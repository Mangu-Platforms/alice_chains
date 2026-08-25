/**
 * Web push registration (BUILD_PLAN F-6).
 *
 * Deliberately does not ask for permission on load. A permission prompt fired
 * at a member who has just arrived is the fastest way to a permanent denial —
 * the browser remembers "no" and there is no second chance. `enable()` is
 * called from a control the member chose to press.
 */
import { useCallback, useEffect, useState } from "react";
import { trpc } from "@/providers/trpc";

type PermissionState = "unsupported" | "default" | "granted" | "denied";

/**
 * base64url → the raw bytes the Push API insists on.
 *
 * Typed as ArrayBuffer rather than Uint8Array: TypeScript's DOM lib narrowed
 * BufferSource to ArrayBuffer-backed views, and a Uint8Array over the generic
 * ArrayBufferLike no longer satisfies it.
 */
function decodeVapidKey(base64Url: string): ArrayBuffer {
  const padding = "=".repeat((4 - (base64Url.length % 4)) % 4);
  const base64 = (base64Url + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(base64);
  const bytes = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i += 1) bytes[i] = raw.charCodeAt(i);
  return bytes.buffer;
}

function isSupported(): boolean {
  return (
    typeof window !== "undefined" &&
    "serviceWorker" in navigator &&
    "PushManager" in window &&
    "Notification" in window
  );
}

export function usePushNotifications() {
  const [permission, setPermission] = useState<PermissionState>(() =>
    isSupported() ? (Notification.permission as PermissionState) : "unsupported"
  );
  const [subscribed, setSubscribed] = useState(false);
  const [busy, setBusy] = useState(false);

  const { data: config } = trpc.push.config.useQuery();
  const subscribeMutation = trpc.push.subscribe.useMutation();
  const unsubscribeMutation = trpc.push.unsubscribe.useMutation();

  // Reflect what the browser already holds, so the control shows the real
  // state rather than assuming "off" on every load.
  useEffect(() => {
    if (!isSupported() || !config?.enabled) return;

    let cancelled = false;
    void (async () => {
      try {
        const registration = await navigator.serviceWorker.register("/sw.js");
        const existing = await registration.pushManager.getSubscription();
        if (!cancelled) setSubscribed(Boolean(existing));
      } catch {
        // A registration failure leaves the control offering "enable", which
        // is the honest state: nothing is subscribed.
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [config?.enabled]);

  const enable = useCallback(async () => {
    if (!isSupported() || !config?.publicKey) return false;

    setBusy(true);
    try {
      const result = await Notification.requestPermission();
      setPermission(result as PermissionState);
      if (result !== "granted") return false;

      const registration = await navigator.serviceWorker.register("/sw.js");
      await navigator.serviceWorker.ready;

      const subscription = await registration.pushManager.subscribe({
        // Chrome refuses a subscription without this, and a silent
        // subscription would be one the member never consented to anyway.
        userVisibleOnly: true,
        applicationServerKey: decodeVapidKey(config.publicKey),
      });

      const json = subscription.toJSON();
      await subscribeMutation.mutateAsync({
        endpoint: subscription.endpoint,
        p256dh: json.keys?.p256dh ?? "",
        auth: json.keys?.auth ?? "",
      });

      setSubscribed(true);
      return true;
    } catch {
      return false;
    } finally {
      setBusy(false);
    }
  }, [config?.publicKey, subscribeMutation]);

  const disable = useCallback(async () => {
    if (!isSupported()) return;

    setBusy(true);
    try {
      const registration = await navigator.serviceWorker.getRegistration();
      const subscription = await registration?.pushManager.getSubscription();
      if (subscription) {
        // Told to the server first: if the browser-side unsubscribe succeeds
        // and the server call does not, the row would go on receiving pushes
        // for an endpoint that no longer exists.
        await unsubscribeMutation.mutateAsync({ endpoint: subscription.endpoint });
        await subscription.unsubscribe();
      }
      setSubscribed(false);
    } finally {
      setBusy(false);
    }
  }, [unsubscribeMutation]);

  return {
    available: isSupported() && Boolean(config?.enabled),
    permission,
    subscribed,
    busy,
    enable,
    disable,
  };
}
