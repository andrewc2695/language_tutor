import { tool, zodSchema } from 'ai';
import { z } from 'zod/v4';
import { getDb } from './db';

// Helper function to get today's date in YYYY-MM-DD format
function getTodayDate(): string {
  const date = new Date().toISOString().split('T')[0];
  if (!date) {
    throw new Error('Failed to get today\'s date');
  }
  return date;
}

// Helper function to normalize word for fuzzy matching
// Handles variations like "I/my" vs "I / my", case differences, etc.
function normalizeWord(word: string): string {
  return word
    .trim()
    .toLowerCase()
    .replace(/\s*\/\s*/g, '/')  // Normalize "I / my" -> "I/my"
    .replace(/\s+/g, ' ')        // Collapse multiple spaces
    .trim();
}

// Helper function to find a word in the database using fuzzy matching
// Can search by either English or Cantonese (jyutping)
// Returns the actual database english value if found, null otherwise
function findWordInDatabase(db: ReturnType<typeof getDb>, searchTerm: string): string | null {
  const normalizedSearch = normalizeWord(searchTerm);
  
  // First try exact match on English (case-insensitive)
  const exactEnglishMatch = db
    .prepare('SELECT english FROM words WHERE LOWER(TRIM(english)) = LOWER(TRIM(?))')
    .get(searchTerm) as { english: string } | undefined;
  
  if (exactEnglishMatch) {
    return exactEnglishMatch.english;
  }
  
  // Try exact match on Cantonese (case-insensitive)
  const exactCantoneseMatch = db
    .prepare('SELECT english FROM words WHERE LOWER(TRIM(cantonese_jyutping)) = LOWER(TRIM(?))')
    .get(searchTerm) as { english: string } | undefined;
  
  if (exactCantoneseMatch) {
    return exactCantoneseMatch.english;
  }
  
  // Then try normalized fuzzy match - get all words and compare normalized versions
  const allWords = db
    .prepare('SELECT english, cantonese_jyutping FROM words')
    .all() as Array<{ english: string; cantonese_jyutping: string }>;
  
  for (const word of allWords) {
    // Check normalized English
    const normalizedEnglish = normalizeWord(word.english);
    if (normalizedEnglish === normalizedSearch) {
      return word.english; // Return the actual database value
    }
    
    // Check normalized Cantonese
    const normalizedCantonese = normalizeWord(word.cantonese_jyutping);
    if (normalizedCantonese === normalizedSearch) {
      return word.english; // Return the actual database value
    }
  }
  
  return null;
}

// Tool 1: Get words for practice
const getWordsForPracticeSchema = z.object({
  mode: z.enum(['srs_review', 'general_review']).default('general_review').optional().describe('Controls the word selection strategy: general_review (default, for any words) or srs_review (for words due based on SRS calculation)'),
});

type GetWordsForPracticeInput = z.infer<typeof getWordsForPracticeSchema>;

export const getWordsForPractice = tool({
  description: 'Retrieve words for practice. Use general_review mode (default) for any words ordered by least recently practiced, or srs_review mode for words due based on SRS calculation. When user asks for "SRS review" or "due words", use srs_review mode. Returns all matching words without a limit.',
  parameters: zodSchema(getWordsForPracticeSchema),
  // @ts-expect-error - tool function type definition may be incomplete
  execute: async ({ mode = 'general_review' }: GetWordsForPracticeInput) => {
    try {
      const db = getDb();
      const today = getTodayDate();
      
      console.log('🔍 getWordsForPractice params:', { mode, today });
      
      let words: Array<{
        english: string;
        cantonese_jyutping: string;
        last_practiced_date: string;
        proficiency_level: number | null;
      }>;

      if (mode === 'general_review') {
        // Mode 2: General Review - Get any words, prioritizing least recently practiced
        console.log('📋 Executing general_review query (all words)');
        const stmt = db.prepare(`
          SELECT 
            english,
            cantonese_jyutping,
            last_practiced_date,
            proficiency_level
          FROM words
          ORDER BY last_practiced_date ASC, RANDOM()
        `);
        words = stmt.all() as Array<{
          english: string;
          cantonese_jyutping: string;
          last_practiced_date: string;
          proficiency_level: number | null;
        }>;

      } else {
        // Mode 1 (Default): SRS Review - Find words due for review
        // A word is due when: last_practiced_date <= today (simplified without interval)
        console.log('📋 Executing srs_review query with today:', today, '(all due words)');
        const stmt = db.prepare(`
          SELECT 
            english,
            cantonese_jyutping,
            last_practiced_date,
            proficiency_level
          FROM words
          WHERE date(last_practiced_date) <= date(?)
          ORDER BY last_practiced_date ASC
        `);
        words = stmt.bind(today).all() as Array<{
          english: string;
          cantonese_jyutping: string;
          last_practiced_date: string;
          proficiency_level: number | null;
        }>;
      }

      return {
        words: words.map((word) => ({
          english: word.english,
          cantonese_jyutping: word.cantonese_jyutping,
          last_practiced_date: word.last_practiced_date,
          proficiency_level: word.proficiency_level ?? 1,
        })),
        count: words.length,
        mode: mode,
      };
    } catch (error) {
      console.error('❌ getWordsForPractice error:', error);
      console.error('Error details:', {
        message: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : undefined,
        name: error instanceof Error ? error.name : undefined,
      });
      throw error;
    }
  },
});

// Tool 2: Add new word
const addNewWordSchema = z.object({
  english: z.string().describe('The English translation of the word'),
  cantonese_jyutping: z.string().describe('The Cantonese romanization (e.g., ping4 gwo2)'),
});

type AddNewWordInput = z.infer<typeof addNewWordSchema>;

export const addNewWord = tool({
  description: 'Add a newly learned word to the vocabulary database. Initializes with last_practiced_date = today and proficiency_level = 1.',
  parameters: zodSchema(addNewWordSchema),
  // @ts-expect-error - tool function type definition may be incomplete
  execute: async ({ english, cantonese_jyutping }: AddNewWordInput) => {
    const db = getDb();
    const today = getTodayDate();

    try {
      db.prepare(`
        INSERT INTO words (english, cantonese_jyutping, last_practiced_date, proficiency_level)
        VALUES (?, ?, ?, 1)
      `).run(english, cantonese_jyutping, today);

      return {
        success: true,
        message: `Word "${english}" (${cantonese_jyutping}) has been added to the vocabulary database.`,
        word: {
          english,
          cantonese_jyutping,
          last_practiced_date: today,
          proficiency_level: 1,
        },
      };
    } catch (error: unknown) {
      if (error && typeof error === 'object' && 'code' in error && error.code === 'SQLITE_CONSTRAINT_PRIMARYKEY') {
        return {
          success: false,
          message: `Word "${english}" already exists in the database.`,
        };
      }
      throw error;
    }
  },
});

// Tool 3: Update word progress
const updateWordProgressSchema = z.object({
  words: z.array(z.object({
    english: z.string().describe('The English word or Cantonese (jyutping) to update. Can be either the English translation or the Cantonese pronunciation.'),
    success: z.boolean().describe('True if the user remembered the word, False if they struggled'),
  })).describe('Array of words to update with their success status'),
});

type UpdateWordProgressInput = z.infer<typeof updateWordProgressSchema>;

export const updateWordProgress = tool({
  description: 'Update proficiency metrics after practicing one or more words. Accepts an array of words with their success status. For each word: If success is true, increase proficiency_level by 1. If false, decrease by 1 (minimum 1). Always update last_practiced_date to today. Can update multiple words in a single call. The tool automatically handles word format variations (e.g., "I/my" will match "I / my" in the database) and can search by either English translation or Cantonese (jyutping) pronunciation.',
  parameters: zodSchema(updateWordProgressSchema),
  // @ts-expect-error - tool function type definition may be incomplete
  execute: async ({ words }: UpdateWordProgressInput) => {
    try {
      const db = getDb();
      const today = getTodayDate();

      console.log('🔄 updateWordProgress params:', { wordCount: words.length, today });

      if (words.length === 0) {
        return {
          success: false,
          message: 'No words provided to update.',
          updatedWords: [],
          failedWords: [],
        };
      }

      // Prepare statements
      const getWordStmt = db.prepare('SELECT proficiency_level FROM words WHERE english = ?');
      const updateStmt = db.prepare(`
        UPDATE words
        SET last_practiced_date = ?,
            proficiency_level = ?
        WHERE english = ?
      `);
      const getUpdatedStmt = db.prepare(`
        SELECT 
          english,
          cantonese_jyutping,
          last_practiced_date,
          proficiency_level
        FROM words
        WHERE english = ?
      `);

      const updatedWords: Array<{
        english: string;
        cantonese_jyutping: string;
        last_practiced_date: string;
        proficiency_level: number;
      }> = [];
      const failedWords: Array<{ english: string; reason: string }> = [];

      // Process each word
      for (const { english, success } of words) {
        try {
          // Use fuzzy matching to find the word in the database
          const actualEnglish = findWordInDatabase(db, english);
          
          if (!actualEnglish) {
            failedWords.push({ 
              english, 
              reason: `Word not found in database. Searched for "${english}" (as both English and Cantonese) but no matching word found (tried fuzzy matching for variations like "I/my" vs "I / my").` 
            });
            console.log(`❌ Word "${english}" not found in database (fuzzy match failed for both English and Cantonese)`);
            continue;
          }

          // Get current word data using the actual database value
          const currentWord = getWordStmt.get(actualEnglish) as { proficiency_level: number | null } | undefined;

          if (!currentWord) {
            failedWords.push({ 
              english, 
              reason: `Word found but data retrieval failed. Matched "${english}" to "${actualEnglish}" but couldn't retrieve word data.` 
            });
            console.log(`❌ Word "${english}" matched to "${actualEnglish}" but data retrieval failed`);
            continue;
          }

          // Calculate new proficiency level
          const currentProficiency = currentWord.proficiency_level ?? 1;
          const newProficiency = success
            ? currentProficiency + 1  // Increase, no max
            : Math.max(currentProficiency - 1, 1); // Decrease, min 1

          // Update the word using the actual database value
          updateStmt.run(today, newProficiency, actualEnglish);

          // Get updated word data
          const updatedWord = getUpdatedStmt.get(actualEnglish) as {
            english: string;
            cantonese_jyutping: string;
            last_practiced_date: string;
            proficiency_level: number | null;
          };

          updatedWords.push({
            english: updatedWord.english,
            cantonese_jyutping: updatedWord.cantonese_jyutping,
            last_practiced_date: updatedWord.last_practiced_date,
            proficiency_level: updatedWord.proficiency_level ?? 1,
          });

          const matchNote = actualEnglish !== english ? ` (matched "${english}" to "${actualEnglish}")` : '';
          console.log(`✅ Updated word "${actualEnglish}"${matchNote}: proficiency=${newProficiency}`);
        } catch (error) {
          console.error(`❌ Error updating word "${english}":`, error);
          failedWords.push({ 
            english, 
            reason: error instanceof Error ? error.message : String(error) 
          });
        }
      }

      const successCount = updatedWords.length;
      const failCount = failedWords.length;

      console.log(`📊 Batch update complete: ${successCount} succeeded, ${failCount} failed`);

      return {
        success: successCount > 0,
        message: `Updated ${successCount} word(s). ${failCount > 0 ? `${failCount} word(s) failed to update.` : ''}`,
        updatedWords,
        failedWords: failCount > 0 ? failedWords : undefined,
      };
    } catch (error) {
      console.error('❌ updateWordProgress error:', error);
      console.error('Error details:', {
        message: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : undefined,
        name: error instanceof Error ? error.name : undefined,
      });
      throw error;
    }
  },
});

// Tool 4: Remove a word from the database
const removeWordSchema = z.object({
  english: z.string().describe('The English word or Cantonese (jyutping) to remove from the vocabulary database. Can be either the English translation or the Cantonese pronunciation.'),
});

type RemoveWordInput = z.infer<typeof removeWordSchema>;

export const removeWord = tool({
  description: 'Remove a word from the vocabulary database. Use this when the user explicitly asks to delete, remove, or forget a word. The word will be permanently deleted from the database. The tool automatically handles word format variations (e.g., "I/my" will match "I / my" in the database) and can search by either English translation or Cantonese (jyutping) pronunciation.',
  parameters: zodSchema(removeWordSchema),
  // @ts-expect-error - tool function type definition may be incomplete
  execute: async ({ english }: RemoveWordInput) => {
    try {
      const db = getDb();
      
      console.log('🗑️  removeWord params:', { english });

      // Use fuzzy matching to find the word in the database
      const actualEnglish = findWordInDatabase(db, english);

      if (!actualEnglish) {
        console.log(`❌ Word "${english}" not found in database (fuzzy match failed for both English and Cantonese)`);
        return {
          success: false,
          message: `Word "${english}" not found in the database (searched as both English and Cantonese).`,
        };
      }

      // Get the word details before deletion
      const existingWord = db
        .prepare('SELECT english, cantonese_jyutping FROM words WHERE english = ?')
        .get(actualEnglish) as { english: string; cantonese_jyutping: string } | undefined;

      if (!existingWord) {
        console.log(`❌ Word "${english}" matched to "${actualEnglish}" but couldn't retrieve word data`);
        return {
          success: false,
          message: `Word "${english}" found but couldn't retrieve word data.`,
        };
      }

      // Delete the word using the actual database value
      const stmt = db.prepare('DELETE FROM words WHERE english = ?');
      const result = stmt.run(actualEnglish);
      
      const matchNote = actualEnglish !== english ? ` (matched "${english}" to "${actualEnglish}")` : '';
      console.log(`✅ Removed word "${actualEnglish}"${matchNote}: ${result.changes} row(s) affected`);

      return {
        success: true,
        message: `Word "${existingWord.english}" (${existingWord.cantonese_jyutping}) has been removed from your vocabulary database.`,
        removedWord: {
          english: existingWord.english,
          cantonese_jyutping: existingWord.cantonese_jyutping,
        },
      };
    } catch (error) {
      console.error('❌ removeWord error:', error);
      console.error('Error details:', {
        message: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : undefined,
        name: error instanceof Error ? error.name : undefined,
      });
      throw error;
    }
  },
});

// Tool 5: Get all words in CSV format
export const getAllWordsCSV = tool({
  description: 'Retrieve all words from the vocabulary database. Returns plain text with all words, one per line in format "english, jyutping". IMPORTANT: You must include the returned text directly in your response to the user - do not just show the tool result. Copy the word list into your chat message so the user can see all their words.',
  parameters: zodSchema(z.object({})),
  // @ts-expect-error - tool function type definition may be incomplete
  execute: async () => {
    const db = getDb();
    
    const words = db
      .prepare(`
        SELECT 
          english,
          cantonese_jyutping
        FROM words
        ORDER BY english ASC
      `)
      .all() as Array<{
        english: string;
        cantonese_jyutping: string;
      }>;

    // Build text content: one word per line in format "english, jyutping"
    const textLines = words.map((word) => {
      return `${word.english}, ${word.cantonese_jyutping}`;
    });

    const textContent = textLines.join('\n');
    return textContent;
  },
});

// Tool 6: Get words with lowest proficiency level
export const getWordsWithLowestProficiency = tool({
  description: 'Retrieve words with the lowest proficiency_level from the vocabulary database. Returns words ordered by proficiency_level (lowest first), then by last_practiced_date (least recently practiced first). Useful for identifying words that need the most practice.',
  parameters: zodSchema(z.object({})),
  // @ts-expect-error - tool function type definition may be incomplete
  execute: async () => {
    try {
      const db = getDb();
      
      console.log('🔍 getWordsWithLowestProficiency: fetching words with lowest proficiency');
      
      const stmt = db.prepare(`
        SELECT 
          english,
          cantonese_jyutping,
          last_practiced_date,
          proficiency_level
        FROM words
        ORDER BY COALESCE(proficiency_level, 1) ASC, last_practiced_date ASC
      `);
      
      const words = stmt.all() as Array<{
        english: string;
        cantonese_jyutping: string;
        last_practiced_date: string;
        proficiency_level: number | null;
      }>;

      // Find the minimum proficiency level
      const minProficiency = words.length > 0 
        ? Math.min(...words.map(w => w.proficiency_level ?? 1))
        : null;

      // Filter to only words with the minimum proficiency level
      const lowestProficiencyWords = words.filter(w => (w.proficiency_level ?? 1) === minProficiency);

      return {
        words: lowestProficiencyWords.map((word) => ({
          english: word.english,
          cantonese_jyutping: word.cantonese_jyutping,
          last_practiced_date: word.last_practiced_date,
          proficiency_level: word.proficiency_level ?? 1,
        })),
        count: lowestProficiencyWords.length,
        min_proficiency_level: minProficiency,
      };
    } catch (error) {
      console.error('❌ getWordsWithLowestProficiency error:', error);
      console.error('Error details:', {
        message: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : undefined,
        name: error instanceof Error ? error.name : undefined,
      });
      throw error;
    }
  },
});

