import { Hono } from "hono";
import { serve } from "@hono/node-server";
import { auth } from "./auth.js";
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

app.get("/sign-in", (c) => c.html(frontend));
app.get("/consent", (c) => c.html(frontend));

app.get("/health", (c) => c.text("ok"));

const port = Number(process.env.PORT ?? 3000);
serve({ fetch: app.fetch, port });
console.log(`reeyan-sso listening on :${port}`);
