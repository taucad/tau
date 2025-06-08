/* eslint-disable @typescript-eslint/naming-convention, no-await-in-loop */
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import process from 'node:process';
import * as ts from 'typescript';
import { OpenAIEmbeddings } from '@langchain/openai';

type ChunkData = {
  id: string;
  signature: string;
  jsDoc: string;
  embedding?: number[];
};

/**
 * Build Replicad API chunks for RAG usage.
 *
 * 1. Reads gen/api/replicad/replicad-clean-with-jsdoc.d.ts
 * 2. Removes OpenCascade noise & generics
 * 3. Splits top-level exports (function | class | const | type | interface)
 * 4. Emits JSON array with { id, signature, jsDoc }
 * 5. Optionally adds embeddings if OPENAI_API_KEY in env
 */
async function main(): Promise<void> {
  const inPath = join(process.cwd(), 'gen/api/replicad/replicad-clean-with-jsdoc.d.ts');
  const outPath = join(process.cwd(), 'gen/api/replicad/replicad-chunks.json');

  const source = readFileSync(inPath, 'utf8');

  const sourceFile = ts.createSourceFile('replicad.d.ts', source, ts.ScriptTarget.Latest, true);

  const chunks: ChunkData[] = [];

  // Visit all exported declarations
  for (const [index, statement] of sourceFile.statements.entries()) {
    if (
      !ts.isExportDeclaration(statement) &&
      !ts.isFunctionDeclaration(statement) &&
      !ts.isClassDeclaration(statement) &&
      !ts.isTypeAliasDeclaration(statement) &&
      !ts.isInterfaceDeclaration(statement) &&
      !ts.isVariableStatement(statement)
    ) {
      continue;
    }

    const text = statement.getFullText(sourceFile).trim();

    // Skip OpenCascade types
    if (text.includes('TopoDS_') || text.includes('gp_') || text.includes('Handle_')) {
      continue;
    }

    // Extract name for ID
    let name = `chunk_${index}`;
    if (ts.isFunctionDeclaration(statement) && statement.name) {
      name = statement.name.text;
    } else if (ts.isClassDeclaration(statement) && statement.name) {
      name = statement.name.text;
    } else if (ts.isTypeAliasDeclaration(statement)) {
      name = statement.name.text;
    } else if (ts.isInterfaceDeclaration(statement)) {
      name = statement.name.text;
    }

    // Split JSDoc from signature
    const lines = text.split('\n');
    const jsDocLines: string[] = [];
    const signatureLines: string[] = [];

    let inJsDoc = false;
    for (const line of lines) {
      if (line.trim().startsWith('/**')) {
        inJsDoc = true;
        jsDocLines.push(line);
      } else if (line.trim().endsWith('*/') && inJsDoc) {
        jsDocLines.push(line);
        inJsDoc = false;
      } else if (inJsDoc) {
        jsDocLines.push(line);
      } else if (line.trim()) {
        signatureLines.push(line);
      }
    }

    const signature = signatureLines.join('\n').trim();
    const jsDoc = jsDocLines.join('\n').trim();

    if (signature) {
      chunks.push({
        id: name,
        signature,
        jsDoc: jsDoc || '',
      });
    }
  }

  console.log(`✅ Extracted ${chunks.length} API chunks`);

  // Optionally add embeddings
  if (process.env.OPENAI_API_KEY) {
    console.log('🔗 Adding embeddings...');
    const embeddings = new OpenAIEmbeddings({
      openAIApiKey: process.env.OPENAI_API_KEY,
      modelName: 'text-embedding-3-small',
    });

    for (const chunk of chunks) {
      const text = `${chunk.jsDoc}\n${chunk.signature}`;
      try {
        const embedding = await embeddings.embedQuery(text);
        chunk.embedding = embedding;
        console.log(`✅ Embedded: ${chunk.id}`);
      } catch (error) {
        console.warn(`❌ Failed to embed ${chunk.id}:`, error);
      }
    }
  } else {
    console.log('⚠️  No OPENAI_API_KEY found, skipping embeddings');
  }

  writeFileSync(outPath, JSON.stringify(chunks, null, 2));
  console.log(`✅ Wrote ${chunks.length} chunks to ${outPath}`);
}

await main().catch((error: unknown) => {
  console.error('❌ Build failed:', error);
  throw error;
});
