import Database from 'better-sqlite3';
import type { Database as DatabaseType } from 'better-sqlite3';
import { join } from 'path';
import { existsSync, mkdirSync } from 'fs';

// Get the database path
// In Next.js, process.cwd() returns the project root (apps/web directory)
// Database will persist between server restarts as it's stored on the filesystem
const dbDir = join(process.cwd(), 'data');
const dbPath = join(dbDir, 'vocabulary.db');

// Ensure the data directory exists
if (!existsSync(dbDir)) {
  mkdirSync(dbDir, { recursive: true });
}

// Initialize database connection
let db: DatabaseType | null = null;

export function getDb(): DatabaseType {
  if (!db) {
    db = new Database(dbPath);
    initializeSchema(db);
  }
  return db;
}

function initializeSchema(database: DatabaseType) {
  database.exec(`
    CREATE TABLE IF NOT EXISTS words (
      english TEXT PRIMARY KEY,
      cantonese_jyutping TEXT NOT NULL,
      last_practiced_date DATE NOT NULL,
      proficiency_level INTEGER DEFAULT 1 CHECK(proficiency_level >= 1)
    )
  `);
}

export function closeDb() {
  if (db) {
    db.close();
    db = null;
  }
}

