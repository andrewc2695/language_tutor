import Database from 'better-sqlite3';
import { join } from 'path';
import { existsSync } from 'fs';

// Get the database path
const dbDir = join(process.cwd(), 'data');
const dbPath = join(dbDir, 'vocabulary.db');

if (!existsSync(dbPath)) {
  console.error('❌ Database file not found at:', dbPath);
  process.exit(1);
}

console.log('📚 Opening database:', dbPath);
const db = new Database(dbPath);

try {
  // Get all words
  const words = db
    .prepare(`
      SELECT 
        english,
        cantonese_jyutping,
        last_practiced_date,
        proficiency_level
      FROM words
      ORDER BY english ASC
    `)
    .all() as Array<{
      english: string;
      cantonese_jyutping: string;
      last_practiced_date: string;
      proficiency_level: number | null;
    }>;

  console.log(`\n📊 Total words in database: ${words.length}\n`);
  console.log('─'.repeat(100));
  console.log(
    'English'.padEnd(30) +
    'Jyutping'.padEnd(25) +
    'Last Practiced'.padEnd(18) +
    'Proficiency'
  );
  console.log('─'.repeat(100));

  words.forEach((word) => {
    console.log(
      word.english.padEnd(30) +
      word.cantonese_jyutping.padEnd(25) +
      word.last_practiced_date.padEnd(18) +
      (word.proficiency_level ?? 1).toString()
    );
  });

  console.log('─'.repeat(100));
  console.log(`\n✅ Displayed ${words.length} words\n`);
} catch (error) {
  console.error('❌ Error reading database:', error);
  process.exit(1);
} finally {
  db.close();
}

