import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readdirSync, readFileSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  appendReviewEvent,
  changedReviewEvents,
  finishReview,
  foldReviewThreads,
  main,
  readReviewThreads,
  reviewEventId,
} from '#canvas-review.js';
import type { ReviewEvent } from '#canvas-review.js';

const temporaryPaths: string[] = [];
afterEach(() => {
  vi.restoreAllMocks();
  for (const path of temporaryPaths.splice(0)) {
    rmSync(path, { recursive: true, force: true });
  }
});

const git = (cwd: string, ...arguments_: string[]): string =>
  execFileSync('git', arguments_, { cwd, encoding: 'utf8' }).trim();

/** A Git repository with `artifacts/demo/` holding one canvas file, like Tau Brain. */
const repository = (): { root: string; artifacts: string; canvas: string } => {
  const root = mkdtempSync(resolve(tmpdir(), 'tau-canvas-review-'));
  temporaryPaths.push(root);
  const artifacts = join(root, 'artifacts');
  mkdirSync(join(artifacts, 'demo'), { recursive: true });
  writeFileSync(join(artifacts, 'demo', 'index.html'), '<main></main>');
  git(root, 'init', '--quiet');
  git(root, 'config', 'user.name', 'Test');
  git(root, 'config', 'user.email', 'test@example.com');
  git(root, 'config', 'commit.gpgsign', 'false');
  git(root, 'add', '.');
  git(root, 'commit', '--quiet', '-m', 'init');
  return { root, artifacts, canvas: 'demo' };
};

const comment = {
  type: 'comment',
  author: { kind: 'person', name: 'Reviewer' },
  body: 'The tab label repeats the file name.',
  anchor: { target: { kind: 'role', role: 'tab', name: 'main.ts' }, offset: { x: 0.4, y: 0.5 }, excerpt: 'main.ts' },
  context: {
    canvas: 'demo',
    url: '/',
    scenario: 's1',
    theme: 'dark',
    viewport: { width: 1440, height: 900 },
    textScale: 1,
    source: 'sha256:0',
  },
};
const agent = { kind: 'agent', name: 'claude' };

describe('canvas review events', () => {
  it('should write a create-only, content-addressed file and fold replies and resolutions into its thread', async () => {
    const { artifacts, canvas } = repository();
    const written = await appendReviewEvent({
      canvas,
      root: artifacts,
      event: comment,
      now: new Date('2026-09-27T10:00:00Z'),
    });
    expect(written.status).toBe('written');
    if (written.status !== 'written') {
      return;
    }
    const { id, ...rest } = written.event;
    expect(id).toBe(reviewEventId(rest));
    expect(written.path).toBe(`demo/review/2026-09-27T10-00-00.000Z-${id}.json`);
    expect(JSON.parse(readFileSync(join(artifacts, written.path), 'utf8'))).toEqual(written.event);

    await appendReviewEvent({
      canvas,
      root: artifacts,
      event: { type: 'reply', author: agent, thread: id, body: 'On it.' },
      now: new Date('2026-09-27T10:01:00Z'),
    });
    await appendReviewEvent({
      canvas,
      root: artifacts,
      event: { type: 'resolve', author: agent, thread: id, note: 'Fixed.', changes: ['abc123'] },
      now: new Date('2026-09-27T10:02:00Z'),
    });
    const [thread] = await readReviewThreads({ canvas, root: artifacts });
    expect(thread?.status).toBe('resolved');
    expect(thread?.history.map((event) => event.type)).toEqual(['reply', 'resolve']);
    expect(await readReviewThreads({ canvas, root: artifacts, status: 'open' })).toEqual([]);

    const again = await appendReviewEvent({
      canvas,
      root: artifacts,
      event: { type: 'resolve', author: agent, thread: id, note: 'Again.' },
    });
    expect(again).toMatchObject({ status: 'refused', code: 'THREAD_RESOLVED' });
    await appendReviewEvent({
      canvas,
      root: artifacts,
      event: {
        type: 'reopen',
        author: { kind: 'person', name: 'Reviewer' },
        thread: id,
        body: 'Still wrong in light.',
      },
      now: new Date('2026-09-27T10:03:00Z'),
    });
    const [reopened] = await readReviewThreads({ canvas, root: artifacts });
    expect(reopened?.status).toBe('open');
  });

  it('should refuse the same event twice in the same millisecond instead of overwriting it', async () => {
    const { artifacts, canvas } = repository();
    const now = new Date('2026-09-27T10:00:00Z');
    await appendReviewEvent({ canvas, root: artifacts, event: comment, now });
    expect(await appendReviewEvent({ canvas, root: artifacts, event: comment, now })).toMatchObject({
      status: 'refused',
      code: 'WRITE_FAILED',
    });
  });

  it.each([
    ['a comment without an anchor', { ...comment, anchor: undefined }, 'INVALID_EVENT'],
    ['an empty body', { ...comment, body: '  ' }, 'INVALID_EVENT'],
    [
      'an offset outside the element',
      { ...comment, anchor: { ...comment.anchor, offset: { x: 2, y: 0 } } },
      'INVALID_EVENT',
    ],
    ['an unknown type', { ...comment, type: 'label' }, 'INVALID_EVENT'],
    ['a reply to no thread', { type: 'reply', author: agent, thread: 'nope', body: 'x' }, 'THREAD_NOT_FOUND'],
    ['a resolve without a thread', { type: 'resolve', author: agent, note: 'x' }, 'INVALID_EVENT'],
  ])('should refuse %s', async (_, event, code) => {
    const { artifacts, canvas } = repository();
    expect(await appendReviewEvent({ canvas, root: artifacts, event })).toMatchObject({ status: 'refused', code });
  });

  it('should refuse a canvas outside the artifacts root', async () => {
    const { artifacts } = repository();
    expect(await appendReviewEvent({ canvas: '../..', root: artifacts, event: comment })).toMatchObject({
      code: 'INVALID_EVENT',
    });
  });

  it('should refuse a canvas as invalid when the artifacts root is absent', async () => {
    const { root, canvas } = repository();
    const missing = join(root, 'missing-artifacts');
    expect(await appendReviewEvent({ canvas, root: missing, event: comment })).toMatchObject({
      status: 'refused',
      code: 'INVALID_EVENT',
      message: `\`${canvas}\` is not a canvas directory: ${missing} does not exist.`,
    });
    await expect(readReviewThreads({ canvas, root: missing })).rejects.toThrow(`${missing} does not exist.`);
  });

  it('should ignore events for unknown threads and order by time when folding', () => {
    const base = { author: { kind: 'agent', name: 'a' } } as const;
    const events = [
      { ...base, id: 'r', at: '2026-01-01T00:00:02Z', type: 'reply', thread: 'c', body: 'x' },
      { ...base, id: 'o', at: '2026-01-01T00:00:03Z', type: 'reply', thread: 'missing', body: 'x' },
      { ...base, ...comment, id: 'c', at: '2026-01-01T00:00:01Z' },
    ] as unknown as ReviewEvent[];
    const threads = foldReviewThreads(events);
    expect(threads).toHaveLength(1);
    expect(threads[0]?.history.map((event) => event.id)).toEqual(['r']);
  });
});

describe('finishing a review', () => {
  it('should commit new events by path, leaving other staged work alone, and refuse edits to committed events', async () => {
    const { root, artifacts, canvas } = repository();
    writeFileSync(join(root, 'staged.md'), 'peer work');
    git(root, 'add', 'staged.md');
    expect(await finishReview({ canvas, root: artifacts })).toEqual({ status: 'unchanged' });

    await appendReviewEvent({ canvas, root: artifacts, event: comment });
    const finished = await finishReview({ canvas, root: artifacts });
    expect(finished).toMatchObject({ status: 'committed', events: 1 });
    expect(git(root, 'show', '--name-only', '--format=%s', 'HEAD').split('\n')).toEqual([
      'docs(research): Record review feedback on demo',
      '',
      expect.stringMatching(/^artifacts\/demo\/review\/.+\.json$/),
    ]);
    expect(git(root, 'diff', '--cached', '--name-only')).toBe('staged.md');
    expect(await finishReview({ canvas, root: artifacts })).toEqual({ status: 'unchanged' });

    const [file] = readdirSync(join(artifacts, 'demo', 'review'));
    writeFileSync(join(artifacts, 'demo', 'review', file!), '{}');
    expect(changedReviewEvents(artifacts)).toEqual([`artifacts/demo/review/${file}`]);
    expect(await finishReview({ canvas, root: artifacts })).toMatchObject({ status: 'refused', code: 'INVALID_EVENT' });
  });

  it('should read a status larger than the default 1 MiB child-process buffer', async () => {
    const { root, artifacts, canvas } = repository();
    await appendReviewEvent({ canvas, root: artifacts, event: comment });
    await finishReview({ canvas, root: artifacts });
    // Disposable evidence beside the canvas, as other programs leave it in Tau Brain.
    const evidence = join(artifacts, canvas, 'evidence');
    mkdirSync(evidence);
    const name = 'x'.repeat(240);
    for (let index = 0; index < 4400; index += 1) {
      writeFileSync(join(evidence, `${index}-${name}.txt`), '');
    }
    const [file] = readdirSync(join(artifacts, canvas, 'review'));
    writeFileSync(join(artifacts, canvas, 'review', file!), '{}');
    const status = execFileSync('git', ['status', '--porcelain=v1', '-z', '--untracked-files=all'], {
      cwd: root,
      maxBuffer: 16 * 1024 * 1024,
    });
    expect(status.byteLength).toBeGreaterThan(1024 * 1024);
    expect(changedReviewEvents(artifacts)).toEqual([`artifacts/demo/review/${file}`]);
  }, 60_000);

  it('should name the repository in one line when the Git status cannot be read', () => {
    const { root, artifacts } = repository();
    writeFileSync(join(root, '.git', 'index'), 'corrupt');
    expect(() => changedReviewEvents(artifacts)).toThrow(
      new RegExp(`^Could not read the Git status of ${realpathSync(root)} \\(0 bytes read\\): [^\\n]+$`),
    );
  });

  it('should report a canvas outside Git as read-only', async () => {
    const artifacts = mkdtempSync(resolve(tmpdir(), 'tau-canvas-review-nogit-'));
    temporaryPaths.push(artifacts);
    mkdirSync(join(artifacts, 'demo'));
    await appendReviewEvent({ canvas: 'demo', root: artifacts, event: comment });
    expect(await finishReview({ canvas: 'demo', root: artifacts })).toMatchObject({
      status: 'refused',
      code: 'READ_ONLY',
    });
    expect(changedReviewEvents(artifacts)).toEqual([]);
    expect(changedReviewEvents(join(artifacts, 'absent'))).toEqual([]);
  });
});

describe('canvas-review CLI', () => {
  it('should refuse unknown commands and missing canvases with a code', async () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    expect(await main(['frobnicate'])).toBe(2);
    expect(await main(['list', 'no/such/canvas'])).toBe(1);
    expect(error.mock.calls.at(-1)?.[0]).toMatch(/^INVALID_EVENT: /);
  });
});
