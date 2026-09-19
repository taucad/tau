import { describe, expect, it } from 'vitest';
import { decodeCommit, encodeCommit, GitObjectError, parseChangeId, renderChangeId } from '#git-objects.js';
import { bytesToHex, digest } from '#object-hash.js';

const changeId = Uint8Array.from({ length: 16 }, (_value, index) => index * 17);
const signature = { name: 'Tau', email: 'tau@example.com', seconds: 981_147_906, offsetMinutes: 0 };
/** `git hash-object -t tree /dev/null` — the empty tree, in every Git repository. */
const tree = '4b825dc642cb6eb9a060e54bf8d69288fbee4904';

describe('object hashing', () => {
  it('reproduces the well-known empty SHA-1 and SHA-256 digests', () => {
    expect(bytesToHex(digest('sha1', new Uint8Array(0)))).toBe('da39a3ee5e6b4b0d3255bfef95601890afd80709');
    expect(bytesToHex(digest('sha256', new Uint8Array(0)))).toBe(
      'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855',
    );
  });
});

describe('commit encoding', () => {
  it('renders and parses a Jujutsu change id', () => {
    expect(parseChangeId(renderChangeId(changeId))).toStrictEqual(changeId);
    expect(renderChangeId(Uint8Array.from({ length: 16 }, () => 0))).toBe('z'.repeat(32));
  });

  it('writes headers in Jujutsu order: labels, trees, change-id, all after committer', () => {
    const commit = encodeCommit({
      objectFormat: 'sha1',
      tree,
      parents: [],
      author: signature,
      committer: signature,
      message: 'merged\n',
      changeId,
      conflictedTrees: [tree, tree, tree],
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
      tree,
      parents: [],
      author: signature,
      committer: { ...signature, offsetMinutes: -330 },
      message: 'title\n\nTau-Metadata: abc\n',
      changeId,
      conflictedTrees: [tree, tree, tree],
      conflictLabels: ['left side', 'base', 'right side'],
    });
    const decoded = decodeCommit(commit.body);
    expect(decoded).toMatchObject({
      tree,
      parents: [],
      author: signature,
      committer: { ...signature, offsetMinutes: -330 },
      message: 'title\n\nTau-Metadata: abc\n',
      changeId: renderChangeId(changeId),
      conflictedTrees: [tree, tree, tree],
      conflictLabels: ['left side', 'base', 'right side'],
    });
  });

  it('refuses an even number of conflict terms', () => {
    expect(() =>
      encodeCommit({
        objectFormat: 'sha1',
        tree,
        parents: [],
        author: signature,
        committer: signature,
        message: 'x\n',
        changeId,
        conflictedTrees: [tree, tree],
      }),
    ).toThrow(GitObjectError);
  });
});
