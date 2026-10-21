import JSZip from 'jszip';
import { describe, expect, it } from 'vitest';
import { projectManifestSchema, projectManifestSchemaUrl } from '@taucad/types';
import {
  extractRepositoryImportFiles,
  normalizeRepositoryArchive,
  repositoryImportLimits,
} from '#repository-archive.js';

const mebibyte = 1024 * 1024;

const manifest = JSON.stringify({
  $schema: projectManifestSchemaUrl,
  name: 'Repository example',
  description: 'Portable repository fixture',
  tags: ['test'],
  assets: { main: { entryPath: 'main.ts' } },
});

const archive = async (
  files: Readonly<Record<string, string | Uint8Array<ArrayBuffer>>>,
  compression: 'DEFLATE' | 'STORE' = 'DEFLATE',
) => {
  const zip = new JSZip();
  for (const [path, content] of Object.entries(files)) {
    zip.file(path, content);
  }
  return new Uint8Array(await zip.generateAsync({ type: 'uint8array', platform: 'UNIX', compression }));
};

/** Bytes that DEFLATE cannot shrink, so an archive's size is its content's size. */
const incompressible = (length: number): Uint8Array<ArrayBuffer> => {
  const bytes = new Uint8Array(length);
  for (let offset = 0; offset < length; offset += 65_536) {
    crypto.getRandomValues(bytes.subarray(offset, Math.min(offset + 65_536, length)));
  }
  return bytes;
};

/** One random 256-byte block repeated: DEFLATE reaches about 200×, between the share and import ratios. */
const compressible = (length: number): Uint8Array<ArrayBuffer> => {
  const block = incompressible(256);
  const bytes = new Uint8Array(length);
  for (let offset = 0; offset < length; offset += block.byteLength) {
    bytes.set(block.subarray(0, Math.min(block.byteLength, length - offset)), offset);
  }
  return bytes;
};

describe('repository archive normalization', () => {
  it('converts a legacy declaration without copying project identity into the share', async () => {
    const legacy = {
      ...projectManifestSchema.parse(JSON.parse(manifest)),
      $schema: 'https://tau.new/schemas/tau-schema-v1.json',
      id: 'proj_123456789012345678901',
    };
    const opened = await normalizeRepositoryArchive(
      await archive({
        'repo/tau.json': JSON.stringify(legacy),
        'repo/main.ts': 'export default 1;',
      }),
      '',
    );
    const content = opened.files.find(({ path }) => path === 'tau.json')?.content;
    expect(JSON.parse(new TextDecoder().decode(content))).toEqual(JSON.parse(manifest));
  });

  it('selects the requested subtree and returns one canonical project archive', async () => {
    const input = await archive({
      'repo-root/README.md': 'outer',
      'repo-root/examples/birdhouse/tau.json': manifest,
      'repo-root/examples/birdhouse/main.ts': 'export default 1;',
      'repo-root/examples/other/main.ts': 'ignored',
    });
    const opened = await normalizeRepositoryArchive(input, 'examples/birdhouse');
    expect(opened.files.map(({ path }) => path)).toEqual(['main.ts', 'tau.json']);
  });

  it('rejects unsafe, ambiguous, symlinked, bomb, and incomplete projects', async () => {
    await expect(
      normalizeRepositoryArchive(await archive({ 'one/tau.json': manifest, 'two/main.ts': 'x' }), ''),
    ).rejects.toMatchObject({
      code: 'SHARE_ARTIFACT_INVALID',
    });
    await expect(
      normalizeRepositoryArchive(await archive({ 'repo/tau.json': manifest, 'repo/../outside.ts': 'x' }), ''),
    ).rejects.toMatchObject({ code: 'SHARE_ARTIFACT_INVALID' });

    const symlink = new JSZip();
    symlink.file('repo/tau.json', manifest);
    symlink.file('repo/main.ts', 'target', { unixPermissions: 0o12_0777 });
    await expect(
      normalizeRepositoryArchive(
        new Uint8Array(await symlink.generateAsync({ type: 'uint8array', platform: 'UNIX' })),
        '',
      ),
    ).rejects.toMatchObject({ code: 'SHARE_ARTIFACT_INVALID' });

    await expect(normalizeRepositoryArchive(await archive({ 'repo/tau.json': manifest }), '')).rejects.toMatchObject({
      code: 'SHARE_ARTIFACT_INVALID',
    });
    await expect(
      normalizeRepositoryArchive(
        await archive({ 'repo/tau.json': manifest, 'repo/main.ts': new Uint8Array(1024 * 1024) }),
        '',
      ),
    ).rejects.toMatchObject({ code: 'SHARE_ARTIFACT_LIMIT' });
  });

  it('keeps the portable-share bounds for repository shares', async () => {
    const files: Record<string, Uint8Array<ArrayBuffer>> = {};
    for (let index = 0; index < 201; index++) {
      files[`repo/file-${String(index)}.txt`] = new Uint8Array([index % 256]);
    }
    await expect(
      normalizeRepositoryArchive(await archive({ ...files, 'repo/tau.json': manifest, 'repo/main.ts': 'x' }), ''),
    ).rejects.toMatchObject({ code: 'SHARE_ARTIFACT_LIMIT' });
    await expect(
      normalizeRepositoryArchive(
        await archive({
          'repo/tau.json': manifest,
          'repo/main.ts': 'x',
          'repo/blob.bin': incompressible(9 * mebibyte),
        }),
        '',
      ),
    ).rejects.toMatchObject({ code: 'SHARE_ARTIFACT_LIMIT' });
  });
});

describe('repository import extraction', () => {
  it('uses the import limits the operator ruled, not the portable-share limits', () => {
    expect(repositoryImportLimits).toStrictEqual({
      maxArchiveBytes: 256 * mebibyte,
      maxEntries: 100_000,
      maxFiles: 100_000,
      maxEntryBytes: 25 * mebibyte,
      maxTotalBytes: 512 * mebibyte,
      maxCompressionRatio: 1000,
      maxPathBytes: 2048,
    });
  });

  it('imports a repository larger than a portable share without a manifest', async () => {
    const files: Record<string, Uint8Array<ArrayBuffer>> = {};
    for (let index = 0; index < 700; index++) {
      files[`repo-root/src/part-${String(index).padStart(3, '0')}.kcl`] = incompressible(13 * 1024);
    }
    const input = await archive(files, 'STORE');
    expect(input.byteLength).toBeGreaterThan(8 * mebibyte);

    const imported = await extractRepositoryImportFiles(input, { root: '' });

    expect(imported).toHaveLength(700);
    expect(imported[0]).toMatchObject({ path: 'src/part-000.kcl' });
    expect(imported[0]!.content).toEqual(files['repo-root/src/part-000.kcl']);
  });

  it('allows a test snapshot that compresses past the share ratio', async () => {
    const snapshot = compressible(400 * 1024);
    await expect(
      extractRepositoryImportFiles(await archive({ 'repo/tests/ops.snap': snapshot }), { root: '' }),
    ).resolves.toMatchObject([{ path: 'tests/ops.snap' }]);
    await expect(
      normalizeRepositoryArchive(
        await archive({ 'repo/tau.json': manifest, 'repo/main.ts': 'x', 'repo/tests/ops.snap': snapshot }),
        '',
      ),
    ).rejects.toMatchObject({ code: 'SHARE_ARTIFACT_LIMIT' });
  });

  it('imports one folder with folder-relative paths', async () => {
    const input = await archive({
      'repo-root/README.md': 'outer',
      'repo-root/public/kcl-samples/gear/main.kcl': 'gear',
      'repo-root/public/kcl-samples/README.md': 'samples',
      'repo-root/rust/tests/ops.snap': 'snapshot',
    });

    const imported = await extractRepositoryImportFiles(input, { root: 'public/kcl-samples' });

    expect(imported.map(({ path }) => path).toSorted()).toEqual(['README.md', 'gear/main.kcl']);
    await expect(extractRepositoryImportFiles(input, { root: 'missing' })).rejects.toMatchObject({
      code: 'SHARE_ARTIFACT_INVALID',
    });
  });

  it('keeps repository paths a share would refuse, and still refuses colliding ones', async () => {
    await expect(
      extractRepositoryImportFiles(await archive({ 'repo/.tau/notes.md': 'n', 'repo/main.kcl': 'm' }), { root: '' }),
    ).resolves.toMatchObject([{ path: '.tau/notes.md' }, { path: 'main.kcl' }]);
    await expect(
      extractRepositoryImportFiles(await archive({ 'repo/Part.kcl': 'a', 'repo/part.kcl': 'b' }), { root: '' }),
    ).rejects.toMatchObject({ code: 'SHARE_ARTIFACT_INVALID' });
    await expect(
      extractRepositoryImportFiles(await archive({ 'repo/a\u0001b.kcl': 'a' }), { root: '' }),
    ).rejects.toMatchObject({ code: 'SHARE_ARTIFACT_INVALID' });
  });

  it('refuses a file past the per-file import limit', async () => {
    const input = await archive({ 'repo/huge.bin': compressible(26 * mebibyte) });

    await expect(extractRepositoryImportFiles(input, { root: '' })).rejects.toMatchObject({
      code: 'SHARE_ARTIFACT_LIMIT',
      message: 'A repository project file exceeds the per-file size limit.',
    });
  });
});
