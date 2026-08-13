/* eslint-disable @typescript-eslint/naming-convention -- VM paths are object keys here. */
import { mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createNodeGeoSpecCliHost } from '#cli/node-host.js';

const project = async (): Promise<string> => {
  const root = await mkdtemp(join(tmpdir(), 'geospec-cli-'));
  await writeFile(
    join(root, 'a.geospec.ts'),
    `import { describe, it } from 'geospec';
     describe('cli', () => { it('passes', () => {}); });`,
    'utf8',
  );
  return root;
};

afterEach(() => {
  vi.restoreAllMocks();
});

describe('createNodeGeoSpecCliHost', () => {
  it('should write one line per call to stdout', () => {
    const write = vi.spyOn(process.stdout, 'write').mockReturnValue(true);

    createNodeGeoSpecCliHost().write('hello');

    expect(write).toHaveBeenCalledWith('hello\n');
  });

  it('should report the process cwd', () => {
    expect(createNodeGeoSpecCliHost().cwd()).toBe(process.cwd());
  });

  it('should classify directories and files for discovery', async () => {
    const root = await project();
    const filesystem = createNodeGeoSpecCliHost().discoveryFileSystem(root);

    expect(await filesystem.readdir(root)).toStrictEqual(['a.geospec.ts']);
    expect(await filesystem.stat(root)).toStrictEqual({ kind: 'directory' });
    expect(await filesystem.stat(join(root, 'a.geospec.ts'))).toStrictEqual({ kind: 'file' });
  });

  it('should build a serial runner that executes a real project file', async () => {
    const root = await project();
    const runner = createNodeGeoSpecCliHost().createRunner({
      projectPath: root,
      workers: undefined,
      shardTimeout: undefined,
    });

    const result = await runner.run({ files: ['a.geospec.ts'] });
    await runner.close();

    expect(result.success).toBe(true);
  });

  it('should pass explicit cache controls to serial and pooled runners', async () => {
    const root = await project();
    const host = createNodeGeoSpecCliHost({ reportStream: () => undefined });
    const serial = host.createRunner({ projectPath: root, workers: undefined, shardTimeout: undefined, cache: false });
    const serialResult = await serial.run({ files: ['a.geospec.ts'] });
    expect(serialResult.success).toBe(true);
    await serial.close();

    const cached = host.createRunner({
      projectPath: root,
      workers: undefined,
      shardTimeout: undefined,
      cacheDirectory: join(tmpdir(), 'geospec-node-host-serial-cache'),
    });
    const cachedResult = await cached.run({ files: ['a.geospec.ts'] });
    expect(cachedResult.success).toBe(true);
    await cached.close();

    expect(
      typeof host.createRunner({
        projectPath: root,
        workers: 1,
        shardTimeout: undefined,
        cacheDirectory: join(tmpdir(), 'geospec-node-host-cache'),
      }).run,
    ).toBe('function');
    expect(typeof host.createRunner({ projectPath: root, workers: 1, shardTimeout: undefined, cache: false }).run).toBe(
      'function',
    );
  });

  it('should build a pool runner when a worker count is requested', () => {
    const host = createNodeGeoSpecCliHost();

    expect(typeof host.createRunner({ projectPath: '/x', workers: 2, shardTimeout: 1000 }).run).toBe('function');
    expect(typeof host.createRunner({ projectPath: '/x', workers: 0, shardTimeout: undefined }).run).toBe('function');
  });

  it('should expose a flush that resolves', async () => {
    await expect(createNodeGeoSpecCliHost().flush()).resolves.toBeUndefined();
  });
});
