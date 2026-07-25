import { Pool } from "pg";

// One pool for both Better Auth and the admin API routes. Better Auth owns the
// tables it generates; everything here reads them or writes admin_audit_log.
export const pool = new Pool({ connectionString: process.env.DATABASE_URL });
