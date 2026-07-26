import { Hono } from "hono";
import { serve } from "@hono/node-server";
import { isAPIError } from "better-auth/api";
import { auth, oauthResource } from "./auth.js";
import { adminApi } from "./admin-api.js";
import { ensureAuditTable, warnOnMissingTables } from "./audit.js";
import { ensureScopeTable, reloadScopes, scopesFresh } from "./scopes.js";
import { listPublicSessions } from "./sessions.js";
import { serveStatic } from "@hono/node-server/serve-static";
import { readFileSync } from "node:fs";

const app = new Hono();
const frontend = readFileSync("./dist/client/index.html", "utf8");

app.use("/assets/*", serveStatic({ root: "./dist/client" }));
app.use("/fonts/*", serveStatic({ root: "./dist/client" }));
app.use("/black-felt.png", serveStatic({ root: "./dist/client" }));

// Better Auth handles all /api/auth/** routes, including the OAuth2/OIDC
// authorize, token, register, and well-known discovery endpoints.
app.on(["GET", "POST"], "/api/auth/**", (c) => auth.handler(c.req.raw));

// Admin-only reads that Better Auth does not expose (audit log, other users'
// OAuth consents).
app.route("/api/admin", adminApi);

// OAuth counterpart to Better Auth's cookie-authenticated /list-sessions.
// The verified token subject fixes the user being queried; callers cannot
// supply a different user ID. Session tokens are deliberately never returned.
app.get("/api/sessions", async (c) => {
  const authorization = c.req.header("authorization");
  const accessToken = authorization?.match(/^Bearer[ \t]+(.+)$/i)?.[1];
  if (!accessToken) {
    return c.json(
      { error: "invalid_token", error_description: "Bearer token required." },
      401,
    );
  }

  let subject: string;
  try {
    const claims = await oauthResource.verifyAccessToken(accessToken, {
      verifyOptions: { audience: process.env.BASE_URL ?? "" },
      scopes: ["read:sessions"],
    });
    if (typeof claims.sub !== "string" || !claims.sub) {
      return c.json(
        { error: "invalid_token", error_description: "Token has no user subject." },
        401,
      );
    }
    subject = claims.sub;
  } catch (error) {
    if (isAPIError(error) && error.status === "FORBIDDEN") {
      return c.json(
        {
          error: "insufficient_scope",
          error_description: "The read:sessions scope is required.",
        },
        403,
        { "WWW-Authenticate": 'Bearer scope="read:sessions"' },
      );
    }
    if (isAPIError(error)) {
      return c.json(
        { error: "invalid_token", error_description: "Access token is invalid." },
        401,
      );
    }
    console.error("[sessions] access-token verification failed", error);
    return c.json({ error: "server_error" }, 500);
  }

  // Go through Better Auth's configured adapter instead of assuming its
  // physical SQL schema. This is the same lookup used by /list-sessions and
  // also works when sessions use custom field names or secondary storage.
  const authContext = await auth.$context;
  return c.json({
    sessions: await listPublicSessions(
      subject,
      (userId, options) =>
        authContext.internalAdapter.listSessions(userId, options),
    ),
  });
});

// Gate the account page here rather than in the client so a signed-out visitor
// never renders it at all — no flash of account chrome before the redirect.
app.get("/", async (c) => {
  const session = await auth.api.getSession({ headers: c.req.raw.headers });
  if (!session) return c.redirect("/sign-in?callbackURL=%2F");
  return c.html(frontend);
});

app.get("/sign-in", (c) => c.html(frontend));
app.get("/sign-up", (c) => c.html(frontend));
app.get("/consent", (c) => c.html(frontend));
app.get("/admin", (c) => c.html(frontend));

// Scope names are already public in the discovery document; this adds the
// human descriptions so the consent screen and admin editor stay in step with
// src/scopes.ts instead of keeping their own copies.
app.get("/api/scopes", async (c) => c.json({ scopes: await scopesFresh() }));

app.get("/health", (c) => c.text("ok"));

const port = Number(process.env.PORT ?? 3000);
await ensureAuditTable();
await ensureScopeTable();
await reloadScopes();
await warnOnMissingTables();
serve({ fetch: app.fetch, port });
console.log(`reeyan-sso listening on :${port}`);
