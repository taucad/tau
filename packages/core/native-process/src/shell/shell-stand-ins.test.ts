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
import { join } from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import { holdProtectedStandIns, useStandInJournal } from '#shell/shell-stand-ins.js';
import type { StandInProfile } from '#shell/shell-stand-ins.js';

const roots: string[] = [];
afterEach(() => {
  for (const root of roots.splice(0)) {
    rmSync(root, { recursive: true, force: true });
  }
});

const temporary = (prefix: string): string => {
  const root = realpathSync(mkdtempSync(join(tmpdir(), prefix)));
  roots.push(root);
  return root;
};

const checkout = (): StandInProfile & { root: string } => {
  const root = temporary('tau-stand-in-');
  const reserved = join(root, '.tau');
  return {
    root,
    allowWrite: [root],
    denyWrite: [join(reserved, 'binding.json'), join(root, '.git'), join(reserved, 'runs')],
    directories: [join(reserved, 'runs'), join(root, '.git')],
  };
};

describe.runIf(process.platform === 'linux')('Linux protected-path stand-ins', () => {
  it('should keep a stand-in shared by overlapping launches until the last of them releases it', () => {
    const profile = checkout();
    const reserved = join(profile.root, '.tau');
    const control = join(profile.root, '.git');
    const releaseFirst = holdProtectedStandIns(profile);
    expect(lstatSync(reserved).isDirectory()).toBe(true);
    // A directory row is stood in for by a directory, never a file.
    expect(lstatSync(control).isDirectory()).toBe(true);
    // The whole protected path is present, so the runtime makes no mount point of its own.
    expect(lstatSync(join(reserved, 'binding.json')).isFile()).toBe(true);
    expect(lstatSync(join(reserved, 'runs')).isDirectory()).toBe(true);
    const releaseSecond = holdProtectedStandIns(profile);
    releaseFirst();
    releaseFirst();
    expect(existsSync(reserved)).toBe(true);
    expect(existsSync(control)).toBe(true);
    releaseSecond();
    expect(existsSync(reserved)).toBe(false);
    expect(existsSync(control)).toBe(false);
  });

  it('should stand in for an absent directory row as a directory and a file row as a file', () => {
    const profile = checkout();
    const reserved = join(profile.root, '.tau');
    mkdirSync(join(reserved, 'parameters'), { recursive: true });
    const release = holdProtectedStandIns(profile);
    expect(lstatSync(join(reserved, 'runs')).isDirectory()).toBe(true);
    expect(lstatSync(join(reserved, 'binding.json')).isFile()).toBe(true);
    // The host's own write into a stand-in is real data and survives the release.
    writeFileSync(join(reserved, 'runs', 'lease.json'), '{}');
    release();
    expect(existsSync(join(reserved, 'runs', 'lease.json'))).toBe(true);
    expect(existsSync(join(reserved, 'binding.json'))).toBe(false);
  });

  it('should not make a stand-in outside a writable root or beneath a symbolic link', () => {
    const profile = checkout();
    const elsewhere = temporary('tau-stand-in-elsewhere-');
    symlinkSync(elsewhere, join(profile.root, 'linked'));
    const release = holdProtectedStandIns({
      ...profile,
      denyWrite: [join(elsewhere, '.git'), join(profile.root, 'linked', 'hidden')],
    });
    expect(existsSync(join(elsewhere, '.git'))).toBe(false);
    expect(existsSync(join(elsewhere, 'hidden'))).toBe(false);
    release();
  });

  it('should release what a hold already took when it throws midway', () => {
    const profile = checkout();
    // A name longer than any filesystem allows: lstat throws ENAMETOOLONG rather than reporting it absent.
    const unreadable = join(profile.root, 'x'.repeat(300));
    expect(() => holdProtectedStandIns({ ...profile, denyWrite: [join(profile.root, '.git'), unreadable] })).toThrow(
      /ENAMETOOLONG/u,
    );
    expect(existsSync(join(profile.root, '.git'))).toBe(false);
    // Nothing is still counted: a fresh hold creates and its release removes again.
    const release = holdProtectedStandIns({ ...profile, denyWrite: [join(profile.root, '.git')] });
    expect(existsSync(join(profile.root, '.git'))).toBe(true);
    release();
    expect(existsSync(join(profile.root, '.git'))).toBe(false);
  });

  it('should never remove a file that replaced a stand-in, even an empty one', () => {
    const profile = checkout();
    const binding = join(profile.root, '.tau', 'binding.json');
    const release = holdProtectedStandIns({ ...profile, denyWrite: [binding] });
    // A host writer atomically replaces the stand-in with its own (empty) file: a different inode.
    writeFileSync(`${binding}.next`, '');
    renameSync(`${binding}.next`, binding);
    release();
    expect(existsSync(binding)).toBe(true);
  });

  it('should journal live stand-ins and sweep at the next start only those still empty and unchanged', () => {
    const profile = checkout();
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
