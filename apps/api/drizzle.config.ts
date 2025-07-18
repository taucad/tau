import process from 'node:process';
// eslint-disable-next-line import-x/no-unassigned-import -- this is a config file
import 'dotenv/config';
import { defineConfig } from 'drizzle-kit';

export default defineConfig({
  out: './app/database/migrations',
  schema: './app/database/schema.ts',
  dialect: 'postgresql',
  dbCredentials: {
    url: process.env.DATABASE_URL,
  },
});
