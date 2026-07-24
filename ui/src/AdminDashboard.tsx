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

type SessionResponse = {
  user?: AdminUser;
  session?: { id: string };
};

type UsersResponse = {
  users: AdminUser[];
  total: number;
};

type Notice = {
  tone: "success" | "error";
  message: string;
};

const API = "/api/auth";

async function apiRequest<T>(
  path: string,
  options: RequestInit = {},
): Promise<T> {
  const response = await fetch(`${API}${path}`, {
    ...options,
    headers: {
      ...(options.body ? { "Content-Type": "application/json" } : {}),
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

  if (response.status === 204) {
    return undefined as T;
  }

  const text = await response.text();
  return (text ? JSON.parse(text) : undefined) as T;
}

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

function Modal({
  title,
  eyebrow,
  children,
  onClose,
}: {
  title: string;
  eyebrow: string;
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
        className="modal"
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
  onSignOut,
}: {
  forbidden: boolean;
  onSignOut: () => void;
}) {
  return (
    <main className="admin-gate">
      <p className="brand-word">reeyan</p>
      <p className="section-kicker">Administration</p>
      <h1>{forbidden ? "Access denied" : "Sign in required"}</h1>
      <p className="gate-copy">
        {forbidden
          ? "This account does not have administrator privileges."
          : "Use an administrator account to continue."}
      </p>
      <div className="gate-actions">
        {forbidden ? (
          <button className="button-secondary" type="button" onClick={onSignOut}>
            Sign out
          </button>
        ) : null}
        <a
          className="button-primary"
          href="/sign-in?callbackURL=%2Fadmin"
        >
          Sign in
        </a>
      </div>
    </main>
  );
}

export function AdminDashboard() {
  const [session, setSession] = useState<SessionResponse | null>(null);
  const [access, setAccess] = useState<"loading" | "signed-out" | "forbidden" | "admin">(
    "loading",
  );
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [totalUsers, setTotalUsers] = useState(0);
  const [clients, setClients] = useState<OAuthClient[]>([]);
  const [activeView, setActiveView] = useState<"users" | "applications">("users");
  const [search, setSearch] = useState("");
  const [busyId, setBusyId] = useState<string | null>(null);
  const [notice, setNotice] = useState<Notice | null>(null);
  const [showNewUser, setShowNewUser] = useState(false);
  const [showNewClient, setShowNewClient] = useState(false);
  const [credentials, setCredentials] = useState<OAuthClient | null>(null);

  useEffect(() => {
    document.body.classList.add("admin-view");
    document.title = "reeyan — administration";
    return () => document.body.classList.remove("admin-view");
  }, []);

  const loadUsers = useCallback(async () => {
    const data = await apiRequest<UsersResponse>(
      "/admin/list-users?limit=100&sortBy=createdAt&sortDirection=desc",
    );
    setUsers(data.users);
    setTotalUsers(data.total);
  }, []);

  const loadClients = useCallback(async () => {
    const data = await apiRequest<OAuthClient[] | null>("/oauth2/get-clients");
    setClients(data ?? []);
  }, []);

  useEffect(() => {
    void (async () => {
      try {
        const current = await apiRequest<SessionResponse>("/get-session");
        setSession(current);
        if (!current.user) {
          setAccess("signed-out");
          return;
        }
        if (current.user.role !== "admin") {
          setAccess("forbidden");
          return;
        }

        setAccess("admin");
        await Promise.all([loadUsers(), loadClients()]);
      } catch {
        setAccess("signed-out");
      }
    })();
  }, [loadClients, loadUsers]);

  const filteredUsers = useMemo(() => {
    const term = search.trim().toLowerCase();
    if (!term) return users;
    return users.filter(
      (user) =>
        user.name.toLowerCase().includes(term) ||
        user.email.toLowerCase().includes(term),
    );
  }, [search, users]);

  const stats = useMemo(
    () => ({
      admins: users.filter((user) => user.role === "admin").length,
      suspended: users.filter((user) => user.banned).length,
    }),
    [users],
  );

  function showError(error: unknown) {
    setNotice({
      tone: "error",
      message: error instanceof Error ? error.message : "Something went wrong.",
    });
  }

  async function signOut() {
    try {
      await apiRequest("/sign-out", { method: "POST" });
    } finally {
      window.location.href = "/sign-in?callbackURL=%2Fadmin";
    }
  }

  async function setRole(user: AdminUser) {
    const role = user.role === "admin" ? "user" : "admin";
    setBusyId(user.id);
    setNotice(null);
    try {
      await apiRequest("/admin/set-role", {
        method: "POST",
        body: JSON.stringify({ userId: user.id, role }),
      });
      await loadUsers();
      setNotice({ tone: "success", message: `${user.name} is now ${role}.` });
    } catch (error) {
      showError(error);
    } finally {
      setBusyId(null);
    }
  }

  async function toggleBan(user: AdminUser) {
    setBusyId(user.id);
    setNotice(null);
    try {
      await apiRequest(
        user.banned ? "/admin/unban-user" : "/admin/ban-user",
        {
          method: "POST",
          body: JSON.stringify({
            userId: user.id,
            ...(!user.banned ? { banReason: "Suspended by administrator" } : {}),
          }),
        },
      );
      await loadUsers();
      setNotice({
        tone: "success",
        message: `${user.name} was ${user.banned ? "restored" : "suspended"}.`,
      });
    } catch (error) {
      showError(error);
    } finally {
      setBusyId(null);
    }
  }

  async function createUser(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusyId("new-user");
    setNotice(null);
    const data = new FormData(event.currentTarget);

    try {
      await apiRequest("/admin/create-user", {
        method: "POST",
        body: JSON.stringify({
          name: data.get("name"),
          email: data.get("email"),
          password: data.get("password"),
          role: data.get("role"),
        }),
      });
      await loadUsers();
      setShowNewUser(false);
      setNotice({ tone: "success", message: "User created successfully." });
    } catch (error) {
      showError(error);
    } finally {
      setBusyId(null);
    }
  }

  async function createClient(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusyId("new-client");
    setNotice(null);
    const data = new FormData(event.currentTarget);
    const applicationType = String(data.get("applicationType"));
    const isPublic = applicationType !== "web";
    const redirectUris = String(data.get("redirectUris"))
      .split(/\r?\n/)
      .map((value) => value.trim())
      .filter(Boolean);

    try {
      const client = await apiRequest<OAuthClient>("/oauth2/create-client", {
        method: "POST",
        body: JSON.stringify({
          client_name: data.get("name"),
          redirect_uris: redirectUris,
          scope: "openid profile email",
          type: applicationType,
          token_endpoint_auth_method: isPublic ? "none" : "client_secret_basic",
          grant_types: ["authorization_code", "refresh_token"],
          response_types: ["code"],
        }),
      });
      await loadClients();
      setShowNewClient(false);
      setCredentials(client);
      setNotice({ tone: "success", message: "Application registered." });
    } catch (error) {
      showError(error);
    } finally {
      setBusyId(null);
    }
  }

  async function deleteClient(client: OAuthClient) {
    if (
      !window.confirm(
        `Delete ${client.client_name ?? "this application"}? Existing integrations will stop working.`,
      )
    ) {
      return;
    }

    setBusyId(client.client_id);
    setNotice(null);
    try {
      await apiRequest("/oauth2/delete-client", {
        method: "POST",
        body: JSON.stringify({ client_id: client.client_id }),
      });
      await loadClients();
      setNotice({ tone: "success", message: "Application deleted." });
    } catch (error) {
      showError(error);
    } finally {
      setBusyId(null);
    }
  }

  async function rotateSecret(client: OAuthClient) {
    if (!window.confirm("Rotate this client secret now? The old secret will stop working.")) {
      return;
    }

    setBusyId(client.client_id);
    setNotice(null);
    try {
      const updated = await apiRequest<OAuthClient>(
        "/oauth2/client/rotate-secret",
        {
          method: "POST",
          body: JSON.stringify({ client_id: client.client_id }),
        },
      );
      setCredentials(updated);
      setNotice({ tone: "success", message: "Client secret rotated." });
    } catch (error) {
      showError(error);
    } finally {
      setBusyId(null);
    }
  }

  async function copyValue(value: string) {
    await navigator.clipboard.writeText(value);
    setNotice({ tone: "success", message: "Copied to clipboard." });
  }

  if (access === "loading") return <LoadingState />;
  if (access !== "admin") {
    return (
      <AccessState
        forbidden={access === "forbidden"}
        onSignOut={() => void signOut()}
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
          <button
            className={activeView === "users" ? "active" : ""}
            type="button"
            onClick={() => setActiveView("users")}
          >
            <span>Users</span>
            <span className="nav-count">{totalUsers}</span>
          </button>
          <button
            className={activeView === "applications" ? "active" : ""}
            type="button"
            onClick={() => setActiveView("applications")}
          >
            <span>Applications</span>
            <span className="nav-count">{clients.length}</span>
          </button>
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
            onClick={() => void signOut()}
          >
            Sign out
          </button>
        </div>
      </aside>

      <main className="admin-main">
        <header className="admin-topbar">
          <div>
            <p className="section-kicker">Identity provider</p>
            <h1>{activeView === "users" ? "Directory" : "Applications"}</h1>
          </div>
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
        </header>

        <section className="metric-strip" aria-label="SSO summary">
          <div>
            <span>Total users</span>
            <strong>{totalUsers}</strong>
          </div>
          <div>
            <span>Administrators</span>
            <strong>{stats.admins}</strong>
          </div>
          <div>
            <span>Suspended</span>
            <strong>{stats.suspended}</strong>
          </div>
          <div>
            <span>OAuth clients</span>
            <strong>{clients.length}</strong>
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
                <p>{totalUsers} accounts in this directory</p>
              </div>
              <label className="search-field">
                <span>Search users</span>
                <input
                  type="search"
                  placeholder="Name or email"
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                />
              </label>
            </div>

            <div className="user-list">
              <div className="user-row user-row-header" aria-hidden="true">
                <span>User</span>
                <span>Role</span>
                <span>Joined</span>
                <span>Status</span>
                <span>Actions</span>
              </div>
              {filteredUsers.map((user) => {
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
                        className="text-button danger"
                        type="button"
                        disabled={busyId === user.id || isCurrentUser}
                        title={isCurrentUser ? "You cannot suspend yourself" : ""}
                        onClick={() => void toggleBan(user)}
                      >
                        {user.banned ? "Restore" : "Suspend"}
                      </button>
                    </div>
                  </article>
                );
              })}
              {filteredUsers.length === 0 ? (
                <div className="empty-state">
                  <strong>No matching users</strong>
                  <span>Try a different name or email.</span>
                </div>
              ) : null}
            </div>
          </section>
        ) : (
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
                    {client.token_endpoint_auth_method !== "none" ? (
                      <button
                        className="button-secondary compact"
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
        )}
      </main>

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

      {credentials ? (
        <Modal
          eyebrow="Credentials"
          title="Application registered"
          onClose={() => setCredentials(null)}
        >
          <div className="credential-copy">
            <p>
              Store the client secret now. It will not be shown again.
            </p>
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
