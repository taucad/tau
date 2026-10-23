/**
 * The Files pane's listing: one index per project folder, kept current from its watch.
 */

import { mkdir, mkdtemp, rm, unlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { createMcpViewerFiles, isOpenablePath } from '#mcp-viewer-files.js';
import type { McpViewerFiles } from '#mcp-viewer-files.js';

let root: string;
let files: McpViewerFiles;

beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), 'tau-viewer-files-'));
  await mkdir(join(root, 'parts'));
  await mkdir(join(root, 'exports'));
  await mkdir(join(root, '.venv', 'lib'), { recursive: true });
  await mkdir(join(root, '.tau'));
  await writeFile(join(root, 'parts', 'arm.ts'), 'export default () => null;');
  await writeFile(join(root, 'parts', 'base.ts'), 'export default () => null;');
  await writeFile(join(root, 'exports', 'arm.stl'), 'solid arm');
  await writeFile(join(root, 'README.md'), '# Arm');
  await writeFile(join(root, '.venv', 'lib', 'site.py'), '');
  await writeFile(join(root, '.tau', 'state.json'), '{}');
  files = createMcpViewerFiles({ settle: 10 });
});

afterEach(async () => {
  await files.close();
  await rm(root, { recursive: true, force: true });
});

const names = async (path: string): Promise<string[]> => {
  const listed = await files.list(root, { path });
  return 'entries' in listed ? listed.entries.map(({ name }) => name) : [listed.errorCode];
};

describe('createMcpViewerFiles', () => {
  it('should list folders first, with exports, leaving out dot-folders', async () => {
    expect(await names('')).toEqual(['exports', 'parts', 'README.md']);
    expect(await files.list(root, { path: 'parts/' })).toMatchObject({
      entries: [
        { name: 'arm.ts', path: 'parts/arm.ts', isFolder: false, renderable: true },
        { name: 'base.ts', path: 'parts/base.ts', isFolder: false, renderable: true },
      ],
      truncated: false,
      filesVersion: 1,
    });
    expect(await names('.tau')).toEqual(['NOT_A_FOLDER']);
    expect(await names('parts/arm.ts')).toEqual(['NOT_A_FOLDER']);
    expect(await names('../elsewhere')).toEqual(['PATH_OUTSIDE_PROJECT']);
    expect(await names('/etc')).toEqual(['PATH_OUTSIDE_PROJECT']);
  });

  it('should find files by a part of their path, never in a hidden folder', async () => {
    const found = await files.list(root, { query: 'ARM' });
    expect('entries' in found && found.entries.map(({ path }) => path)).toEqual(['exports/arm.stl', 'parts/arm.ts']);
    const hidden = await files.list(root, { query: 'site' });
    expect('entries' in hidden && hidden.entries).toEqual([]);
  });

  it('should move the version and settle the change notice when a file is removed', async () => {
    await files.list(root, { path: '' });
    const before = files.listed(root);
    expect(before?.version).toBe(1);
    await unlink(join(root, 'parts', 'base.ts'));
    await before?.changed;

    expect(files.listed(root)?.version).toBeGreaterThan(1);
    expect(await names('parts')).toEqual(['arm.ts']);
  });

  it('should know nothing of a project before it is listed', () => {
    expect(files.listed(root)).toBeUndefined();
  });

  it('should open only sources, exchange formats and drawn files', () => {
    expect(
      ['main.ts', 'part.step', 'part.glb', 'logo.svg', 'main.test.ts', 'README.md', 'tau.json'].map((path) =>
        isOpenablePath(path),
      ),
    ).toEqual([true, true, true, true, false, false, false]);
  });
});
