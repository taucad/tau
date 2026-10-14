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

  it('should build a compiled one-worker runner that executes a real project file', async () => {
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

  it('should write through a supplied report stream instead of stdout', () => {
    const stdout = vi.spyOn(process.stdout, 'write').mockReturnValue(true);
    const lines: string[] = [];

    createNodeGeoSpecCliHost({ reportStream: (text) => lines.push(text) }).write('report');

    expect(lines).toStrictEqual(['report\n']);
    expect(stdout).not.toHaveBeenCalled();
  });

  it('should build a pool runner when a worker count is requested', () => {
    const host = createNodeGeoSpecCliHost();

    expect(typeof host.createRunner({ projectPath: '/x', workers: 2, shardTimeout: 1000 }).run).toBe('function');
    expect(typeof host.createRunner({ projectPath: '/x', workers: 0, shardTimeout: undefined }).run).toBe('function');
  });
});
