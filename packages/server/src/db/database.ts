import Database from 'better-sqlite3';
import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));

let db: Database.Database | null = null;

export function getDatabase(): Database.Database {
  if (!db) {
    const dbPath = process.env.DATABASE_PATH || join(__dirname, '../../data/a11y-crawler.db');
    db = new Database(dbPath);
    db.pragma('journal_mode = WAL');
    db.pragma('foreign_keys = ON');
  }
  return db;
}

export function initializeDatabase(): void {
  const database = getDatabase();
  const schema = readFileSync(join(__dirname, 'schema.sql'), 'utf-8');
  database.exec(schema);

  // Migration: add source_url column if missing (existing DBs)
  const cols = database.prepare("PRAGMA table_info(pages)").all() as Array<{ name: string }>;
  if (!cols.some(c => c.name === 'source_url')) {
    database.exec('ALTER TABLE pages ADD COLUMN source_url TEXT');
  }

  console.log('Database initialized successfully');
}

export function closeDatabase(): void {
  if (db) {
    db.close();
    db = null;
  }
}
