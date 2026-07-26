import assert from "node:assert/strict";
import test from "node:test";
import { listPublicSessions } from "../dist/server/sessions.js";

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
