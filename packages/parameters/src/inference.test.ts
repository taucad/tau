import { contentDigest } from '@taucad/cache-core';
import { expect, it } from 'vitest';
import { compileParameterManifest, inferParameterManifest } from '@taucad/parameters';

it('shares English length and angle inference outside the runtime, preserving explicit units and native values', async () => {
  const digest = contentDigest({ value: `sha256:${'1'.repeat(64)}` });
  const names = ['Depth', 'Height', 'Width', 'Wall Thickness', 'Cell Size', 'Rotation Angle', 'Count'];
  const defaults = Object.fromEntries(names.map((name) => [name, 3]));
  const manifest = await compileParameterManifest({
    declaration: {
      schema: {
        $schema: 'https://json-structure.org/meta/extended/v0/#',
        $id: 'urn:test:english',
        $uses: ['JSONSchemaUnits'],
        name: 'English',
        type: 'object',
        properties: {
          ...Object.fromEntries(names.map((name) => [name, { type: 'double' }])),
          explicit: { type: 'double', ucumUnit: 'm' },
        },
      },
      defaults,
    },
    scope: { kind: 'source', authority: 'memory', root: '/', entry: 'main.ts' },
    source: { id: 'fixture', version: '1', revision: digest, capability: 'json-structure' },
    dependency: digest,
    middleware: digest,
  });
  const resolved = await inferParameterManifest(manifest);
  expect(resolved.defaults).toEqual(defaults);
  for (const name of names.slice(0, 5)) {
    expect(resolved.bindings[`/${name}`]?.unit).toBe('mm');
  }
  expect(resolved.bindings['/Rotation Angle']?.unit).toBe('deg');
  expect(resolved.bindings['/Count']?.unit).toBeUndefined();
  expect(resolved.bindings['/explicit']?.unit).toBe('m');
  expect(await inferParameterManifest(manifest, { language: 'fr' })).toBe(manifest);
});
