import { pool } from "./db.js";

// Better Auth has no audit primitive, so this table is ours. It is created on
// boot rather than through the Better Auth CLI migration, which only knows
// about plugin-declared schemas.
export async function ensureAuditTable() {
  await pool.query(`
    create table if not exists admin_audit_log (
      id bigserial primary key,
      "createdAt" timestamptz not null default now(),
      "actorId" text,
      "actorEmail" text,
      action text not null,
      "targetType" text,
      "targetId" text,
      "targetLabel" text,
      detail jsonb,
      ip text
    );
    create index if not exists admin_audit_log_created_at_idx
      on admin_audit_log ("createdAt" desc);
  `);
}

// Tables Better Auth's CLI creates, not us. If a plugin was added and
// `npm run migrate` was not re-run, the failure surfaces far from the cause —
// a 500 on an unrelated screen — so name it at boot instead.
export async function warnOnMissingTables() {
  const required = ["user", "session", "oauthClient", "passkey"];
  const result = await pool.query(
    `select t.name from unnest($1::text[]) as t(name)
      where to_regclass('public."' || t.name || '"') is null`,
    [required],
  );
  if (result.rowCount) {
    const missing = result.rows.map((row) => row.name).join(", ");
    console.warn(
      `[startup] missing table(s): ${missing} — run "npm run migrate" (docker compose exec sso npm run migrate)`,
    );
  }
}

export type AuditEntry = {
  actorId?: string | null;
  actorEmail?: string | null;
  action: string;
  targetType?: string | null;
  targetId?: string | null;
  targetLabel?: string | null;
  detail?: unknown;
  ip?: string | null;
};

export async function recordAudit(entry: AuditEntry) {
  // Auditing must never take down the action it is describing.
  try {
    await pool.query(
      `insert into admin_audit_log
         ("actorId","actorEmail",action,"targetType","targetId","targetLabel",detail,ip)
       values ($1,$2,$3,$4,$5,$6,$7,$8)`,
      [
        entry.actorId ?? null,
        entry.actorEmail ?? null,
        entry.action,
        entry.targetType ?? null,
        entry.targetId ?? null,
        entry.targetLabel ?? null,
        entry.detail === undefined ? null : JSON.stringify(entry.detail),
        entry.ip ?? null,
      ],
    );
  } catch (error) {
    console.error("[audit] failed to record entry", entry.action, error);
  }
}

export async function listAudit(limit: number, offset: number) {
  const [rows, total] = await Promise.all([
    pool.query(
      `select id, "createdAt", "actorId", "actorEmail", action,
              "targetType", "targetId", "targetLabel", detail, ip
         from admin_audit_log
        order by "createdAt" desc, id desc
        limit $1 offset $2`,
      [limit, offset],
    ),
    pool.query(`select count(*)::int as count from admin_audit_log`),
  ]);
  return { entries: rows.rows, total: total.rows[0].count as number };
}

export async function lookupUserLabel(userId: string) {
  const result = await pool.query(
    `select email from "user" where id = $1 limit 1`,
    [userId],
  );
  return (result.rows[0]?.email as string | undefined) ?? null;
}

// Revoking a single session identifies it by token, so the audited target has
// to be resolved back to a person.
export async function lookupSessionOwner(token: string) {
  const result = await pool.query(
    `select u.id, u.email
       from session s join "user" u on u.id = s."userId"
      where s.token = $1 limit 1`,
    [token],
  );
  return (result.rows[0] as { id: string; email: string } | undefined) ?? null;
}

// Deleting a user or revoking a session removes the row the after-hook would
// read the label from, so those labels are resolved before the action runs and
// picked up afterwards. Entries expire so a failed action cannot leak memory.
const pendingLabels = new Map<string, { label: string | null; expires: number }>();

export function stashLabel(key: string, label: string | null) {
  const now = Date.now();
  for (const [existing, value] of pendingLabels) {
    if (value.expires < now) pendingLabels.delete(existing);
  }
  pendingLabels.set(key, { label, expires: now + 30_000 });
}

export function takeLabel(key: string) {
  const entry = pendingLabels.get(key);
  if (!entry) return null;
  pendingLabels.delete(key);
  return entry.expires < Date.now() ? null : entry.label;
}

export async function lookupClientLabel(clientId: string) {
  const result = await pool.query(
    `select name from "oauthClient" where "clientId" = $1 limit 1`,
    [clientId],
  );
  return (result.rows[0]?.name as string | undefined) ?? null;
}
