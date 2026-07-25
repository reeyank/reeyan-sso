import { Hono } from "hono";
import { auth } from "./auth.js";
import { pool } from "./db.js";
import { listAudit, recordAudit, lookupUserLabel } from "./audit.js";

// Better Auth's /oauth2/get-consents and /oauth2/delete-consent are hard-scoped
// to session.user.id — an admin cannot see or revoke anyone else's grants
// through them. These routes read the same oauthConsent table with an admin
// check instead. The audit log has no Better Auth endpoint at all.
type AdminSession = NonNullable<Awaited<ReturnType<typeof auth.api.getSession>>>;

export const adminApi = new Hono<{ Variables: { session: AdminSession } }>();

adminApi.use("*", async (c, next) => {
  const session = await auth.api.getSession({ headers: c.req.raw.headers });
  if (!session) return c.json({ message: "Sign in required." }, 401);
  if (session.user.role !== "admin") {
    return c.json({ message: "Administrator access required." }, 403);
  }
  c.set("session", session);
  await next();
});

// Once the directory is paginated the client only ever holds one page, so the
// summary counts have to come from the database rather than the loaded rows.
adminApi.get("/stats", async (c) => {
  const result = await pool.query(`
    select
      (select count(*)::int from "user") as "totalUsers",
      (select count(*)::int from "user" where role = 'admin') as admins,
      (select count(*)::int from "user" where banned) as suspended,
      (select count(*)::int from "oauthClient") as clients,
      (select count(*)::int from "oauthConsent") as consents,
      (select count(*)::int from session where "expiresAt" > now()) as "activeSessions"
  `);
  return c.json(result.rows[0]);
});

adminApi.get("/audit", async (c) => {
  const limit = Math.min(Number(c.req.query("limit") ?? 50) || 50, 200);
  const offset = Math.max(Number(c.req.query("offset") ?? 0) || 0, 0);
  return c.json(await listAudit(limit, offset));
});

adminApi.get("/consents", async (c) => {
  const userId = c.req.query("userId");
  if (!userId) return c.json({ message: "userId is required." }, 400);

  const result = await pool.query(
    `select c.id, c."clientId", c.scopes, c."createdAt", c."updatedAt",
            o.name as "clientName"
       from "oauthConsent" c
       left join "oauthClient" o on o."clientId" = c."clientId"
      where c."userId" = $1
      order by c."createdAt" desc`,
    [userId],
  );
  return c.json({ consents: result.rows });
});

adminApi.post("/consents/revoke", async (c) => {
  const { consentId } = await c.req.json<{ consentId?: string }>();
  if (!consentId) return c.json({ message: "consentId is required." }, 400);

  const consent = await pool.query(
    `select id, "userId", "clientId" from "oauthConsent" where id = $1`,
    [consentId],
  );
  if (!consent.rowCount) return c.json({ message: "Consent not found." }, 404);
  const { userId, clientId } = consent.rows[0];

  // Dropping the consent row alone would leave already-issued tokens working,
  // so clear this user's tokens for that client in the same transaction.
  const client = await pool.connect();
  try {
    await client.query("begin");
    await client.query(`delete from "oauthConsent" where id = $1`, [consentId]);
    await client.query(
      `delete from "oauthAccessToken" where "userId" = $1 and "clientId" = $2`,
      [userId, clientId],
    );
    // revoked is a nullable timestamptz, not a boolean.
    await client.query(
      `update "oauthRefreshToken" set revoked = now()
        where "userId" = $1 and "clientId" = $2 and revoked is null`,
      [userId, clientId],
    );
    await client.query("commit");
  } catch (error) {
    await client.query("rollback");
    throw error;
  } finally {
    client.release();
  }

  const session = c.get("session");
  await recordAudit({
    actorId: session.user.id,
    actorEmail: session.user.email,
    action: "consent.revoke",
    targetType: "user",
    targetId: userId,
    targetLabel: await lookupUserLabel(userId),
    detail: { clientId },
    ip: c.req.header("x-forwarded-for") ?? c.req.header("x-real-ip") ?? null,
  });

  return c.json({ success: true });
});
