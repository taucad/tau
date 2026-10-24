import process from 'node:process';
import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import * as schema from '#database/schema.js';
import { requestProjectDeletion } from '#api/projects/project-deletion.js';
import { assertDeletionDatabase } from '#testing/project-deletion.fixture.js';

const connection = assertDeletionDatabase(process.env.DATABASE_URL);
const [projectId, userId] = process.argv.slice(2);
if (!projectId || !userId || !process.send) {
  throw new Error('Deletion crash fixture requires project, owner and IPC.');
}
const client = postgres(connection, { max: 1, prepare: false });
const database = drizzle(client, { schema });
await requestProjectDeletion({ database, projectId, userId, enabled: true });
process.send({ state: 'intent-committed' });
// The parent kills this process before any storage fence or graceful shutdown.
setInterval(() => undefined, 1000);
