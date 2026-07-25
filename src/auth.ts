import { betterAuth } from "better-auth";
import { jwt, admin } from "better-auth/plugins";
import { createAuthMiddleware, getSessionFromCtx } from "better-auth/api";
import { oauthProvider } from "@better-auth/oauth-provider";
import { pool } from "./db.js";
import {
    recordAudit,
    lookupClientLabel,
    lookupSessionOwner,
    lookupUserLabel,
    stashLabel,
    takeLabel,
} from "./audit.js";

// Endpoints worth an audit row, and the action name each one records. Anything
// not listed here (sign-in, token exchange, discovery) is deliberately skipped
// so the log stays a record of administrative intent, not of traffic.
const AUDITED: Record<string, string> = {
  "/admin/create-user": "user.create",
  "/admin/remove-user": "user.delete",
  "/admin/update-user": "user.update",
  "/admin/set-role": "user.set-role",
  "/admin/ban-user": "user.ban",
  "/admin/unban-user": "user.unban",
  "/admin/set-user-password": "user.set-password",
  "/admin/revoke-user-session": "session.revoke",
  "/admin/revoke-user-sessions": "session.revoke-all",
  "/admin/impersonate-user": "user.impersonate",
  "/admin/stop-impersonating": "user.stop-impersonating",
  "/oauth2/create-client": "client.create",
  "/oauth2/update-client": "client.update",
  "/oauth2/delete-client": "client.delete",
  "/oauth2/client/rotate-secret": "client.rotate-secret",
};

// Never let a request body land in the log verbatim — these carry secrets.
const REDACTED = new Set(["password", "newPassword", "client_secret"]);

function safeDetail(body: unknown) {
  if (!body || typeof body !== "object") return undefined;
  const detail: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(body as Record<string, unknown>)) {
    if (REDACTED.has(key)) continue;
    if (key === "userId" || key === "client_id") continue;
    detail[key] = value;
  }
  return Object.keys(detail).length ? detail : undefined;
}

export const auth = betterAuth({
    baseURL: process.env.BASE_URL, // https://reeyan.md
    secret: process.env.AUTH_SECRET,
    database: pool,
    emailAndPassword: {
        enabled: true,
    },
    // Without this, OAuth failures (disabled client, invalid redirect_uri,
    // bad client_id, etc.) fall back to better-auth's stock unbranded error
    // page at /api/auth/error instead of our own.
    onAPIError: {
        errorURL: `${process.env.BASE_URL}/error`,
    },
    hooks: {
        // These two endpoints destroy the row the after-hook would read the
        // audit label from, so resolve it while it still exists.
        before: createAuthMiddleware(async (ctx) => {
            try {
                const body = (ctx.body ?? {}) as Record<string, unknown>;
                if (
                    ctx.path === "/admin/remove-user" &&
                    typeof body.userId === "string"
                ) {
                    stashLabel(`user:${body.userId}`, await lookupUserLabel(body.userId));
                }
                if (
                    ctx.path === "/admin/revoke-user-session" &&
                    typeof body.sessionToken === "string"
                ) {
                    const owner = await lookupSessionOwner(body.sessionToken);
                    stashLabel(`session:${body.sessionToken}`, owner?.email ?? null);
                }
            } catch (error) {
                console.error("[audit] pre-resolve failed for", ctx.path, error);
            }
        }),
        // Runs only when the endpoint succeeded, so the log records completed
        // actions rather than attempts.
        after: createAuthMiddleware(async (ctx) => {
            const action = AUDITED[ctx.path];
            if (!action) return;

            try {
                const session = await getSessionFromCtx(ctx);
                const body = (ctx.body ?? {}) as Record<string, unknown>;
                const userId = typeof body.userId === "string" ? body.userId : null;
                const clientId =
                    typeof body.client_id === "string" ? body.client_id : null;

                let targetType: string | null = null;
                let targetId: string | null = null;
                let targetLabel: string | null = null;

                if (userId) {
                    targetType = "user";
                    targetId = userId;
                    targetLabel =
                        takeLabel(`user:${userId}`) ?? (await lookupUserLabel(userId));
                } else if (typeof body.sessionToken === "string") {
                    targetType = "user";
                    targetLabel = takeLabel(`session:${body.sessionToken}`);
                } else if (clientId) {
                    targetType = "client";
                    targetId = clientId;
                    targetLabel = await lookupClientLabel(clientId);
                } else if (action === "client.create") {
                    targetType = "client";
                    targetLabel =
                        typeof body.client_name === "string" ? body.client_name : null;
                } else if (action === "user.create") {
                    targetType = "user";
                    targetLabel = typeof body.email === "string" ? body.email : null;
                }

                await recordAudit({
                    // On impersonation the session already belongs to the target,
                    // so the real actor is the one recorded in impersonatedBy.
                    actorId:
                        session?.session.impersonatedBy ?? session?.user.id ?? null,
                    actorEmail: session?.session.impersonatedBy
                        ? await lookupUserLabel(session.session.impersonatedBy)
                        : (session?.user.email ?? null),
                    action,
                    targetType,
                    targetId,
                    targetLabel,
                    detail: safeDetail(ctx.body),
                    ip:
                        ctx.request?.headers.get("x-forwarded-for") ??
                        ctx.request?.headers.get("x-real-ip") ??
                        null,
                });
            } catch (error) {
                console.error("[audit] hook failed for", ctx.path, error);
            }
        }),
    },
    plugins: [
        jwt(),
        // Adds /api/auth/admin/** (list/ban/set-role/impersonate/etc). Anyone
        // with role "admin" can use it. There's no bootstrap flow: after your
        // first sign-up, promote yourself once via
        //   docker compose exec db psql -U sso -d sso -c "update \"user\" set role='admin' where email='you@example.com';"
        // From then on /admin lets that account promote others.
        admin(),
        oauthProvider({
            loginPage: "/sign-in",
            consentPage: "/consent",
            allowDynamicClientRegistration: true, // self-serve client registration
            // Admin-created clients share one owner, so every administrator can
            // manage the same application catalog.
            clientReference: ({ user }) =>
                user?.role === "admin" ? "sso-admin" : undefined,
            clientPrivileges: ({ user }) => user?.role === "admin",
        }),
    ],
    trustedOrigins: (process.env.TRUSTED_ORIGINS ?? "").split(","),
});
