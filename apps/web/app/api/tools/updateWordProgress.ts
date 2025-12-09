import { tool, zodSchema } from "ai";
import z from "zod";
import { getDb } from "../chat/db";
import { findWordInDatabase, getTodayDate } from "./toolUtils";

const updateWordProgressSchema = z.object({
    words: z.array(z.object({
      english: z.string().optional().describe('The English word to update. Either english or cantonese_jyutping must be provided.'),
      cantonese_jyutping: z.string().optional().describe('The Cantonese (jyutping) pronunciation to update. Either english or cantonese_jyutping must be provided.'),
      success: z.boolean().describe('True if the user remembered the word, False if they struggled'),
    }).refine(
      (data) => data.english || data.cantonese_jyutping,
      { message: 'Either english or cantonese_jyutping must be provided' }
    )).describe('Array of words to update with their success status'),
  });
  
  type UpdateWordProgressInput = z.infer<typeof updateWordProgressSchema>;
  
  export const updateWordProgress = tool({
    description: 'Update proficiency metrics after practicing one or more words. Accepts an array of words with their success status. For each word, provide either "english" OR "cantonese_jyutping" (at least one is required). If success is true, increase proficiency_level by 1. If false, decrease by 1 (minimum 1). Always update last_practiced_date to today. Can update multiple words in a single call. The tool automatically handles word format variations and can search by either English translation or Cantonese (jyutping) pronunciation.',
    parameters: zodSchema(updateWordProgressSchema),
    // @ts-expect-error - tool function type definition may be incomplete
    execute: async ({ words }: UpdateWordProgressInput) => {
      try {
        const db = getDb();
        const today = getTodayDate();
  
        console.log('🔄 updateWordProgress params:', { wordCount: words.length, today });
        console.log('🔄 words:', words);
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
        for (const { english, cantonese_jyutping, success } of words) {
          try {
            // Determine which field to use for lookup (prefer english, fallback to cantonese_jyutping)
            const searchTerm = english || cantonese_jyutping;
            
            // Validate that at least one field is provided and is a string
            if (!searchTerm || typeof searchTerm !== 'string') {
              failedWords.push({ 
                english: String(searchTerm || 'undefined'), 
                reason: `Invalid word provided: either english or cantonese_jyutping must be a non-empty string, got english=${typeof english}, cantonese_jyutping=${typeof cantonese_jyutping}` 
              });
              console.log(`❌ Invalid word entry: english=${english}, cantonese_jyutping=${cantonese_jyutping}`);
              continue;
            }

            // Use fuzzy matching to find the word in the database
            const actualEnglish = findWordInDatabase(db, searchTerm);
            
            if (!actualEnglish) {
              failedWords.push({ 
                english: searchTerm, 
                reason: `Word not found in database. Searched for "${searchTerm}" (as both English and Cantonese) but no matching word found (tried fuzzy matching for variations like "I/my" vs "I / my").` 
              });
              console.log(`❌ Word "${searchTerm}" not found in database (fuzzy match failed for both English and Cantonese)`);
              continue;
            }
  
            // Get current word data using the actual database value
            const currentWord = getWordStmt.get(actualEnglish) as { proficiency_level: number | null } | undefined;
  
            if (!currentWord) {
              failedWords.push({ 
                english: searchTerm, 
                reason: `Word found but data retrieval failed. Matched "${searchTerm}" to "${actualEnglish}" but couldn't retrieve word data.` 
              });
              console.log(`❌ Word "${searchTerm}" matched to "${actualEnglish}" but data retrieval failed`);
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
            const errorSearchTerm = english || cantonese_jyutping || 'unknown';
            console.error(`❌ Error updating word "${errorSearchTerm}":`, error);
            failedWords.push({ 
              english: errorSearchTerm, 
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