/**
 * Structured logging (BUILD_PLAN S-15 / P-TOOL-4, TECH_SPEC §10).
 *
 * The app logged with bare `console.log`, unstructured and unfiltered — a
 * socket id here, an error object there, nothing correlating one request's
 * lines to each other and nothing stopping a message body or a session token
 * from ending up in a log aggregator forever.
 *
 * One line of JSON per event, with a request id so a request can be followed
 * end to end, and a redactor that runs over every field.
 */
import { randomUUID } from "node:crypto";
import { env, isProduction } from "./env";

export type LogLevel = "debug" | "info" | "warn" | "error";

const LEVEL_ORDER: Record<LogLevel, number> = { debug: 10, info: 20, warn: 30, error: 40 };

/** Quiet in tests: a passing suite should not print a thousand lines. */
const MINIMUM_LEVEL: LogLevel =
  env.NODE_ENV === "test" ? "error" : isProduction ? "info" : "debug";

/**
 * Field names whose values are never logged, matched case-insensitively on any
 * part of the key.
 *
 * Deliberately broad. The cost of redacting something harmless is a `[redacted]`
 * in a log; the cost of missing something is a credential in a system with a
 * long retention policy and a wide audience.
 */
const REDACTED_KEYS =
  /token|secret|password|passwd|credential|cookie|authorization|session|p256dh|auth|key|content|body|message|email/i;

const REDACTED = "[redacted]";

/** Recursively replace anything sensitive. Depth-limited against cycles. */
export function redact(value: unknown, depth = 0): unknown {
  if (depth > 6) return "[truncated]";
  if (value === null || value === undefined) return value;

  if (Array.isArray(value)) {
    return value.length > 20
      ? [...value.slice(0, 20).map((v) => redact(v, depth + 1)), `…${value.length - 20} more`]
      : value.map((v) => redact(v, depth + 1));
  }

  if (value instanceof Error) {
    return { name: value.name, message: value.message, stack: value.stack };
  }

  if (typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [key, nested] of Object.entries(value as Record<string, unknown>)) {
      out[key] = REDACTED_KEYS.test(key) ? REDACTED : redact(nested, depth + 1);
    }
    return out;
  }

  if (typeof value === "string" && value.length > 512) {
    return `${value.slice(0, 512)}…[truncated]`;
  }

  return value;
}

export interface LogFields {
  [key: string]: unknown;
}

function emit(level: LogLevel, message: string, fields: LogFields = {}): void {
  if (LEVEL_ORDER[level] < LEVEL_ORDER[MINIMUM_LEVEL]) return;

  const line = JSON.stringify({
    level,
    time: new Date().toISOString(),
    msg: message,
    ...(redact(fields) as LogFields),
  });

  // Errors and warnings to stderr, everything else to stdout: a container
  // runtime and a log shipper both treat the two differently.
  if (level === "error" || level === "warn") process.stderr.write(`${line}\n`);
  else process.stdout.write(`${line}\n`);
}

export const log = {
  debug: (message: string, fields?: LogFields) => emit("debug", message, fields),
  info: (message: string, fields?: LogFields) => emit("info", message, fields),
  warn: (message: string, fields?: LogFields) => emit("warn", message, fields),
  error: (message: string, fields?: LogFields) => emit("error", message, fields),
  /** A logger that stamps every line with the same fields. */
  child(bound: LogFields) {
    return {
      debug: (m: string, f?: LogFields) => emit("debug", m, { ...bound, ...f }),
      info: (m: string, f?: LogFields) => emit("info", m, { ...bound, ...f }),
      warn: (m: string, f?: LogFields) => emit("warn", m, { ...bound, ...f }),
      error: (m: string, f?: LogFields) => emit("error", m, { ...bound, ...f }),
    };
  },
};

/** A request id: the inbound one if a proxy set it, otherwise a fresh one. */
export function requestId(headers: Headers): string {
  return headers.get("x-request-id") ?? randomUUID();
}
