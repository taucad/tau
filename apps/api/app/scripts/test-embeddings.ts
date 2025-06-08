import process from 'node:process';
import { OpenAIEmbeddings } from '@langchain/openai';

/**
 * Test embeddings generation to verify OPENAI_API_KEY works
 */
async function testEmbeddings(): Promise<void> {
  console.log('🧪 Testing OpenAI embeddings...');

  if (!process.env.OPENAI_API_KEY) {
    console.log('❌ OPENAI_API_KEY not found in environment');
    console.log('💡 Set OPENAI_API_KEY environment variable to test embeddings');
    throw new Error('OPENAI_API_KEY not found');
  }

  const embeddings = new OpenAIEmbeddings({
    // eslint-disable-next-line @typescript-eslint/naming-convention
    openAIApiKey: process.env.OPENAI_API_KEY,
    modelName: 'text-embedding-3-small',
  });

  console.log('🔗 Testing embedding generation...');
  const testQuery = 'draw a circle in 2D';
  const embedding = await embeddings.embedQuery(testQuery);

  console.log(`✅ Generated embedding with ${embedding.length} dimensions`);
  console.log(
    `📊 First 5 values: [${embedding
      .slice(0, 5)
      .map((v) => v.toFixed(4))
      .join(', ')}...]`,
  );

  console.log('✅ Embeddings test passed!');
}

await testEmbeddings().catch((error: unknown) => {
  console.error('❌ Embeddings test failed:', error);
});
