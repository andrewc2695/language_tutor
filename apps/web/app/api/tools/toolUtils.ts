import type { Database } from 'better-sqlite3';

// Helper function to get today's date in YYYY-MM-DD format
export function getTodayDate(): string {
    const date = new Date().toISOString().split('T')[0];
    if (!date) {
      throw new Error('Failed to get today\'s date');
    }
    return date;
  }
  
  // Helper function to normalize word for fuzzy matching
  // Handles variations like "I/my" vs "I / my", case differences, etc.
  function normalizeWord(word: string): string {
    if (!word || typeof word !== 'string') {
      return '';
    }
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
  export function findWordInDatabase(db: Database, searchTerm: string): string | null {
    if (!searchTerm || typeof searchTerm !== 'string') {
      return null;
    }
    const normalizedSearch = normalizeWord(searchTerm);
    if (!normalizedSearch) {
      return null;
    }
    
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
      
      // Check normalized Cantonese - handle multiple jyutping values separated by /
      const normalizedCantonese = normalizeWord(word.cantonese_jyutping);
      
      // First check exact match on full jyutping string
      if (normalizedCantonese === normalizedSearch) {
        return word.english; // Return the actual database value
      }
      
      // Then check if the search term matches any individual jyutping value
      // Split by / and check each part (handles cases like "si5 coeng4 / zaap6 fo3 pou3")
      const jyutpingParts = normalizedCantonese.split('/').map(part => part.trim());
      for (const part of jyutpingParts) {
        if (part === normalizedSearch) {
          return word.english; // Return the actual database value
        }
      }
    }
    
    return null;
  }