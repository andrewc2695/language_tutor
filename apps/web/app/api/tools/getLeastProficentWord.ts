import { tool, zodSchema } from 'ai';
import { z } from 'zod/v4';
import { getDb } from '../chat/db';

export const getLeastProficientWord = tool({
  description: 'Retrieve the word with the lowest proficiency level. If multiple words have the same lowest proficiency, returns the one that was practiced least recently (farthest date in the past). Useful for identifying the word that needs the most practice.',
  parameters: zodSchema(z.object({})),
  // @ts-expect-error - tool function type definition may be incomplete
  execute: async () => {
    try {
      const db = getDb();
      console.log('🔍 getLeastProficientWord: fetching word with lowest proficiency and oldest practice date');
      // Query: Order by proficiency_level ASC (lowest first), then by last_practiced_date ASC (oldest first)
      // LIMIT 1 to get just the single word
      const stmt = db.prepare(`
        SELECT 
          english,
          cantonese_jyutping,
          last_practiced_date,
          proficiency_level
        FROM words
        ORDER BY COALESCE(proficiency_level, 1) ASC, last_practiced_date ASC
        LIMIT 1
      `);
      
      const word = stmt.get() as {
        english: string;
        cantonese_jyutping: string;
        last_practiced_date: string;
        proficiency_level: number | null;
      } | undefined;

      if (!word) {
        return {
          word: null,
          message: 'No words found in database.',
        };
      }

      console.log('🔍 getLeastProficientWord: found word with lowest proficiency:', word);
      return {
        word: {
          english: word.english,
          cantonese_jyutping: word.cantonese_jyutping,
          last_practiced_date: word.last_practiced_date,
          proficiency_level: word.proficiency_level ?? 1,
        },
      };
    } catch (error) {
      console.error('❌ getLeastProficientWord error:', error);
      console.error('Error details:', {
        message: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : undefined,
        name: error instanceof Error ? error.name : undefined,
      });
      throw error;
    }
  },
});

