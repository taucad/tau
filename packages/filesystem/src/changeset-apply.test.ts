import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { MockInstance } from 'vitest';
import { CrossTabCoordinator } from '#cross-tab-coordinator.js';
import { changeEventEntries } from '#changeset.js';
import { createWorkspaceFileService } from '#testing/workspace-service-harness.js';
import type { WorkspaceHarness } from '#testing/workspace-service-harness.js';
import type { ChangesetEntry } from '#changeset.js';
import type { ChangeEvent } from '#types.js';
import type { RootedFileSystem } from '#rooted-views.js';

/** A rooted view's `apply`, which every authority view offers. */
const applyOf = (rooted: RootedFileSystem): NonNullable<RootedFileSystem['apply']> => {
  if (rooted.apply === undefined) {
    throw new Error('A rooted view of the authority offers apply.');
  }
  return rooted.apply.bind(rooted);
};

/**
 * `apply(changeset)` through the authority: one lock set, one change event and
 * one cross-tab notice per changeset, whatever it holds (D2); and conveniences
 * issued in one task coalescing into one changeset (D22).
 */
describe('apply', () => {
  let coordinator: CrossTabCoordinator;
  let context: WorkspaceHarness;
  let events: ChangeEvent[];
  let notifyChanges: MockInstance<CrossTabCoordinator['notifyChanges']>;
  let queueForClaims: MockInstance;

  beforeEach(async () => {
    coordinator = new CrossTabCoordinator();
    notifyChanges = vi.spyOn(coordinator, 'notifyChanges');
    context = await createWorkspaceFileService({ crossTabCoordinator: coordinator });
    events = [];
    context.eventBus.subscribe((event) => events.push(event));
    queueForClaims = vi.spyOn(context.resourceQueue, 'queueForClaims');
  });

  afterEach(() => {
    context.service.dispose();
    coordinator.dispose();
  });

  it('should apply 100 writes under one lock set, with one change event and one notice', async () => {
    const rooted = context.service.createRootedFileSystem('/');
    const entries = Array.from(
      { length: 100 },
      (_, index): ChangesetEntry => ({
        op: 'write',
        path: `src/file-${String(index)}.ts`,
        data: `export const value = ${String(index)};\n`,
      }),
    );

    const receipt = await applyOf(rooted)({ entries: [{ op: 'mkdir', path: 'src', recursive: true }, ...entries] });

    expect(receipt.state).toBe('applied');
    expect(queueForClaims).toHaveBeenCalledTimes(1);
    expect(events).toHaveLength(1);
    expect(changeEventEntries(events[0]!).filter(({ type }) => type === 'fileWritten')).toHaveLength(100);
    expect(notifyChanges).toHaveBeenCalledTimes(1);
    await expect(rooted.readFile('src/file-99.ts', 'utf8')).resolves.toBe('export const value = 99;\n');
  });

  it('should report a refused entry, skip the later phase, and publish only what applied', async () => {
    const rooted = context.service.createRootedFileSystem('/');
    await rooted.writeFile('taken.txt', 'mine');
    events.length = 0;

    const receipt = await applyOf(rooted)({
      entries: [
        { op: 'write', path: 'taken.txt', data: 'theirs', create: true },
        { op: 'write', path: 'free.txt', data: 'free' },
        { op: 'delete', path: 'free.txt', phase: 1 },
      ],
    });

    expect(receipt.entries.map(({ outcome }) => outcome)).toEqual(['failed', 'applied', 'skipped']);
    expect(receipt.state).toBe('partially-applied');
    await expect(rooted.readFile('taken.txt', 'utf8')).resolves.toBe('mine');
    expect(
      events
        .flatMap((event) => changeEventEntries(event))
        .map(({ type, ...rest }) => [type, 'path' in rest ? rest.path : undefined]),
    ).toEqual([['fileWritten', '/free.txt']]);
  });

  it('should refuse overlapping entries of one phase before taking any lock', async () => {
    const rooted = context.service.createRootedFileSystem('/');

    await expect(
      applyOf(rooted)({
        entries: [
          { op: 'write', path: 'dir/a.txt', data: 'a' },
          { op: 'delete', path: 'dir', recursive: true },
        ],
      }),
    ).rejects.toMatchObject({ code: 'EINVAL' });
    expect(queueForClaims).not.toHaveBeenCalled();
    expect(events).toEqual([]);
  });

  it('should coalesce conveniences started together into one changeset', async () => {
    const files = Array.from({ length: 20 }, (_, index) => `/c-${String(index)}.txt`);

    await Promise.all(files.map(async (path) => context.service.writeFile(path, path)));

    expect(queueForClaims).toHaveBeenCalledTimes(1);
    expect(events).toHaveLength(1);
    expect(notifyChanges).toHaveBeenCalledTimes(1);
    await expect(context.service.readFile('/c-19.txt', 'utf8')).resolves.toBe('/c-19.txt');
  });

  it('should flush a pending changeset before an entry that would race it, and keep their order', async () => {
    const writing = context.service.writeFile('/race.txt', 'first');
    const deleting = context.service.unlink('/race.txt');

    await Promise.all([writing, deleting]);

    expect(queueForClaims).toHaveBeenCalledTimes(2);
    await expect(context.service.exists('/race.txt')).resolves.toBe(false);
  });

  it('should answer each coalesced caller with its own outcome', async () => {
    await context.service.writeFile('/exists.txt', 'here');
    queueForClaims.mockClear();

    const results = await Promise.allSettled([
      context.service.writeFile('/new.txt', 'new'),
      context.service.unlink('/missing.txt'),
    ]);

    expect(queueForClaims).toHaveBeenCalledTimes(1);
    expect(results[0]).toEqual({ status: 'fulfilled', value: undefined });
    expect(results[1]).toMatchObject({ status: 'rejected' });
    await expect(context.service.readFile('/new.txt', 'utf8')).resolves.toBe('new');
  });
});
