import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, resolve } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { createBrainIndex } from '#brain-index.js';

const fixtures: string[] = [];
const fixture = (): string => {
  const root = mkdtempSync(resolve(tmpdir(), 'tau-brain-index-'));
  fixtures.push(root);
  return root;
};
const write = (root: string, path: string, text: string): void => {
  mkdirSync(dirname(resolve(root, path)), { recursive: true });
  writeFileSync(resolve(root, path), text);
};

afterEach(() => {
  for (const root of fixtures.splice(0)) {
    rmSync(root, { recursive: true, force: true });
  }
});

describe('createBrainIndex', () => {
  it('answers from the Git index, so sparse-excluded Brain files still exist', () => {
    const root = fixture();
    write(root, 'research/a.md', 'a\n');
    write(root, 'research/artifacts/subject/run/README.md', 'b\n');
    const git = (...args: string[]): void => {
      execFileSync('git', ['-C', root, ...args], { stdio: 'ignore' });
    };
    git('init', '-q');
    git('add', '-A');
    git('-c', 'user.name=t', '-c', 'user.email=t@t', 'commit', '-qm', 'fixture');
    git('sparse-checkout', 'set', '--no-cone', '/*', '!/research/artifacts/*/**');
    const tracked = createBrainIndex(root);

    expect(tracked('research/artifacts/subject/run/README.md')).toBe(true);
    expect(tracked('research/artifacts/subject')).toBe(true);
    expect(tracked('research/artifacts/missing.md')).toBe(false);
    expect(createBrainIndex(resolve(root, 'absent'))('research/a.md')).toBe(false);
  });
});
