/**
 * Service worker for web push (BUILD_PLAN F-6).
 *
 * Served from the site root so its scope covers the whole app. It does nothing
 * but notifications — no caching, no offline shell — because an aggressive
 * cache on an app that is mostly live data causes more confusion than it saves.
 */

self.addEventListener("install", () => {
  // Take over immediately rather than waiting for every tab to close, so a
  // member who just granted permission does not have to reload.
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener("push", (event) => {
  if (!event.data) return;

  let payload;
  try {
    payload = event.data.json();
  } catch {
    return;
  }

  event.waitUntil(
    self.registration.showNotification(payload.title || "Alice Chains", {
      body: payload.body || "",
      // One tag per conversation, so a burst collapses into the latest rather
      // than stacking a dozen notifications for one thread.
      tag: payload.tag,
      renotify: true,
      icon: payload.icon || "/favicon.svg",
      badge: "/favicon.svg",
      data: { url: payload.url || "/chat" },
    })
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const target = event.notification.data?.url || "/chat";

  event.waitUntil(
    (async () => {
      const open = await clients.matchAll({
        type: "window",
        includeUncontrolled: true,
      });

      // Focus a tab that is already open and steer it, rather than opening a
      // second copy of the app.
      for (const client of open) {
        if (new URL(client.url).origin === self.location.origin) {
          await client.focus();
          if ("navigate" in client) await client.navigate(target);
          return;
        }
      }

      await clients.openWindow(target);
    })()
  );
});
