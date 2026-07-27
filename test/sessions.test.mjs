import assert from "node:assert/strict";
import test from "node:test";
import {
  listPublicSessions,
  oauthJwksUrl,
  revokeOwnedSession,
} from "../dist/server/sessions.js";

test("builds the JWKS endpoint from the OAuth issuer without duplicating its path", () => {
  assert.equal(
    oauthJwksUrl("https://sso.example.com/api/auth"),
    "https://sso.example.com/api/auth/jwks",
  );
  assert.equal(
    oauthJwksUrl("https://sso.example.com/api/auth/"),
    "https://sso.example.com/api/auth/jwks",
  );
});

test("lists only the token subject's active sessions through the auth adapter", async () => {
  const requested = [];
  const now = Date.parse("2026-07-26T01:00:00.000Z");
  const active = {
    id: "active",
    token: "must-not-leak",
    userId: "must-not-leak",
    createdAt: new Date("2026-07-25T01:00:00.000Z"),
    updatedAt: new Date("2026-07-25T02:00:00.000Z"),
    expiresAt: new Date("2026-07-27T01:00:00.000Z"),
    ipAddress: "203.0.113.1",
    userAgent: "test-agent",
  };
  const expired = {
    ...active,
    id: "expired",
    expiresAt: new Date("2026-07-25T23:00:00.000Z"),
  };

  const sessions = await listPublicSessions(
    "verified-token-subject",
    async (userId, options) => {
      requested.push({ userId, options });
      return [active, expired];
    },
    now,
  );

  assert.deepEqual(requested, [
    {
      userId: "verified-token-subject",
      options: { onlyActiveSessions: true },
    },
  ]);
  assert.equal(sessions.length, 1);
  assert.equal(sessions[0].id, "active");
  assert.equal("token" in sessions[0], false);
  assert.equal("userId" in sessions[0], false);
});

test("revokes an owned session using its server-side token", async () => {
  const deleted = [];
  const revoked = await revokeOwnedSession(
    "verified-token-subject",
    "session-2",
    async (userId, options) => {
      assert.equal(userId, "verified-token-subject");
      assert.deepEqual(options, { onlyActiveSessions: true });
      return [
        { id: "session-1", token: "secret-1" },
        { id: "session-2", token: "secret-2" },
      ];
    },
    async (token) => deleted.push(token),
  );

  assert.equal(revoked, true);
  assert.deepEqual(deleted, ["secret-2"]);
});

test("does not delete an unknown or other-user session ID", async () => {
  let deleted = false;
  const revoked = await revokeOwnedSession(
    "verified-token-subject",
    "someone-elses-session",
    async () => [{ id: "owned-session", token: "owned-secret" }],
    async () => {
      deleted = true;
    },
  );

  assert.equal(revoked, false);
  assert.equal(deleted, false);
});
