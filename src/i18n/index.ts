/**
 * Translation and locale-aware formatting (BUILD_PLAN S-20).
 *
 * Deliberately small and dependency-free. The app has one catalogue today; the
 * point of this module is that adding a second is a matter of writing it,
 * rather than of finding every string first.
 *
 * Timestamps go through `Intl`, which knows every locale's conventions —
 * hard-coding `HH:mm` shows 14:30 to a reader whose locale writes 2:30 PM, and
 * `MM/DD` is ambiguous to most of the world.
 */
import { en, type Catalogue, type MessageKey } from "./en";

const catalogues: Record<string, Catalogue> = { en };

/** The browser's preferred locale, falling back to English. */
export function currentLocale(): string {
  if (typeof navigator === "undefined") return "en";
  return navigator.language || "en";
}

function catalogueFor(locale: string): Catalogue {
  // `en-GB` falls back to `en`; an unknown language falls back to English
  // rather than rendering a key.
  return catalogues[locale] ?? catalogues[locale.split("-")[0]] ?? en;
}

type Entry = Catalogue[MessageKey];
type Args<K extends MessageKey> = Catalogue[K] extends (...args: infer P) => string ? P : [];

/** Look up a message. Parameterised entries take their arguments positionally. */
export function t<K extends MessageKey>(key: K, ...args: Args<K>): string {
  const entry: Entry = catalogueFor(currentLocale())[key];
  return typeof entry === "function"
    ? (entry as (...a: unknown[]) => string)(...args)
    : entry;
}

/** A time of day, in the reader's own convention. */
export function formatTime(value: Date | string | number): string {
  return new Intl.DateTimeFormat(currentLocale(), {
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(value));
}

/** A date, spelled out enough to be unambiguous across locales. */
export function formatDate(value: Date | string | number): string {
  return new Intl.DateTimeFormat(currentLocale(), {
    day: "numeric",
    month: "short",
    year: "numeric",
  }).format(new Date(value));
}

/**
 * A timestamp for a message list: the time for today, a weekday within the
 * last week, a date beyond that.
 */
export function formatMessageTimestamp(value: Date | string | number): string {
  const date = new Date(value);
  const now = new Date();
  const sameDay = date.toDateString() === now.toDateString();
  if (sameDay) return formatTime(date);

  const daysAgo = (now.getTime() - date.getTime()) / 86_400_000;
  if (daysAgo < 7) {
    return new Intl.DateTimeFormat(currentLocale(), { weekday: "short" }).format(date);
  }

  return formatDate(date);
}

/** "3 minutes ago", in the reader's language, via Intl.RelativeTimeFormat. */
export function formatRelative(value: Date | string | number): string {
  const date = new Date(value);
  const seconds = Math.round((date.getTime() - Date.now()) / 1000);
  const formatter = new Intl.RelativeTimeFormat(currentLocale(), { numeric: "auto" });

  const divisions: [number, Intl.RelativeTimeFormatUnit][] = [
    [60, "second"],
    [60, "minute"],
    [24, "hour"],
    [7, "day"],
    [4.34524, "week"],
    [12, "month"],
    [Number.POSITIVE_INFINITY, "year"],
  ];

  let duration = seconds;
  for (const [amount, unit] of divisions) {
    if (Math.abs(duration) < amount) return formatter.format(Math.round(duration), unit);
    duration /= amount;
  }
  return formatter.format(Math.round(duration), "year");
}

export { en };
export type { MessageKey };
