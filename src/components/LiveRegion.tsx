/**
 * A polite live region (BUILD_PLAN S-20).
 *
 * A screen reader user gets no notification of a message arriving in a
 * conversation they are reading: the DOM changes silently. This announces it.
 *
 * `polite` rather than `assertive`, because an arriving message should wait for
 * a gap rather than interrupt whatever is being read — `assertive` is for
 * things that must stop the reader, and a chat message is not one.
 */
import { useEffect, useRef, useState } from "react";

export function LiveRegion({ message }: { message: string | null }) {
  const [announced, setAnnounced] = useState("");
  const previous = useRef<string | null>(null);

  useEffect(() => {
    if (!message || message === previous.current) return;
    previous.current = message;

    // Cleared first, then set: a screen reader announces a *change*, so
    // repeating the same string would otherwise be silent.
    setAnnounced("");
    const timer = setTimeout(() => setAnnounced(message), 50);
    return () => clearTimeout(timer);
  }, [message]);

  return (
    <div
      role="status"
      aria-live="polite"
      aria-atomic="true"
      // Visually hidden, not `display: none` — a hidden element is not read at
      // all, whereas this stays in the accessibility tree.
      className="sr-only"
    >
      {announced}
    </div>
  );
}
