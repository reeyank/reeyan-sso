import { useEffect, useState, type FormEvent } from "react";
import { AdminDashboard } from "./AdminDashboard";
import { formatDate, initials } from "./format";
import {
  authClient,
  conditionalUiAvailable,
  passkeyErrorMessage,
  passkeysSupported,
  type Passkey,
} from "./auth-client";

// Immediate fallback so the consent screen renders without waiting on a
// request; /api/scopes then fills in descriptions for custom scopes too.
const scopeLabels: Record<string, string> = {
  openid: "verify your identity",
  profile: "read your name and profile info",
  email: "read your email address",
  offline_access: "stay signed in on your behalf",
};

function useScopeLabels() {
  const [labels, setLabels] = useState(scopeLabels);
  useEffect(() => {
    void fetch("/api/scopes")
      .then((response) => (response.ok ? response.json() : null))
      .then((data) => {
        if (!data?.scopes) return;
        setLabels((current) => ({
          ...current,
          ...Object.fromEntries(
            data.scopes.map((scope: { value: string; description: string }) => [
              scope.value,
              scope.description,
            ]),
          ),
        }));
      })
      .catch(() => {
        // Falls back to the built-in labels above.
      });
  }, []);
  return labels;
}

function PageFrame({
  title,
  children,
  footer,
}: {
  title: string;
  children: React.ReactNode;
  footer: React.ReactNode;
}) {
  return (
    <>
      <div className="grain" />
      <main className="stage">
        <p className="eyebrow">reeyan</p>
        <h1 className="headline">{title}</h1>
        <div className="panel">{children}</div>
        <p className="footer-note">{footer}</p>
      </main>
    </>
  );
}

function redirectTarget(fallback: string) {
  const query = new URLSearchParams(window.location.search);
  return (
    query.get("redirect_to") ??
    query.get("callbackURL") ??
    query.get("callbackUrl") ??
    fallback
  );
}

function SignInPage() {
  const redirectTo = redirectTarget("/");
  const [error, setError] = useState(false);
  const [passkeyError, setPasskeyError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [passkeyReady] = useState(passkeysSupported);

  useEffect(() => {
    if (!passkeyReady) return;
    let cancelled = false;
    // Conditional mediation lets the browser offer a saved passkey straight
    // from the email field, with no button press at all.
    void (async () => {
      if (!(await conditionalUiAvailable()) || cancelled) return;
      try {
        const result = await authClient.signIn.passkey({ autoFill: true });
        if (!cancelled && !result?.error) window.location.href = redirectTo;
      } catch {
        // An abandoned autofill prompt is not an error worth showing.
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [passkeyReady, redirectTo]);

  async function signInWithPasskey() {
    setError(false);
    setPasskeyError(null);
    setSubmitting(true);
    try {
      const result = await authClient.signIn.passkey();
      if (result?.error) throw new Error(result.error.message);
      window.location.href = redirectTo;
      return;
    } catch (cause) {
      setPasskeyError(passkeyErrorMessage(cause, "passkey sign-in failed"));
    }
    setSubmitting(false);
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(false);
    setSubmitting(true);

    const data = new FormData(event.currentTarget);

    try {
      const response = await fetch("/api/auth/sign-in/email", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: data.get("email"),
          password: data.get("password"),
        }),
      });

      if (response.ok) {
        window.location.href = redirectTo;
        return;
      }
    } catch {
      // The original page reports all failed sign-in requests identically.
    }

    setSubmitting(false);
    setError(true);
  }

  return (
    <PageFrame
      title="Sign In"
      footer={
        <>
          self-hosted · protected by <span className="accent">better-auth</span>
        </>
      }
    >
      <form onSubmit={handleSubmit}>
        <label htmlFor="email">email</label>
        <input
          id="email"
          type="email"
          name="email"
          required
          autoComplete={passkeyReady ? "username webauthn" : "username"}
        />

        <label htmlFor="password">password</label>
        <input
          id="password"
          type="password"
          name="password"
          required
          autoComplete="current-password"
        />

        <p className={`error${error || passkeyError ? " visible" : ""}`}>
          {passkeyError ?? "invalid credentials — try again"}
        </p>

        <button className="btn-primary" type="submit" disabled={submitting}>
          Continue
        </button>

        {passkeyReady ? (
          <>
            <p className="divider">
              <span>or</span>
            </p>
            <button
              className="btn-deny"
              type="button"
              disabled={submitting}
              onClick={() => void signInWithPasskey()}
            >
              Use a passkey
            </button>
          </>
        ) : null}

        <p className="form-switch">
          No account?{" "}
          <a href={`/sign-up${window.location.search}`}>Create one</a>
        </p>
      </form>
    </PageFrame>
  );
}

function SignUpPage() {
  const redirectTo = redirectTarget("/");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);

    if (data.get("password") !== data.get("confirm")) {
      setError("passwords do not match");
      return;
    }

    setError(null);
    setSubmitting(true);

    try {
      const response = await fetch("/api/auth/sign-up/email", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: data.get("name"),
          email: data.get("email"),
          password: data.get("password"),
        }),
      });

      if (response.ok) {
        window.location.href = redirectTo;
        return;
      }

      // Unlike sign-in, the reason matters here: an account can fail to be
      // created for reasons the person can act on.
      let message = "could not create the account — try again";
      try {
        const body = (await response.json()) as { message?: string };
        if (body.message) message = body.message.toLowerCase();
      } catch {
        // Not every failure carries a JSON body.
      }
      setError(message);
    } catch {
      setError("could not create the account — try again");
    }

    setSubmitting(false);
  }

  return (
    <PageFrame
      title="Sign Up"
      footer={
        <>
          self-hosted · protected by <span className="accent">better-auth</span>
        </>
      }
    >
      <form onSubmit={handleSubmit}>
        <label htmlFor="name">name</label>
        <input id="name" name="name" required autoComplete="name" />

        <label htmlFor="email">email</label>
        <input
          id="email"
          type="email"
          name="email"
          required
          autoComplete="username"
        />

        <label htmlFor="password">password</label>
        <input
          id="password"
          type="password"
          name="password"
          minLength={8}
          required
          autoComplete="new-password"
        />

        <label htmlFor="confirm">confirm password</label>
        <input
          id="confirm"
          type="password"
          name="confirm"
          minLength={8}
          required
          autoComplete="new-password"
        />

        <p className={`error${error ? " visible" : ""}`}>
          {error ?? "could not create the account"}
        </p>

        <button className="btn-primary" type="submit" disabled={submitting}>
          Create account
        </button>

        <p className="form-switch">
          Already have an account?{" "}
          <a href={`/sign-in${window.location.search}`}>Sign in</a>
        </p>
      </form>
    </PageFrame>
  );
}

type AccountUser = {
  id: string;
  name: string;
  email: string;
  emailVerified?: boolean;
  role?: string;
  createdAt: string;
};

type Consent = {
  id: string;
  clientId: string;
  scopes: string | string[] | null;
  createdAt: string;
  clientName?: string;
};

function scopeList(scopes: Consent["scopes"]) {
  if (!scopes) return [];
  return Array.isArray(scopes) ? scopes : scopes.split(/[\s,]+/).filter(Boolean);
}

// A name the person will recognise later in the list.
function defaultPasskeyName() {
  const agent = navigator.userAgent;
  const os =
    /Mac OS X|Macintosh/.test(agent) ? "Mac"
    : /Windows/.test(agent) ? "Windows"
    : /iPhone|iPad/.test(agent) ? "iPhone"
    : /Android/.test(agent) ? "Android"
    : /Linux/.test(agent) ? "Linux"
    : "This device";
  return os;
}

function AccountPage() {
  const labels = useScopeLabels();
  const [user, setUser] = useState<AccountUser | null>(null);
  const [sessionCount, setSessionCount] = useState<number | null>(null);
  const [consents, setConsents] = useState<Consent[]>([]);
  const [passkeys, setPasskeys] = useState<Passkey[]>([]);
  const [passkeyReady] = useState(passkeysSupported);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  useEffect(() => {
    document.title = "reeyan — account";
    void (async () => {
      try {
        const session = await fetch("/api/auth/get-session").then((r) => r.json());
        if (!session?.user) {
          window.location.href = "/sign-in?callbackURL=%2F";
          return;
        }
        setUser(session.user);

        const [sessions, granted, keys] = await Promise.all([
          fetch("/api/auth/list-sessions").then((r) => (r.ok ? r.json() : [])),
          fetch("/api/auth/oauth2/get-consents").then((r) => (r.ok ? r.json() : [])),
          fetch("/api/auth/passkey/list-user-passkeys").then((r) =>
            r.ok ? r.json() : [],
          ),
        ]);
        setSessionCount(Array.isArray(sessions) ? sessions.length : null);
        setPasskeys(Array.isArray(keys) ? keys : []);

        const list: Consent[] = Array.isArray(granted) ? granted : [];
        // Consent rows only carry the client id, so each name is looked up
        // through the endpoint that exposes public client fields.
        const named = await Promise.all(
          list.map(async (consent) => {
            try {
              const client = await fetch(
                `/api/auth/oauth2/public-client?client_id=${encodeURIComponent(consent.clientId)}`,
              ).then((r) => (r.ok ? r.json() : null));
              return { ...consent, clientName: client?.client_name };
            } catch {
              return consent;
            }
          }),
        );
        setConsents(named);
      } catch {
        window.location.href = "/sign-in?callbackURL=%2F";
      }
    })();
  }, []);

  async function signOut() {
    setBusy("sign-out");
    try {
      const response = await fetch("/api/auth/sign-out", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: "{}",
      });
      if (!response.ok) throw new Error();
      window.location.href = "/sign-in";
    } catch {
      setError("could not sign out — try again");
      setBusy(null);
    }
  }

  async function addPasskey() {
    setBusy("add-passkey");
    setError(null);
    setNotice(null);
    try {
      const label =
        window.prompt("Name this passkey", defaultPasskeyName()) ?? undefined;
      const result = await authClient.passkey.addPasskey({ name: label });
      if (result?.error) throw new Error(result.error.message);
      const keys = await fetch("/api/auth/passkey/list-user-passkeys").then((r) =>
        r.ok ? r.json() : [],
      );
      setPasskeys(Array.isArray(keys) ? keys : []);
      setNotice("passkey added");
    } catch (cause) {
      setError(passkeyErrorMessage(cause, "could not add that passkey"));
    } finally {
      setBusy(null);
    }
  }

  async function removePasskey(key: Passkey) {
    // The last passkey is still removable, but say what it costs.
    if (
      !window.confirm(
        `Remove ${key.name || "this passkey"}? You will not be able to sign in with it again.`,
      )
    ) {
      return;
    }
    setBusy(key.id);
    setError(null);
    setNotice(null);
    try {
      const response = await fetch("/api/auth/passkey/delete-passkey", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: key.id }),
      });
      if (!response.ok) throw new Error();
      setPasskeys((current) => current.filter((item) => item.id !== key.id));
      setNotice("passkey removed");
    } catch {
      setError("could not remove that passkey — try again");
    } finally {
      setBusy(null);
    }
  }

  async function revoke(consent: Consent) {
    setBusy(consent.id);
    setError(null);
    try {
      const response = await fetch("/api/auth/oauth2/delete-consent", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: consent.id }),
      });
      if (!response.ok) throw new Error();
      setConsents((current) => current.filter((item) => item.id !== consent.id));
    } catch {
      setError("could not revoke that application — try again");
    } finally {
      setBusy(null);
    }
  }

  if (!user) {
    return (
      <PageFrame title="Account" footer={<>loading your details</>}>
        <div className="loading-line" />
      </PageFrame>
    );
  }

  return (
    <PageFrame
      title="Account"
      footer={
        <>
          self-hosted · protected by <span className="accent">better-auth</span>
        </>
      }
    >
      <div className="account-identity">
        <div className="avatar">{initials(user.name, user.email)}</div>
        <div>
          <strong>{user.name}</strong>
          <span>{user.email}</span>
        </div>
      </div>

      <dl className="account-facts">
        <div>
          <dt>Role</dt>
          <dd>{user.role === "admin" ? "Administrator" : "Member"}</dd>
        </div>
        <div>
          <dt>Member since</dt>
          <dd>{formatDate(user.createdAt)}</dd>
        </div>
        <div>
          <dt>Email</dt>
          <dd>{user.emailVerified ? "Verified" : "Unverified"}</dd>
        </div>
        <div>
          <dt>Active sessions</dt>
          <dd>{sessionCount ?? "—"}</dd>
        </div>
      </dl>

      {passkeyReady ? (
        <section className="account-apps">
          <h2>Passkeys</h2>
          {passkeys.length ? (
            <ul>
              {passkeys.map((key) => (
                <li key={key.id}>
                  <div>
                    <strong>{key.name || "Unnamed passkey"}</strong>
                    <span>
                      {key.deviceType === "multiDevice" ? "Synced" : "This device"}
                      {key.backedUp ? " · backed up" : ""} · added{" "}
                      {formatDate(key.createdAt)}
                    </span>
                  </div>
                  <button
                    className="link-button"
                    type="button"
                    disabled={busy === key.id}
                    onClick={() => void removePasskey(key)}
                  >
                    Remove
                  </button>
                </li>
              ))}
            </ul>
          ) : (
            <p className="account-hint">
              No passkeys yet. Add one to sign in with Touch ID, Face ID, Windows
              Hello, or a security key instead of your password.
            </p>
          )}
          <button
            className="link-button add"
            type="button"
            disabled={busy === "add-passkey"}
            onClick={() => void addPasskey()}
          >
            {busy === "add-passkey" ? "Waiting for device…" : "+ Add a passkey"}
          </button>
        </section>
      ) : null}

      {consents.length ? (
        <section className="account-apps">
          <h2>Connected applications</h2>
          <ul>
            {consents.map((consent) => (
              <li key={consent.id}>
                <div>
                  <strong>{consent.clientName ?? consent.clientId}</strong>
                  <span>
                    {scopeList(consent.scopes)
                      .map((scope) => labels[scope] ?? scope)
                      .join(" · ") || "no scopes"}
                  </span>
                </div>
                <button
                  className="link-button"
                  type="button"
                  disabled={busy === consent.id}
                  onClick={() => void revoke(consent)}
                >
                  Revoke
                </button>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {error ? <p className="error visible">{error}</p> : null}
      {notice ? <p className="account-notice">{notice}</p> : null}

      <div className="account-actions">
        {user.role === "admin" ? (
          <a className="btn-deny" href="/admin">
            Administration
          </a>
        ) : null}
        <button
          className="btn-primary"
          type="button"
          disabled={busy === "sign-out"}
          onClick={() => void signOut()}
        >
          {busy === "sign-out" ? "Signing out…" : "Sign out"}
        </button>
      </div>
    </PageFrame>
  );
}

function ConsentPage() {
  const labels = useScopeLabels();
  const query = new URLSearchParams(window.location.search);
  const clientName = query.get("client_name") ?? "this application";
  const scopes = (query.get("scope") ?? "openid profile email").split(" ");
  const acceptUrl = query.get("accept_url") ?? "/api/auth/oauth2/consent";
  const denyUrl = query.get("deny_url") ?? "/api/auth/oauth2/consent";
  const [error, setError] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  async function submitConsent(accept: boolean) {
    setError(false);
    setSubmitting(true);

    try {
      const response = await fetch(accept ? acceptUrl : denyUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          accept,
          oauth_query: window.location.search.slice(1),
        }),
      });

      let data: { url?: string; redirect_uri?: string } = {};
      try {
        data = await response.json();
      } catch {
        // Consent failures can return a non-JSON response.
      }

      const redirectTo = data.url || data.redirect_uri;
      if (response.ok && redirectTo) {
        window.location.href = redirectTo;
        return;
      }
    } catch {
      // Match the existing generic consent failure state.
    }

    setSubmitting(false);
    setError(true);
  }

  return (
    <PageFrame
      title="Authorize"
      footer={
        <>
          granting access to <span className="accent">{clientName}</span>
        </>
      }
    >
      <ul className="scopes">
        {scopes.map((scope, index) => (
          <li key={`${scope}-${index}`}>{labels[scope] ?? scope}</li>
        ))}
      </ul>

      <p className={`error${error ? " visible" : ""}`}>
        authorization failed — try again
      </p>

      <div className="row">
        <button
          className="btn-deny"
          type="button"
          disabled={submitting}
          onClick={() => void submitConsent(false)}
        >
          Deny
        </button>
        <button
          className="btn-allow"
          type="button"
          disabled={submitting}
          onClick={() => void submitConsent(true)}
        >
          Allow
        </button>
      </div>
    </PageFrame>
  );
}

export function App() {
  const path = window.location.pathname;

  if (path === "/admin") {
    return <AdminDashboard />;
  }

  if (path === "/consent") {
    document.title = `reeyan — authorize ${
      new URLSearchParams(window.location.search).get("client_name") ??
      "this application"
    }`;
    return <ConsentPage />;
  }

  if (path === "/sign-up") {
    document.title = "reeyan — sign up";
    return <SignUpPage />;
  }

  if (path === "/") {
    return <AccountPage />;
  }

  document.title = "reeyan — sign in";
  return <SignInPage />;
}
