import { tool, zodSchema } from 'ai';
import { z } from 'zod/v4';
import { getDb } from '../chat/db';

export const getRandomWords = tool({
  description: 'Retrieve 50 random words from the vocabulary database. Useful for generating sentences with a diverse set of vocabulary words.',
  parameters: zodSchema(z.object({})),
  // @ts-expect-error - tool function type definition may be incomplete
  execute: async () => {
    try {
      const db = getDb();
      
      console.log('🔍 getRandomWords: fetching 50 random words');
      
      // Query: Get 50 random words using SQLite's RANDOM() function
      const stmt = db.prepare(`
        SELECT 
          english,
          cantonese_jyutping,
          last_practiced_date,
          proficiency_level
        FROM words
        ORDER BY RANDOM()
        LIMIT 50
      `);
      
      const words = stmt.all() as Array<{
        english: string;
        cantonese_jyutping: string;
        last_practiced_date: string;
        proficiency_level: number | null;
      }>;

      return {
        words: words.map((word) => ({
          english: word.english,
          cantonese_jyutping: word.cantonese_jyutping,
          last_practiced_date: word.last_practiced_date,
          proficiency_level: word.proficiency_level ?? 1,
        })),
        count: words.length,
        message: `Retrieved ${words.length} random words from the database.`,
      };
    } catch (error) {
      console.error('❌ getRandomWords error:', error);
      console.error('Error details:', {
        message: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : undefined,
        name: error instanceof Error ? error.name : undefined,
      });
      throw error;
    }
  },
});

