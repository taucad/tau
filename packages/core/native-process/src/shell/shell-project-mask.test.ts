import {
  existsSync,
  lstatSync,
  mkdirSync,
  mkdtempSync,
  realpathSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';

import { wrapCommandWithSandboxMacOS } from '@anthropic-ai/sandbox-runtime/dist/sandbox/macos-sandbox-utils.js';
import { afterEach, describe, expect, it } from 'vitest';

import { bindMaskedDirectories, holdProtectedStandIns, maskProblem } from '#shell/shell-project-mask.js';
import type { ShellFilesystem } from '#shell/shell-provider.js';

const roots: string[] = [];
afterEach(() => {
  for (const root of roots.splice(0)) {
    rmSync(root, { recursive: true, force: true });
  }
});
const fixture = (): ShellFilesystem => {
  const root = realpathSync(mkdtempSync(join(tmpdir(), 'tau-mask-')));
  roots.push(root);
  mkdirSync(join(root, 'reserved', 'authored'), { recursive: true });
  return {
    readable: [],
    writable: [root, join(root, 'reserved', 'authored')],
    denied: [join(root, 'reserved', 'hidden')],
    masked: [join(root, 'reserved')],
  };
};

describe('masked container admission', () => {
  it('should preserve a parent grant and explicit child without weakening denied', () => {
    const filesystem = fixture();
    expect(maskProblem(filesystem)).toBeUndefined();
    expect(maskProblem({ ...filesystem, denied: [...filesystem.denied, filesystem.writable[1]!] })).toContain('denied');
  });
  it('should admit an absent container only beneath a canonical immediate parent', () => {
    const filesystem = fixture();
    expect(maskProblem({ ...filesystem, masked: [join(filesystem.masked![0]!, 'missing')] })).toBeUndefined();
    expect(maskProblem({ ...filesystem, masked: [join(filesystem.masked![0]!, 'missing', 'nested')] })).toContain(
      'unavailable',
    );
    const alias = join(filesystem.writable[0]!, 'alias');
    symlinkSync(filesystem.masked![0]!, alias);
    expect(maskProblem({ ...filesystem, masked: [join(alias, 'missing')] })).toContain('canonical');
  });
  it('should refuse a container spelled through the data-volume firmlink', () => {
    const filesystem = fixture();
    expect(maskProblem({ ...filesystem, masked: ['/System/Volumes/Data/Users/someone/project/.tau'] })).toContain(
      '/System/Volumes/Data',
    );
  });
  it.runIf(process.platform === 'darwin')('should refuse a container spelled in a case it is not stored in', () => {
    const filesystem = fixture();
    const upper = filesystem.masked![0]!.toUpperCase();
    expect(maskProblem({ ...filesystem, masked: [upper] })).toBeDefined();
    expect(maskProblem({ ...filesystem, masked: [join(dirname(upper), 'reserved')] })).toBeDefined();
  });
  it('should refuse a child alias resolving outside its container', () => {
    const filesystem = fixture();
    const link = join(filesystem.masked![0]!, 'alias');
    symlinkSync(filesystem.writable[0]!, link);
    expect(maskProblem({ ...filesystem, writable: [...filesystem.writable, link] })).toContain('symbolic link');
  });
  it('should refuse a grant that reopens the masked container itself', () => {
    const filesystem = fixture();
    expect(maskProblem({ ...filesystem, readable: filesystem.masked! })).toContain('strict descendants');
  });
});

describe('macOS masked directory profile composition', () => {
  it('should narrow read and write masks without appending allowances', () => {
    const filesystem: ShellFilesystem = {
      readable: [],
      writable: ['/project', '/project/.tau/parameters'],
      readOnly: ['/project/.tau/chats'],
      denied: ['/project/.tau/secret'],
      masked: ['/project/.tau'],
    };
    const argv = ['/bin/sh', '-c', "exec /usr/bin/sandbox-exec -p '(version 1)\n(allow file-write*)' /bin/bash"];
    const bound = bindMaskedDirectories(argv, filesystem)!;
    const appended = bound[2]!.slice(bound[2]!.indexOf('; Reserved directory'));
    expect(appended).toContain('(deny file-read*');
    expect(appended).toContain('(deny file-write*');
    expect(appended).not.toContain('(allow ');
    expect(appended).toContain('(require-not (subpath "/project/.tau/parameters"))');
    const [reads, writes] = appended.split('(deny file-write*');
    expect(reads).toContain('(require-not (subpath "/project/.tau/chats"))');
    expect(writes).not.toContain('/project/.tau/chats');
    expect(writes).toContain('(deny file-write-create file-write-unlink (require-all (regex');
    expect(reads).toContain('(deny file-read-data (regex "^/project/');
    expect(reads).toContain('(deny file-read-metadata (require-all (regex');
    expect(reads).toContain('(require-not (subpath "/project/.tau/parameters"))');
    expect(appended).toContain('[tT][aA][uU][. ]*(:[^/]*)?');
    expect(argv[2]).not.toContain('Reserved directory');
  });
  it('should place every mask deny after the runtime directory-metadata allow in the real profile', () => {
    const filesystem: ShellFilesystem = {
      readable: [],
      writable: ['/project', '/project/.tau/parameters', '/project/.tau/a/b'],
      denied: ['/project/.tau/secret'],
      masked: ['/project/.tau'],
    };
    const wrapped = wrapCommandWithSandboxMacOS({
      command: 'true',
      needsNetworkRestriction: false,
      readConfig: { denyOnly: [...filesystem.denied], allowWithinDeny: [] },
      writeConfig: { allowOnly: [...filesystem.writable], denyWithinAllow: [...filesystem.denied] },
      binShell: 'bash',
    });
    const profile = bindMaskedDirectories(['/bin/sh', '-c', wrapped], filesystem)![2]!;
    const lastAllow = (operation: string): number => profile.lastIndexOf(`(allow ${operation}`);
    const metadataAllow = lastAllow('file-read-metadata');
    expect(metadataAllow).toBeGreaterThan(-1);
    const boundary = profile.indexOf('; Reserved directory creation boundary');
    expect(boundary).toBeGreaterThan(Math.max(metadataAllow, lastAllow('file-read'), lastAllow('file-write')));
    const denies = profile.slice(boundary).match(/\(deny [a-z*-]+(?: [a-z*-]+)*/gu) ?? [];
    expect(denies).toEqual([
      '(deny file-read*',
      '(deny file-read-data',
      '(deny file-read-metadata',
      '(deny file-write*',
      '(deny file-write-create file-write-unlink',
    ]);
    // Every runtime allow of these operations precedes the boundary.
    expect(profile.slice(boundary)).not.toContain('(allow ');
    // A directory between the container and an opened child stays stat-able but never listable.
    const between = '(literal "/project/.tau/a")';
    const data = profile
      .slice(boundary)
      .split('\n')
      .find((line) => line.startsWith('(deny file-read-data'));
    expect(data).toContain(between);
  });

  it('should refuse an unrecognized sandbox vector', () => {
    expect(bindMaskedDirectories(['/bin/bash', '-c', 'true'], fixture())).toBeUndefined();
  });
});

describe.runIf(process.platform === 'linux')('Linux protected-path stand-ins', () => {
  const absent = (): ShellFilesystem & { root: string } => {
    const root = realpathSync(mkdtempSync(join(tmpdir(), 'tau-stand-in-')));
    roots.push(root);
    const reserved = join(root, '.tau');
    return {
      root,
      readable: [],
      writable: [root],
      readOnly: [join(reserved, 'chats')],
      denied: [join(reserved, 'binding.json'), join(root, '.git')],
      masked: [reserved],
    };
  };

  it('should keep a stand-in shared by overlapping launches until the last of them releases it', () => {
    const filesystem = absent();
    const reserved = join(filesystem.root, '.tau');
    const control = join(filesystem.root, '.git');
    const releaseFirst = holdProtectedStandIns(filesystem);
    // The container is an empty directory and the control path an empty file: what the runtime would mount on.
    expect(lstatSync(reserved).isDirectory()).toBe(true);
    expect(lstatSync(control).size).toBe(0);
    // Nothing is made inside a stand-in container: the runtime's mask covers it whole.
    expect(existsSync(join(reserved, 'binding.json'))).toBe(false);
    const releaseSecond = holdProtectedStandIns(filesystem);
    // The first launch ending while the second is still configured or running leaves the stand-ins in place.
    releaseFirst();
    releaseFirst();
    expect(existsSync(reserved)).toBe(true);
    expect(existsSync(control)).toBe(true);
    releaseSecond();
    expect(existsSync(reserved)).toBe(false);
    expect(existsSync(control)).toBe(false);
  });

  it('should leave real data written into a stand-in and never create inside an existing container', () => {
    const filesystem = absent();
    const reserved = join(filesystem.root, '.tau');
    const release = holdProtectedStandIns(filesystem);
    writeFileSync(join(reserved, 'state.json'), 'REAL');
    release();
    expect(existsSync(join(reserved, 'state.json'))).toBe(true);
    // The container now exists, so its protected children are left to the mask.
    const again = holdProtectedStandIns(filesystem);
    expect(existsSync(join(reserved, 'binding.json'))).toBe(false);
    expect(existsSync(join(reserved, 'chats'))).toBe(false);
    again();
    expect(existsSync(join(filesystem.root, '.git'))).toBe(false);
  });

  it('should not make a stand-in outside a writable root or beneath a symbolic link', () => {
    const filesystem = absent();
    const elsewhere = realpathSync(mkdtempSync(join(tmpdir(), 'tau-stand-in-elsewhere-')));
    roots.push(elsewhere);
    symlinkSync(elsewhere, join(filesystem.root, 'linked'));
    const release = holdProtectedStandIns({
      ...filesystem,
      denied: [join(elsewhere, '.git'), join(filesystem.root, 'linked', 'hidden')],
      readOnly: [],
      masked: [],
    });
    expect(existsSync(join(elsewhere, '.git'))).toBe(false);
    expect(existsSync(join(elsewhere, 'hidden'))).toBe(false);
    release();
  });
});
