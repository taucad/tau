import { execFileSync } from 'node:child_process';
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { ImmutableRevisionTree } from '#algorithms/index.js';
import { digestHex } from '#object-hash.js';
import { decodeTree, encodeTree } from '#object-store/tree-codec.js';
import { gitToolchainOnPath } from '#test/native-git-harness.js';
import { createTreeIdMemo } from '#tree-id-memo.js';
import type { TreeObject } from '#tree-id-memo.js';

const encoder = new TextEncoder();
const decoder = new TextDecoder();
const roots: string[] = [];

afterEach(async () => {
  await Promise.all(roots.splice(0).map(async (root) => rm(root, { recursive: true, force: true })));
});

const gitEnvironment: NodeJS.ProcessEnv = { ...process.env };
gitEnvironment['GIT_CONFIG_GLOBAL'] = '/dev/null';
gitEnvironment['GIT_CONFIG_NOSYSTEM'] = '1';

const git = (cwd: string, args: readonly string[], input?: string): Uint8Array<ArrayBuffer> =>
  new Uint8Array(execFileSync('git', args, { cwd, env: gitEnvironment, input }));
const gitText = (cwd: string, args: readonly string[], input?: string): string =>
  decoder.decode(git(cwd, args, input)).trim();

const repository = async (): Promise<string> => {
  const root = await mkdtemp(join(tmpdir(), 'tau-tree-codec-'));
  roots.push(root);
  git(root, ['init', '--quiet']);
  return root;
};

const treeOid = (body: Uint8Array<ArrayBuffer>): string =>
  digestHex('sha1', new Uint8Array([...encoder.encode(`tree ${String(body.byteLength)}\0`), ...body]));

describe.runIf(gitToolchainOnPath)('the tree codec against native git', () => {
  it('reads and writes every mode, and names that prefix one another, byte for byte', async () => {
    const root = await repository();
    const blob = (text: string): string => gitText(root, ['hash-object', '-w', '--stdin'], text);
    const subtree = gitText(root, ['mktree'], `100644 blob ${blob('inner\n')}\tinner.txt\n`);
    const submodule = 'c'.repeat(40);
    /* `git mktree` sorts its input into git's order; the listing here is not in it. */
    const listing = [
      `040000 tree ${subtree}\ta`,
      `100644 blob ${blob('dot\n')}\ta.b`,
      `100644 blob ${blob('dash\n')}\ta-b`,
      `100644 blob ${blob('zero\n')}\ta0`,
      `100755 blob ${blob('#!/bin/sh\n')}\trun`,
      `120000 blob ${blob('a.b')}\tlink`,
      `160000 commit ${submodule}\tsub`,
    ];
    const oid = gitText(root, ['mktree', '--missing'], `${listing.join('\n')}\n`);
    const body = git(root, ['cat-file', 'tree', oid]);

    const entries = decodeTree(body);
    /* "a/" sorts after "a.b" and "a-b" and before "a0": a directory's name is compared with its slash. */
    expect(entries.map((entry) => [entry.mode, entry.type, entry.path])).toStrictEqual([
      ['100644', 'blob', 'a-b'],
      ['100644', 'blob', 'a.b'],
      ['040000', 'tree', 'a'],
      ['100644', 'blob', 'a0'],
      ['120000', 'blob', 'link'],
      ['100755', 'blob', 'run'],
      ['160000', 'commit', 'sub'],
    ]);
    expect(entries.find((entry) => entry.path === 'a')?.oid).toBe(subtree);
    expect(entries.find((entry) => entry.path === 'sub')?.oid).toBe(submodule);

    const encoded = encodeTree(
      entries.map((entry): TreeObject['entries'][number] => ({
        name: entry.path,
        mode: entry.mode,
        oid: entry.oid,
        type: 'blob',
        content: new Uint8Array(),
      })),
    );
    expect(encoded).toStrictEqual(body);
    expect(treeOid(encoded)).toBe(oid);
  });

  it("writes the memo's trees as git writes the same files", async () => {
    const root = await repository();
    const files: ReadonlyArray<readonly [string, string]> = [
      ['a.b', 'dot\n'],
      ['a-b', 'dash\n'],
      ['a/x', 'inside\n'],
      ['a/x.y/z', 'deeper\n'],
      ['a0', 'zero\n'],
      ['ab', 'ab\n'],
    ];
    for (const [path, text] of files) {
      // oxlint-disable-next-line no-await-in-loop -- a directory is made before the file in it.
      await mkdir(join(root, path, '..'), { recursive: true });
      // oxlint-disable-next-line no-await-in-loop -- one file after another.
      await writeFile(join(root, path), text);
    }
    await writeFile(join(root, 'run'), '#!/bin/sh\n', { mode: 0o755 });
    git(root, ['add', '--all']);
    const expected = gitText(root, ['write-tree']);

    const tree = new ImmutableRevisionTree([
      ...files.map(([path, text]) => [path, encoder.encode(text)] as const),
      ['run', encoder.encode('#!/bin/sh\n'), '100755'] as const,
    ]);
    const written = createTreeIdMemo().treeObject(tree, 'sha1');
    expect(written.oid).toBe(expected);

    /* Every tree in the graph: the encoded body is git's, byte for byte. */
    const pending: TreeObject[] = [written];
    for (let next = pending.pop(); next !== undefined; next = pending.pop()) {
      const body = encodeTree(next.entries);
      expect(body).toStrictEqual(git(root, ['cat-file', 'tree', next.oid]));
      expect(treeOid(body)).toBe(next.oid);
      expect(decodeTree(body).map((entry) => entry.path)).toStrictEqual(next.entries.map((entry) => entry.name));
      for (const entry of next.entries) {
        if (entry.type === 'tree') {
          pending.push(entry.tree);
        }
      }
    }
  });
});

describe('the tree codec', () => {
  it('refuses a truncated body and an unsafe name', () => {
    const entry = (name: string): Uint8Array<ArrayBuffer> =>
      new Uint8Array([...encoder.encode(`100644 ${name}\0`), ...new Uint8Array(20)]);
    expect(() => decodeTree(entry('ok').subarray(0, 12))).toThrow(/truncated/u);
    for (const name of ['..', '.', 'a/b', String.raw`a\b`]) {
      expect(() => decodeTree(entry(name))).toThrow(/unsafe name/u);
    }
  });

  it('refuses an unknown mode', () => {
    expect(() => decodeTree(new Uint8Array([...encoder.encode('100600 x\0'), ...new Uint8Array(20)]))).toThrow(
      /unknown mode/u,
    );
  });
});
