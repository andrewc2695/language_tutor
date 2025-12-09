import { readdir, readFile, writeFile } from 'fs/promises';
import { join } from 'path';

interface Card {
  frontText: string;
  backText: string;
  [key: string]: unknown;
}

interface DeckFile {
  name: string;
  cards: Card[];
  [key: string]: unknown;
}

// Get the base directory with JSON files
const baseDir = join(process.cwd(), 'app', 'api', 'chat', 'base');
const outputPath = join(process.cwd(), 'app', 'api', 'chat', 'wordBank', 'words.csv');

async function extractToCSV() {
  console.log('Extracting data from JSON files...\n');

  // Read all JSON files from base directory
  const files = await readdir(baseDir);
  const jsonFiles = files.filter((file) => file.endsWith('.json'));

  console.log(`Found ${jsonFiles.length} JSON files\n`);

  const csvRows: string[] = [];
  // Add CSV header
  csvRows.push('english,cantonese_jyutping');

  let totalCards = 0;
  let extractedCards = 0;

  // Process each JSON file
  for (const file of jsonFiles) {
    const filePath = join(baseDir, file);
    console.log(`Processing ${file}...`);

    try {
      const fileContent = await readFile(filePath, 'utf-8');
      const deck: DeckFile = JSON.parse(fileContent);

      if (!deck.cards || !Array.isArray(deck.cards)) {
        console.log(`  ⚠️  Skipping ${file}: No cards array found\n`);
        continue;
      }

      let fileExtracted = 0;

      for (const card of deck.cards) {
        totalCards++;

        const english = card.frontText?.trim();
        const cantonese_jyutping = card.backText?.trim();

        // Skip if missing required fields
        if (!english || !cantonese_jyutping) {
          continue;
        }

        // Escape quotes and commas in CSV
        const escapeCSV = (text: string): string => {
          // If text contains comma, quote, or newline, wrap in quotes and escape quotes
          if (text.includes(',') || text.includes('"') || text.includes('\n')) {
            return `"${text.replace(/"/g, '""')}"`;
          }
          return text;
        };

        csvRows.push(`${escapeCSV(english)},${escapeCSV(cantonese_jyutping)}`);
        fileExtracted++;
        extractedCards++;
      }

      console.log(`  ✅ Extracted ${fileExtracted} cards\n`);
    } catch (error) {
      console.error(`  ❌ Error processing ${file}:`, error);
    }
  }

  // Write CSV file
  const csvContent = csvRows.join('\n');
  await writeFile(outputPath, csvContent, 'utf-8');

  // Summary
  console.log('='.repeat(50));
  console.log('Extraction Summary:');
  console.log(`  Total cards processed: ${totalCards}`);
  console.log(`  Cards extracted: ${extractedCards}`);
  console.log(`  CSV file written to: ${outputPath}`);
  console.log('='.repeat(50));
}

// Run the extraction
extractToCSV().catch((error) => {
  console.error('Fatal error:', error);
  process.exit(1);
});

