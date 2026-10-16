import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import { openTarget } from '#commands/open.js';
import { exitCodes } from '#output.js';

const roots: string[] = [];

afterEach(async () => {
  await Promise.all(roots.splice(0).map(async (root) => rm(root, { recursive: true, force: true })));
});

describe('openTarget', () => {
  it.each(['https://tau.new/w/team/bracket', 'http://127.0.0.1:7180/', 'tau://invitation/abc'])(
    'should open %s as a URL',
    async (url) => {
      await expect(openTarget(url, '/')).resolves.toEqual({ kind: 'url', url: new URL(url).href });
    },
  );

  it('should serve a folder, a file by its project, and the current directory by default', async () => {
    const root = await mkdtemp(join(tmpdir(), 'tau-open-'));
    roots.push(root);
    await mkdir(join(root, 'parts'));
    await writeFile(join(root, 'tau.json'), '{}');
    await writeFile(join(root, 'parts', 'main.ts'), '');

    await expect(openTarget(join(root, 'parts'), '/')).resolves.toEqual({
      kind: 'folder',
      folder: join(root, 'parts'),
    });
    await expect(openTarget('parts/main.ts', root)).resolves.toEqual({ kind: 'folder', folder: root });
    await expect(openTarget(undefined, root)).resolves.toEqual({ kind: 'folder', folder: root });
  });

  it('should refuse a path that does not exist', async () => {
    await expect(openTarget('/no/such/tau/project', '/')).rejects.toMatchObject({
      code: 'INPUT_NOT_FOUND',
      exit: exitCodes.refused,
    });
  });
});
