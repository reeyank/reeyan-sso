import { Hono } from "hono";
import { serve } from "@hono/node-server";
import { auth } from "./auth.js";
import { signInPage, consentPage } from "./pages.js";
import { serveStatic } from "@hono/node-server/serve-static";

const app = new Hono();

app.use("/fonts/*", serveStatic({ root: "./public" }));
app.use("/black-felt.png", serveStatic({ root: "./public" }));

// Better Auth handles all /api/auth/** routes, including the OAuth2/OIDC
// authorize, token, register, and well-known discovery endpoints.
app.on(["GET", "POST"], "/api/auth/**", (c) => auth.handler(c.req.raw));

// Branded login page. Redirect target comes from Better Auth's own
// redirect_to query param on the way in.
app.get("/sign-in", (c) => {
  const redirectTo =
    c.req.query("redirect_to") ??
    c.req.query("callbackURL") ??
    c.req.query("callbackUrl") ??
    "/";
  return c.html(signInPage(redirectTo));
});

// Branded consent page. client_name / scope / accept / deny params are
// populated by the oauth-provider plugin when it redirects here.
// NOTE: verify these exact query param + endpoint names against the
// installed @better-auth/oauth-provider version's docs before going live —
// this plugin's API has shifted across recent releases.
app.get("/consent", (c) => {
  const clientName = c.req.query("client_name") ?? "this application";
  const scope = c.req.query("scope") ?? "openid profile email";
  const acceptUrl = c.req.query("accept_url") ?? "/api/auth/oauth2/consent";
  const denyUrl = c.req.query("deny_url") ?? "/api/auth/oauth2/consent";
  return c.html(consentPage(clientName, scope.split(" "), acceptUrl, denyUrl));
});

app.get("/health", (c) => c.text("ok"));

const port = Number(process.env.PORT ?? 3000);
serve({ fetch: app.fetch, port });
console.log(`reeyan-sso listening on :${port}`);
