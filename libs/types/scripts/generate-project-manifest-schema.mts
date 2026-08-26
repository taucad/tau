/**
 * Generate the immutable Tau project-manifest JSON Schema from its Zod source.
 *
 * Why: docs/research/headless-thumbnail-rendering-architecture-v4.md requires
 * the checked-in v1 artifact and runtime parser to share one source of truth.
 *
 * Usage: pnpm nx run types:generate-project-manifest-schema
 * Exit codes: 0 success; 1 generation/write failure.
 */

import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import process from 'node:process';
import { toJSONSchema } from 'zod';
import { projectManifestSchema, projectManifestSchemaUrl } from '@taucad/types';

const outputPath = resolve(import.meta.dirname, '../../../apps/ui/public/schemas/tau-schema-v1.json');

const main = (): void => {
  const schema = toJSONSchema(projectManifestSchema, { target: 'draft-7' }) as Record<string, unknown>;
  schema['$id'] = projectManifestSchemaUrl;
  schema['title'] = 'Tau Project Manifest v1';
  mkdirSync(dirname(outputPath), { recursive: true });
  writeFileSync(outputPath, `${JSON.stringify(schema, null, 2)}\n`);
  console.log(`✓ wrote ${outputPath}`);
};

try {
  main();
} catch (error) {
  console.error('project manifest schema generation failed:', error);
  process.exit(1);
}
