/**
 * The audit trail (BUILD_PLAN S-18).
 *
 * Append-only by construction: this module exports a write and a read, and no
 * update or delete exists anywhere in the codebase. `audit_logs` also carries
 * no foreign key to `users`, which is deliberate — an audit trail that cascades
 * away with the account it describes is not an audit trail.
 *
 * Writing never throws. An administrative action that succeeded must not be
 * reported as failed because its log line could not be written; the failure is
 * logged instead, where the S-15 alerting can see it.
 */
import { desc, eq } from "drizzle-orm";
import { auditLogs } from "@db/schema";
import { getDb } from "../queries/connection";
import { log } from "./logger";

export type AuditAction =
  | "admin.member.list"
  | "admin.member.deactivate"
  | "admin.member.reactivate"
  | "admin.member.promote"
  | "account.export"
  | "account.deletion.request"
  | "account.deletion.cancel"
  | "account.purge"
  | "session.revoke_all";

export interface AuditEntry {
  actorId: number | null;
  action: AuditAction;
  targetUserId?: number | null;
  targetType?: string | null;
  targetId?: string | null;
  outcome: "success" | "failure";
  detail?: string | null;
}

export async function recordAudit(entry: AuditEntry): Promise<void> {
  try {
    await getDb().insert(auditLogs).values({
      actorId: entry.actorId,
      action: entry.action,
      targetUserId: entry.targetUserId ?? null,
      targetType: entry.targetType ?? null,
      targetId: entry.targetId ?? null,
      outcome: entry.outcome,
      // Truncated rather than rejected: losing the tail of a detail string is
      // better than losing the whole record.
      detail: entry.detail ? entry.detail.slice(0, 512) : null,
    });
  } catch (error) {
    log.error("failed to write an audit record", { action: entry.action, error });
  }
}

/**
 * Run an administrative action and record exactly one row for it, whichever
 * way it goes.
 *
 * A refusal is as much a fact worth keeping as a success — an administrator
 * repeatedly failing to deactivate someone is the shape of an incident.
 */
export async function audited<T>(
  entry: Omit<AuditEntry, "outcome">,
  operation: () => Promise<T>
): Promise<T> {
  try {
    const result = await operation();
    await recordAudit({ ...entry, outcome: "success" });
    return result;
  } catch (error) {
    await recordAudit({
      ...entry,
      outcome: "failure",
      detail: error instanceof Error ? error.message : String(error),
    });
    throw error;
  }
}

/** The most recent entries, newest first. Read-only, for the admin surface. */
export async function readAuditLog(limit = 100) {
  return getDb().select().from(auditLogs).orderBy(desc(auditLogs.id)).limit(limit);
}

/** Entries concerning one member. */
export async function readAuditLogFor(targetUserId: number, limit = 100) {
  return getDb()
    .select()
    .from(auditLogs)
    .where(eq(auditLogs.targetUserId, targetUserId))
    .orderBy(desc(auditLogs.id))
    .limit(limit);
}
