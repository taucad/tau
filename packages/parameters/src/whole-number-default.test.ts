import { contentDigest } from '@taucad/cache-core';
import { jsonSchemaFromJson } from '@taucad/utils/schema';
import { describe, expect, it } from 'vitest';
import { compileParameterManifest, projectDraft7SchemaToParameterDeclaration } from '@taucad/parameters';

const sourceRevision = contentDigest({ value: `sha256:${'1'.repeat(64)}` });
const middlewareRevision = contentDigest({ value: `sha256:${'2'.repeat(64)}` });

describe('whole-number producer defaults', () => {
  it('should compile a whole-number default as binary64', async () => {
    const defaults = { clearance: 0 };
    const schema = await jsonSchemaFromJson(defaults);
    const declaration = projectDraft7SchemaToParameterDeclaration({
      defaults,
      schema,
      schemaId: 'urn:taucad:test:whole-number-default',
      schemaName: 'WholeNumberDefault',
    });
    const manifest = await compileParameterManifest({
      declaration,
      scope: {
        kind: 'source',
        authority: 'filesystem',
        root: '/project',
        entry: '/project/model.js',
      },
      source: {
        id: 'fixture-kernel',
        version: '1.0.0',
        revision: sourceRevision,
        capability: 'json-structure',
      },
      dependency: sourceRevision,
      middleware: middlewareRevision,
    });

    expect(manifest.bindings['/clearance']).toMatchObject({ representation: 'binary64' });
  });
});
