import { betterAuth } from "better-auth";
import { jwt, admin } from "better-auth/plugins";
import { oauthProvider } from "@better-auth/oauth-provider";
import { Pool } from "pg";
export const auth = betterAuth({
    baseURL: process.env.BASE_URL, // https://reeyan.md
    secret: process.env.AUTH_SECRET,
    database: new Pool({ connectionString: process.env.DATABASE_URL }),
    emailAndPassword: {
        enabled: true,
    },
    // Without this, OAuth failures (disabled client, invalid redirect_uri,
    // bad client_id, etc.) fall back to better-auth's stock unbranded error
    // page at /api/auth/error instead of our own.
    onAPIError: {
        errorURL: `${process.env.BASE_URL}/error`,
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
