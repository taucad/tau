import { describe, expect, it } from 'vitest';
import {
  convertLegacyProjectManifestBytes,
  parseProjectManifestBytes,
  projectManifestMaxBytes,
  projectManifestSchemaUrl,
  projectToManifest,
  serializeProjectManifest,
} from '@taucad/project-core';
import type { ProjectManifest } from '@taucad/project-core';

const manifest: ProjectManifest = projectToManifest({
  name: 'Example',
  description: '',
  tags: [],
  assets: { main: { entryPath: 'main.ts', thumbnail: 'thumbnail.webp' } },
});

const encode = (value: unknown): Uint8Array<ArrayBuffer> => new TextEncoder().encode(JSON.stringify(value));

describe('project manifest schema', () => {
  it('round-trips the strict v1 contract', () => {
    const parsed = parseProjectManifestBytes(serializeProjectManifest(manifest));
    expect(parsed).toEqual({ success: true, data: manifest });
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

  it('rejects an authored project id', () => {
    expect(parseProjectManifestBytes(encode({ ...manifest, id: 'copied-folder' }))).toMatchObject({
      success: false,
      issue: { code: 'manifest-invalid' },
    });
  });

  it('accepts a hand-authored declaration without identity', () => {
    expect(parseProjectManifestBytes(encode(manifest))).toEqual({ success: true, data: manifest });
    expect(parseProjectManifestBytes(encode({ ...manifest, id: 'proj_0123456789ABCDEFGHIJK' }))).toMatchObject({
      success: false,
    });
  });

  it('converts only the exact previous prerelease contract and preserves its identity', () => {
    const legacy = {
      ...manifest,
      $schema: 'https://tau.new/schemas/tau-schema-v1.json',
      id: 'proj_0123456789ABCDEFGHIJK',
    };
    expect(parseProjectManifestBytes(encode(legacy))).toMatchObject({ success: false });
    expect(convertLegacyProjectManifestBytes(encode(legacy))).toEqual({
      success: true,
      data: { projectId: legacy.id, manifest },
    });
    expect(convertLegacyProjectManifestBytes(encode({ ...legacy, id: 'invented' }))).toMatchObject({ success: false });
    expect(convertLegacyProjectManifestBytes(encode({ ...legacy, extra: true }))).toMatchObject({ success: false });
    expect(convertLegacyProjectManifestBytes(encode(manifest))).toMatchObject({ success: false });
  });

  it('reports an unsupported schema URL distinctly', () => {
    const found = 'https://tau.new/schemas/tau-schema-v2.json';
    expect(parseProjectManifestBytes(encode({ ...manifest, $schema: found }))).toEqual({
      success: false,
      issue: { code: 'manifest-unknown-schema', found, supported: projectManifestSchemaUrl },
    });
  });

  it('serializes only explicit manifest fields', () => {
    const localView = { ...manifest, id: 'proj_0123456789ABCDEFGHIJK', deletedAt: 1, revisionState: { dirty: true } };
    expect(new TextDecoder().decode(serializeProjectManifest(projectToManifest(localView)))).not.toContain('id');
    expect(new TextDecoder().decode(serializeProjectManifest(projectToManifest(localView)))).not.toContain('deletedAt');
    expect(new TextDecoder().decode(serializeProjectManifest(projectToManifest(localView)))).not.toContain(
      'revisionState',
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
