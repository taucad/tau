import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import * as publicManifest from '@taucad/project-core';
import * as privateManifest from '#schemas/project-manifest.schema.js';
import {
  checkProjectManifestReplacement,
  describeProjectManifestIssue,
  parseProjectManifestBytes,
  projectManifestMaxBytes,
  projectManifestSchema,
  projectManifestSchemaUrl,
  projectToManifest,
  readProjectManifestBytes,
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

  it('carries the default-off large-export sync preference', async () => {
    const enabled = { ...manifest, syncLargeExports: true };
    expect(parseProjectManifestBytes(serializeProjectManifest(enabled))).toEqual({ success: true, data: enabled });
    expect(projectToManifest(enabled).syncLargeExports).toBe(true);
    expect('syncLargeExports' in projectToManifest(manifest)).toBe(false);

    const text = await readFile(fileURLToPath(new URL(publishedSchemaPath, import.meta.url)), 'utf8');
    const published = publishedSchemaShape.parse(JSON.parse(text));
    expect(published.properties['syncLargeExports']?.['type']).toBe('boolean');
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

  it('publishes exactly the JSON Schema generated from the strict Zod schema', async () => {
    const generated = {
      ...(z.toJSONSchema(projectManifestSchema, { target: 'draft-7' }) as Record<string, unknown>),
      $id: projectManifestSchemaUrl,
      title: 'Tau Project Manifest v1',
    };
    const text = await readFile(fileURLToPath(new URL(publishedSchemaPath, import.meta.url)), 'utf8');
    expect(JSON.parse(text)).toEqual(generated);
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

describe('project manifest forwarding', () => {
  it('forwards the exact public project manifest authority', () => {
    expect(privateManifest.parseAdoptableProjectManifestBytes).toBe(publicManifest.parseAdoptableProjectManifestBytes);
    expect(privateManifest.parseProjectManifestBytes).toBe(publicManifest.parseProjectManifestBytes);
    expect(privateManifest.projectIdSchema).toBe(publicManifest.projectIdSchema);
    expect(privateManifest.projectManifestMaxBytes).toBe(publicManifest.projectManifestMaxBytes);
    expect(privateManifest.projectManifestSchema).toBe(publicManifest.projectManifestSchema);
    expect(privateManifest.projectManifestSchemaUrl).toBe(publicManifest.projectManifestSchemaUrl);
    expect(privateManifest.projectRelativePathSchema).toBe(publicManifest.projectRelativePathSchema);
    expect(privateManifest.projectToManifest).toBe(publicManifest.projectToManifest);
    expect(privateManifest.serializeProjectManifest).toBe(publicManifest.serializeProjectManifest);
  });

  it('round-trips through public and private entrypoints', () => {
    const manifest = publicManifest.projectToManifest({
      id: 'proj_0123456789ABCDEFGHIJK',
      name: 'Example',
      description: '',
      tags: [],
      assets: { main: { entryPath: 'main.ts', thumbnail: 'thumbnail.webp' } },
    });

    expect(privateManifest.parseProjectManifestBytes(publicManifest.serializeProjectManifest(manifest))).toEqual({
      success: true,
      data: manifest,
    });
    expect(publicManifest.parseProjectManifestBytes(privateManifest.serializeProjectManifest(manifest))).toEqual({
      success: true,
      data: manifest,
    });
  });
});

describe('readProjectManifestBytes', () => {
  const { id: _id, ...withoutId } = manifest;
  const text = (value: string): Uint8Array<ArrayBuffer> => new TextEncoder().encode(value);

  it('returns a strictly valid manifest untouched', () => {
    expect(readProjectManifestBytes(serializeProjectManifest(manifest))).toEqual({ success: true, data: manifest });
  });

  /* The incident: asked for a second model, an agent added `assets.<name>`.
   * The identity was intact, so the project must stay reachable (blueprint F1). */
  it('degrades an extra asset key instead of losing the project', () => {
    const read = readProjectManifestBytes(
      encode({ ...manifest, assets: { ...manifest.assets, second: { entryPath: 'second.cs' } } }),
    );
    expect(read).toEqual({
      success: true,
      data: manifest,
      issue: {
        code: 'manifest-invalid',
        issues: [expect.objectContaining({ code: 'unrecognized_keys', keys: ['second'], path: ['assets'] })],
      },
    });
    expect(read.issue === undefined ? [] : describeProjectManifestIssue(read.issue)).toEqual([
      'assets: Unrecognized key: "second"',
    ]);
  });

  it('salvages every declaration field into a strictly valid view', () => {
    const read = readProjectManifestBytes(
      encode({
        ...manifest,
        name: 42,
        description: 'd'.repeat(10_001),
        tags: ['kept', 7, 't'.repeat(101)],
        assets: { main: { entryPath: String.raw`./src\main.ts`, thumbnail: '../escape.webp', extra: true } },
        syncChats: 'no',
        syncLargeExports: 1,
        createdAt: 1,
      }),
    );
    const expected: ProjectManifest = {
      ...withoutId,
      id: manifest.id,
      name: '',
      description: 'd'.repeat(10_000),
      tags: ['kept', 't'.repeat(100)],
      assets: { main: { entryPath: 'src/main.ts' } },
      // An unreadable preference fails closed: no sync.
      syncChats: false,
      syncLargeExports: false,
    };
    expect(read).toMatchObject({ success: true, issue: { code: 'manifest-invalid' } });
    expect(read.success && read.data).toEqual(projectToManifest(expected));
    expect(read.success && parseProjectManifestBytes(serializeProjectManifest(read.data)).success).toBe(true);
  });

  it.each([['../escape.ts'], ['a/../b.ts'], [''], [42]])(
    'falls back to main.ts only when entryPath %j cannot be normalized',
    (entryPath) => {
      expect(readProjectManifestBytes(encode({ ...manifest, assets: { main: { entryPath } } }))).toMatchObject({
        success: true,
        data: { assets: { main: { entryPath: 'main.ts' } } },
      });
    },
  );

  it('recovers the identity, name and entry from text that is not JSON', () => {
    const trailingComma = JSON.stringify(manifest, undefined, 2).replace(/\n}$/, ',\n}');
    expect(readProjectManifestBytes(text(trailingComma))).toEqual({
      success: true,
      data: projectToManifest({
        ...withoutId,
        id: manifest.id,
        description: '',
        tags: [],
        assets: { main: { entryPath: 'main.ts' } },
      }),
      /* oxlint-disable-next-line @typescript-eslint/no-unsafe-assignment -- vitest types asymmetric matchers as `any`. */
      issue: { code: 'manifest-invalid-json', message: expect.any(String) },
    });
  });

  it('leaves two conflicting identities in broken text unidentified', () => {
    const conflict = `<<<<<<< ours\n{ "id": "${manifest.id}" }\n=======\n{ "id": "proj_zzzzzzzzzzzzzzzzzzzzz" }\n>>>>>>> theirs\n`;
    expect(readProjectManifestBytes(text(conflict))).toMatchObject({
      success: false,
      issue: { code: 'manifest-invalid-json' },
      adoptable: { name: '', assets: { main: { entryPath: 'main.ts' } } },
    });
  });

  it('offers the salvaged declaration for explicit adoption when only the identity is missing', () => {
    expect(readProjectManifestBytes(encode(withoutId))).toEqual({
      success: false,
      /* oxlint-disable-next-line @typescript-eslint/no-unsafe-assignment -- vitest types asymmetric matchers as `any`. */
      issue: expect.objectContaining({ code: 'manifest-invalid' }),
      adoptable: withoutId,
    });
    expect(readProjectManifestBytes(encode({ ...withoutId, id: 'copied-folder', author: {} }))).toMatchObject({
      success: false,
      adoptable: withoutId,
    });
  });

  it('lets a mounted route supply the identity its bytes lost, never replace a present one', () => {
    const routeId = 'proj_zzzzzzzzzzzzzzzzzzzzz';
    expect(readProjectManifestBytes(encode(withoutId), { id: manifest.id })).toMatchObject({
      success: true,
      data: manifest,
      issue: { code: 'manifest-invalid' },
    });
    expect(readProjectManifestBytes(serializeProjectManifest(manifest), { id: routeId })).toEqual({
      success: true,
      data: manifest,
    });
  });

  it('reads an absent $schema as v1 but refuses a foreign one and oversize bytes', () => {
    const { $schema: _schema, ...unversioned } = manifest;
    expect(readProjectManifestBytes(encode(unversioned))).toMatchObject({
      success: true,
      data: manifest,
      issue: { code: 'manifest-unknown-schema', found: undefined },
    });
    const found = 'https://tau.new/schemas/tau-schema-v2.json';
    expect(readProjectManifestBytes(encode({ ...manifest, $schema: found, extra: 1 }))).toEqual({
      success: false,
      issue: { code: 'manifest-unknown-schema', found, supported: projectManifestSchemaUrl },
    });
    expect(readProjectManifestBytes(text(`{ "$schema": "${found}", "id": "${manifest.id}",`))).toMatchObject({
      success: false,
      issue: { code: 'manifest-unknown-schema', found },
    });
    expect(readProjectManifestBytes(new Uint8Array(projectManifestMaxBytes + 1))).toEqual({
      success: false,
      issue: { code: 'manifest-too-large', maxBytes: projectManifestMaxBytes },
    });
  });
});

describe('checkProjectManifestReplacement', () => {
  const current = serializeProjectManifest(manifest);

  it('accepts a valid edit that keeps the identity', () => {
    expect(checkProjectManifestReplacement(encode({ ...manifest, name: 'Renamed' }), current)).toBeUndefined();
  });

  it('names every defect of an invalid replacement', () => {
    const message = checkProjectManifestReplacement(
      encode({ ...manifest, assets: { ...manifest.assets, second: { entryPath: 'second.cs' } } }),
      current,
    );
    expect(message).toContain('assets: Unrecognized key: "second"');
    expect(message).toContain('Other source files need no manifest entry.');
  });

  it('refuses a replacement that changes the identity', () => {
    expect(checkProjectManifestReplacement(encode({ ...manifest, id: 'proj_zzzzzzzzzzzzzzzzzzzzz' }), current)).toBe(
      `tau.json must keep the project id ${manifest.id}.`,
    );
  });

  it('lets a valid replacement repair a degraded or missing manifest', () => {
    const degraded = encode({ ...manifest, extra: true });
    expect(checkProjectManifestReplacement(serializeProjectManifest(manifest), degraded)).toBeUndefined();
    expect(checkProjectManifestReplacement(serializeProjectManifest(manifest), undefined)).toBeUndefined();
  });
});

describe('parts declaration recovery', () => {
  it('retains valid declarations through degraded reads and explicit adoption', () => {
    const parts = { include: ['parts/**/*.ts'], exclude: ['**/*.test.ts'] };
    const degraded = readProjectManifestBytes(encode({ ...manifest, name: 42, parts }));
    expect(degraded).toMatchObject({ success: true, data: { parts } });
    const adopted = readProjectManifestBytes(encode({ ...manifest, id: undefined, parts }));
    expect(adopted).toMatchObject({ success: false, adoptable: { parts } });
  });
  it('fails closed on invalid globs while preserving project identity', () => {
    const degraded = readProjectManifestBytes(encode({ ...manifest, parts: { include: ['../secret.ts'] } }));
    expect(degraded.success).toBe(true);
    if (degraded.success) {
      expect(degraded.data.parts).toBeUndefined();
      expect(degraded.issue?.code).toBe('manifest-invalid');
    }
  });
});
