import process from 'node:process';
import { config as loadDotenv } from 'dotenv';
import { defineConfig } from 'drizzle-kit';
import { ensureWorktreeDatabase } from '@taucad/utils/worktree-database';

// The local `DATABASE_URL` lives in the API's `.env` (copied from `.env.example`); targets run from this project's root.
loadDotenv({ path: '../../api/.env' });

export default defineConfig({
  out: './src/migrations',
  schema: './src/schema/index.ts',
  dialect: 'postgresql',
  dbCredentials: {
    // A linked git worktree migrates its own fork of the local database.
    url: process.env.DATABASE_URL && ensureWorktreeDatabase(process.env.DATABASE_URL),
  },
});
