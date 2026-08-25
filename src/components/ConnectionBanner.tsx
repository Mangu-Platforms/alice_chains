/**
 * The connection banner (BUILD_PLAN P-UX-2).
 *
 * Says what is happening and what it means for anything the member has typed.
 * Deliberately not shown for a momentary blip: `connecting` is the normal state
 * for the first few hundred milliseconds of every page load, and a banner that
 * flashes on every navigation is one people learn to ignore.
 */
import { useEffect, useState } from "react";
import { CloudOff, RefreshCw } from "lucide-react";
import type { ConnectionState } from "@/hooks/useSocket";

/** How long a connection must be down before it is worth saying so. */
const GRACE_MS = 1500;

export function ConnectionBanner({
  state,
  queued,
}: {
  state: ConnectionState;
  queued: number;
}) {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (state === "connected") {
      setVisible(false);
      return;
    }

    const timer = setTimeout(() => setVisible(true), GRACE_MS);
    return () => clearTimeout(timer);
  }, [state]);

  if (!visible || state === "connected") return null;

  return (
    <div
      // `status` rather than `alert`: this is worth announcing, but not worth
      // interrupting whatever a screen reader is currently reading.
      role="status"
      aria-live="polite"
      className="flex items-center justify-center gap-2 px-4 py-2 text-xs bg-amber-500/15 text-amber-200 border-b border-amber-500/25"
    >
      {state === "connecting" ? (
        <RefreshCw className="w-3.5 h-3.5 animate-spin" aria-hidden="true" />
      ) : (
        <CloudOff className="w-3.5 h-3.5" aria-hidden="true" />
      )}
      <span>
        {state === "connecting" ? "Reconnecting…" : "You are offline."}
        {queued > 0 && (
          <>
            {" "}
            {queued === 1
              ? "1 message will be sent when you are back."
              : `${queued} messages will be sent when you are back.`}
          </>
        )}
      </span>
    </div>
  );
}
