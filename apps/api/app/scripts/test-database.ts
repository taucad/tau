import { eq } from 'drizzle-orm';
import { db } from '../db/client.js';
import { replicadChunks } from '../db/schema.js';

/**
 * Test database connection and basic operations
 */
async function testDatabase(): Promise<void> {
  console.log('🧪 Testing database connection...');

  try {
    // Test connection by querying existing data
    console.log('🔗 Testing database query...');
    const existingChunks = await db.select().from(replicadChunks).limit(5);
    console.log(`📊 Found ${existingChunks.length} existing chunks in database`);

    // Test insert
    console.log('💾 Testing database insert...');
    const testChunk = {
      id: 'test_chunk_' + Date.now(),
      signature: 'export declare function testFunction(param: number): void;',
      jsdoc: '/** Test function for database verification */',
      embedding: null,
    };

    await db.insert(replicadChunks).values(testChunk);
    console.log(`✅ Successfully inserted test chunk: ${testChunk.id}`);

    // Test retrieval
    const retrievedChunk = await db.select().from(replicadChunks).where(eq(replicadChunks.id, testChunk.id)).limit(1);

    if (retrievedChunk.length === 1) {
      console.log('✅ Successfully retrieved test chunk');
    } else {
      throw new Error('Failed to retrieve test chunk');
    }

    // Clean up test data
    await db.delete(replicadChunks).where(eq(replicadChunks.id, testChunk.id));
    console.log('🧹 Cleaned up test data');

    console.log('✅ Database test passed!');
  } catch (error) {
    console.error('❌ Database test failed:', error);
    throw error;
  }
}

await testDatabase().catch((error: unknown) => {
  console.error('❌ Database connection failed:', error);
  console.log('💡 Make sure the database is running: docker compose -f infra/docker-compose.db.yml up -d');
});
