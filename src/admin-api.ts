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
      (select count(*)::int from session where "expiresAt" > now()) as "activeSessions",
      (select count(*)::int from passkey) as passkeys
  `);
  return c.json(result.rows[0]);
});

adminApi.get("/audit", async (c) => {
  const limit = Math.min(Number(c.req.query("limit") ?? 50) || 50, 200);
  const offset = Math.max(Number(c.req.query("offset") ?? 0) || 0, 0);
  return c.json(await listAudit(limit, offset));
});

// Better Auth's /oauth2/get-clients only returns clients whose referenceId
// matches clientReference() — "sso-admin" here. A client created any other way
// (different reference, owned by a user, written before this config existed) is
// live and can authenticate, but is invisible to the console and cannot be
// edited or deleted through the plugin. This lists the whole table so the count
// and the list can never disagree.
const ADMIN_REFERENCE = "sso-admin";

adminApi.get("/clients", async (c) => {
  const result = await pool.query(
    `select o."clientId", o.name, o.type, o."redirectUris", o."grantTypes",
            o."tokenEndpointAuthMethod", o."referenceId", o."userId",
            o.disabled, o."createdAt", u.email as "ownerEmail"
       from "oauthClient" o
       left join "user" u on u.id = o."userId"
      order by o."createdAt" desc nulls last`,
  );

  return c.json({
    clients: result.rows.map((row) => ({
      client_id: row.clientId,
      client_name: row.name,
      type: row.type,
      redirect_uris: row.redirectUris ?? [],
      grant_types: row.grantTypes ?? [],
      token_endpoint_auth_method: row.tokenEndpointAuthMethod,
      disabled: row.disabled ?? false,
      // Only these can be edited or have their secret rotated through the
      // Better Auth endpoints; the rest have to be adopted first.
      managed: row.referenceId === ADMIN_REFERENCE,
      ownerEmail: row.ownerEmail,
    })),
  });
});

adminApi.post("/clients/adopt", async (c) => {
  const { clientId } = await c.req.json<{ clientId?: string }>();
  if (!clientId) return c.json({ message: "clientId is required." }, 400);

  const result = await pool.query(
    `update "oauthClient"
        set "referenceId" = $1, "userId" = null, "updatedAt" = now()
      where "clientId" = $2
      returning name`,
    [ADMIN_REFERENCE, clientId],
  );
  if (!result.rowCount) return c.json({ message: "Client not found." }, 404);

  const session = c.get("session");
  await recordAudit({
    actorId: session.user.id,
    actorEmail: session.user.email,
    action: "client.adopt",
    targetType: "client",
    targetId: clientId,
    targetLabel: result.rows[0].name,
    ip: c.req.header("x-forwarded-for") ?? c.req.header("x-real-ip") ?? null,
  });

  return c.json({ success: true });
});

// Deleting through Better Auth drops the oauthClient row and leaves its tokens
// and consents behind, and refuses outright for clients the admin does not own.
adminApi.post("/clients/delete", async (c) => {
  const { clientId } = await c.req.json<{ clientId?: string }>();
  if (!clientId) return c.json({ message: "clientId is required." }, 400);

  const existing = await pool.query(
    `select name from "oauthClient" where "clientId" = $1`,
    [clientId],
  );
  if (!existing.rowCount) return c.json({ message: "Client not found." }, 404);

  const client = await pool.connect();
  try {
    await client.query("begin");
    await client.query(`delete from "oauthAccessToken" where "clientId" = $1`, [
      clientId,
    ]);
    await client.query(`delete from "oauthRefreshToken" where "clientId" = $1`, [
      clientId,
    ]);
    await client.query(`delete from "oauthConsent" where "clientId" = $1`, [
      clientId,
    ]);
    await client.query(`delete from "oauthClient" where "clientId" = $1`, [
      clientId,
    ]);
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
    action: "client.delete",
    targetType: "client",
    targetId: clientId,
    targetLabel: existing.rows[0].name,
    ip: c.req.header("x-forwarded-for") ?? c.req.header("x-real-ip") ?? null,
  });

  return c.json({ success: true });
});

// The passkey plugin's list endpoint only ever returns the caller's own keys,
// so admin visibility into someone else's reads the table directly.
adminApi.get("/passkeys", async (c) => {
  const userId = c.req.query("userId");
  if (!userId) return c.json({ message: "userId is required." }, 400);

  const result = await pool.query(
    `select id, name, "deviceType", "backedUp", "createdAt"
       from passkey where "userId" = $1 order by "createdAt" desc`,
    [userId],
  );
  return c.json({ passkeys: result.rows });
});

adminApi.post("/passkeys/revoke", async (c) => {
  const { passkeyId } = await c.req.json<{ passkeyId?: string }>();
  if (!passkeyId) return c.json({ message: "passkeyId is required." }, 400);

  const result = await pool.query(
    `delete from passkey where id = $1 returning "userId", name`,
    [passkeyId],
  );
  if (!result.rowCount) return c.json({ message: "Passkey not found." }, 404);
  const { userId, name } = result.rows[0];

  const session = c.get("session");
  await recordAudit({
    actorId: session.user.id,
    actorEmail: session.user.email,
    action: "passkey.revoke",
    targetType: "user",
    targetId: userId,
    targetLabel: await lookupUserLabel(userId),
    detail: { passkey: name ?? passkeyId },
    ip: c.req.header("x-forwarded-for") ?? c.req.header("x-real-ip") ?? null,
  });

  return c.json({ success: true });
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
