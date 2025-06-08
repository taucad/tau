/* eslint-disable @typescript-eslint/no-unsafe-assignment, no-await-in-loop, unicorn/no-process-exit */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import process from 'node:process';
import { db } from '../db/client.js';
import { replicadChunks } from '../db/schema.js';

type ChunkData = {
  id: string;
  signature: string;
  jsDoc: string;
  embedding?: number[];
};

/**
 * Import replicad chunks into the database
 */
async function main(): Promise<void> {
  const chunksPath = join(process.cwd(), 'gen/api/replicad/replicad-chunks.json');

  console.log('📥 Reading chunks from', chunksPath);
  const chunksJson = readFileSync(chunksPath, 'utf8');
  const chunks: ChunkData[] = JSON.parse(chunksJson);

  console.log(`📊 Found ${chunks.length} chunks to import`);

  // Clear existing data
  console.log('🗑️  Clearing existing chunks...');
  await db.delete(replicadChunks);

  // Insert new chunks
  console.log('💾 Inserting chunks...');
  for (const chunk of chunks) {
    try {
      await db.insert(replicadChunks).values({
        id: chunk.id,
        signature: chunk.signature,
        jsdoc: chunk.jsDoc,
        embedding: chunk.embedding ?? null,
      });
      console.log(`✅ Imported: ${chunk.id}`);
    } catch (error) {
      console.warn(`❌ Failed to import ${chunk.id}:`, error);
    }
  }

  console.log('✅ Import complete!');
  process.exit(0);
}

await main().catch((error: unknown) => {
  console.error('❌ Import failed:', error);
  process.exit(1);
});
