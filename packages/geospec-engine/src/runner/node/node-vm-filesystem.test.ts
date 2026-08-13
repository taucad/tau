import { mkdtemp, readFile, writeFile } from 'node:fs/promises';
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
  it('should treat an absolute VM path as project-rooted', () => {
    expect(resolveUnderRoot('/project', '/src/main.ts')).toBe('/project/src/main.ts');
    expect(resolveUnderRoot('/project', 'src/main.ts')).toBe('/project/src/main.ts');
    expect(resolveUnderRoot('/project', './src/../main.ts')).toBe('/project/main.ts');
  });

  it('should refuse a path that escapes the root', () => {
    expect(() => resolveUnderRoot('/project', '../secrets')).toThrow('outside the project root');
    expect(() => resolveUnderRoot('/project', '/../secrets')).toThrow('outside the project root');
    expect(() => resolveUnderRoot('/project', 'a/../../secrets')).toThrow('outside the project root');
  });
});

describe('createNodeVmFileSystem', () => {
  it('should read, write and probe under the root', async () => {
    const filesystem = createNodeVmFileSystem(root);
    expect(await filesystem.exists('/main.ts')).toBe(true);
    expect(await filesystem.exists('/missing.ts')).toBe(false);
    expect(await filesystem.readFile('/main.ts', 'utf8')).toBe('export default 1;\n');
    const bytes = await filesystem.readFile('/main.ts');
    expect(bytes.byteLength).toBe(18);

    await filesystem.ensureDir('/nested');
    await filesystem.writeFile('/nested/deeper/out.txt', 'written');
    expect(await readFile(join(root, 'nested/deeper/out.txt'), 'utf8')).toBe('written');
  });
});
