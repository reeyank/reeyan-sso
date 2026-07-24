import { useState, type FormEvent } from "react";
import { AdminDashboard } from "./AdminDashboard";

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

function SignInPage() {
  const query = new URLSearchParams(window.location.search);
  const redirectTo =
    query.get("redirect_to") ??
    query.get("callbackURL") ??
    query.get("callbackUrl") ??
    "/";
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
      </form>
    </PageFrame>
  );
}

function ConsentPage() {
  const query = new URLSearchParams(window.location.search);
  const clientName = query.get("client_name") ?? "this application";
  const scopes = (query.get("scope") ?? "openid profile email").split(" ");
  const acceptUrl =
    query.get("accept_url") ?? "/api/auth/oauth2/consent";
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
  if (window.location.pathname === "/admin") {
    return <AdminDashboard />;
  }

  if (window.location.pathname === "/consent") {
    document.title = `reeyan — authorize ${
      new URLSearchParams(window.location.search).get("client_name") ??
      "this application"
    }`;
    return <ConsentPage />;
  }

  document.title = "reeyan — sign in";
  return <SignInPage />;
}
