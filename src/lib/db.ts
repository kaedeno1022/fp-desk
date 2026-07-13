import Database from "better-sqlite3";
import fs from "node:fs";
import path from "node:path";

// || にしているのは .env の「DATABASE_PATH=」（空文字）でも既定値に落とすため
const DB_PATH = process.env.DATABASE_PATH || path.join(process.cwd(), "data", "fp-desk.db");

declare global {
  var __db: Database.Database | undefined;
}

function init(): Database.Database {
  if (DB_PATH !== ":memory:") {
    fs.mkdirSync(path.dirname(DB_PATH), { recursive: true });
  }
  const db = new Database(DB_PATH);
  db.pragma("journal_mode = WAL");
  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      email TEXT UNIQUE NOT NULL,
      password_hash TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE TABLE IF NOT EXISTS simulations (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(id),
      name TEXT NOT NULL,
      input_json TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
  `);
  return db;
}

// Next.js dev server はモジュールを再読み込みするため、
// グローバルにキャッシュして接続を使い回す。
export const db = globalThis.__db ?? init();
if (process.env.NODE_ENV !== "production") {
  globalThis.__db = db;
}
