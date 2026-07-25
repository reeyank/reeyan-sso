import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type FormEvent,
  type ReactNode,
} from "react";

type AdminUser = {
  id: string;
  name: string;
  email: string;
  role?: string;
  banned: boolean | null;
  banReason?: string | null;
  banExpires?: string | null;
  createdAt: string;
};

type OAuthClient = {
  client_id: string;
  client_secret?: string;
  client_name?: string;
  redirect_uris?: string[];
  grant_types?: string[];
  token_endpoint_auth_method?: string;
  type?: string;
};

type UserSession = {
  id: string;
  token: string;
  createdAt: string;
  expiresAt: string;
  ipAddress?: string | null;
  userAgent?: string | null;
};

type Consent = {
  id: string;
  clientId: string;
  clientName?: string | null;
  scopes: string | string[] | null;
  createdAt: string;
};

type AuditEntry = {
  id: number;
  createdAt: string;
  actorEmail?: string | null;
  action: string;
  targetType?: string | null;
  targetId?: string | null;
  targetLabel?: string | null;
  detail?: Record<string, unknown> | null;
  ip?: string | null;
};

type Stats = {
  totalUsers: number;
  admins: number;
  suspended: number;
  clients: number;
  consents: number;
  activeSessions: number;
};

type SessionResponse = {
  user?: AdminUser;
  session?: { id: string; impersonatedBy?: string | null };
};

type UsersResponse = { users: AdminUser[]; total: number };

type Discovery = Record<string, unknown>;

type Notice = { tone: "success" | "error"; message: string };

type View = "users" | "applications" | "audit" | "endpoints";

const API = "/api/auth";
const ADMIN_API = "/api/admin";
const PAGE_SIZE = 25;
const AUDIT_PAGE_SIZE = 50;

async function request<T>(url: string, options: RequestInit = {}): Promise<T> {
  const method = options.method ?? "GET";
  // Better Auth rejects a bodyless POST with 415 (missing Content-Type) and a
  // JSON Content-Type with no body with 400, so every write needs both — even
  // endpoints like /sign-out that take no arguments.
  const sendsBody = method !== "GET" && method !== "HEAD";

  const response = await fetch(url, {
    ...options,
    ...(sendsBody ? { body: options.body ?? "{}" } : {}),
    headers: {
      ...(sendsBody ? { "Content-Type": "application/json" } : {}),
      ...options.headers,
    },
  });

  if (!response.ok) {
    let message = "The request could not be completed.";
    try {
      const data = (await response.json()) as {
        message?: string;
        error?: string;
        error_description?: string;
      };
      message =
        data.message ?? data.error_description ?? data.error ?? message;
    } catch {
      // Some Better Auth errors do not include a JSON response.
    }
    throw new Error(message);
  }

  if (response.status === 204) return undefined as T;
  const text = await response.text();
  return (text ? JSON.parse(text) : undefined) as T;
}

const apiRequest = <T,>(path: string, options?: RequestInit) =>
  request<T>(`${API}${path}`, options);

const adminRequest = <T,>(path: string, options?: RequestInit) =>
  request<T>(`${ADMIN_API}${path}`, options);

function initials(name: string, email: string) {
  const source = name.trim() || email;
  return source
    .split(/[\s@._-]+/)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join("");
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat("en", {
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(new Date(value));
}

function formatDateTime(value: string) {
  return new Intl.DateTimeFormat("en", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(value));
}

function scopeList(scopes: Consent["scopes"]) {
  if (!scopes) return [];
  return Array.isArray(scopes) ? scopes : scopes.split(/[\s,]+/).filter(Boolean);
}

function describeAgent(agent?: string | null) {
  if (!agent) return "Unknown client";
  const browser =
    /Edg\//.test(agent) ? "Edge"
    : /OPR\//.test(agent) ? "Opera"
    : /Chrome\//.test(agent) ? "Chrome"
    : /Safari\//.test(agent) ? "Safari"
    : /Firefox\//.test(agent) ? "Firefox"
    : "Browser";
  const os =
    /Windows/.test(agent) ? "Windows"
    : /Mac OS X|Macintosh/.test(agent) ? "macOS"
    : /Android/.test(agent) ? "Android"
    : /iPhone|iPad/.test(agent) ? "iOS"
    : /Linux/.test(agent) ? "Linux"
    : "";
  return os ? `${browser} on ${os}` : browser;
}

function Modal({
  title,
  eyebrow,
  wide,
  children,
  onClose,
}: {
  title: string;
  eyebrow: string;
  wide?: boolean;
  children: ReactNode;
  onClose: () => void;
}) {
  useEffect(() => {
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [onClose]);

  return (
    <div className="modal-backdrop" role="presentation" onMouseDown={onClose}>
      <section
        className={wide ? "modal modal-wide" : "modal"}
        role="dialog"
        aria-modal="true"
        aria-labelledby="modal-title"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <header className="modal-header">
          <div>
            <p className="section-kicker">{eyebrow}</p>
            <h2 id="modal-title">{title}</h2>
          </div>
          <button
            className="icon-button"
            type="button"
            aria-label="Close"
            title="Close"
            onClick={onClose}
          >
            ×
          </button>
        </header>
        {children}
      </section>
    </div>
  );
}

function Pager({
  page,
  pageSize,
  total,
  onChange,
}: {
  page: number;
  pageSize: number;
  total: number;
  onChange: (page: number) => void;
}) {
  const pages = Math.max(Math.ceil(total / pageSize), 1);
  const first = total === 0 ? 0 : page * pageSize + 1;
  const last = Math.min((page + 1) * pageSize, total);

  return (
    <div className="pager">
      <span>
        {first}–{last} of {total}
      </span>
      <div className="pager-controls">
        <button
          className="button-secondary compact"
          type="button"
          disabled={page === 0}
          onClick={() => onChange(page - 1)}
        >
          Previous
        </button>
        <span className="pager-position">
          Page {page + 1} of {pages}
        </span>
        <button
          className="button-secondary compact"
          type="button"
          disabled={page + 1 >= pages}
          onClick={() => onChange(page + 1)}
        >
          Next
        </button>
      </div>
    </div>
  );
}

function LoadingState() {
  return (
    <main className="admin-gate">
      <p className="brand-word">reeyan</p>
      <div className="loading-line" />
      <p>Checking administrator access</p>
    </main>
  );
}

function AccessState({
  forbidden,
  impersonating,
  notice,
  onSignOut,
  onStopImpersonating,
}: {
  forbidden: boolean;
  impersonating: boolean;
  notice: Notice | null;
  onSignOut: () => void;
  onStopImpersonating: () => void;
}) {
  return (
    <main className="admin-gate">
      <p className="brand-word">reeyan</p>
      <p className="section-kicker">Administration</p>
      <h1>{impersonating ? "Impersonating" : forbidden ? "Access denied" : "Sign in required"}</h1>
      <p className="gate-copy">
        {impersonating
          ? "You are signed in as another user. Stop impersonating to return to your own account."
          : forbidden
            ? "This account does not have administrator privileges."
            : "Use an administrator account to continue."}
      </p>
      {notice ? <p className="gate-error">{notice.message}</p> : null}
      <div className="gate-actions">
        {impersonating ? (
          <button
            className="button-primary"
            type="button"
            onClick={onStopImpersonating}
          >
            Stop impersonating
          </button>
        ) : null}
        {forbidden && !impersonating ? (
          <button className="button-secondary" type="button" onClick={onSignOut}>
            Sign out
          </button>
        ) : null}
        {!impersonating ? (
          <a className="button-primary" href="/sign-in?callbackURL=%2Fadmin">
            Sign in
          </a>
        ) : null}
      </div>
    </main>
  );
}

export function AdminDashboard() {
  const [session, setSession] = useState<SessionResponse | null>(null);
  const [access, setAccess] = useState<
    "loading" | "signed-out" | "forbidden" | "admin"
  >("loading");

  const [users, setUsers] = useState<AdminUser[]>([]);
  const [userTotal, setUserTotal] = useState(0);
  const [userPage, setUserPage] = useState(0);
  const [search, setSearch] = useState("");
  const [searchField, setSearchField] = useState<"email" | "name">("email");
  const [debouncedSearch, setDebouncedSearch] = useState("");

  const [clients, setClients] = useState<OAuthClient[]>([]);
  const [stats, setStats] = useState<Stats | null>(null);

  const [audit, setAudit] = useState<AuditEntry[]>([]);
  const [auditTotal, setAuditTotal] = useState(0);
  const [auditPage, setAuditPage] = useState(0);

  const [discovery, setDiscovery] = useState<Discovery | null>(null);

  const [activeView, setActiveView] = useState<View>("users");
  const [busyId, setBusyId] = useState<string | null>(null);
  const [notice, setNotice] = useState<Notice | null>(null);

  const [showNewUser, setShowNewUser] = useState(false);
  const [showNewClient, setShowNewClient] = useState(false);
  const [editingClient, setEditingClient] = useState<OAuthClient | null>(null);
  const [credentials, setCredentials] = useState<OAuthClient | null>(null);

  const [managed, setManaged] = useState<AdminUser | null>(null);
  const [managedSessions, setManagedSessions] = useState<UserSession[] | null>(null);
  const [managedConsents, setManagedConsents] = useState<Consent[] | null>(null);
  const [suspending, setSuspending] = useState<AdminUser | null>(null);
  const [resetting, setResetting] = useState<AdminUser | null>(null);
  const [deleting, setDeleting] = useState<AdminUser | null>(null);
  const [deleteConfirm, setDeleteConfirm] = useState("");

  useEffect(() => {
    document.body.classList.add("admin-view");
    document.title = "reeyan — administration";
    return () => document.body.classList.remove("admin-view");
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setDebouncedSearch(search.trim());
      setUserPage(0);
    }, 300);
    return () => window.clearTimeout(timer);
  }, [search]);

  function showError(error: unknown) {
    setNotice({
      tone: "error",
      message: error instanceof Error ? error.message : "Something went wrong.",
    });
  }

  // Paging happens server-side: the browser only ever holds one page, so a
  // directory of any size loads in constant time.
  const loadUsers = useCallback(async () => {
    const params = new URLSearchParams({
      limit: String(PAGE_SIZE),
      offset: String(userPage * PAGE_SIZE),
      sortBy: "createdAt",
      sortDirection: "desc",
    });
    if (debouncedSearch) {
      params.set("searchValue", debouncedSearch);
      params.set("searchField", searchField);
      params.set("searchOperator", "contains");
    }
    const data = await apiRequest<UsersResponse>(`/admin/list-users?${params}`);
    setUsers(data.users);
    setUserTotal(data.total);
  }, [debouncedSearch, searchField, userPage]);

  const loadClients = useCallback(async () => {
    const data = await apiRequest<OAuthClient[] | null>("/oauth2/get-clients");
    setClients(data ?? []);
  }, []);

  const loadStats = useCallback(async () => {
    setStats(await adminRequest<Stats>("/stats"));
  }, []);

  const loadAudit = useCallback(async () => {
    const data = await adminRequest<{ entries: AuditEntry[]; total: number }>(
      `/audit?limit=${AUDIT_PAGE_SIZE}&offset=${auditPage * AUDIT_PAGE_SIZE}`,
    );
    setAudit(data.entries);
    setAuditTotal(data.total);
  }, [auditPage]);

  useEffect(() => {
    void (async () => {
      try {
        const current = await apiRequest<SessionResponse>("/get-session");
        setSession(current);
        if (!current.user) return setAccess("signed-out");
        if (current.user.role !== "admin") return setAccess("forbidden");
        setAccess("admin");
        await Promise.all([loadUsers(), loadClients(), loadStats()]);
      } catch {
        setAccess("signed-out");
      }
    })();
    // Deliberately runs once: later refreshes are driven by the effects below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (access !== "admin") return;
    void loadUsers().catch(showError);
  }, [access, loadUsers]);

  useEffect(() => {
    if (access !== "admin" || activeView !== "audit") return;
    void loadAudit().catch(showError);
  }, [access, activeView, loadAudit]);

  useEffect(() => {
    if (access !== "admin" || activeView !== "endpoints" || discovery) return;
    void request<Discovery>(`${API}/.well-known/openid-configuration`)
      .then(setDiscovery)
      .catch(showError);
  }, [access, activeView, discovery]);

  const impersonating = Boolean(session?.session?.impersonatedBy);

  async function refresh() {
    await Promise.all([loadUsers(), loadStats()]);
  }

  async function signOut() {
    setBusyId("sign-out");
    setNotice(null);
    try {
      await apiRequest("/sign-out", { method: "POST" });
      window.location.href = "/sign-in?callbackURL=%2Fadmin";
    } catch (error) {
      // Redirecting on failure used to make a failed sign-out look successful:
      // the session survived and /sign-in sent the user straight back in.
      showError(error);
      setBusyId(null);
    }
  }

  async function stopImpersonating() {
    try {
      await apiRequest("/admin/stop-impersonating", { method: "POST" });
      window.location.reload();
    } catch (error) {
      showError(error);
    }
  }

  async function run(id: string, action: () => Promise<void>, success?: string) {
    setBusyId(id);
    setNotice(null);
    try {
      await action();
      if (success) setNotice({ tone: "success", message: success });
    } catch (error) {
      showError(error);
    } finally {
      setBusyId(null);
    }
  }

  const setRole = (user: AdminUser) => {
    const role = user.role === "admin" ? "user" : "admin";
    return run(
      user.id,
      async () => {
        await apiRequest("/admin/set-role", {
          method: "POST",
          body: JSON.stringify({ userId: user.id, role }),
        });
        await refresh();
      },
      `${user.name} is now ${role}.`,
    );
  };

  const restoreUser = (user: AdminUser) =>
    run(
      user.id,
      async () => {
        await apiRequest("/admin/unban-user", {
          method: "POST",
          body: JSON.stringify({ userId: user.id }),
        });
        await refresh();
        setManaged((current) =>
          current && current.id === user.id
            ? { ...current, banned: false, banReason: null }
            : current,
        );
      },
      `${user.name} was restored.`,
    );

  async function suspendUser(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!suspending) return;
    const data = new FormData(event.currentTarget);
    const seconds = Number(data.get("expiresIn"));
    const user = suspending;

    await run(
      "suspend",
      async () => {
        await apiRequest("/admin/ban-user", {
          method: "POST",
          body: JSON.stringify({
            userId: user.id,
            banReason: String(data.get("reason") || "Suspended by administrator"),
            ...(seconds > 0 ? { banExpiresIn: seconds } : {}),
          }),
        });
        await refresh();
        setSuspending(null);
        setManaged(null);
      },
      `${user.name} was suspended.`,
    );
  }

  async function resetPassword(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!resetting) return;
    const data = new FormData(event.currentTarget);
    const password = String(data.get("password"));
    if (password !== String(data.get("confirm"))) {
      setNotice({ tone: "error", message: "Passwords do not match." });
      return;
    }
    const user = resetting;

    await run(
      "reset-password",
      async () => {
        await apiRequest("/admin/set-user-password", {
          method: "POST",
          body: JSON.stringify({ userId: user.id, newPassword: password }),
        });
        setResetting(null);
      },
      `Password updated for ${user.name}.`,
    );
  }

  async function deleteUser() {
    if (!deleting) return;
    const user = deleting;
    await run(
      "delete-user",
      async () => {
        await apiRequest("/admin/remove-user", {
          method: "POST",
          body: JSON.stringify({ userId: user.id }),
        });
        await refresh();
        setDeleting(null);
        setDeleteConfirm("");
        setManaged(null);
      },
      `${user.email} was deleted.`,
    );
  }

  const impersonate = (user: AdminUser) =>
    run(user.id, async () => {
      await apiRequest("/admin/impersonate-user", {
        method: "POST",
        body: JSON.stringify({ userId: user.id }),
      });
      window.location.reload();
    });

  const openManage = (user: AdminUser) => {
    setManaged(user);
    setManagedSessions(null);
    setManagedConsents(null);
    void (async () => {
      try {
        const [sessions, consents] = await Promise.all([
          apiRequest<{ sessions: UserSession[] }>("/admin/list-user-sessions", {
            method: "POST",
            body: JSON.stringify({ userId: user.id }),
          }),
          adminRequest<{ consents: Consent[] }>(`/consents?userId=${user.id}`),
        ]);
        setManagedSessions(sessions.sessions ?? []);
        setManagedConsents(consents.consents ?? []);
      } catch (error) {
        showError(error);
        setManagedSessions([]);
        setManagedConsents([]);
      }
    })();
  };

  const revokeSession = (token: string) =>
    run(
      token,
      async () => {
        await apiRequest("/admin/revoke-user-session", {
          method: "POST",
          body: JSON.stringify({ sessionToken: token }),
        });
        setManagedSessions(
          (current) => current?.filter((item) => item.token !== token) ?? null,
        );
        await loadStats();
      },
      "Session revoked.",
    );

  const revokeAllSessions = (user: AdminUser) =>
    run(
      "revoke-all",
      async () => {
        await apiRequest("/admin/revoke-user-sessions", {
          method: "POST",
          body: JSON.stringify({ userId: user.id }),
        });
        setManagedSessions([]);
        await loadStats();
      },
      `Signed ${user.name} out everywhere.`,
    );

  const revokeConsent = (consent: Consent) =>
    run(
      consent.id,
      async () => {
        await adminRequest("/consents/revoke", {
          method: "POST",
          body: JSON.stringify({ consentId: consent.id }),
        });
        setManagedConsents(
          (current) => current?.filter((item) => item.id !== consent.id) ?? null,
        );
        await loadStats();
      },
      "Access revoked.",
    );

  async function createUser(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    await run(
      "new-user",
      async () => {
        await apiRequest("/admin/create-user", {
          method: "POST",
          body: JSON.stringify({
            name: data.get("name"),
            email: data.get("email"),
            password: data.get("password"),
            role: data.get("role"),
          }),
        });
        await refresh();
        setShowNewUser(false);
      },
      "User created successfully.",
    );
  }

  function readClientForm(data: FormData) {
    return {
      client_name: String(data.get("name")),
      redirect_uris: String(data.get("redirectUris"))
        .split(/\r?\n/)
        .map((value) => value.trim())
        .filter(Boolean),
      type: String(data.get("applicationType")),
    };
  }

  async function createClient(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = readClientForm(new FormData(event.currentTarget));
    const isPublic = form.type !== "web";

    await run(
      "new-client",
      async () => {
        const client = await apiRequest<OAuthClient>("/oauth2/create-client", {
          method: "POST",
          body: JSON.stringify({
            ...form,
            scope: "openid profile email",
            token_endpoint_auth_method: isPublic ? "none" : "client_secret_basic",
            grant_types: ["authorization_code", "refresh_token"],
            response_types: ["code"],
          }),
        });
        await Promise.all([loadClients(), loadStats()]);
        setShowNewClient(false);
        setCredentials(client);
      },
      "Application registered.",
    );
  }

  async function updateClient(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!editingClient) return;
    const form = readClientForm(new FormData(event.currentTarget));

    await run(
      "edit-client",
      async () => {
        await apiRequest("/oauth2/update-client", {
          method: "POST",
          body: JSON.stringify({
            client_id: editingClient.client_id,
            update: form,
          }),
        });
        await loadClients();
        setEditingClient(null);
      },
      "Application updated.",
    );
  }

  async function deleteClient(client: OAuthClient) {
    if (
      !window.confirm(
        `Delete ${client.client_name ?? "this application"}? Existing integrations will stop working.`,
      )
    ) {
      return;
    }
    await run(
      client.client_id,
      async () => {
        await apiRequest("/oauth2/delete-client", {
          method: "POST",
          body: JSON.stringify({ client_id: client.client_id }),
        });
        await Promise.all([loadClients(), loadStats()]);
      },
      "Application deleted.",
    );
  }

  async function rotateSecret(client: OAuthClient) {
    if (
      !window.confirm(
        "Rotate this client secret now? The old secret will stop working.",
      )
    ) {
      return;
    }
    await run(
      client.client_id,
      async () => {
        const updated = await apiRequest<OAuthClient>(
          "/oauth2/client/rotate-secret",
          {
            method: "POST",
            body: JSON.stringify({ client_id: client.client_id }),
          },
        );
        setCredentials(updated);
      },
      "Client secret rotated.",
    );
  }

  async function copyValue(value: string) {
    await navigator.clipboard.writeText(value);
    setNotice({ tone: "success", message: "Copied to clipboard." });
  }

  const headings: Record<View, string> = {
    users: "Directory",
    applications: "Applications",
    audit: "Audit log",
    endpoints: "Endpoints",
  };

  const endpointRows = useMemo(() => {
    if (!discovery) return [];
    const keys = [
      ["issuer", "Issuer"],
      ["authorization_endpoint", "Authorization"],
      ["token_endpoint", "Token"],
      ["userinfo_endpoint", "UserInfo"],
      ["jwks_uri", "JWKS"],
      ["registration_endpoint", "Registration"],
      ["introspection_endpoint", "Introspection"],
      ["revocation_endpoint", "Revocation"],
      ["end_session_endpoint", "End session"],
    ] as const;
    return keys
      .map(([key, label]) => [label, discovery[key]] as const)
      .filter(([, value]) => typeof value === "string") as [string, string][];
  }, [discovery]);

  if (access === "loading") return <LoadingState />;
  if (access !== "admin") {
    return (
      <AccessState
        forbidden={access === "forbidden"}
        impersonating={impersonating}
        notice={notice}
        onSignOut={() => void signOut()}
        onStopImpersonating={() => void stopImpersonating()}
      />
    );
  }

  return (
    <div className="admin-shell">
      <aside className="admin-sidebar">
        <a className="admin-brand" href="/admin" aria-label="reeyan administration">
          <span className="brand-word">reeyan</span>
          <span className="brand-label">SSO administration</span>
        </a>

        <nav className="admin-nav" aria-label="Administration">
          {(
            [
              ["users", "Users", stats?.totalUsers],
              ["applications", "Applications", stats?.clients],
              ["audit", "Audit log", auditTotal || undefined],
              ["endpoints", "Endpoints", undefined],
            ] as [View, string, number | undefined][]
          ).map(([view, label, count]) => (
            <button
              key={view}
              className={activeView === view ? "active" : ""}
              type="button"
              onClick={() => setActiveView(view)}
            >
              <span>{label}</span>
              <span className="nav-count">{count ?? ""}</span>
            </button>
          ))}
        </nav>

        <div className="sidebar-account">
          <div className="avatar">
            {initials(session?.user?.name ?? "", session?.user?.email ?? "")}
          </div>
          <div className="account-copy">
            <strong>{session?.user?.name}</strong>
            <span>{session?.user?.email}</span>
          </div>
          <button
            className="text-button"
            type="button"
            disabled={busyId === "sign-out"}
            onClick={() => void signOut()}
          >
            {busyId === "sign-out" ? "Signing out…" : "Sign out"}
          </button>
        </div>
      </aside>

      <main className="admin-main">
        <header className="admin-topbar">
          <div>
            <p className="section-kicker">Identity provider</p>
            <h1>{headings[activeView]}</h1>
          </div>
          {activeView === "users" || activeView === "applications" ? (
            <button
              className="button-primary"
              type="button"
              onClick={() =>
                activeView === "users"
                  ? setShowNewUser(true)
                  : setShowNewClient(true)
              }
            >
              {activeView === "users" ? "Add user" : "Register app"}
            </button>
          ) : null}
        </header>

        <section className="metric-strip" aria-label="SSO summary">
          <div>
            <span>Total users</span>
            <strong>{stats?.totalUsers ?? "—"}</strong>
          </div>
          <div>
            <span>Administrators</span>
            <strong>{stats?.admins ?? "—"}</strong>
          </div>
          <div>
            <span>Suspended</span>
            <strong>{stats?.suspended ?? "—"}</strong>
          </div>
          <div>
            <span>Active sessions</span>
            <strong>{stats?.activeSessions ?? "—"}</strong>
          </div>
          <div>
            <span>OAuth clients</span>
            <strong>{stats?.clients ?? "—"}</strong>
          </div>
        </section>

        {notice ? (
          <div className={`notice ${notice.tone}`} role="status">
            <span>{notice.message}</span>
            <button
              type="button"
              aria-label="Dismiss notification"
              onClick={() => setNotice(null)}
            >
              ×
            </button>
          </div>
        ) : null}

        {activeView === "users" ? (
          <section className="data-section">
            <div className="section-toolbar">
              <div>
                <h2>People</h2>
                <p>{userTotal} accounts match this view</p>
              </div>
              <div className="toolbar-controls">
                {/* Better Auth searches one column at a time, so the field is
                    an explicit choice rather than a silent guess. */}
                <label className="search-field">
                  <span>Search users</span>
                  <input
                    type="search"
                    placeholder={searchField === "email" ? "Email" : "Name"}
                    value={search}
                    onChange={(event) => setSearch(event.target.value)}
                  />
                </label>
                <label className="field-toggle">
                  <span>Search by</span>
                  <select
                    value={searchField}
                    onChange={(event) => {
                      setSearchField(event.target.value as "email" | "name");
                      setUserPage(0);
                    }}
                  >
                    <option value="email">Email</option>
                    <option value="name">Name</option>
                  </select>
                </label>
              </div>
            </div>

            <div className="user-list">
              <div className="user-row user-row-header" aria-hidden="true">
                <span>User</span>
                <span>Role</span>
                <span>Joined</span>
                <span>Status</span>
                <span>Actions</span>
              </div>
              {users.map((user) => {
                const isCurrentUser = user.id === session?.user?.id;
                return (
                  <article className="user-row" key={user.id}>
                    <div className="user-identity">
                      <div className="avatar">{initials(user.name, user.email)}</div>
                      <div>
                        <strong>{user.name}</strong>
                        <span>{user.email}</span>
                      </div>
                    </div>
                    <span className={`role-badge ${user.role ?? "user"}`}>
                      {user.role ?? "user"}
                    </span>
                    <span className="muted-value">{formatDate(user.createdAt)}</span>
                    <span className={`status ${user.banned ? "blocked" : "active"}`}>
                      {user.banned ? "Suspended" : "Active"}
                    </span>
                    <div className="row-actions">
                      <button
                        className="button-secondary compact"
                        type="button"
                        disabled={busyId === user.id || isCurrentUser}
                        title={isCurrentUser ? "You cannot change your own role" : ""}
                        onClick={() => void setRole(user)}
                      >
                        {user.role === "admin" ? "Make user" : "Make admin"}
                      </button>
                      <button
                        className="text-button"
                        type="button"
                        onClick={() => openManage(user)}
                      >
                        Manage
                      </button>
                    </div>
                  </article>
                );
              })}
              {users.length === 0 ? (
                <div className="empty-state">
                  <strong>No matching users</strong>
                  <span>Try a different {searchField}.</span>
                </div>
              ) : null}
            </div>

            <Pager
              page={userPage}
              pageSize={PAGE_SIZE}
              total={userTotal}
              onChange={setUserPage}
            />
          </section>
        ) : null}

        {activeView === "applications" ? (
          <section className="data-section">
            <div className="section-toolbar">
              <div>
                <h2>OAuth clients</h2>
                <p>Applications registered by this administrator</p>
              </div>
            </div>

            <div className="client-list">
              {clients.map((client) => (
                <article className="client-row" key={client.client_id}>
                  <div className="client-mark">
                    {initials(client.client_name ?? "Application", client.client_id)}
                  </div>
                  <div className="client-primary">
                    <div className="client-heading">
                      <h3>{client.client_name ?? "Untitled application"}</h3>
                      <span className="role-badge user">{client.type ?? "web"}</span>
                    </div>
                    <code>{client.client_id}</code>
                    <div className="uri-list">
                      {(client.redirect_uris ?? []).map((uri) => (
                        <span key={uri}>{uri}</span>
                      ))}
                    </div>
                  </div>
                  <div className="client-meta">
                    <span>Grant</span>
                    <strong>
                      {(client.grant_types ?? ["authorization_code"])
                        .map((grant) => grant.replaceAll("_", " "))
                        .join(", ")}
                    </strong>
                  </div>
                  <div className="row-actions">
                    <button
                      className="button-secondary compact"
                      type="button"
                      disabled={busyId === client.client_id}
                      onClick={() => setEditingClient(client)}
                    >
                      Edit
                    </button>
                    {client.token_endpoint_auth_method !== "none" ? (
                      <button
                        className="text-button"
                        type="button"
                        disabled={busyId === client.client_id}
                        onClick={() => void rotateSecret(client)}
                      >
                        Rotate secret
                      </button>
                    ) : null}
                    <button
                      className="text-button danger"
                      type="button"
                      disabled={busyId === client.client_id}
                      onClick={() => void deleteClient(client)}
                    >
                      Delete
                    </button>
                  </div>
                </article>
              ))}
              {clients.length === 0 ? (
                <div className="empty-state large">
                  <strong>No applications registered</strong>
                  <span>Register an OAuth client to connect your first application.</span>
                  <button
                    className="button-secondary"
                    type="button"
                    onClick={() => setShowNewClient(true)}
                  >
                    Register app
                  </button>
                </div>
              ) : null}
            </div>
          </section>
        ) : null}

        {activeView === "audit" ? (
          <section className="data-section">
            <div className="section-toolbar">
              <div>
                <h2>Administrative activity</h2>
                <p>Every completed admin action, newest first</p>
              </div>
              <button
                className="button-secondary compact"
                type="button"
                onClick={() => void loadAudit().catch(showError)}
              >
                Refresh
              </button>
            </div>

            <div className="user-list audit-list">
              <div className="audit-row audit-row-header" aria-hidden="true">
                <span>When</span>
                <span>Actor</span>
                <span>Action</span>
                <span>Target</span>
                <span>Details</span>
              </div>
              {audit.map((entry) => (
                <article className="audit-row" key={entry.id}>
                  <span className="muted-value">{formatDateTime(entry.createdAt)}</span>
                  <span className="audit-actor">{entry.actorEmail ?? "system"}</span>
                  <span className={`action-badge ${entry.action.split(".")[0]}`}>
                    {entry.action}
                  </span>
                  <span className="audit-target">
                    {entry.targetLabel ?? entry.targetId ?? "—"}
                  </span>
                  <span className="audit-detail">
                    {entry.detail && Object.keys(entry.detail).length
                      ? Object.entries(entry.detail)
                          .map(([key, value]) => `${key}: ${JSON.stringify(value)}`)
                          .join("  ")
                      : "—"}
                  </span>
                </article>
              ))}
              {audit.length === 0 ? (
                <div className="empty-state large">
                  <strong>No activity recorded yet</strong>
                  <span>Admin actions appear here as they happen.</span>
                </div>
              ) : null}
            </div>

            <Pager
              page={auditPage}
              pageSize={AUDIT_PAGE_SIZE}
              total={auditTotal}
              onChange={setAuditPage}
            />
          </section>
        ) : null}

        {activeView === "endpoints" ? (
          <section className="data-section">
            <div className="section-toolbar">
              <div>
                <h2>OpenID Connect discovery</h2>
                <p>Everything a new application needs to connect</p>
              </div>
            </div>

            <div className="endpoint-list">
              {endpointRows.map(([label, value]) => (
                <div className="endpoint-row" key={label}>
                  <span>{label}</span>
                  <code>{value}</code>
                  <button
                    className="button-secondary compact"
                    type="button"
                    onClick={() => void copyValue(value)}
                  >
                    Copy
                  </button>
                </div>
              ))}
              {!discovery ? (
                <div className="empty-state large">
                  <strong>Loading discovery document</strong>
                  <span>Reading /api/auth/.well-known/openid-configuration</span>
                </div>
              ) : null}
            </div>
          </section>
        ) : null}
      </main>

      {managed ? (
        <Modal
          eyebrow="Account"
          title={managed.name}
          wide
          onClose={() => setManaged(null)}
        >
          <div className="manage-body">
            <div className="manage-summary">
              <div className="avatar">{initials(managed.name, managed.email)}</div>
              <div>
                <strong>{managed.email}</strong>
                <span>
                  {managed.role ?? "user"} · joined {formatDate(managed.createdAt)}
                  {managed.banned
                    ? ` · suspended${managed.banReason ? `: ${managed.banReason}` : ""}`
                    : ""}
                </span>
              </div>
            </div>

            <section className="manage-block">
              <header>
                <h3>Active sessions</h3>
                {managedSessions?.length ? (
                  <button
                    className="text-button danger"
                    type="button"
                    disabled={busyId === "revoke-all"}
                    onClick={() => void revokeAllSessions(managed)}
                  >
                    Revoke all
                  </button>
                ) : null}
              </header>
              {managedSessions === null ? (
                <p className="manage-empty">Loading…</p>
              ) : managedSessions.length === 0 ? (
                <p className="manage-empty">No active sessions.</p>
              ) : (
                <ul className="manage-list">
                  {managedSessions.map((item) => (
                    <li key={item.id}>
                      <div>
                        <strong>{describeAgent(item.userAgent)}</strong>
                        <span>
                          {item.ipAddress || "unknown IP"} · started{" "}
                          {formatDateTime(item.createdAt)} · expires{" "}
                          {formatDateTime(item.expiresAt)}
                        </span>
                      </div>
                      <button
                        className="text-button danger"
                        type="button"
                        disabled={busyId === item.token}
                        onClick={() => void revokeSession(item.token)}
                      >
                        Revoke
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </section>

            <section className="manage-block">
              <header>
                <h3>Connected applications</h3>
              </header>
              {managedConsents === null ? (
                <p className="manage-empty">Loading…</p>
              ) : managedConsents.length === 0 ? (
                <p className="manage-empty">No applications authorized.</p>
              ) : (
                <ul className="manage-list">
                  {managedConsents.map((consent) => (
                    <li key={consent.id}>
                      <div>
                        <strong>{consent.clientName ?? consent.clientId}</strong>
                        <span>
                          {scopeList(consent.scopes).join(", ") || "no scopes"} ·
                          granted {formatDate(consent.createdAt)}
                        </span>
                      </div>
                      <button
                        className="text-button danger"
                        type="button"
                        disabled={busyId === consent.id}
                        onClick={() => void revokeConsent(consent)}
                      >
                        Revoke
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </section>

            <section className="manage-block">
              <header>
                <h3>Actions</h3>
              </header>
              <div className="manage-actions">
                <button
                  className="button-secondary compact"
                  type="button"
                  onClick={() => setResetting(managed)}
                >
                  Reset password
                </button>
                {managed.banned ? (
                  <button
                    className="button-secondary compact"
                    type="button"
                    disabled={busyId === managed.id}
                    onClick={() => void restoreUser(managed)}
                  >
                    Restore access
                  </button>
                ) : (
                  <button
                    className="button-secondary compact"
                    type="button"
                    disabled={managed.id === session?.user?.id}
                    title={
                      managed.id === session?.user?.id
                        ? "You cannot suspend yourself"
                        : ""
                    }
                    onClick={() => setSuspending(managed)}
                  >
                    Suspend
                  </button>
                )}
                <button
                  className="button-secondary compact"
                  type="button"
                  disabled={managed.id === session?.user?.id || busyId === managed.id}
                  title={
                    managed.id === session?.user?.id
                      ? "You are already signed in as yourself"
                      : ""
                  }
                  onClick={() => void impersonate(managed)}
                >
                  Impersonate
                </button>
                <button
                  className="text-button danger"
                  type="button"
                  disabled={managed.id === session?.user?.id}
                  title={
                    managed.id === session?.user?.id
                      ? "You cannot delete your own account"
                      : ""
                  }
                  onClick={() => {
                    setDeleteConfirm("");
                    setDeleting(managed);
                  }}
                >
                  Delete user
                </button>
              </div>
              <p className="manage-hint">
                Impersonating signs you in as this user. Return from the banner on
                the next screen.
              </p>
            </section>
          </div>
        </Modal>
      ) : null}

      {suspending ? (
        <Modal
          eyebrow="Directory"
          title="Suspend user"
          onClose={() => setSuspending(null)}
        >
          <form className="modal-form" onSubmit={suspendUser}>
            <p className="modal-copy">
              {suspending.email} will be signed out and blocked from signing in.
            </p>
            <label>
              Reason
              <input
                name="reason"
                defaultValue="Suspended by administrator"
                required
              />
            </label>
            <label>
              Duration
              <select name="expiresIn" defaultValue="0">
                <option value="0">Until manually restored</option>
                <option value="3600">1 hour</option>
                <option value="86400">24 hours</option>
                <option value="604800">7 days</option>
                <option value="2592000">30 days</option>
              </select>
            </label>
            <div className="modal-actions">
              <button
                className="button-secondary"
                type="button"
                onClick={() => setSuspending(null)}
              >
                Cancel
              </button>
              <button
                className="button-primary"
                type="submit"
                disabled={busyId === "suspend"}
              >
                Suspend
              </button>
            </div>
          </form>
        </Modal>
      ) : null}

      {resetting ? (
        <Modal
          eyebrow="Directory"
          title="Reset password"
          onClose={() => setResetting(null)}
        >
          <form className="modal-form" onSubmit={resetPassword}>
            <p className="modal-copy">
              Sets a new password for {resetting.email} immediately.
            </p>
            <label>
              New password
              <input
                name="password"
                type="password"
                minLength={8}
                required
                autoComplete="new-password"
              />
            </label>
            <label>
              Confirm password
              <input
                name="confirm"
                type="password"
                minLength={8}
                required
                autoComplete="new-password"
              />
            </label>
            <div className="modal-actions">
              <button
                className="button-secondary"
                type="button"
                onClick={() => setResetting(null)}
              >
                Cancel
              </button>
              <button
                className="button-primary"
                type="submit"
                disabled={busyId === "reset-password"}
              >
                Update password
              </button>
            </div>
          </form>
        </Modal>
      ) : null}

      {deleting ? (
        <Modal
          eyebrow="Danger zone"
          title="Delete user"
          onClose={() => setDeleting(null)}
        >
          <div className="modal-form">
            <p className="modal-copy">
              This permanently removes {deleting.email}, their sessions, and their
              application grants. It cannot be undone.
            </p>
            <label>
              Type the email to confirm
              <input
                value={deleteConfirm}
                autoComplete="off"
                onChange={(event) => setDeleteConfirm(event.target.value)}
              />
            </label>
            <div className="modal-actions">
              <button
                className="button-secondary"
                type="button"
                onClick={() => setDeleting(null)}
              >
                Cancel
              </button>
              <button
                className="button-danger"
                type="button"
                disabled={
                  deleteConfirm.trim() !== deleting.email ||
                  busyId === "delete-user"
                }
                onClick={() => void deleteUser()}
              >
                Delete permanently
              </button>
            </div>
          </div>
        </Modal>
      ) : null}

      {showNewUser ? (
        <Modal
          eyebrow="Directory"
          title="Add user"
          onClose={() => setShowNewUser(false)}
        >
          <form className="modal-form" onSubmit={createUser}>
            <label>
              Name
              <input name="name" required autoComplete="off" />
            </label>
            <label>
              Email
              <input name="email" type="email" required autoComplete="off" />
            </label>
            <label>
              Temporary password
              <input
                name="password"
                type="password"
                minLength={8}
                required
                autoComplete="new-password"
              />
            </label>
            <label>
              Role
              <select name="role" defaultValue="user">
                <option value="user">User</option>
                <option value="admin">Administrator</option>
              </select>
            </label>
            <div className="modal-actions">
              <button
                className="button-secondary"
                type="button"
                onClick={() => setShowNewUser(false)}
              >
                Cancel
              </button>
              <button
                className="button-primary"
                type="submit"
                disabled={busyId === "new-user"}
              >
                Create user
              </button>
            </div>
          </form>
        </Modal>
      ) : null}

      {showNewClient ? (
        <Modal
          eyebrow="OAuth client"
          title="Register application"
          onClose={() => setShowNewClient(false)}
        >
          <form className="modal-form" onSubmit={createClient}>
            <label>
              Application name
              <input name="name" required autoComplete="off" />
            </label>
            <label>
              Redirect URIs
              <textarea
                name="redirectUris"
                rows={3}
                required
                placeholder="https://app.example.com/auth/callback"
              />
              <small>One absolute URI per line</small>
            </label>
            <label>
              Application type
              <select name="applicationType" defaultValue="web">
                <option value="web">Web server (confidential)</option>
                <option value="user-agent-based">Browser SPA (public with PKCE)</option>
                <option value="native">Native app (public with PKCE)</option>
              </select>
            </label>
            <div className="modal-actions">
              <button
                className="button-secondary"
                type="button"
                onClick={() => setShowNewClient(false)}
              >
                Cancel
              </button>
              <button
                className="button-primary"
                type="submit"
                disabled={busyId === "new-client"}
              >
                Register app
              </button>
            </div>
          </form>
        </Modal>
      ) : null}

      {editingClient ? (
        <Modal
          eyebrow="OAuth client"
          title="Edit application"
          onClose={() => setEditingClient(null)}
        >
          <form className="modal-form" onSubmit={updateClient}>
            <label>
              Application name
              <input
                name="name"
                required
                autoComplete="off"
                defaultValue={editingClient.client_name ?? ""}
              />
            </label>
            <label>
              Redirect URIs
              <textarea
                name="redirectUris"
                rows={3}
                required
                defaultValue={(editingClient.redirect_uris ?? []).join("\n")}
              />
              <small>One absolute URI per line</small>
            </label>
            <label>
              Application type
              <select
                name="applicationType"
                defaultValue={editingClient.type ?? "web"}
              >
                <option value="web">Web server (confidential)</option>
                <option value="user-agent-based">Browser SPA (public with PKCE)</option>
                <option value="native">Native app (public with PKCE)</option>
              </select>
            </label>
            <p className="modal-copy">
              Client ID <code>{editingClient.client_id}</code> stays the same. The
              secret is unchanged — rotate it separately if it leaked.
            </p>
            <div className="modal-actions">
              <button
                className="button-secondary"
                type="button"
                onClick={() => setEditingClient(null)}
              >
                Cancel
              </button>
              <button
                className="button-primary"
                type="submit"
                disabled={busyId === "edit-client"}
              >
                Save changes
              </button>
            </div>
          </form>
        </Modal>
      ) : null}

      {credentials ? (
        <Modal
          eyebrow="Credentials"
          title="Application credentials"
          onClose={() => setCredentials(null)}
        >
          <div className="credential-copy">
            <p>Store the client secret now. It will not be shown again.</p>
            <label>
              Client ID
              <span className="copy-field">
                <code>{credentials.client_id}</code>
                <button
                  type="button"
                  onClick={() => void copyValue(credentials.client_id)}
                >
                  Copy
                </button>
              </span>
            </label>
            {credentials.client_secret ? (
              <label>
                Client secret
                <span className="copy-field">
                  <code>{credentials.client_secret}</code>
                  <button
                    type="button"
                    onClick={() => void copyValue(credentials.client_secret!)}
                  >
                    Copy
                  </button>
                </span>
              </label>
            ) : (
              <p className="public-client-note">
                This is a public client and does not use a client secret.
              </p>
            )}
            <div className="modal-actions">
              <button
                className="button-primary"
                type="button"
                onClick={() => setCredentials(null)}
              >
                Done
              </button>
            </div>
          </div>
        </Modal>
      ) : null}
    </div>
  );
}
