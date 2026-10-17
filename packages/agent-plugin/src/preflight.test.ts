import { chmod, mkdtemp, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { preflight, versionOf } from '#preflight.js';
import type { PreflightInput } from '#preflight.js';

/** The contract every failure keeps: one stderr line that starts with `tau: `. */
const oneLine = /^tau: .*\n$/u;

describe('preflight', () => {
  let directory: string;

  beforeEach(async () => {
    directory = await mkdtemp(join(tmpdir(), 'tau-agent-plugin-preflight-'));
  });

  afterEach(async () => {
    await rm(directory, { recursive: true, force: true });
  });

  /** An npm that answers `--version` with `version` and names `cache` as its cache. */
  const npmAt = (version: string, cache: string): NonNullable<PreflightInput['npm']> =>
    vi.fn((args: readonly string[]) => (args[0] === '--version' ? version : cache));

  it('should exit 2 on Node.js older than 24 without running npm', () => {
    const npm = npmAt('10.9.4', directory);

    const report = preflight({ nodeVersion: '22.22.0', npm });

    expect(report).toEqual({
      failure: { code: 2, message: 'tau: Node.js 22.22.0 started this plugin; install Node.js 24 or later\n' },
    });
    expect(report.failure?.message).toMatch(oneLine);
    expect(npm).not.toHaveBeenCalled();
  });

  it('should exit 4 when npm does not run', () => {
    const npm = (): string => {
      throw Object.assign(new Error('spawnSync npm ENOENT'), { code: 'ENOENT' });
    };

    const report = preflight({ nodeVersion: '24.20.0', npm });

    expect(report).toEqual({
      failure: { code: 4, message: 'tau: npm did not run; install Node.js 24 or later, which includes npm\n' },
    });
    expect(report.failure?.message).toMatch(oneLine);
  });

  it('should skip the cache check when npm will not name its cache, as for a path holding a UUID', () => {
    const npm = (args: readonly string[]): string => {
      if (args[0] === '--version') {
        return '11.19.0';
      }
      throw new Error('npm error The cache option is protected, and cannot be retrieved in this way');
    };

    expect(preflight({ nodeVersion: '24.20.0', npm })).toEqual({ npm: '11.19.0' });
  });

  it.each([['10.9.4'], ['']])('should exit 4 on npm %j, which cannot install the CLI', (version) => {
    const report = preflight({ nodeVersion: '24.20.0', npm: npmAt(version, directory) });

    expect(report).toEqual({
      failure: { code: 4, message: `tau: npm ${version} is older than 11; run: npm install -g npm@11\n` },
    });
    expect(report.failure?.message).toMatch(oneLine);
  });

  it('should exit 3 with npm’s own fix when nothing can be created in the cache', async () => {
    /* A cache below a file fails for root too, which a read-only folder would not. */
    await writeFile(join(directory, 'file'), '');
    const cache = join(directory, 'file', 'npm-cache');

    const report = preflight({ nodeVersion: '24.20.0', npm: npmAt('11.19.0', cache) });

    const fix =
      process.getuid === undefined ? '' : `; run: sudo chown -R ${process.getuid()}:${process.getgid?.()} "${cache}"`;
    expect(report).toEqual({ failure: { code: 3, message: `tau: npm cache ${cache} is not writable${fix}\n` } });
    expect(report.failure?.message).toMatch(oneLine);
  });

  it('should pass on npm 11 or later with a writable cache, and leave no probe file behind', async () => {
    for (const version of ['11.19.0', '12.2.0']) {
      expect(preflight({ nodeVersion: '24.20.0', npm: npmAt(version, directory) })).toEqual({
        npm: version,
        cache: directory,
      });
    }
    await expect(readdir(join(directory, '_cacache', 'tmp'))).resolves.toEqual([]);
  });
});

describe.skipIf(process.platform === 'win32')('versionOf', () => {
  let directory: string;

  /** An executable stand-in for `tau`, run by the current Node.js. */
  const fakeCli = async (body: string): Promise<string> => {
    const path = join(directory, 'tau');
    await writeFile(path, `#!${process.execPath}\n${body}\n`);
    await chmod(path, 0o755);
    return path;
  };

  beforeEach(async () => {
    directory = await mkdtemp(join(tmpdir(), 'tau-agent-plugin-version-'));
  });

  afterEach(async () => {
    await rm(directory, { recursive: true, force: true });
  });

  it('should return what the CLI prints for --version, trimmed', async () => {
    const cli = await fakeCli(
      String.raw`process.stdout.write(process.argv[2] === '--version' ? '0.1.0-beta.6\n' : 'wrong');`,
    );

    expect(versionOf(cli)).toBe('0.1.0-beta.6');
  });

  it('should return undefined for a CLI that fails or is missing', async () => {
    const cli = await fakeCli("process.stdout.write('0.1.0-beta.6'); process.exit(1);");

    expect(versionOf(cli)).toBeUndefined();
    expect(versionOf(join(directory, 'missing-tau'))).toBeUndefined();
  });

  it('should give up on a CLI that does not answer within 2 s', async () => {
    const cli = await fakeCli('setInterval(() => undefined, 1000);');
    const started = Date.now();

    expect(versionOf(cli)).toBeUndefined();
    expect(Date.now() - started).toBeGreaterThanOrEqual(2000);
    expect(Date.now() - started).toBeLessThan(4000);
  });
});
