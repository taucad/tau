import process from 'node:process';
import { OpenAIEmbeddings } from '@langchain/openai';
import { desc, sql } from 'drizzle-orm';
import { db } from '~/db/client.js';
import { replicadChunks } from '~/db/schema.js';
import type { ReplicadChunk } from '~/db/schema.js';

export type RelevantChunk = {
  similarity?: number;
} & ReplicadChunk;

/**
 * Retrieve relevant Replicad API chunks using vector similarity
 */
export async function retrieveRelevantChunks(query: string, limit = 8, minSimilarity = 0.5): Promise<RelevantChunk[]> {
  try {
    // Generate embedding for the query
    const embeddings = new OpenAIEmbeddings({
      // eslint-disable-next-line @typescript-eslint/naming-convention -- expected
      openAIApiKey: process.env.OPENAI_API_KEY,
      modelName: 'text-embedding-3-small',
    });

    const queryEmbedding = await embeddings.embedQuery(query);
    const embeddingString = JSON.stringify(queryEmbedding);

    // Use vector similarity search
    const similarChunks = await db
      .select({
        id: replicadChunks.id,
        signature: replicadChunks.signature,
        jsdoc: replicadChunks.jsdoc,
        embedding: replicadChunks.embedding,
        similarity: sql<number>`1 - (${replicadChunks.embedding} <=> ${embeddingString}::vector)`,
      })
      .from(replicadChunks)
      .where(sql`${replicadChunks.embedding} IS NOT NULL`)
      .orderBy(desc(sql`1 - (${replicadChunks.embedding} <=> ${embeddingString}::vector)`))
      .limit(limit * 2); // Get more to filter by similarity

    // Filter by minimum similarity and return top results
    return similarChunks.filter((chunk) => chunk.similarity! >= minSimilarity).slice(0, limit);
  } catch (error) {
    console.warn('Vector search failed, falling back to text search:', error);
    return textSearchFallback(query, limit);
  }
}

/**
 * Fallback text search when vector search is not available
 */
async function textSearchFallback(query: string, limit: number): Promise<ReplicadChunk[]> {
  return db
    .select()
    .from(replicadChunks)
    .where(
      sql`to_tsvector('english', ${replicadChunks.signature} || ' ' || ${replicadChunks.jsdoc}) 
          @@ plainto_tsquery('english', ${query})`,
    )
    .limit(limit);
}

/**
 * Build context string from retrieved chunks for LLM prompt
 */
export function buildApiContext(chunks: RelevantChunk[]): string {
  if (chunks.length === 0) {
    return 'No relevant API documentation found.';
  }

  const contextParts = chunks.map((chunk, index) => {
    const similarityNote = chunk.similarity ? ` (similarity: ${(chunk.similarity * 100).toFixed(1)}%)` : '';

    return `## ${index + 1}. ${chunk.id}${similarityNote}

${chunk.jsdoc ? `${chunk.jsdoc}\n` : ''}
\`\`\`typescript
${chunk.signature}
\`\`\``;
  });

  return `# Relevant Replicad API Documentation

${contextParts.join('\n\n')}

---
*Retrieved ${chunks.length} relevant API chunks*`;
}

/**
 * Get suggested API functions based on user intent
 */
export async function suggestApiFunctions(intent: string): Promise<string[]> {
  const chunks = await retrieveRelevantChunks(intent, 6, 0.4);
  return chunks.map((chunk) => chunk.id);
}
