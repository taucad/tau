import process from 'node:process';
// oxlint-disable-next-line import-x/no-unassigned-import -- this is a config file
import 'dotenv/config';
import { defineConfig } from 'drizzle-kit';
import { ensureWorktreeDatabase } from '@taucad/utils/worktree-database';

export default defineConfig({
  out: './app/database/migrations',
  schema: './app/database/schema.ts',
  dialect: 'postgresql',
  dbCredentials: {
    // A linked git worktree migrates its own fork of the local database.
    url: process.env.DATABASE_URL && ensureWorktreeDatabase(process.env.DATABASE_URL),
  },
});
