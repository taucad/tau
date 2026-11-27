/**
 * WP11: the read-only history audit counts a repository's commits by record shape and the commits no push record's
 * listed branch or tag tip reaches, from a real bare repository and push log.
 */
import { execFileSync } from 'node:child_process';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import { auditHistory } from '#store/history-audit.js';
import type { PushRecord } from '#store/manifest.js';

const roots: string[] = [];

afterEach(async () => {
  await Promise.all(roots.splice(0).map(async (root) => rm(root, { recursive: true, force: true })));
});

const pusher = 'user_PusherAccountIdA12345';
const record = (actorId: string): string =>
  `Tau-Metadata: ${JSON.stringify({
    version: 2,
    parents: [],
    provenance: {
      source: 'user',
      actor: { kind: 'user', id: actorId, ...(actorId.startsWith('anon:') ? { anonymous: true } : {}) },
      capture: 'save',
      via: 'desktop',
      createdAt: 1_790_000_000_000,
    },
    summary: { generated: 'Saved' },
  })}`;

const repository = async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'tau-history-audit-'));
  roots.push(root);
  const run = (args: string[]): string => execFileSync('git', args, { cwd: root, encoding: 'utf8' }).trim();
  run(['init', '--quiet', '--bare']);
  let parent: string | undefined;
  /** One commit on the last one (or a root commit, or on `on`), by Tau's committer when `tau`, returning its id. */
  const commit = (message: string, options: { tau?: boolean; on?: string } = {}): string => {
    const tree = run(['mktree']);
    const base = options.on ?? parent;
    const identity = [
      '-c',
      'author.name=Pusher',
      '-c',
      `author.email=${pusher}@users.noreply.tau.new`,
      '-c',
      `committer.name=${options.tau === true ? 'Tau' : 'Pusher'}`,
      '-c',
      `committer.email=${options.tau === true ? 'noreply@tau.new' : 'pusher@example.com'}`,
    ];
    const id = run([...identity, 'commit-tree', tree, ...(base === undefined ? [] : ['-p', base]), '-m', message]);
    parent = id;
    return id;
  };
  return { root, run, commit };
};

const push = (generation: number, moved: PushRecord['refs'], omitted?: number): PushRecord => ({
  generation,
  committedAt: '2026-11-27T00:00:00.000Z',
  committedBy: pusher,
  refs: moved,
  ...(omitted === undefined ? {} : { omitted }),
});

describe('auditHistory (WP11)', () => {
  it('should count history by shape and the commits only an omitted ref reaches', async () => {
    const { root, run, commit } = await repository();
    const plain = commit('Imported');
    const saved = commit(`Saved\n\n${record(pusher)}`, { tau: true });
    const anonymous = commit(`Saved\n\n${record('anon:5e1ea5ed')}`, { tau: true });
    run(['update-ref', 'refs/heads/main', anonymous]);
    /* A second branch whose only record counted it without listing it (a push of more than 64 refs). */
    const side = commit(`Saved\n\nTau-Metadata: {"version":1}`, { tau: true, on: plain });
    run(['update-ref', 'refs/heads/side', side]);
    /* A chat ref the walk never reads, and a listed tip compaction dropped. */
    run(['update-ref', 'refs/heads/chats-not-history', saved]);
    const pushes = [
      push(1, [{ ref: 'refs/heads/main', tip: saved }], 1),
      push(2, [
        { ref: 'refs/heads/main', tip: anonymous },
        { ref: 'refs/tau/records/x', tip: side },
        { ref: 'refs/heads/gone', tip: 'f'.repeat(40) },
      ]),
    ];

    expect(await auditHistory(root, pushes)).toStrictEqual({
      commits: 4,
      shapes: { git: 1, 'tau/2': 2, 'tau/other': 1 },
      tauWritten: 3,
      pseudonymous: 1,
      namesAccount: 4,
      records: 2,
      recordsWithOmitted: 1,
      omittedRefs: 1,
      missingTips: 1,
      unlisted: 1,
    });
    expect(plain).not.toBe(side);
  });

  it('should answer an empty repository with zeros', async () => {
    const { root } = await repository();
    expect(await auditHistory(root, [])).toStrictEqual({
      commits: 0,
      shapes: { git: 0, 'tau/2': 0, 'tau/other': 0 },
      tauWritten: 0,
      pseudonymous: 0,
      namesAccount: 0,
      records: 0,
      recordsWithOmitted: 0,
      omittedRefs: 0,
      missingTips: 0,
      unlisted: 0,
    });
  });
});
