type StoredSession = {
  id: string;
  createdAt: Date;
  updatedAt: Date;
  expiresAt: Date;
  ipAddress?: string | null;
  userAgent?: string | null;
};

type RevocableSession = {
  id: string;
  token: string;
};

type ListSessions = (
  userId: string,
  options: { onlyActiveSessions: true },
) => Promise<StoredSession[]>;

type ListRevocableSessions = (
  userId: string,
  options: { onlyActiveSessions: true },
) => Promise<RevocableSession[]>;

export function oauthJwksUrl(baseUrl: string) {
  return `${baseUrl.replace(/\/+$/, "")}/jwks`;
}

// Keep the resource endpoint on Better Auth's storage abstraction and return a
// deliberately small DTO. In particular, never expose a browser session token
// or its userId even if an adapter includes those fields in its result.
export async function listPublicSessions(
  userId: string,
  listSessions: ListSessions,
  now = Date.now(),
) {
  const sessions = await listSessions(userId, { onlyActiveSessions: true });
  return sessions
    .filter((session) => new Date(session.expiresAt).getTime() > now)
    .map((session) => ({
      id: session.id,
      createdAt: session.createdAt,
      updatedAt: session.updatedAt,
      expiresAt: session.expiresAt,
      ipAddress: session.ipAddress ?? null,
      userAgent: session.userAgent ?? null,
    }));
}

// Resolve the opaque browser-session token only after listing by the verified
// OAuth subject. A caller can never use this endpoint to revoke another user's
// session, and the browser token is never returned to them.
export async function revokeOwnedSession(
  userId: string,
  sessionId: string,
  listSessions: ListRevocableSessions,
  deleteSession: (token: string) => Promise<void>,
) {
  const sessions = await listSessions(userId, { onlyActiveSessions: true });
  const target = sessions.find((session) => session.id === sessionId);
  if (!target) return false;
  await deleteSession(target.token);
  return true;
}
