# Language Tutor

A Cantonese language learning application built with Next.js, featuring AI-powered conversation practice and vocabulary management.

## Prerequisites

Before you begin, ensure you have the following installed:

- **Node.js** v22.21.1 (specified in `.nvmrc`)
  - If you use `nvm`, run: `nvm use` or `nvm install`
- **pnpm** v9.0.0 (specified in `package.json`)
  - Install with: `npm install -g pnpm@9.0.0`
- **Google Gemini API Key**
  - Get your API key from [Google AI Studio](https://aistudio.google.com/apikey)

## Getting Started

### 1. Clone the Repository

```bash
git clone https://github.com/andrewc2695/language_tutor.git
cd language_tutor
```

### 2. Install Dependencies

```bash
pnpm install
```

### 3. Set Up Environment Variables

Create a `.env.local` file in the `apps/web` directory:

```bash
cd apps/web
touch .env.local
```

Add your Google Gemini API key to `apps/web/.env.local`:

```env
GOOGLE_GENERATIVE_AI_API_KEY=your_api_key_here
```

**Important:** The `.env.local` file is already in `.gitignore` and will not be committed to the repository. Never commit your API keys!

### 4. Seed the Database

The application uses a SQLite database to store vocabulary words. Seed it from the included CSV file:

```bash
cd apps/web
pnpm seed-db
```

This will:
- Create a `data/` directory (if it doesn't exist)
- Create a SQLite database at `data/vocabulary.db`
- Import words from `app/api/chat/wordBank/words.csv`

### 5. Run the Development Server

From the root directory:

```bash
pnpm dev
```

Or to run only the web app:

```bash
pnpm dev --filter=web
```

The application will be available at [http://localhost:3000](http://localhost:3000)

## Project Structure

This is a [Turborepo](https://turborepo.org/) monorepo with the following structure:

- `apps/web`: The main Next.js application
  - `app/api/chat/`: API routes for chat functionality
  - `app/api/agents/`: AI agent implementations
  - `app/api/tools/`: Database and vocabulary tools
  - `app/api/chat/wordBank/`: CSV files containing vocabulary words
  - `scripts/`: Utility scripts for database management
- `packages/ui`: Shared React component library
- `packages/eslint-config`: Shared ESLint configuration
- `packages/typescript-config`: Shared TypeScript configuration

## Available Scripts

### Root Level

- `pnpm dev`: Start all apps in development mode
- `pnpm build`: Build all apps and packages
- `pnpm lint`: Lint all apps and packages
- `pnpm check-types`: Type check all apps and packages

### Web App (`apps/web`)

- `pnpm dev`: Start the development server on port 3000
- `pnpm build`: Build the production application
- `pnpm start`: Start the production server
- `pnpm seed-db`: Seed the database from CSV file
- `pnpm view-db`: View database contents
- `pnpm add-new-words`: Add new words to the database
- `pnpm extract-csv`: Extract data to CSV format
- `pnpm update-dates`: Update practice dates in the database

## Database

The application uses SQLite with `better-sqlite3`. The database file is stored at `apps/web/data/vocabulary.db` and contains:

- **words** table: Stores vocabulary with English, Cantonese (Jyutping), practice dates, and proficiency levels

The database is automatically created when you first run the application or seed script.

## How It Works

### Sentence Agent

The Sentence Agent is an AI-powered component that generates practice sentences to help you learn Cantonese vocabulary. Here's how it works:

1. **Word Selection**: The agent identifies the word you need the most practice with by:
   - Finding the word with the **smallest proficiency level** (lowest score)
   - If multiple words have the same lowest proficiency, it selects the one you've **seen farthest in the past** (oldest `last_practiced_date`)

2. **Sentence Generation**: The agent then:
   - Retrieves 50 random words from your vocabulary database
   - Attempts to create a natural, grammatically correct Cantonese sentence using:
     - The least proficient word (which **must** be included)
     - Any of the 50 random words to help construct a complete sentence
   - If needed, it can fetch more random words to create a better sentence

3. **Progress Tracking**: When you respond with your translation:
   - The agent evaluates your translation and provides feedback
   - It **updates all words used** in the sentence based on your performance:
     - Words you translated correctly: proficiency increases
     - Words you struggled with: proficiency decreases (minimum of 1)
     - All words get their `last_practiced_date` updated to today
   - If your translation was correct, the agent automatically generates a new sentence without waiting for you to ask

This adaptive approach ensures you focus on the words that need the most practice while maintaining natural, context-rich sentence practice.

## Technology Stack

- **Framework**: Next.js 16
- **Language**: TypeScript
- **AI SDK**: Vercel AI SDK with Google Gemini
- **Database**: SQLite (better-sqlite3)
- **Package Manager**: pnpm
- **Monorepo**: Turborepo

## Troubleshooting

### Database Issues

If you encounter database errors:
1. Delete the `apps/web/data/` directory
2. Run `pnpm seed-db` again to recreate the database

### API Key Issues

If you get authentication errors:
1. Verify your API key is correct in `apps/web/.env.local`
2. Ensure the file is named exactly `.env.local` (not `.env` or `.env.local.txt`)
3. Restart the development server after adding/changing the API key

### Port Already in Use

If port 3000 is already in use:
- The dev server will automatically try the next available port
- Or specify a different port: `pnpm dev -- --port 3001`

## Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

## License

This project is open source and available under the MIT License.

## Useful Links

- [Next.js Documentation](https://nextjs.org/docs)
- [Turborepo Documentation](https://turborepo.com/docs)
- [Vercel AI SDK](https://sdk.vercel.ai/docs)
- [Google AI Studio](https://aistudio.google.com/)
