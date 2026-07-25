import { useEffect, useState, type FormEvent } from "react";
import { AdminDashboard } from "./AdminDashboard";
import { formatDate, initials } from "./format";

const scopeLabels: Record<string, string> = {
  openid: "verify your identity",
  profile: "read your name and profile info",
  email: "read your email address",
  offline_access: "stay signed in on your behalf",
};

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
  const [submitting, setSubmitting] = useState(false);

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
          autoComplete="username"
        />

        <label htmlFor="password">password</label>
        <input
          id="password"
          type="password"
          name="password"
          required
          autoComplete="current-password"
        />

        <p className={`error${error ? " visible" : ""}`}>
          invalid credentials — try again
        </p>

        <button className="btn-primary" type="submit" disabled={submitting}>
          Continue
        </button>

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

function AccountPage() {
  const [user, setUser] = useState<AccountUser | null>(null);
  const [sessionCount, setSessionCount] = useState<number | null>(null);
  const [consents, setConsents] = useState<Consent[]>([]);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

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

        const [sessions, granted] = await Promise.all([
          fetch("/api/auth/list-sessions").then((r) => (r.ok ? r.json() : [])),
          fetch("/api/auth/oauth2/get-consents").then((r) => (r.ok ? r.json() : [])),
        ]);
        setSessionCount(Array.isArray(sessions) ? sessions.length : null);

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
                      .map((scope) => scopeLabels[scope] ?? scope)
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
          <li key={`${scope}-${index}`}>{scopeLabels[scope] ?? scope}</li>
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
