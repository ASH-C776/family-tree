import fs from 'node:fs';
import path from 'node:path';
import Database from 'better-sqlite3';

export const DATA_DIR = process.env.DATA_DIR ?? path.resolve(process.cwd(), 'data');
export const UPLOAD_DIR = process.env.UPLOAD_DIR ?? path.join(DATA_DIR, 'uploads');

fs.mkdirSync(DATA_DIR, { recursive: true });
fs.mkdirSync(UPLOAD_DIR, { recursive: true });

export const db = new Database(path.join(DATA_DIR, 'app.db'));

db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');
db.pragma('busy_timeout = 5000');

type Migration = { version: number; sql: string };

const migrations: Migration[] = [
  {
    version: 1,
    sql: `
CREATE TABLE IF NOT EXISTS schema_version (
  version INTEGER PRIMARY KEY,
  applied_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  username TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  display_name TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'editor',
  created_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS persons (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  gender TEXT NOT NULL DEFAULT 'unknown',
  birth_date TEXT,
  birth_precision TEXT,
  birth_circa INTEGER NOT NULL DEFAULT 0,
  death_date TEXT,
  death_precision TEXT,
  death_circa INTEGER NOT NULL DEFAULT 0,
  is_alive INTEGER NOT NULL DEFAULT 1,
  avatar TEXT,
  bio TEXT,
  phone TEXT,
  address TEXT,
  birth_order INTEGER,
  created_by TEXT,
  updated_by TEXT,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  deleted_at INTEGER
);
CREATE INDEX IF NOT EXISTS idx_persons_deleted ON persons(deleted_at);

CREATE TABLE IF NOT EXISTS unions (
  id TEXT PRIMARY KEY,
  status TEXT NOT NULL DEFAULT 'married',
  start_date TEXT,
  end_date TEXT,
  note TEXT,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  deleted_at INTEGER
);
CREATE INDEX IF NOT EXISTS idx_unions_deleted ON unions(deleted_at);

CREATE TABLE IF NOT EXISTS union_members (
  union_id TEXT NOT NULL,
  person_id TEXT NOT NULL,
  role TEXT NOT NULL,
  order_index INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (union_id, person_id, role)
);
CREATE INDEX IF NOT EXISTS idx_members_person ON union_members(person_id);
CREATE INDEX IF NOT EXISTS idx_members_union ON union_members(union_id);

CREATE TABLE IF NOT EXISTS media (
  id TEXT PRIMARY KEY,
  person_id TEXT NOT NULL,
  kind TEXT NOT NULL DEFAULT 'photo',
  path TEXT NOT NULL,
  thumb_path TEXT,
  caption TEXT,
  created_at INTEGER NOT NULL,
  deleted_at INTEGER
);
CREATE INDEX IF NOT EXISTS idx_media_person ON media(person_id);
`,
  },
  {
    version: 2,
    sql: `
ALTER TABLE users ADD COLUMN status TEXT NOT NULL DEFAULT 'active';

CREATE TABLE IF NOT EXISTS invites (
  id TEXT PRIMARY KEY,
  code TEXT NOT NULL UNIQUE,
  role TEXT NOT NULL DEFAULT 'editor',
  note TEXT,
  created_by TEXT,
  created_at INTEGER NOT NULL,
  expires_at INTEGER,
  used_by TEXT,
  used_at INTEGER
);

CREATE TABLE IF NOT EXISTS settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);
`,
  },
  {
    version: 3,
    sql: `
ALTER TABLE persons ADD COLUMN privacy TEXT NOT NULL DEFAULT 'public';
ALTER TABLE media ADD COLUMN privacy TEXT NOT NULL DEFAULT 'public';
ALTER TABLE media ADD COLUMN taken_at INTEGER;
`,
  },
];

export function migrate(): void {
  db.exec(`CREATE TABLE IF NOT EXISTS schema_version (version INTEGER PRIMARY KEY, applied_at INTEGER NOT NULL)`);
  const row = db.prepare('SELECT MAX(version) AS v FROM schema_version').get() as { v: number | null };
  const current = row?.v ?? 0;
  for (const m of migrations) {
    if (m.version <= current) continue;
    const apply = db.transaction(() => {
      db.exec(m.sql);
      db.prepare('INSERT INTO schema_version (version, applied_at) VALUES (?, ?)').run(m.version, Date.now());
    });
    apply();
  }
}

export function getSetting(key: string, fallback: string): string {
  const row = db.prepare('SELECT value FROM settings WHERE key = ?').get(key) as { value: string } | undefined;
  return row?.value ?? fallback;
}

export function setSetting(key: string, value: string): void {
  db.prepare('INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value').run(
    key,
    value,
  );
}

export function now(): number {
  return Date.now();
}

export function newId(prefix: string): string {
  return `${prefix}_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
}
