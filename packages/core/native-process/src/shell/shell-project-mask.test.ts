import { mkdirSync, mkdtempSync, realpathSync, rmSync, symlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import { bindMaskedDirectories, maskProblem } from '#shell/shell-project-mask.js';
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
    expect(appended).toContain('[tT][aA][uU][. ]*(:[^/]*)?');
    expect(argv[2]).not.toContain('Reserved directory');
  });
  it('should refuse an unrecognized sandbox vector', () => {
    expect(bindMaskedDirectories(['/bin/bash', '-c', 'true'], fixture())).toBeUndefined();
  });
});
