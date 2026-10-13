import { createHash } from 'node:crypto';
import { mkdir, mkdtemp, readFile, readdir, rm, rmdir, stat, unlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { gzipSync } from 'node:zlib';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mock } from 'vitest-mock-extended';
import type { RpcFileSystem } from '#rpc/rpc-dependencies.js';
import { handleInstallPackages } from '#rpc/handlers/handle-install-packages.js';

const encoder = new TextEncoder();

/** Gzipped ustar archive of regular files under `package/`, as npm publishes them. */
const tarball = (files: Readonly<Record<string, string>>): Uint8Array<ArrayBuffer> => {
  const blocks = Object.entries(files).flatMap(([name, text]) => {
    const data = encoder.encode(text);
    const header = new Uint8Array(512);
    header.set(encoder.encode(`package/${name}`), 0);
    header.set(encoder.encode(`${data.length.toString(8).padStart(11, '0')}\0`), 124);
    header.set(encoder.encode('0'), 156);
    header.set(encoder.encode('ustar\u000000'), 257);
    header.fill(0x20, 148, 156);
    const checksum = header.reduce((sum, byte) => sum + byte, 0);
    header.set(encoder.encode(`${checksum.toString(8).padStart(6, '0')}\0 `), 148);
    return [header, data, new Uint8Array((512 - (data.length % 512)) % 512)];
  });
  return new Uint8Array(gzipSync(Buffer.concat([...blocks, new Uint8Array(1024)])));
};

const aleaTarball = tarball({
  'package.json': JSON.stringify({ name: 'alea', version: '1.0.1', main: 'alea.js' }),
  'alea.js': 'module.exports = () => Math.random;\n',
});
const aleaUrl = 'https://registry.npmjs.org/alea/-/alea-1.0.1.tgz';
const aleaPackument = {
  name: 'alea',
  'dist-tags': { latest: '1.0.1' },
  versions: {
    '1.0.1': {
      name: 'alea',
      version: '1.0.1',
      dist: { tarball: aleaUrl, integrity: `sha512-${createHash('sha512').update(aleaTarball).digest('base64')}` },
    },
  },
};

/* The registry and its tarballs, served without a network. */
const registry = vi.fn<typeof fetch>(async (input) => {
  const { url } = new Request(input);
  if (url === 'https://registry.npmjs.org/alea') {
    return Response.json(aleaPackument);
  }
  return url === aleaUrl ? new Response(aleaTarball) : new Response(undefined, { status: 404 });
});

/** The RPC filesystem over a real directory, with the checked write the record authority provides. */
const directoryFileSystem = (root: string): RpcFileSystem => {
  const at = (path: string): string => join(root, path);
  const current = async (path: string): Promise<string | undefined> => {
    try {
      return await readFile(at(path), 'utf8');
    } catch {
      return undefined;
    }
  };
  const isDirectory = async (path: string): Promise<boolean> => {
    const value = await stat(at(path));
    return value.isDirectory();
  };
  const put = async (path: string, content: string | Uint8Array<ArrayBuffer>): Promise<void> => {
    await mkdir(dirname(at(path)), { recursive: true });
    await writeFile(at(path), content);
  };
  const fileSystem = mock<RpcFileSystem>();
  fileSystem.exists.mockImplementation(async (path) => {
    try {
      await stat(at(path));
      return true;
    } catch {
      return false;
    }
  });
  fileSystem.stat.mockImplementation(async (path) => {
    const value = await stat(at(path));
    const times = { size: value.size, createdAt: '', modifiedAt: '' };
    return value.isDirectory()
      ? { ...times, isDirectory: true }
      : { ...times, isDirectory: false, contentKind: 'binary' };
  });
  fileSystem.readFile.mockImplementation(async (path) => readFile(at(path), 'utf8'));
  fileSystem.readBinaryFile.mockImplementation(async (path) => new Uint8Array(await readFile(at(path))));
  fileSystem.writeFile.mockImplementation(put);
  fileSystem.writeBinaryFile.mockImplementation(put);
  fileSystem.readdir.mockImplementation(async (path) => {
    const names = await readdir(at(path));
    return names.map((name) => ({ name, type: 'file', size: 0, contentKind: 'binary' }));
  });
  fileSystem.deleteFile.mockImplementation(async (path) =>
    (await isDirectory(path)) ? rmdir(at(path)) : unlink(at(path)),
  );
  fileSystem.writeFileChecked.mockImplementation(async ({ path, data, preconditions }) => {
    for (const condition of preconditions) {
      // oxlint-disable-next-line no-await-in-loop -- a few preconditions, checked in order
      if ((await current(condition.path)) !== (condition.expected ?? undefined)) {
        return { status: 'conflict', conflicts: [] };
      }
    }
    await put(path, data);
    return { status: 'applied', content: new Uint8Array(await readFile(at(path))) };
  });
  return fileSystem;
};

describe('handleInstallPackages', () => {
  let root: string;
  let fileSystem: RpcFileSystem;
  const manifest = `${JSON.stringify({ name: 'noise-vase', type: 'module' }, null, 2)}\n`;

  beforeEach(async () => {
    root = await mkdtemp(join(tmpdir(), 'tau-install-packages-'));
    await writeFile(join(root, 'package.json'), manifest);
    fileSystem = directoryFileSystem(root);
    registry.mockClear();
    vi.stubGlobal('fetch', registry);
  });

  afterEach(async () => {
    vi.unstubAllGlobals();
    await rm(root, { recursive: true, force: true });
  });

  it('should add a package, lock it and unpack the verified tarball, then reinstall with no download', async () => {
    const added = await handleInstallPackages({ add: { alea: '^1.0.1' } }, fileSystem);

    expect(added).toEqual({
      success: true,
      manifestChanged: true,
      lockChanged: true,
      packages: [{ name: 'alea', version: '1.0.1', path: 'node_modules/alea' }],
      issues: [],
    });
    expect(JSON.parse(await readFile(join(root, 'package.json'), 'utf8'))).toEqual({
      name: 'noise-vase',
      type: 'module',
      dependencies: { alea: '^1.0.1' },
    });
    const lock = JSON.parse(await readFile(join(root, 'package-lock.json'), 'utf8')) as Record<string, unknown>;
    expect(lock).toMatchObject({
      lockfileVersion: 3,
      packages: { 'node_modules/alea': { version: '1.0.1', resolved: aleaUrl } },
    });
    expect(await readFile(join(root, 'node_modules/alea/alea.js'), 'utf8')).toContain('Math.random');

    registry.mockClear();
    const again = await handleInstallPackages({}, fileSystem);

    expect(again).toMatchObject({ success: true, manifestChanged: false, lockChanged: false, issues: [] });
    expect(registry).not.toHaveBeenCalledWith(aleaUrl, expect.anything());
  });

  it('should write nothing when no published version matches the range', async () => {
    const result = await handleInstallPackages({ add: { alea: '^9.0.0' } }, fileSystem);

    expect(result).toEqual({
      success: true,
      manifestChanged: false,
      lockChanged: false,
      packages: [],
      issues: [expect.objectContaining({ code: 'no-matching-version', name: 'alea' })],
    });
    expect(await readFile(join(root, 'package.json'), 'utf8')).toBe(manifest);
    await expect(stat(join(root, 'package-lock.json'))).rejects.toThrow();
  });

  it('should remove a package from package.json and delete its unpacked tree', async () => {
    await handleInstallPackages({ add: { alea: '^1.0.1' } }, fileSystem);

    const result = await handleInstallPackages({ remove: ['alea'] }, fileSystem);

    expect(result).toMatchObject({ success: true, manifestChanged: true, packages: [], issues: [] });
    expect(JSON.parse(await readFile(join(root, 'package.json'), 'utf8'))).toMatchObject({ dependencies: {} });
    await expect(stat(join(root, 'node_modules/alea'))).rejects.toThrow();
  });
});
