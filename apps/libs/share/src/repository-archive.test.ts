import JSZip from 'jszip';
import { describe, expect, it } from 'vitest';
import { projectManifestSchemaUrl } from '@taucad/types';
import { extractRepositoryArchiveFiles, normalizeRepositoryArchive } from '#repository-archive.js';

const manifest = JSON.stringify({
  $schema: projectManifestSchemaUrl,
  id: 'proj_123456789012345678901',
  name: 'Repository example',
  description: 'Portable repository fixture',
  tags: ['test'],
  assets: { main: { entryPath: 'main.ts' } },
});

const archive = async (files: Readonly<Record<string, string | Uint8Array<ArrayBuffer>>>) => {
  const zip = new JSZip();
  for (const [path, content] of Object.entries(files)) {
    zip.file(path, content);
  }
  return new Uint8Array(await zip.generateAsync({ type: 'uint8array', platform: 'UNIX', compression: 'DEFLATE' }));
};

describe('repository archive normalization', () => {
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

  it('supports bounded manifest-free extraction for the existing importer', async () => {
    const input = await archive({ 'repo-root/main.ts': 'export default 1;' });
    await expect(extractRepositoryArchiveFiles(input, { root: '', requireManifest: false })).resolves.toMatchObject([
      { path: 'main.ts' },
    ]);
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
});
