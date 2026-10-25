import { mkdtemp, open, readFile, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { beforeAll, describe, expect, it, vi } from 'vitest';
import { createNodeVmFileSystem, resolveUnderRoot, withInMemorySources } from '#runner/node/node-vm-filesystem.js';

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
      expect(() => resolveUnderRoot('/project', path)).toThrow(expect.objectContaining({ name: 'VirtualPathError' }));
    }
  });
});

describe('createNodeVmFileSystem', () => {
  it('should probe an ordinary file without reading its contents', async () => {
    const probe = await open(join(root, 'main.ts'), 'r');
    const readFile = vi.spyOn(Object.getPrototypeOf(probe) as typeof probe, 'readFile');
    await probe.close();
    try {
      await expect(createNodeVmFileSystem(root).exists('main.ts')).resolves.toBe(true);
      expect(readFile).not.toHaveBeenCalled();
    } finally {
      readFile.mockRestore();
    }
  });

  it('should read, write and probe under the root', async () => {
    const filesystem = createNodeVmFileSystem(root);
    expect(await filesystem.exists('main.ts')).toBe(true);
    expect(await filesystem.exists('missing.ts')).toBe(false);
    await expect(filesystem.exists('/main.ts')).rejects.toMatchObject({ name: 'VirtualPathError' });
    expect(await filesystem.readFile('main.ts', 'utf8')).toBe('export default 1;\n');
    const bytes = await filesystem.readFile('main.ts');
    expect(bytes.byteLength).toBe(18);
    expect(Buffer.isBuffer(bytes)).toBe(false);
    expect(new TextDecoder().decode(bytes)).toBe('export default 1;\n');

    await filesystem.ensureDir('nested');
    await filesystem.writeFile('nested/deeper/out.txt', 'written');
    expect(await readFile(join(root, 'nested/deeper/out.txt'), 'utf8')).toBe('written');
    await expect(filesystem.exists('nested')).rejects.toMatchObject({ code: 'EISDIR' });
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
    await expect(filesystem.exists('inside-link')).resolves.toBe(true);
    await expect(filesystem.writeFile('inside-link', 'replacement')).rejects.toMatchObject({ code: 'ELOOP' });
  });
});

describe('withInMemorySources', () => {
  it('should serve a source from memory in front of the disk and pass every other path through', async () => {
    await writeFile(join(root, 'served.geospec.ts'), 'on disk\n', 'utf8');
    const filesystem = withInMemorySources(root, createNodeVmFileSystem(root), {
      'served.geospec.ts': 'in memory\n',
      'virtual.geospec.ts': 'only in memory\n',
    });

    await expect(filesystem.readFile('served.geospec.ts', 'utf8')).resolves.toBe('in memory\n');
    await expect(filesystem.readFile('virtual.geospec.ts')).resolves.toStrictEqual(
      new TextEncoder().encode('only in memory\n'),
    );
    await expect(filesystem.exists('virtual.geospec.ts')).resolves.toBe(true);
    await expect(filesystem.exists('absent.ts')).resolves.toBe(false);
    await expect(filesystem.readFile('main.ts', 'utf8')).resolves.toBe('export default 1;\n');
  });

  it('should refuse to write a served path and leave the file on disk alone', async () => {
    await writeFile(join(root, 'kept.geospec.ts'), 'mine\n', 'utf8');
    const filesystem = withInMemorySources(root, createNodeVmFileSystem(root), { 'kept.geospec.ts': 'served\n' });

    await expect(filesystem.writeFile('kept.geospec.ts', 'replaced\n')).rejects.toMatchObject({ code: 'EACCES' });
    await filesystem.writeFile('other.txt', 'written\n');
    await filesystem.ensureDir('nested/dir');

    await expect(readFile(join(root, 'kept.geospec.ts'), 'utf8')).resolves.toBe('mine\n');
    await expect(readFile(join(root, 'other.txt'), 'utf8')).resolves.toBe('written\n');
  });
});
