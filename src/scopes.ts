import { pool } from "./db.js";

export type ScopeDef = {
  value: string;
  description: string;
  required: boolean;
};

// Scopes every OIDC provider needs. Seeded on first boot, then owned by the
// database so they can be managed from the admin console.
const SEED: ScopeDef[] = [
  { value: "openid", description: "verify your identity", required: true },
  {
    value: "profile",
    description: "read your name and profile info",
    required: false,
  },
  { value: "email", description: "read your email address", required: false },
  {
    value: "offline_access",
    description: "stay signed in on your behalf",
    required: false,
  },
  {
    value: "read:sessions",
    description: "read your active sessions",
    required: false,
  },
  {
    value: "delete:sessions",
    description: "revoke your active sessions",
    required: false,
  },
];

// The OAuth plugin reads opts.scopes on every request — validation at
// /authorize and /token, and scopes_supported in discovery — but it copies the
// array it is handed (`scopes: Array.from(scopes)`). So the array passed in at
// construction is only the seed; the live one is the plugin's own copy, bound
// below and mutated in place so edits apply without a restart.
export const LIVE_SCOPE_VALUES: string[] = SEED.map((scope) => scope.value);

let pluginScopes: string[] | null = null;

export function bindPluginScopes(target: string[]) {
  pluginScopes = target;
  applyValues(definitions.map((scope) => scope.value));
}

function applyValues(values: string[]) {
  for (const target of [LIVE_SCOPE_VALUES, pluginScopes]) {
    if (!target) continue;
    target.length = 0;
    target.push(...values);
  }
}

let definitions: ScopeDef[] = [...SEED];
let lastLoad = 0;

export function currentScopes() {
  return definitions;
}

export async function ensureScopeTable() {
  await pool.query(`
    create table if not exists oauth_scope (
      value text primary key,
      description text not null default '',
      required boolean not null default false,
      "createdAt" timestamptz not null default now()
    );
  `);

  const existing = await pool.query(
    `select count(*)::int as count from oauth_scope`,
  );
  if (existing.rows[0].count === 0) {
    for (const scope of SEED) {
      await pool.query(
        `insert into oauth_scope (value, description, required)
         values ($1, $2, $3) on conflict (value) do nothing`,
        [scope.value, scope.description, scope.required],
      );
    }
  }
}

export async function reloadScopes() {
  const result = await pool.query(
    `select value, description, required from oauth_scope
      order by required desc, value asc`,
  );

  definitions = result.rows as ScopeDef[];
  // Replace the contents, never the reference — the plugin holds this array.
  applyValues(definitions.map((scope) => scope.value));
  lastLoad = Date.now();
  return definitions;
}

// A second instance writing to the same database would not see this process's
// in-memory copy, so it is refreshed on read after a short interval.
export async function scopesFresh(maxAgeMs = 15_000) {
  if (Date.now() - lastLoad > maxAgeMs) await reloadScopes();
  return definitions;
}
