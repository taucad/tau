import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import process from 'node:process';

type ChunkData = {
  id: string;
  signature: string;
  jsDoc: string;
  embedding?: number[];
};

/**
 * Simple test to verify RAG chunks work correctly
 */
async function main(): Promise<void> {
  const chunksPath = join(process.cwd(), 'gen/api/replicad/replicad-chunks.json');

  console.log('📥 Reading chunks from', chunksPath);
  const chunksJson = readFileSync(chunksPath, 'utf8');
  const chunks: ChunkData[] = JSON.parse(chunksJson) as ChunkData[];

  console.log(`📊 Found ${chunks.length} chunks`);

  // Simple text search for "draw" functionality
  const query = 'draw circle';
  console.log(`🔍 Searching for: "${query}"`);

  const relevantChunks = chunks.filter((chunk) => {
    const text = `${chunk.jsDoc} ${chunk.signature}`.toLowerCase();
    return text.includes('draw') && text.includes('circle');
  });

  console.log(`✅ Found ${relevantChunks.length} relevant chunks:`);

  for (const chunk of relevantChunks.slice(0, 3)) {
    console.log(`\n## ${chunk.id}`);
    if (chunk.jsDoc) {
      console.log(chunk.jsDoc);
    }

    console.log('```typescript');
    console.log(chunk.signature);
    console.log('```');
  }

  console.log('\n✅ RAG test complete!');
}

await main().catch((error: unknown) => {
  console.error('❌ Test failed:', error);
});
