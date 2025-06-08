import { pgTable, text, vector } from 'drizzle-orm/pg-core';

export const replicadChunks = pgTable('replicad_chunks', {
  id: text('id').primaryKey(),
  signature: text('signature').notNull(),
  jsdoc: text('jsdoc').notNull(),
  embedding: vector('embedding', { dimensions: 1536 }),
});

export type ReplicadChunk = typeof replicadChunks.$inferSelect;
export type NewReplicadChunk = typeof replicadChunks.$inferInsert;
