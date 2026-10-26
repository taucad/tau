import {
  existsSync,
  lstatSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  realpathSync,
  renameSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';

import { wrapCommandWithSandboxMacOS } from '@anthropic-ai/sandbox-runtime/dist/sandbox/macos-sandbox-utils.js';
import { afterEach, describe, expect, it } from 'vitest';

import {
  bindMaskedDirectories,
  holdProtectedStandIns,
  maskProblem,
  useStandInJournal,
} from '#shell/shell-project-mask.js';
import type { StandInProfile } from '#shell/shell-project-mask.js';
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
  const temporary = (prefix: string): string => {
    const root = realpathSync(mkdtempSync(join(tmpdir(), prefix)));
    roots.push(root);
    return root;
  };

  /** A checkout whose reserved container is masked, as the runtime lists are handed it. */
  const absent = (): StandInProfile & { root: string } => {
    const root = temporary('tau-stand-in-');
    const reserved = join(root, '.tau');
    return {
      root,
      allowWrite: [root],
      writable: [root],
      denyWrite: [join(reserved, 'binding.json'), join(root, '.git'), join(reserved, 'chats')],
      masked: [reserved],
    };
  };

  /** The same checkout with no mask: every reserved row is its own protected path. */
  const unmasked = (): StandInProfile & { root: string } => {
    const profile = absent();
    const reserved = join(profile.root, '.tau');
    return {
      ...profile,
      masked: [],
      denyWrite: [join(reserved, 'binding.json'), join(profile.root, '.git'), join(reserved, 'runs')],
      directories: [join(reserved, 'runs'), join(profile.root, '.git')],
    };
  };

  it('should keep a stand-in shared by overlapping launches until the last of them releases it', () => {
    const profile = absent();
    const reserved = join(profile.root, '.tau');
    const control = join(profile.root, '.git');
    const releaseFirst = holdProtectedStandIns(profile);
    // The container is an empty directory and the control path an empty file: what the runtime would mount on.
    expect(lstatSync(reserved).isDirectory()).toBe(true);
    expect(lstatSync(control).size).toBe(0);
    // Nothing is made inside a stand-in container: the runtime's mask covers it whole.
    expect(existsSync(join(reserved, 'binding.json'))).toBe(false);
    expect(existsSync(join(reserved, '.tau-mask-boundary'))).toBe(false);
    const releaseSecond = holdProtectedStandIns({
      ...profile,
      denyWrite: [...profile.denyWrite, join(reserved, '.tau-mask-boundary')],
    });
    expect(existsSync(join(reserved, '.tau-mask-boundary'))).toBe(false);
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
    const profile = absent();
    const reserved = join(profile.root, '.tau');
    const release = holdProtectedStandIns(profile);
    writeFileSync(join(reserved, 'state.json'), 'REAL');
    release();
    expect(existsSync(join(reserved, 'state.json'))).toBe(true);
    // The container now exists, so its protected children are left to the mask.
    const again = holdProtectedStandIns(profile);
    expect(existsSync(join(reserved, 'binding.json'))).toBe(false);
    expect(existsSync(join(reserved, 'chats'))).toBe(false);
    again();
    expect(existsSync(join(profile.root, '.git'))).toBe(false);
  });

  it('should stand in for an absent directory row as a directory and a file row as a file', () => {
    const profile = unmasked();
    const reserved = join(profile.root, '.tau');
    const release = holdProtectedStandIns(profile);
    expect(lstatSync(join(profile.root, '.git')).isDirectory()).toBe(true);
    expect(lstatSync(reserved).isDirectory()).toBe(true);
    // The whole protected path is present, so the runtime makes no mount point of its own.
    expect(lstatSync(join(reserved, 'runs')).isDirectory()).toBe(true);
    expect(lstatSync(join(reserved, 'binding.json')).isFile()).toBe(true);
    // The host's own write into a stand-in is real data and survives the release.
    writeFileSync(join(reserved, 'runs', 'lease.json'), '{}');
    release();
    expect(existsSync(join(reserved, 'runs', 'lease.json'))).toBe(true);
    expect(existsSync(join(reserved, 'binding.json'))).toBe(false);
    expect(existsSync(join(profile.root, '.git'))).toBe(false);
  });

  it('should not make a stand-in outside a writable root or beneath a symbolic link', () => {
    const profile = absent();
    const elsewhere = temporary('tau-stand-in-elsewhere-');
    symlinkSync(elsewhere, join(profile.root, 'linked'));
    const release = holdProtectedStandIns({
      ...profile,
      denyWrite: [join(elsewhere, '.git'), join(profile.root, 'linked', 'hidden')],
      masked: [],
    });
    expect(existsSync(join(elsewhere, '.git'))).toBe(false);
    expect(existsSync(join(elsewhere, 'hidden'))).toBe(false);
    release();
  });

  it('should release what a hold already took when it throws midway', () => {
    const profile = unmasked();
    const control = join(profile.root, '.git');
    // A name longer than any filesystem allows: lstat throws ENAMETOOLONG rather than reporting it absent.
    const unreadable = join(profile.root, 'x'.repeat(300));
    expect(() => holdProtectedStandIns({ ...profile, denyWrite: [control, unreadable] })).toThrow(/ENAMETOOLONG/u);
    expect(existsSync(control)).toBe(false);
    // Nothing is still counted: a fresh hold creates and its release removes again.
    const release = holdProtectedStandIns({ ...profile, denyWrite: [control] });
    expect(existsSync(control)).toBe(true);
    release();
    expect(existsSync(control)).toBe(false);
  });

  it('should never remove a file that replaced a stand-in, even an empty one', () => {
    const profile = unmasked();
    const binding = join(profile.root, '.tau', 'binding.json');
    const release = holdProtectedStandIns({ ...profile, denyWrite: [binding] });
    // A host writer atomically replaces the stand-in with its own (empty) file: a different inode.
    writeFileSync(`${binding}.next`, '');
    renameSync(`${binding}.next`, binding);
    release();
    expect(existsSync(binding)).toBe(true);
  });

  it('should journal live stand-ins and sweep at the next start only those still empty and unchanged', () => {
    const profile = unmasked();
    const state = temporary('tau-stand-in-state-');
    const journal = join(state, 'shell-stand-ins.json');
    const reserved = join(profile.root, '.tau');
    useStandInJournal(journal);
    const release = holdProtectedStandIns(profile);
    const rows = JSON.parse(readFileSync(journal, 'utf8')) as Array<{ path: string }>;
    expect(rows.map((row) => row.path).toSorted()).toStrictEqual(
      [reserved, join(reserved, 'binding.json'), join(reserved, 'runs'), join(profile.root, '.git')].toSorted(),
    );
    release();
    expect(JSON.parse(readFileSync(journal, 'utf8'))).toStrictEqual([]);

    // What a crashed process leaves: entries on disk and their journal rows, with no live holder.
    const left = temporary('tau-stand-in-left-');
    const row = (path: string, directory: boolean) => {
      const info = lstatSync(path, { bigint: true });
      return { path, directory, dev: String(info.dev), ino: String(info.ino) };
    };
    mkdirSync(join(left, '.git'));
    mkdirSync(join(left, '.tau', 'runs'), { recursive: true });
    writeFileSync(join(left, '.tau', 'binding.json'), '');
    writeFileSync(join(left, 'thumbnail.webp'), '');
    const crashed = [
      row(join(left, '.git'), true),
      row(join(left, '.tau'), true),
      row(join(left, '.tau', 'runs'), true),
      row(join(left, '.tau', 'binding.json'), false),
      row(join(left, 'thumbnail.webp'), false),
    ];
    // Since the crash: real data in one stand-in, and another replaced by a different (empty) file.
    writeFileSync(join(left, '.tau', 'runs', 'lease.json'), '{}');
    writeFileSync(join(left, 'thumbnail.next'), '');
    renameSync(join(left, 'thumbnail.next'), join(left, 'thumbnail.webp'));
    const next = join(state, 'next.json');
    writeFileSync(next, JSON.stringify(crashed));
    useStandInJournal(next);
    expect(existsSync(join(left, '.git'))).toBe(false);
    expect(existsSync(join(left, '.tau', 'binding.json'))).toBe(false);
    expect(existsSync(join(left, '.tau', 'runs', 'lease.json'))).toBe(true);
    expect(existsSync(join(left, 'thumbnail.webp'))).toBe(true);
    expect(JSON.parse(readFileSync(next, 'utf8'))).toStrictEqual([]);
  });
});
