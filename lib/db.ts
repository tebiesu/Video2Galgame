import Database from "better-sqlite3";
import { mkdirSync } from "node:fs";
import path from "node:path";

declare global {
  // eslint-disable-next-line no-var
  var __videofetch_db__: Database.Database | undefined;
}

function initDb(db: Database.Database): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS jobs (
      id TEXT PRIMARY KEY,
      title_text TEXT,
      status TEXT NOT NULL,
      stage TEXT NOT NULL,
      started_at TEXT NOT NULL,
      finished_at TEXT,
      input_json TEXT NOT NULL,
      transcript_text TEXT,
      raw_parse_text TEXT,
      summary_markdown TEXT,
      snapshots_json TEXT,
      warnings_json TEXT,
      error TEXT
    );
    CREATE INDEX IF NOT EXISTS idx_jobs_started_at ON jobs(started_at DESC);
  `);

  const cols = db.prepare("PRAGMA table_info(jobs)").all() as Array<{ name: string }>;
  const hasTitle = cols.some((c) => c.name === "title_text");
  if (!hasTitle) {
    db.exec("ALTER TABLE jobs ADD COLUMN title_text TEXT;");
  }
}

export function getDb(): Database.Database {
  if (global.__videofetch_db__) return global.__videofetch_db__;

  const dir = path.join(process.cwd(), ".videofetch");
  mkdirSync(dir, { recursive: true });
  const file = path.join(dir, "videofetch.db");
  const db = new Database(file);
  db.pragma("journal_mode = WAL");
  initDb(db);
  global.__videofetch_db__ = db;
  return db;
}
