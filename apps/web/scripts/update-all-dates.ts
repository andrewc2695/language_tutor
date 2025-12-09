import Database from 'better-sqlite3';
import { join } from 'path';
import { existsSync, mkdirSync } from 'fs';

// Get the database path
const dbDir = join(process.cwd(), 'data');
const dbPath = join(dbDir, 'vocabulary.db');

// Ensure the data directory exists
if (!existsSync(dbDir)) {
  mkdirSync(dbDir, { recursive: true });
}

// Get today's date in YYYY-MM-DD format
const today = new Date().toISOString().split('T')[0];

console.log(`📅 Updating all words to last_practiced_date: ${today}`);

// Open database
const db = new Database(dbPath);

try {
  // Update all words
  const stmt = db.prepare('UPDATE words SET last_practiced_date = ?');
  const result = stmt.run(today);
  
  console.log(`✅ Updated ${result.changes} words to today's date (${today})`);
} catch (error) {
  console.error('❌ Error updating words:', error);
  process.exit(1);
} finally {
  db.close();
}

