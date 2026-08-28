import { mkdtemp, readFile, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { beforeAll, describe, expect, it } from 'vitest';
import { createNodeVmFileSystem, resolveUnderRoot } from '#runner/node/node-vm-filesystem.js';

let root: string;

beforeAll(async () => {
  root = await mkdtemp(join(tmpdir(), 'geospec-vmfs-'));
  await writeFile(join(root, 'main.ts'), 'export default 1;\n', 'utf8');
});

describe('resolveUnderRoot', () => {
  it('should resolve canonical rooted paths beneath the host root', () => {
    expect(resolveUnderRoot('/project', 'src/main.ts')).toBe('/project/src/main.ts');
    expect(resolveUnderRoot('/project', '')).toBe('/project');
  });

  it('should refuse non-canonical and escaping paths', () => {
    for (const path of ['/src/main.ts', './main.ts', '../secrets', 'a/../../secrets']) {
      expect(() => resolveUnderRoot('/project', path)).toThrowError(
        expect.objectContaining({ name: 'VirtualPathError' }),
      );
    }
  });
});

describe('createNodeVmFileSystem', () => {
  it('should read, write and probe under the root', async () => {
    const filesystem = createNodeVmFileSystem(root);
    expect(await filesystem.exists('main.ts')).toBe(true);
    expect(await filesystem.exists('missing.ts')).toBe(false);
    await expect(filesystem.exists('/main.ts')).rejects.toMatchObject({ name: 'VirtualPathError' });
    expect(await filesystem.readFile('main.ts', 'utf8')).toBe('export default 1;\n');
    const bytes = await filesystem.readFile('main.ts');
    expect(bytes.byteLength).toBe(18);

    await filesystem.ensureDir('nested');
    await filesystem.writeFile('nested/deeper/out.txt', 'written');
    expect(await readFile(join(root, 'nested/deeper/out.txt'), 'utf8')).toBe('written');
  });

  it('should contain reads and writes across symbolic links', async () => {
    const outside = await mkdtemp(join(tmpdir(), 'geospec-vmfs-outside-'));
    await writeFile(join(outside, 'secret.txt'), 'secret', 'utf8');
    await symlink(join(outside, 'secret.txt'), join(root, 'outside-file'));
    await symlink(outside, join(root, 'outside-directory'), 'dir');

    const filesystem = createNodeVmFileSystem(root);
    await expect(filesystem.readFile('outside-file', 'utf8')).rejects.toMatchObject({ code: 'EACCES' });
    await expect(filesystem.exists('outside-file')).rejects.toMatchObject({ code: 'EACCES' });
    await expect(filesystem.writeFile('outside-file', 'replacement')).rejects.toMatchObject({ code: 'ELOOP' });
    await expect(filesystem.writeFile('outside-directory/new.txt', 'replacement')).rejects.toMatchObject({
      code: 'EACCES',
    });

    await writeFile(join(root, 'inside-target.txt'), 'inside', 'utf8');
    await symlink(join(root, 'inside-target.txt'), join(root, 'inside-link'));
    await expect(filesystem.readFile('inside-link', 'utf8')).resolves.toBe('inside');
    await expect(filesystem.writeFile('inside-link', 'replacement')).rejects.toMatchObject({ code: 'ELOOP' });
  });
});
