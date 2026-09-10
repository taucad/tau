import { describe, expect, it } from 'vitest';
import {
  decodeCommit,
  decodeTree,
  encodeBlob,
  encodeCommit,
  encodeTree,
  encodeTreeGraph,
  GitObjectError,
  parseChangeId,
  renderChangeId,
} from '#git-objects.js';
import { bytesToHex, digest } from '#object-hash.js';

const encoder = new TextEncoder();
const changeId = Uint8Array.from({ length: 16 }, (_value, index) => index * 17);
const signature = { name: 'Tau', email: 'tau@example.com', seconds: 981_147_906, offsetMinutes: 0 };

describe('object hashing', () => {
  it('reproduces the well-known empty SHA-1 and SHA-256 digests', () => {
    expect(bytesToHex(digest('sha1', new Uint8Array(0)))).toBe('da39a3ee5e6b4b0d3255bfef95601890afd80709');
    expect(bytesToHex(digest('sha256', new Uint8Array(0)))).toBe(
      'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855',
    );
  });

  it('gives a blob the identity Git gives it', () => {
    // `printf 'hello\n' | git hash-object --stdin`
    expect(encodeBlob('sha1', encoder.encode('hello\n')).id).toBe('ce013625030ba8dba906f756967f9e9ca394464a');
  });
});

describe('tree encoding', () => {
  it('orders a directory as if its name ended with a slash', () => {
    const graph = encodeTreeGraph('sha1', [
      { path: 'a.txt', mode: '100644', content: encoder.encode('a\n') },
      { path: 'a/b.txt', mode: '100644', content: encoder.encode('b\n') },
    ]);
    const entries = decodeTree('sha1', graph.tree.body);
    expect(entries.map((entry) => `${entry.mode} ${entry.name}`)).toStrictEqual(['100644 a.txt', '40000 a']);
  });

  it('round-trips a nested tree through decodeTree', () => {
    const graph = encodeTreeGraph('sha1', [
      { path: 'src/index.ts', mode: '100644', content: encoder.encode('export {};\n') },
      { path: 'README.md', mode: '100644', content: encoder.encode('# tau\n') },
    ]);
    const root = decodeTree('sha1', graph.tree.body);
    expect(root.map((entry) => entry.name)).toStrictEqual(['README.md', 'src']);
    expect(encodeTree('sha1', root).id).toBe(graph.tree.id);
  });

  it('refuses a path that collides with a file', () => {
    expect(() =>
      encodeTreeGraph('sha1', [
        { path: 'a', mode: '100644', content: encoder.encode('a') },
        { path: 'a/b', mode: '100644', content: encoder.encode('b') },
      ]),
    ).toThrow(GitObjectError);
  });
});

describe('commit encoding', () => {
  const { tree } = encodeTreeGraph('sha1', [{ path: 'a.txt', mode: '100644', content: encoder.encode('a\n') }]);

  it('renders and parses a Jujutsu change id', () => {
    expect(parseChangeId(renderChangeId(changeId))).toStrictEqual(changeId);
    expect(renderChangeId(Uint8Array.from({ length: 16 }, () => 0))).toBe('z'.repeat(32));
  });

  it('writes headers in Jujutsu order: labels, trees, change-id, all after committer', () => {
    const commit = encodeCommit({
      objectFormat: 'sha1',
      tree: tree.id,
      parents: [],
      author: signature,
      committer: signature,
      message: 'merged\n',
      changeId,
      conflictedTrees: [tree.id, tree.id, tree.id],
      conflictLabels: ['left', 'base', 'right'],
    });
    const headers = new TextDecoder()
      .decode(commit.body)
      .split('\n\n')[0]!
      .split('\n')
      .filter((line) => !line.startsWith(' '))
      .map((line) => line.split(' ')[0]);
    expect(headers).toStrictEqual(['tree', 'author', 'committer', 'jj:conflict-labels', 'jj:trees', 'change-id']);
  });

  it('round-trips every header through decodeCommit', () => {
    const commit = encodeCommit({
      objectFormat: 'sha1',
      tree: tree.id,
      parents: [],
      author: signature,
      committer: { ...signature, offsetMinutes: -330 },
      message: 'title\n\nTau-Metadata: abc\n',
      changeId,
      conflictedTrees: [tree.id, tree.id, tree.id],
      conflictLabels: ['left side', 'base', 'right side'],
    });
    const decoded = decodeCommit(commit.body);
    expect(decoded).toMatchObject({
      tree: tree.id,
      parents: [],
      author: signature,
      committer: { ...signature, offsetMinutes: -330 },
      message: 'title\n\nTau-Metadata: abc\n',
      changeId: renderChangeId(changeId),
      conflictedTrees: [tree.id, tree.id, tree.id],
      conflictLabels: ['left side', 'base', 'right side'],
    });
  });

  it('refuses an even number of conflict terms', () => {
    expect(() =>
      encodeCommit({
        objectFormat: 'sha1',
        tree: tree.id,
        parents: [],
        author: signature,
        committer: signature,
        message: 'x\n',
        changeId,
        conflictedTrees: [tree.id, tree.id],
      }),
    ).toThrow(GitObjectError);
  });
});
