/**
 * State that survives a reload (BUILD_PLAN P-PROF-2).
 *
 * `localStorage` throws in a private window on some browsers, and is simply
 * absent server-side, so every access is guarded — a preference failing to
 * persist must never take the page down with it.
 *
 * Keys are namespaced so this app's entries are identifiable in a shared
 * origin and removable in one sweep.
 */
import { useCallback, useEffect, useState } from "react";

const NAMESPACE = "alice-chains";

function read<T>(key: string, fallback: T): T {
  try {
    const raw = window.localStorage.getItem(`${NAMESPACE}:${key}`);
    return raw === null ? fallback : (JSON.parse(raw) as T);
  } catch {
    return fallback;
  }
}

export function usePersistedState<T>(key: string, initial: T) {
  const [value, setValue] = useState<T>(() =>
    typeof window === "undefined" ? initial : read(key, initial)
  );

  useEffect(() => {
    try {
      window.localStorage.setItem(`${NAMESPACE}:${key}`, JSON.stringify(value));
    } catch {
      // Full, disabled, or a private window. The preference is lost on reload,
      // which is the whole cost.
    }
  }, [key, value]);

  const reset = useCallback(() => {
    try {
      window.localStorage.removeItem(`${NAMESPACE}:${key}`);
    } catch {
      // As above.
    }
    setValue(initial);
  }, [key, initial]);

  return [value, setValue, reset] as const;
}
