import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";
import { DATABASE_URL } from "./config.js";

const { Pool } = pg;

if (!DATABASE_URL) {
  console.warn("DATABASE_URL fehlt — Datenbankverbindung wird fehlschlagen.");
}

export const pool = new Pool({
  connectionString: DATABASE_URL,
  max: 10,
});

export async function query<T extends pg.QueryResultRow = pg.QueryResultRow>(
  text: string,
  params?: unknown[],
): Promise<pg.QueryResult<T>> {
  return pool.query<T>(text, params);
}

export async function initSchema(): Promise<void> {
  const here = path.dirname(fileURLToPath(import.meta.url));
  const schemaPath = path.join(here, "schema.sql");
  const sql = readFileSync(schemaPath, "utf8");
  await pool.query(sql);
}

export async function healthCheck(): Promise<boolean> {
  try {
    await pool.query("SELECT 1");
    return true;
  } catch {
    return false;
  }
}
