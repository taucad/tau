import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import {
  parseAdoptableProjectManifestBytes,
  parseProjectManifestBytes,
  projectManifestMaxBytes,
  projectManifestSchemaUrl,
  projectToManifest,
  serializeProjectManifest,
} from '#schemas/project-manifest.schema.js';
import type { ProjectManifest } from '#schemas/project-manifest.schema.js';

const manifest: ProjectManifest = projectToManifest({
  id: 'proj_0123456789ABCDEFGHIJK',
  name: 'Example',
  description: '',
  tags: [],
  assets: { main: { entryPath: 'main.ts', thumbnail: 'thumbnail.webp' } },
});

const encode = (value: unknown): Uint8Array<ArrayBuffer> => new TextEncoder().encode(JSON.stringify(value));

/** The file `projectManifestSchemaUrl` is served from, relative to this test. */
const publishedSchemaPath = '../../../../apps/ui/public/schemas/tau-schema-v1.json';

const publishedSchemaShape = z.object({ properties: z.record(z.string(), z.record(z.string(), z.unknown())) });

describe('project manifest schema', () => {
  it('round-trips the strict v1 contract', () => {
    const parsed = parseProjectManifestBytes(serializeProjectManifest(manifest));
    expect(parsed).toEqual({ success: true, data: manifest });
  });

  /* The toggle W17 put in the manifest, both halves: the strict Zod schema
   * accepts it, and the published JSON Schema every `tau.json` declares knows
   * it too — a project that authors the only field that turns chat sync off
   * must not be invalid against its own `$schema` (Manifest Policy Rule 4,
   * a1 review R5). */
  it('carries the optional syncChats toggle, in the Zod and published schemas alike', async () => {
    const off = { ...manifest, syncChats: false };
    expect(parseProjectManifestBytes(serializeProjectManifest(off))).toEqual({ success: true, data: off });
    expect(projectToManifest(off).syncChats).toBe(false);
    // Absent means on: nothing is written for a project that never set it.
    expect('syncChats' in projectToManifest(manifest)).toBe(false);

    const text = await readFile(fileURLToPath(new URL(publishedSchemaPath, import.meta.url)), 'utf8');
    const parsed: unknown = JSON.parse(text);
    const published = publishedSchemaShape.parse(parsed);
    expect(published.properties['syncChats']?.['type']).toBe('boolean');
  });

  it('rejects unknown top-level and nested properties', () => {
    expect(parseProjectManifestBytes(encode({ ...manifest, createdAt: 1 }))).toMatchObject({
      success: false,
      issue: { code: 'manifest-invalid' },
    });
    expect(
      parseProjectManifestBytes(encode({ ...manifest, assets: { main: { ...manifest.assets.main, parameters: {} } } })),
    ).toMatchObject({ success: false, issue: { code: 'manifest-invalid' } });
  });

  it.each(['', '/absolute.ts', '../escape.ts', 'a/../b.ts', String.raw`a\b.ts`, 'a//b.ts'])(
    'rejects unsafe entryPath path %j',
    (entryPath) => {
      const input = { ...manifest, assets: { main: { entryPath } } };
      expect(parseProjectManifestBytes(encode(input))).toMatchObject({
        success: false,
        issue: { code: 'manifest-invalid' },
      });
    },
  );

  it('rejects a malformed project id', () => {
    expect(parseProjectManifestBytes(encode({ ...manifest, id: 'copied-folder' }))).toMatchObject({
      success: false,
      issue: { code: 'manifest-invalid' },
    });
  });

  it('relaxes only id through the explicit adoption parser', () => {
    const { id: _id, ...withoutId } = manifest;
    expect(parseProjectManifestBytes(encode(withoutId))).toMatchObject({ success: false });
    expect(parseAdoptableProjectManifestBytes(encode(withoutId))).toEqual({ success: true, data: withoutId });
    expect(parseAdoptableProjectManifestBytes(encode({ ...withoutId, id: 'copied-folder' }))).toEqual({
      success: true,
      data: withoutId,
    });
    expect(parseAdoptableProjectManifestBytes(encode({ ...withoutId, author: {} }))).toMatchObject({
      success: false,
      issue: { code: 'manifest-invalid' },
    });
  });

  it('reports an unsupported schema URL distinctly', () => {
    const found = 'https://tau.new/schemas/tau-schema-v2.json';
    expect(parseProjectManifestBytes(encode({ ...manifest, $schema: found }))).toEqual({
      success: false,
      issue: { code: 'manifest-unknown-schema', found, supported: projectManifestSchemaUrl },
    });
  });

  it('serializes only explicit manifest fields', () => {
    const localView = { ...manifest, deletedAt: 1, localOnlyField: { dirty: true } };
    expect(new TextDecoder().decode(serializeProjectManifest(projectToManifest(localView)))).not.toContain('deletedAt');
    expect(new TextDecoder().decode(serializeProjectManifest(projectToManifest(localView)))).not.toContain(
      'localOnlyField',
    );
  });

  it('enforces the byte cap before parsing', () => {
    const bytes = new Uint8Array(projectManifestMaxBytes + 1);
    expect(parseProjectManifestBytes(bytes)).toEqual({
      success: false,
      issue: { code: 'manifest-too-large', maxBytes: projectManifestMaxBytes },
    });
  });
});
