import Database from 'better-sqlite3';
import type { Database as DatabaseType } from 'better-sqlite3';
import { readFile } from 'fs/promises';
import { existsSync, mkdirSync } from 'fs';
import { join } from 'path';

// Get the database path
const dbDir = join(process.cwd(), 'data');
const dbPath = join(dbDir, 'vocabulary.db');

// Get the CSV file path
const csvPath = join(process.cwd(), 'app', 'api', 'chat', 'wordBank', 'words.csv');

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

function getTodayDate(): string {
  const date = new Date().toISOString().split('T')[0];
  if (!date) {
    throw new Error('Failed to get today\'s date');
  }
  return date;
}

// Simple CSV parser that handles quoted fields
function parseCSVLine(line: string): string[] {
  const result: string[] = [];
  let current = '';
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    const nextChar = line[i + 1];

    if (char === '"') {
      if (inQuotes && nextChar === '"') {
        // Escaped quote
        current += '"';
        i++; // Skip next quote
      } else {
        // Toggle quote state
        inQuotes = !inQuotes;
      }
    } else if (char === ',' && !inQuotes) {
      // Field separator
      result.push(current.trim());
      current = '';
    } else {
      current += char;
    }
  }
  result.push(current.trim()); // Add last field
  return result;
}

async function seedDatabaseFromCSV() {
  console.log('Starting database seed from CSV...\n');

  // Ensure the data directory exists
  if (!existsSync(dbDir)) {
    mkdirSync(dbDir, { recursive: true });
    console.log(`Created data directory: ${dbDir}\n`);
  }

  // Open database
  const db = new Database(dbPath);

  // Drop existing table if it exists
  console.log('Dropping existing words table...\n');
  db.prepare('DROP TABLE IF EXISTS words').run();
  console.log('Table dropped successfully\n');

  // Recreate the table with the schema
  console.log('Creating new words table...\n');
  initializeSchema(db);
  console.log('Table created successfully\n');

  // Get today's date
  const today = getTodayDate();

  // Read CSV file
  console.log(`Reading CSV file: ${csvPath}\n`);
  const csvContent = await readFile(csvPath, 'utf-8');
  const lines = csvContent.split('\n').filter((line) => line.trim() !== '');

  if (lines.length === 0) {
    console.error('CSV file is empty!');
    db.close();
    process.exit(1);
  }

  // Skip header row
  const dataLines = lines.slice(1);

  console.log(`Found ${dataLines.length} rows to process\n`);

  let addedWords = 0;
  let skippedWords = 0;
  const errors: Array<{ word: string; error: string }> = [];

  // Process each line
  for (let i = 0; i < dataLines.length; i++) {
    const line = dataLines[i];
    if (!line) continue; // Skip if line is undefined
    const [english, cantonese_jyutping] = parseCSVLine(line);

    // Skip if missing required fields
    if (!english || !cantonese_jyutping) {
      skippedWords++;
      continue;
    }

    try {
      // Try to insert the word
      db.prepare(`
        INSERT INTO words (english, cantonese_jyutping, last_practiced_date, proficiency_level)
        VALUES (?, ?, ?, 1)
      `).run(english, cantonese_jyutping, today);

      addedWords++;
    } catch (error: unknown) {
      // Word already exists (primary key constraint)
      if (error && typeof error === 'object' && 'code' in error && error.code === 'SQLITE_CONSTRAINT_PRIMARYKEY') {
        skippedWords++;
      } else {
        errors.push({ word: english, error: String(error) });
        skippedWords++;
      }
    }
  }

  db.close();

  // Summary
  console.log('='.repeat(50));
  console.log('Seed Summary:');
  console.log(`  Total rows processed: ${dataLines.length}`);
  console.log(`  Words added: ${addedWords}`);
  console.log(`  Words skipped: ${skippedWords} (duplicates or missing data)`);
  if (errors.length > 0) {
    console.log(`  Errors: ${errors.length}`);
    console.log('\nErrors:');
    errors.forEach(({ word, error }) => {
      console.log(`  - ${word}: ${error}`);
    });
  }
  console.log('='.repeat(50));
}

// Run the seed
seedDatabaseFromCSV().catch((error) => {
  console.error('Fatal error:', error);
  process.exit(1);
});

