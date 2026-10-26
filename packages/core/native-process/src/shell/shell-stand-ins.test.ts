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
import { join } from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import type { ShellFilesystem } from '#shell/shell-provider.js';
import { holdProtectedStandIns } from '#shell/shell-stand-ins.js';

const roots: string[] = [];
afterEach(() => {
  for (const root of roots.splice(0)) {
    rmSync(root, { recursive: true, force: true });
  }
});

const checkout = (): ShellFilesystem & { root: string } => {
  const root = realpathSync(mkdtempSync(join(tmpdir(), 'tau-stand-in-')));
  roots.push(root);
  const reserved = join(root, '.tau');
  return {
    root,
    readable: [],
    writable: [root],
    readOnly: [join(reserved, 'runs')],
    denied: [join(reserved, 'binding.json'), join(root, '.git')],
    directories: [join(reserved, 'runs'), join(root, '.git')],
  };
};

describe.runIf(process.platform === 'linux')('Linux protected-path stand-ins', () => {
  it('should keep a stand-in shared by overlapping launches until the last of them releases it', () => {
    const filesystem = checkout();
    const reserved = join(filesystem.root, '.tau');
    const control = join(filesystem.root, '.git');
    const releaseFirst = holdProtectedStandIns(filesystem);
    expect(lstatSync(reserved).isDirectory()).toBe(true);
    // A directory row is stood in for by a directory, never a file.
    expect(lstatSync(control).isDirectory()).toBe(true);
    // Below a stand-in nothing more is made: the stand-in alone is the mount point.
    expect(existsSync(join(reserved, 'binding.json'))).toBe(false);
    const releaseSecond = holdProtectedStandIns(filesystem);
    releaseFirst();
    releaseFirst();
    expect(existsSync(reserved)).toBe(true);
    expect(existsSync(control)).toBe(true);
    releaseSecond();
    expect(existsSync(reserved)).toBe(false);
    expect(existsSync(control)).toBe(false);
  });

  it('should stand in for an absent directory row as a directory and a file row as a file', () => {
    const filesystem = checkout();
    const reserved = join(filesystem.root, '.tau');
    mkdirSync(join(reserved, 'parameters'), { recursive: true });
    const release = holdProtectedStandIns(filesystem);
    expect(lstatSync(join(reserved, 'runs')).isDirectory()).toBe(true);
    expect(lstatSync(join(reserved, 'binding.json')).isFile()).toBe(true);
    // The host's own write into a stand-in is real data and survives the release.
    writeFileSync(join(reserved, 'runs', 'lease.json'), '{}');
    release();
    expect(existsSync(join(reserved, 'runs', 'lease.json'))).toBe(true);
    expect(existsSync(join(reserved, 'binding.json'))).toBe(false);
  });

  it('should not make a stand-in outside a writable root or beneath a symbolic link', () => {
    const filesystem = checkout();
    const elsewhere = realpathSync(mkdtempSync(join(tmpdir(), 'tau-stand-in-elsewhere-')));
    roots.push(elsewhere);
    symlinkSync(elsewhere, join(filesystem.root, 'linked'));
    const release = holdProtectedStandIns({
      ...filesystem,
      denied: [join(elsewhere, '.git'), join(filesystem.root, 'linked', 'hidden')],
      readOnly: [],
    });
    expect(existsSync(join(elsewhere, '.git'))).toBe(false);
    expect(existsSync(join(elsewhere, 'hidden'))).toBe(false);
    release();
  });
});
