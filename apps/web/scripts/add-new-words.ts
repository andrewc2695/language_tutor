import Database from 'better-sqlite3';
import type { Database as DatabaseType } from 'better-sqlite3';
import { readFile } from 'fs/promises';
import { existsSync, mkdirSync } from 'fs';
import { join } from 'path';

// Get the database path
const dbDir = join(process.cwd(), 'data');
const dbPath = join(dbDir, 'vocabulary.db');

// Get the CSV file path
const csvPath = join(process.cwd(), 'app', 'api', 'chat', 'wordBank', 'words2.csv');

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

async function main() {
  // Ensure the data directory exists
  if (!existsSync(dbDir)) {
    mkdirSync(dbDir, { recursive: true });
  }

  // Check if CSV file exists
  if (!existsSync(csvPath)) {
    console.error(`❌ CSV file not found: ${csvPath}`);
    process.exit(1);
  }

  console.log(`📖 Reading words from: ${csvPath}`);
  
  // Read CSV file
  const csvContent = await readFile(csvPath, 'utf-8');
  const lines = csvContent.split('\n').map(line => line.trim()).filter(line => line.length > 0);

  if (lines.length === 0) {
    console.error('❌ CSV file is empty');
    process.exit(1);
  }

  // Parse header - handle both "English,Jyutping" and "english,cantonese_jyutping" formats
  const header = lines[0].toLowerCase();
  const headerFields = parseCSVLine(lines[0]);
  
  let englishIndex = -1;
  let jyutpingIndex = -1;
  let hasHeader = false;
  
  // Find column indices
  for (let i = 0; i < headerFields.length; i++) {
    const field = headerFields[i].toLowerCase();
    if (field === 'english' || field === 'english,jyutping') {
      englishIndex = i;
      hasHeader = true;
    }
    if (field === 'jyutping' || field === 'cantonese_jyutping') {
      jyutpingIndex = i;
      hasHeader = true;
    }
  }

  // Try to find indices by checking common patterns
  if (englishIndex === -1 || jyutpingIndex === -1) {
    // Assume first column is English, second is Jyutping
    if (headerFields.length >= 2) {
      englishIndex = 0;
      jyutpingIndex = 1;
      console.log('⚠️  Could not detect column headers, assuming: Column 0 = English, Column 1 = Jyutping');
    } else {
      console.error('❌ Could not determine column structure');
      process.exit(1);
    }
  }

  // Open database
  const db = new Database(dbPath);
  initializeSchema(db);

  // Get all existing words from database (by english key)
  const existingWords = db
    .prepare('SELECT english FROM words')
    .all() as Array<{ english: string }>;
  
  const existingEnglishSet = new Set(existingWords.map(w => w.english.toLowerCase().trim()));

  const startIndex = hasHeader ? 1 : 0;
  const totalWords = lines.length - (hasHeader ? 1 : 0);
  
  console.log(`📚 Found ${existingEnglishSet.size} existing words in database`);
  console.log(`📝 Processing ${totalWords} words from CSV...\n`);

  const today = getTodayDate();
  const newWords: Array<{ english: string; jyutping: string }> = [];
  const skippedWords: Array<{ english: string; reason: string }> = [];

  // Process data lines (skip header only if header was detected)
  for (let i = startIndex; i < lines.length; i++) {
    const line = lines[i];
    if (!line) continue;

    const fields = parseCSVLine(line);
    
    if (fields.length < 2) {
      skippedWords.push({ english: line, reason: 'Invalid format (less than 2 fields)' });
      continue;
    }

    const english = fields[englishIndex]?.trim();
    const jyutping = fields[jyutpingIndex]?.trim();

    if (!english || !jyutping) {
      skippedWords.push({ english: english || line, reason: 'Missing english or jyutping' });
      continue;
    }

    // Check if word already exists (case-insensitive)
    if (existingEnglishSet.has(english.toLowerCase())) {
      skippedWords.push({ english, reason: 'Already exists in database' });
      continue;
    }

    newWords.push({ english, jyutping });
  }

  // Insert new words
  const insertStmt = db.prepare(`
    INSERT INTO words (english, cantonese_jyutping, last_practiced_date, proficiency_level)
    VALUES (?, ?, ?, 1)
  `);

  let addedCount = 0;
  let errorCount = 0;

  for (const word of newWords) {
    try {
      insertStmt.run(word.english, word.jyutping, today);
      addedCount++;
    } catch (error: unknown) {
      if (error && typeof error === 'object' && 'code' in error && error.code === 'SQLITE_CONSTRAINT_PRIMARYKEY') {
        skippedWords.push({ english: word.english, reason: 'Duplicate key (race condition?)' });
      } else {
        console.error(`❌ Error inserting "${word.english}":`, error);
        errorCount++;
      }
    }
  }

  // Summary
  console.log('\n' + '='.repeat(60));
  console.log('📊 Summary:');
  console.log('='.repeat(60));
  console.log(`✅ Added: ${addedCount} new words`);
  console.log(`⏭️  Skipped: ${skippedWords.length} words (already exist or invalid)`);
  if (errorCount > 0) {
    console.log(`❌ Errors: ${errorCount} words`);
  }

  if (skippedWords.length > 0 && skippedWords.length <= 20) {
    console.log('\n⏭️  Skipped words:');
    skippedWords.forEach(({ english, reason }) => {
      console.log(`   - "${english}" (${reason})`);
    });
  } else if (skippedWords.length > 20) {
    console.log(`\n⏭️  Skipped ${skippedWords.length} words (too many to display)`);
  }

  console.log(`\n📚 Total words in database: ${existingEnglishSet.size + addedCount}`);
  console.log('='.repeat(60));

  db.close();
}

main().catch((error) => {
  console.error('❌ Fatal error:', error);
  process.exit(1);
});

