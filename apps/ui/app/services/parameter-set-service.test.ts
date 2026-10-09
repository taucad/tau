import { createElement } from 'react';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { TooltipProvider } from '@taucad/ui/components/tooltip';
import { ParametersNumber } from '#components/geometry/parameters/parameters-number.js';
import type { ParameterCommit } from '#components/geometry/parameters/rjsf-context.js';
import { parameterEntryPath } from '@taucad/types';
import { compileParameterManifest } from '@taucad/parameters';
import type { ParameterManifest, ParameterSetOutcome, ParameterSetRequestBase } from '@taucad/parameters';
import { describe, expect, it, vi } from 'vitest';
import { createParameterSetService } from '#services/parameter-set-service.js';

const encoder = new TextEncoder();
const decoder = new TextDecoder();
type ManifestRevision = ParameterManifest['identity']['dependency'];
const revision = (value: string): ManifestRevision => value as ManifestRevision;
const digestBytes = async (bytes: Uint8Array<ArrayBuffer>): Promise<ManifestRevision> => {
  const digest = new Uint8Array(await globalThis.crypto.subtle.digest('SHA-256', bytes));
  return revision(`sha256:${[...digest].map((byte) => byte.toString(16).padStart(2, '0')).join('')}`);
};
const sameBytes = (
  left: Uint8Array<ArrayBuffer> | undefined,
  // oxlint-disable-next-line typescript-eslint/no-restricted-types -- checked-write absence is represented as null by the filesystem contract.
  right: Uint8Array<ArrayBuffer> | string | null,
): boolean => {
  if (right === null) {
    return left === undefined;
  }
  const expected = typeof right === 'string' ? encoder.encode(right) : right;
  return (
    left !== undefined &&
    left.byteLength === expected.byteLength &&
    left.every((value, index) => value === expected[index])
  );
};

/** With no published entry map, the settled record on disk is the durable statement of the values. */
const parseEntry = (bytes: Uint8Array<ArrayBuffer> | undefined): unknown =>
  bytes === undefined ? undefined : JSON.parse(decoder.decode(bytes));

const fixtureRoot = '/projects/fixture';
const fixtureRecordPath = `${fixtureRoot}/${parameterEntryPath('main.ts')}`;
const lengthKind = 'http://qudt.org/vocab/quantitykind/Length';

type WriteInput = Parameters<Parameters<typeof createParameterSetService>[0]['client']['writeFileChecked']>[0];

/** The effective binding every fixture field carries, so a `base` matches what the planner resolves. */
const fixtureBinding: NonNullable<ParameterSetRequestBase['binding']> = {
  unit: 'mm',
  quantityKind: lengthKind,
  space: 'linear',
  representation: 'binary64',
};

/** One project over an in-memory checked filesystem that enforces every precondition. */
const serviceFixture = (initialRecord?: string, watchReady = Promise.resolve()) => {
  const files = new Map<string, Uint8Array<ArrayBuffer>>([[`${fixtureRoot}/main.ts`, encoder.encode('source:1')]]);
  if (initialRecord !== undefined) {
    files.set(fixtureRecordPath, encoder.encode(initialRecord));
  }
  const listeners = new Map<string, Set<() => void>>();
  const watchClosed = Promise.withResolvers<void>();
  let watchEvent: ((event: { type: string }) => void) | undefined;
  const exists = vi.fn(async (path: string) => files.has(path));
  let gate: Promise<void> | undefined;
  const nextWriteGates: Array<Promise<void>> = [];
  let loseNextReply = false;
  const writes: WriteInput[] = [];
  const writeAttempts: WriteInput[] = [];
  const writeFileChecked = async (input: WriteInput) => {
    writeAttempts.push(input);
    await (nextWriteGates.shift() ?? gate);
    const conflict = input.preconditions.find(({ path, expected }) => !sameBytes(files.get(path), expected));
    if (conflict !== undefined) {
      const actual = files.get(conflict.path);
      return {
        status: 'conflict',
        conflicts: [{ path: conflict.path, actual: actual === undefined ? null : new Uint8Array(actual) }],
      } as const;
    }
    const data = typeof input.data === 'string' ? encoder.encode(input.data) : new Uint8Array(input.data);
    files.set(input.path, data);
    writes.push(input);
    if (loseNextReply) {
      loseNextReply = false;
      files.set(input.path, encoder.encode('{"lost": true}'));
      throw new Error('Reply lost');
    }
    return { status: 'applied', content: new Uint8Array(data) } as const;
  };
  // oxlint-disable-next-line @typescript-eslint/consistent-type-assertions -- structural test double covers the service's authority seam
  const client = {
    exists,
    readFile: async (path: string) => new Uint8Array(files.get(path) ?? new Uint8Array()),
    writeFileChecked,
    move: async (source: string, target: string) => {
      files.set(target, files.get(source)!);
      files.delete(source);
    },
    unlink: async (path: string) => {
      files.delete(path);
    },
    rmdir: async () => undefined,
    mkdir: async () => undefined,
  } as unknown as Parameters<typeof createParameterSetService>[0]['client'];
  const createService = () =>
    createParameterSetService({
      rootDirectory: fixtureRoot,
      client,
      watchReady: ({ paths }, onEvent) => {
        watchEvent = onEvent;
        const stops = paths.map((path) => {
          const listener = (): void => {
            onEvent({ type: 'change' });
          };
          const current = listeners.get(path) ?? new Set();
          current.add(listener);
          listeners.set(path, current);
          return () => current.delete(listener);
        });
        return {
          ready: watchReady,
          closed: watchClosed.promise,
          unsubscribe: () => {
            for (const stop of stops) {
              stop();
            }
          },
        };
      },
    });
  const service = createService();
  const manifestFor = async (source = 'source:1'): Promise<ParameterManifest> => {
    const sourceRevision = await digestBytes(encoder.encode(source));
    return compileParameterManifest({
      declaration: {
        schema: {
          $schema: 'https://json-structure.org/meta/extended/v0/#',
          $id: 'urn:test:service-parameters',
          $uses: ['JSONSchemaUnits'],
          name: 'Parameters',
          type: 'object',
          properties: {
            width: { type: 'double', ucumUnit: 'mm' },
            height: { type: 'double', ucumUnit: 'mm' },
            label: { type: 'string' },
          },
        },
        defaults: { width: 100, height: 10, label: 'box' },
        bindings: {
          '/width': { parameterId: 'width', quantityKind: lengthKind, space: 'linear' },
          '/height': { parameterId: 'height', quantityKind: lengthKind, space: 'linear' },
        },
      },
      scope: { kind: 'source', authority: 'browser-filesystem', root: fixtureRoot, entry: 'main.ts' },
      source: { id: 'fixture', version: '1', revision: sourceRevision, capability: 'json-structure' },
      dependency: sourceRevision,
      middleware: sourceRevision,
      sourceFiles: { 'main.ts': sourceRevision },
    });
  };
  const commit = async (
    manifest: ParameterManifest,
    input: Readonly<{
      pointer: '/height' | '/width';
      value: number;
      base?: number;
      pressure?: 'final' | 'transient';
    }>,
  ) =>
    service.commitValue(service.target('main.ts'), manifest, {
      group: 'default',
      pointer: input.pointer,
      value: input.value,
      ...(input.base === undefined
        ? {}
        : { base: { pointer: input.pointer, value: input.base, binding: fixtureBinding } }),
      ...(input.pressure === 'transient' ? { pressure: 'transient' } : { pressure: 'final' }),
    });
  const draftKey = (pointer: string) => ({
    target: service.target('main.ts'),
    group: 'default',
    pointer,
  });
  const stored = (name: string): unknown =>
    (parseEntry(files.get(fixtureRecordPath)) as { groups?: Record<string, { values: Record<string, unknown> }> })
      .groups?.['default']?.values[name];
  return {
    service,
    createPeerService: createService,
    writeAttempts,
    exists,
    closeWatch: () => {
      watchClosed.resolve();
    },
    resetWatch: () => watchEvent?.({ type: 'reset' }),
    files,
    writes,
    manifestFor,
    commit,
    draftKey,
    stored,
    setSource: (text: string) => {
      files.set(`${fixtureRoot}/main.ts`, encoder.encode(text));
    },
    notify: () => {
      for (const listener of listeners.get(parameterEntryPath('main.ts')) ?? []) {
        listener();
      }
    },
    listeners,
    hold: () => {
      const release = Promise.withResolvers<void>();
      gate = release.promise;
      return () => {
        gate = undefined;
        release.resolve();
      };
    },
    holdNextWrite: () => {
      const release = Promise.withResolvers<void>();
      nextWriteGates.push(release.promise);
      return () => {
        release.resolve();
      };
    },
    loseNextReply: () => {
      loseNextReply = true;
    },
  };
};

describe('parameter set service behaviours', () => {
  it.each(['reset', 'closed'] as const)(
    'waits for actual watch acknowledgement and preserves %s diagnostics',
    async (type) => {
      const ready = Promise.withResolvers<void>();
      const fixture = serviceFixture(undefined, ready.promise);
      const manifest = await fixture.manifestFor();
      const resolving = fixture.service.resolve('main.ts', manifest);
      await vi.waitFor(() => {
        expect(fixture.service.actor('main.ts')).toBeDefined();
      });
      expect(fixture.exists).not.toHaveBeenCalled();
      ready.resolve();
      await resolving;
      if (type === 'reset') {
        fixture.resetWatch();
      } else {
        fixture.closeWatch();
      }
      await vi.waitFor(() => {
        expect(fixture.service.actor('main.ts')?.getSnapshot().context.diagnostic?.code).toBe(
          type === 'reset' ? 'WATCH_RESET' : 'WATCH_CLOSED',
        );
      });
      await fixture.service.close();
    },
  );

  it('commits each field against the live manifest after a source edit', async () => {
    const fixture = serviceFixture();
    const first = await fixture.manifestFor();
    await fixture.service.resolve('main.ts', first);
    expect(await fixture.commit(first, { pointer: '/width', value: 110, base: 100 })).toMatchObject({
      status: 'committed',
    });

    fixture.setSource('source:2');
    const edited = await fixture.manifestFor('source:2');
    await fixture.service.resolve('main.ts', edited);
    expect(await fixture.commit(edited, { pointer: '/width', value: 120, base: 110 })).toMatchObject({
      status: 'committed',
    });
    expect(await fixture.commit(edited, { pointer: '/height', value: 12, base: 10 })).toMatchObject({
      status: 'committed',
    });

    expect([fixture.stored('width'), fixture.stored('height')]).toEqual([120, 12]);
    expect(fixture.writes).toHaveLength(3);
    await fixture.service.close();
  });

  it('refuses a second edit of the same field from a superseded base and commits from the fresh one', async () => {
    const fixture = serviceFixture();
    const manifest = await fixture.manifestFor();
    await fixture.service.resolve('main.ts', manifest);
    const release = fixture.hold();
    const first = fixture.commit(manifest, { pointer: '/width', value: 30, base: 100 });
    const stale = fixture.commit(manifest, { pointer: '/width', value: 40, base: 100 });
    release();

    expect(await first).toMatchObject({ status: 'committed' });
    expect(await stale).toMatchObject({ code: 'STALE_MANIFEST' });
    expect(await fixture.commit(manifest, { pointer: '/width', value: 40, base: 30 })).toMatchObject({
      status: 'committed',
    });
    expect(fixture.stored('width')).toBe(40);
    await fixture.service.close();
  });

  it('settles two independent service edits against an absent sidecar with exactly one same-base winner', async () => {
    const fixture = serviceFixture();
    const peer = fixture.createPeerService();
    const manifest = await fixture.manifestFor();
    await Promise.all([fixture.service.resolve('main.ts', manifest), peer.resolve('main.ts', manifest)]);
    const firstActor = fixture.service.actor('main.ts');
    const secondActor = peer.actor('main.ts');
    if (!firstActor || !secondActor) {
      throw new Error('Expected two resolved parameter actors');
    }
    expect(firstActor).not.toBe(secondActor);
    const firstSettled: ParameterSetOutcome[] = [];
    const secondSettled: ParameterSetOutcome[] = [];
    const firstSubscription = firstActor.on('settled', ({ outcome }) => {
      firstSettled.push(outcome);
    });
    const secondSubscription = secondActor.on('settled', ({ outcome }) => {
      secondSettled.push(outcome);
    });
    const release = fixture.hold();
    const first = fixture.commit(manifest, { pointer: '/width', value: 21, base: 100 });
    const second = peer.commitValue(peer.target('main.ts'), manifest, {
      group: 'default',
      pointer: '/width',
      value: 22,
      base: { pointer: '/width', value: 100, binding: fixtureBinding },
    });
    const outcomes = Promise.all([first, second]);
    try {
      await vi.waitFor(() => {
        expect(fixture.writeAttempts).toHaveLength(2);
      });
      expect(fixture.files.has(fixtureRecordPath)).toBe(false);
      expect(fixture.writes).toHaveLength(0);
      expect(firstSettled).toHaveLength(0);
      expect(secondSettled).toHaveLength(0);
      for (const attempt of fixture.writeAttempts) {
        expect(attempt.preconditions).toEqual([{ path: fixtureRecordPath, expected: null }]);
      }
      release();
      const [firstOutcome, secondOutcome] = await outcomes;
      expect([firstOutcome.status, secondOutcome.status].toSorted()).toEqual(['committed', 'rejected']);
      expect(firstOutcome.status === 'committed' ? secondOutcome : firstOutcome).toMatchObject({
        status: 'rejected',
        code: 'STALE_MANIFEST',
      });
      expect(firstSettled).toEqual([firstOutcome]);
      expect(secondSettled).toEqual([secondOutcome]);
      expect(fixture.writes).toHaveLength(1);
      expect(fixture.stored('width')).toBe(firstOutcome.status === 'committed' ? 21 : 22);
    } finally {
      release();
      await Promise.allSettled([outcomes]);
      firstSubscription.unsubscribe();
      secondSubscription.unsubscribe();
      await Promise.all([fixture.service.close(), peer.close()]);
    }
  });

  it('commits another field while one field is superseded', async () => {
    const fixture = serviceFixture();
    const manifest = await fixture.manifestFor();
    await fixture.service.resolve('main.ts', manifest);
    await fixture.commit(manifest, { pointer: '/width', value: 30, base: 100 });

    expect(await fixture.commit(manifest, { pointer: '/height', value: 12, base: 10 })).toMatchObject({
      status: 'committed',
    });
    expect([fixture.stored('width'), fixture.stored('height')]).toEqual([30, 12]);
    await fixture.service.close();
  });

  it('reports a lost write reply as indeterminate', async () => {
    const fixture = serviceFixture();
    const manifest = await fixture.manifestFor();
    await fixture.service.resolve('main.ts', manifest);
    fixture.loseNextReply();

    expect(await fixture.commit(manifest, { pointer: '/width', value: 30, base: 100 })).toMatchObject({
      status: 'indeterminate',
    });
  });

  it('keeps only the newest queued value of one dragged field', async () => {
    const fixture = serviceFixture();
    const manifest = await fixture.manifestFor();
    await fixture.service.resolve('main.ts', manifest);
    const release = fixture.hold();
    const busy = fixture.commit(manifest, { pointer: '/height', value: 11, base: 10 });
    const dropped = fixture.commit(manifest, { pointer: '/width', value: 30, base: 100, pressure: 'transient' });
    const displaced = fixture.commit(manifest, { pointer: '/width', value: 35, base: 100, pressure: 'transient' });
    const final = fixture.commit(manifest, { pointer: '/width', value: 40, base: 100 });
    release();

    expect(await busy).toMatchObject({ status: 'committed' });
    expect(await dropped).toMatchObject({ status: 'cancelled-before-apply' });
    expect(await displaced).toMatchObject({ status: 'cancelled-before-apply' });
    expect(await final).toMatchObject({ status: 'committed' });
    expect([fixture.stored('width'), fixture.stored('height')]).toEqual([40, 11]);
    await fixture.service.close();
  });

  it('retires the actor and removes the record when its source is deleted', async () => {
    const fixture = serviceFixture();
    const manifest = await fixture.manifestFor();
    await fixture.service.resolve('main.ts', manifest);
    const actor = fixture.service.actor('main.ts');
    const release = fixture.hold();
    const pending = fixture.commit(manifest, { pointer: '/width', value: 30, base: 100 });
    const prepared = fixture.service.prepareFileOperation({ kind: 'delete', path: 'main.ts', directory: false });
    release();
    await pending;
    const operation = await prepared;
    await operation.commit();

    expect(actor?.getSnapshot().status).toBe('done');
    expect(fixture.service.actor('main.ts')).toBeUndefined();
    expect(fixture.files.has(fixtureRecordPath)).toBe(false);
  });

  it('refuses to relocate unsaved drafts, reports them, and proceeds after discard', async () => {
    const fixture = serviceFixture();
    const manifest = await fixture.manifestFor();
    await fixture.service.resolve('main.ts', manifest);
    fixture.service.setDraft(fixture.draftKey('/width'), { text: '30', valid: true });
    const refusals: unknown[] = [];
    fixture.service.subscribeUnsavedDrafts((refusal) => refusals.push(refusal));

    await expect(
      fixture.service.prepareFileOperation({ kind: 'move', oldPath: 'main.ts', newPath: 'renamed.ts' }),
    ).rejects.toMatchObject({ code: 'UNSAVED_PARAMETER_DRAFTS' });
    expect(refusals).toEqual([
      { operation: 'relocate', drafts: [{ entry: 'main.ts', label: 'Width', reason: 'unsubmitted' }] },
    ]);
    expect(fixture.service.actor('main.ts')).toBeDefined();

    fixture.service.discardDrafts('main.ts');
    const prepared = await fixture.service.prepareFileOperation({
      kind: 'move',
      oldPath: 'main.ts',
      newPath: 'renamed.ts',
    });
    await prepared.rollback();
    expect(fixture.service.actor('main.ts')).toBeUndefined();
  });

  it('refuses to close over an unsubmitted draft and closes after discard', async () => {
    const fixture = serviceFixture();
    const manifest = await fixture.manifestFor();
    await fixture.service.resolve('main.ts', manifest);
    fixture.service.setDraft(fixture.draftKey('/width'), { text: '30', valid: true });

    await expect(fixture.service.close()).rejects.toMatchObject({
      code: 'UNSAVED_PARAMETER_DRAFTS',
      message: 'Some parameter edits were typed but not entered. Enter or discard them first.',
    });
    expect(fixture.service.draft(fixture.draftKey('/width'))).toEqual({ text: '30', valid: true });
    fixture.service.discardDrafts();
    await expect(fixture.service.close()).resolves.toBeUndefined();
    expect(fixture.writes).toHaveLength(0);
    expect([...fixture.listeners.values()].every((current) => current.size === 0)).toBe(true);
    await expect(fixture.service.close()).resolves.toBeUndefined();
  });

  it('names an invalid draft in its refusal', async () => {
    const fixture = serviceFixture();
    const manifest = await fixture.manifestFor();
    await fixture.service.resolve('main.ts', manifest);
    fixture.service.setDraft(fixture.draftKey('/width'), { text: 'not a quantity', valid: false });

    await expect(fixture.service.close()).rejects.toMatchObject({
      code: 'UNSAVED_PARAMETER_DRAFTS',
      drafts: [{ entry: 'main.ts', reason: 'invalid' }],
    });
    fixture.service.discardDrafts();
    await fixture.service.close();
  });

  it('retains one field draft across an editor remount', async () => {
    const fixture = serviceFixture();
    const manifest = await fixture.manifestFor();
    await fixture.service.resolve('main.ts', manifest);
    fixture.service.setDraft(fixture.draftKey('/width'), { text: '30', valid: true });

    expect(fixture.service.draft(fixture.draftKey('/width'))).toEqual({ text: '30', valid: true });
    fixture.service.discardDrafts();
    await fixture.service.close();
  });

  it('notifies draft listeners only when a draft is cleared or discarded', async () => {
    const fixture = serviceFixture();
    const changes = vi.fn();
    fixture.service.subscribeDrafts(changes);
    fixture.service.setDraft(fixture.draftKey('/width'), { text: '3', valid: true });
    fixture.service.setDraft(fixture.draftKey('/width'), { text: '30', valid: true });
    fixture.service.setDraft(fixture.draftKey('/depth'), { text: '4', valid: true });

    expect(changes).not.toHaveBeenCalled();

    fixture.service.setDraft(fixture.draftKey('/width'), undefined);
    fixture.service.setDraft(fixture.draftKey('/width'), undefined);
    expect(changes).toHaveBeenCalledOnce();

    fixture.service.discardDrafts('main.ts');
    expect(changes).toHaveBeenCalledTimes(2);
    await fixture.service.close();
  });

  it('discards only the drafts named by the last refusal', async () => {
    const fixture = serviceFixture();
    fixture.service.setDraft(fixture.draftKey('/width'), { text: '30', valid: true });
    fixture.service.setDraft(
      {
        ...fixture.draftKey('/width'),
        target: fixture.service.target('other.ts'),
      },
      { text: '40', valid: true },
    );

    await expect(
      fixture.service.prepareFileOperation({ kind: 'delete', path: 'main.ts', directory: false }),
    ).rejects.toMatchObject({ code: 'UNSAVED_PARAMETER_DRAFTS' });
    fixture.service.discardDrafts();

    expect(fixture.service.draft(fixture.draftKey('/width'))).toBeUndefined();
    expect(
      fixture.service.draft({
        ...fixture.draftKey('/width'),
        target: fixture.service.target('other.ts'),
      }),
    ).toEqual({ text: '40', valid: true });
  });

  it('deletes drafts owned by a deleted group', async () => {
    const fixture = serviceFixture();
    const manifest = await fixture.manifestFor();
    await fixture.service.createGroup('main.ts', manifest, { group: 'alternate' });
    fixture.service.setDraft({ ...fixture.draftKey('/width'), group: 'alternate' }, { text: '30', valid: true });

    await fixture.service.deleteGroup('main.ts', manifest, 'alternate');

    expect(fixture.service.draft({ ...fixture.draftKey('/width'), group: 'alternate' })).toBeUndefined();
  });

  it('rekeys drafts owned by a renamed group', async () => {
    const fixture = serviceFixture();
    const manifest = await fixture.manifestFor();
    await fixture.service.createGroup('main.ts', manifest, { group: 'alternate' });
    const oldKey = { ...fixture.draftKey('/width'), group: 'alternate' };
    const nextKey = { ...oldKey, group: 'renamed' };
    fixture.service.setDraft(oldKey, { text: '30', valid: true });

    await fixture.service.renameGroup('main.ts', manifest, { group: 'alternate', nextGroup: 'renamed' });

    expect(fixture.service.draft(oldKey)).toBeUndefined();
    expect(fixture.service.draft(nextKey)).toEqual({ text: '30', valid: true });
  });

  it('moves the record with its source on commit and restores it on rollback', async () => {
    const fixture = serviceFixture();
    const manifest = await fixture.manifestFor();
    await fixture.service.replaceValues('main.ts', manifest, { width: 50 });
    const renamedPath = `${fixtureRoot}/${parameterEntryPath('renamed.ts')}`;
    const move = await fixture.service.prepareFileOperation({
      kind: 'move',
      oldPath: 'main.ts',
      newPath: 'renamed.ts',
    });
    await move.commit();
    expect([fixture.files.has(fixtureRecordPath), fixture.files.has(renamedPath)]).toEqual([false, true]);
    const back = await fixture.service.prepareFileOperation({
      kind: 'move',
      oldPath: 'renamed.ts',
      newPath: 'main.ts',
    });
    await back.commit();
    const undone = await fixture.service.prepareFileOperation({
      kind: 'move',
      oldPath: 'main.ts',
      newPath: 'renamed.ts',
    });
    await undone.commit();
    await undone.rollback();
    expect([fixture.files.has(fixtureRecordPath), fixture.files.has(renamedPath)]).toEqual([true, false]);
  });

  it('publishes actor creation and retirement, and re-creates a retired actor on resolve', async () => {
    const fixture = serviceFixture();
    const manifest = await fixture.manifestFor();
    const notifications = vi.fn();
    fixture.service.subscribeActors(notifications);
    await fixture.service.resolve('main.ts', manifest);
    const first = fixture.service.actor('main.ts');
    const move = await fixture.service.prepareFileOperation({ kind: 'move', oldPath: 'main.ts', newPath: 'x.ts' });
    await move.rollback();
    await fixture.service.resolve('main.ts', manifest);
    const second = fixture.service.actor('main.ts');
    expect(notifications).toHaveBeenCalledTimes(3);
    expect(second).toBeDefined();
    expect(second).not.toBe(first);
    expect(first?.getSnapshot().status).toBe('done');
  });

  it('reports an unreadable record as a typed failure and resets it against the preserved bytes', async () => {
    const retired = JSON.stringify({
      recordVersion: 1,
      profile: 'tau-json-structure-units-03-v1',
      activeGroup: 'default',
      groups: { default: { values: { width: 7 }, bindings: {} } },
    });
    const fixture = serviceFixture(retired);
    const manifest = await fixture.manifestFor();
    await expect(fixture.service.resolve('main.ts', manifest)).rejects.toMatchObject({ code: 'INVALID_RECORD' });
    expect(fixture.writes).toHaveLength(0);
    expect(decoder.decode(fixture.files.get(fixtureRecordPath))).toBe(retired);

    await fixture.service.resetRecord('main.ts');
    expect(fixture.writes[0]?.preconditions).toEqual([{ path: fixtureRecordPath, expected: encoder.encode(retired) }]);
    await expect(fixture.service.resolve('main.ts', manifest)).resolves.toMatchObject({
      entry: { activeGroup: 'default', groups: { default: { values: {} } } },
    });
    expect(decoder.decode(fixture.files.get(fixtureRecordPath))).not.toContain('recordVersion');
  });

  it('commits one non-numeric field without rewriting the group', async () => {
    const fixture = serviceFixture();
    const manifest = await fixture.manifestFor();
    await fixture.service.replaceValues('main.ts', manifest, { width: 50 });
    await fixture.service.submitValue(fixture.service.target('main.ts'), manifest, {
      group: 'default',
      pointer: '/label',
      value: 'lid',
      base: { pointer: '/label', value: 'box' },
    });
    expect([fixture.stored('width'), fixture.stored('label')]).toEqual([50, 'lid']);
  });

  it('resolves the target on demand when a field is committed before any read', async () => {
    const fixture = serviceFixture();
    const manifest = await fixture.manifestFor();
    expect(await fixture.commit(manifest, { pointer: '/width', value: 30, base: 100 })).toMatchObject({
      status: 'committed',
    });
    expect(fixture.stored('width')).toBe(30);
    await fixture.service.close();
  });

  it('adopts an external record change', async () => {
    const fixture = serviceFixture();
    const manifest = await fixture.manifestFor();
    await fixture.service.replaceValues('main.ts', manifest, { width: 50 });
    fixture.files.set(
      fixtureRecordPath,
      encoder.encode(JSON.stringify({ activeGroup: 'default', groups: { default: { values: { width: 64 } } } })),
    );
    fixture.notify();

    await vi.waitFor(() => {
      expect(fixture.service.snapshot('main.ts')?.entry.groups['default']?.values['width']).toBe(64);
    });
    await fixture.service.close();
  });

  it('serializes the record canonically with a trailing newline and no retired keys', async () => {
    const fixture = serviceFixture();
    const manifest = await fixture.manifestFor();
    await fixture.service.replaceValues('main.ts', manifest, { width: 50, height: 12 });

    const text = decoder.decode(fixture.files.get(fixtureRecordPath));
    expect(text).toBe(
      `${JSON.stringify(
        { activeGroup: 'default', groups: { default: { values: { height: 12, width: 50 } } } },
        undefined,
        2,
      )}\n`,
    );
  });
});

describe('parameter refusal survives row replacement with the real service', () => {
  it.each([
    'before settlement',
    'after settlement',
    'before settlement with newer same-text draft',
    'stepper before settlement',
    'slider before settlement',
    'before settlement with newer final',
  ] as const)('preserves the winning display and the losing intent when replaced %s', async (replacement) => {
    const fixture = serviceFixture();
    const peer = fixture.createPeerService();
    const manifest = await fixture.manifestFor();
    await fixture.service.resolve('main.ts', manifest);
    await peer.resolve('main.ts', manifest);
    const user = userEvent.setup();
    const outcomes: ParameterSetOutcome[] = [];
    const pending: Array<Promise<ParameterSetOutcome>> = [];
    const target = fixture.service.target('main.ts');
    const commit: ParameterCommit = {
      target,
      group: 'default',
      draft: (pointer) => fixture.service.draft(fixture.draftKey(pointer)),
      setDraft: (pointer, draft) => {
        fixture.service.setDraft(fixture.draftKey(pointer), draft);
      },
      subscribeDrafts: fixture.service.subscribeDrafts,
      commit: async (field) => {
        const operation = fixture.service.commitValue(target, manifest, { group: 'default', ...field });
        pending.push(operation);
        const outcome = await operation;
        outcomes.push(outcome);
        return outcome;
      },
      setValue: async (field) => {
        await fixture.service.submitValue(target, manifest, { group: 'default', ...field });
      },
    };
    const row = (value: number) =>
      createElement(
        TooltipProvider,
        null,
        createElement(ParametersNumber, {
          value,
          defaultValue: 100,
          min: 0,
          max: 200,
          step: 1,
          fieldProjection: {
            instancePointer: '/width',
            parameterId: 'width',
            schema: { resource: 'urn:test:service-parameters', pointer: '/properties/width' },
            representation: 'binary64',
            constraints: {},
            guessed: false,
            status: 'unit-bearing',
            nativeUnit: 'mm',
            displayUnit: 'mm',
            adornment: 'mm',
            quantityKind: lengthKind,
            space: 'linear',
          },
          edit: { kind: 'authoritative', commit },
          onChange: vi.fn(),
          'aria-label': 'Concurrent width',
        }),
      );
    let rendered = render(row(100));
    const release = fixture.holdNextWrite();
    try {
      const field = screen.getByRole('spinbutton', { name: 'Concurrent width' });
      if (replacement !== 'slider before settlement') {
        await user.click(field);
      }
      if (replacement === 'slider before settlement') {
        const slider = rendered.container.querySelector<HTMLElement>('[data-slot="slider-input"]');
        if (!slider) {
          throw new Error('Expected the actual numeric slider.');
        }
        Object.defineProperty(slider, 'offsetWidth', { configurable: true, value: 100 });
        for (const [type, clientX] of [
          ['pointerdown', 0],
          ['pointermove', 10],
          ['pointerup', 10],
        ] as const) {
          const event = new MouseEvent(type, { bubbles: true, cancelable: true, button: 0, clientX });
          Object.defineProperty(event, 'pointerId', { value: 1 });
          fireEvent(slider, event);
        }
      } else if (replacement === 'stepper before settlement') {
        await user.keyboard('{ArrowUp}');
      } else {
        await user.clear(field);
        await user.type(field, '21');
        await user.keyboard('{Enter}');
      }
      await waitFor(() => {
        expect(fixture.writeAttempts).toHaveLength(1);
      });
      const winner = await peer.commitValue(peer.target('main.ts'), manifest, {
        group: 'default',
        pointer: '/width',
        value: 22,
        base: { pointer: '/width', value: 100, binding: fixtureBinding },
      });
      expect(winner.status).toBe('committed');
      expect(fixture.stored('width')).toBe(22);
      if (replacement === 'after settlement') {
        await act(async () => {
          release();
          await Promise.all(pending);
        });
      }
      rendered.unmount();
      rendered = render(row(22));
      const replacementField = screen.getByRole('spinbutton', { name: 'Concurrent width' });
      expect(replacementField).not.toBe(field);
      if (
        replacement === 'before settlement with newer same-text draft' ||
        replacement === 'before settlement with newer final'
      ) {
        await user.click(replacementField);
        await user.clear(replacementField);
        await user.type(replacementField, '21');
        if (replacement === 'before settlement with newer final') {
          await user.keyboard('{Enter}');
        }
      }
      await act(async () => {
        release();
        await Promise.all(pending);
      });
      const newerFinal = replacement === 'before settlement with newer final';
      if (newerFinal) {
        rendered.rerender(row(21));
      }
      expect(outcomes).toHaveLength(newerFinal ? 2 : 1);
      const outcome = outcomes.find((result) => result.status === 'rejected');
      expect(outcome).toMatchObject({ status: 'rejected', code: 'STALE_MANIFEST' });
      expect(fixture.stored('width')).toBe(newerFinal ? 21 : 22);
      expect(fixture.writes).toHaveLength(newerFinal ? 2 : 1);
      if (newerFinal) {
        expect(fixture.service.draft(fixture.draftKey('/width'))).toBeUndefined();
      } else {
        expect(fixture.service.draft(fixture.draftKey('/width'))).toMatchObject({
          text:
            replacement === 'stepper before settlement'
              ? '101'
              : replacement === 'slider before settlement'
                ? '120'
                : '21',
          valid: true,
        });
      }
      if (outcome?.status !== 'rejected') {
        throw new Error('Expected the checked losing edit to be rejected.');
      }
      if (replacement === 'before settlement with newer same-text draft' || newerFinal) {
        expect(replacementField).toHaveValue('21');
        expect(screen.queryByText(outcome.message)).not.toBeInTheDocument();
      } else {
        expect(replacementField).toHaveValue('22');
        expect(screen.getByText(outcome.message)).toBeVisible();
      }
    } finally {
      release();
      await act(async () => {
        await Promise.allSettled(pending);
      });
      rendered.unmount();
      fixture.service.discardDrafts('main.ts');
      await fixture.service.close();
      await peer.close();
    }
  });
});

describe('admitted final parameter intent survives owner closure', () => {
  it.each([
    ['initial resolution', 'close'],
    ['held write', 'close'],
    ['initial resolution', 'rename'],
    ['held write', 'rename'],
  ] as const)('settles an admitted non-UI final during %s before %s retires its actor', async (phase, ending) => {
    const initialReady = Promise.withResolvers<void>();
    const fixture = serviceFixture(
      undefined,
      phase === 'initial resolution' ? initialReady.promise : Promise.resolve(),
    );
    const manifest = await fixture.manifestFor();
    if (phase === 'held write') {
      await fixture.service.resolve('main.ts', manifest);
    }
    const release =
      phase === 'initial resolution'
        ? () => {
            initialReady.resolve();
          }
        : fixture.holdNextWrite();
    const final = fixture.commit(manifest, { pointer: '/width', value: 21, base: 100 });
    const finalResult = Promise.allSettled([final]);
    let prepared: Awaited<ReturnType<typeof fixture.service.prepareFileOperation>> | undefined;
    let finished = false;
    try {
      await vi.waitFor(() => {
        if (phase === 'initial resolution') {
          expect(fixture.service.actor('main.ts')).toBeDefined();
          expect(fixture.exists).not.toHaveBeenCalled();
        } else {
          expect(fixture.writeAttempts).toHaveLength(1);
        }
      });
      const admittedActor = fixture.service.actor('main.ts');
      expect(admittedActor).toBeDefined();
      const endingOperation =
        ending === 'close'
          ? fixture.service.close()
          : fixture.service.prepareFileOperation({ kind: 'move', oldPath: 'main.ts', newPath: 'renamed.ts' });
      const endingResult = Promise.allSettled([endingOperation]);
      release();
      const [finalSettled] = await finalResult;
      const [ownerSettled] = await endingResult;
      if (ownerSettled.status === 'fulfilled' && ownerSettled.value !== undefined) {
        prepared = ownerSettled.value;
      }
      expect(finalSettled).toMatchObject({ status: 'fulfilled', value: { status: 'committed' } });
      expect(ownerSettled.status).toBe('fulfilled');
      expect(fixture.writes).toHaveLength(1);
      expect(fixture.stored('width')).toBe(21);
      expect(admittedActor?.getSnapshot().status).toBe('done');
      if (ownerSettled.status === 'fulfilled' && ownerSettled.value !== undefined) {
        await ownerSettled.value.commit();
        finished = true;
        expect(fixture.files.has(fixtureRecordPath)).toBe(false);
        expect(parseEntry(fixture.files.get(`${fixtureRoot}/${parameterEntryPath('renamed.ts')}`))).toMatchObject({
          groups: { default: { values: { width: 21 } } },
        });
      }
    } finally {
      release();
      await finalResult;
      if (!finished) {
        await prepared?.rollback();
      }
      await fixture.service.close();
    }
  });
});

describe('retained final intent is settled before owner disposal', () => {
  it.each(['success', 'refusal'] as const)('waits for a held final %s before closing', async (result) => {
    const fixture = serviceFixture();
    const peer = fixture.createPeerService();
    const manifest = await fixture.manifestFor();
    await fixture.service.resolve('main.ts', manifest);
    await peer.resolve('main.ts', manifest);
    const actor = fixture.service.actor('main.ts');
    const release = fixture.holdNextWrite();
    const operation = fixture.service.commitValue(fixture.service.target('main.ts'), manifest, {
      group: 'default',
      pointer: '/width',
      value: 21,
      pressure: 'final',
      base: { pointer: '/width', value: 100, binding: fixtureBinding },
      draft: { text: '21', valid: true },
    });
    const operationResult = Promise.allSettled([operation]);
    try {
      await vi.waitFor(() => {
        expect(fixture.writeAttempts).toHaveLength(1);
      });
      if (result === 'refusal') {
        expect(
          await peer.commitValue(peer.target('main.ts'), manifest, {
            group: 'default',
            pointer: '/width',
            value: 22,
            base: { pointer: '/width', value: 100, binding: fixtureBinding },
          }),
        ).toMatchObject({ status: 'committed' });
      }
      const closing = Promise.allSettled([fixture.service.close()]);
      release();
      const [settled] = await operationResult;
      const [closed] = await closing;
      expect(settled).toMatchObject({
        status: 'fulfilled',
        value: { status: result === 'success' ? 'committed' : 'rejected' },
      });
      if (result === 'success') {
        expect(closed).toMatchObject({ status: 'fulfilled' });
        expect(actor?.getSnapshot().status).toBe('done');
        expect(fixture.service.draft(fixture.draftKey('/width'))).toBeUndefined();
      } else {
        expect(closed).toMatchObject({ status: 'rejected', reason: { code: 'UNSAVED_PARAMETER_DRAFTS' } });
        expect(actor?.getSnapshot().status).not.toBe('done');
        expect(fixture.service.draft(fixture.draftKey('/width'))).toMatchObject({
          text: '21',
          final: { status: 'refused' },
        });
        expect(fixture.stored('width')).toBe(22);
      }
    } finally {
      release();
      await operationResult;
      fixture.service.discardDrafts('main.ts');
      await fixture.service.close();
      await peer.close();
    }
  });
});

describe('final intent refused before actor admission', () => {
  it.each(['closing', 'closed', 'relocating'] as const)(
    'retains recovery intent while %s without starting a write',
    async (phase) => {
      const fixture = serviceFixture();
      const manifest = await fixture.manifestFor();
      const target = fixture.service.target('main.ts');
      const key = fixture.draftKey('/width');
      const ending =
        phase === 'relocating'
          ? fixture.service.prepareFileOperation({ kind: 'move', oldPath: 'main.ts', newPath: 'renamed.ts' })
          : fixture.service.close();
      const endingResult = Promise.allSettled([ending]);
      if (phase === 'closed') {
        await endingResult;
      }
      const refused = fixture.service.commitValue(target, manifest, {
        group: 'default',
        pointer: '/width',
        value: 21,
        pressure: 'final',
        base: { pointer: '/width', value: 100, binding: fixtureBinding },
        draft: { text: '21', valid: true },
      });
      await expect(refused).rejects.toThrow();
      expect(fixture.writeAttempts).toHaveLength(0);
      if (phase === 'closed') {
        expect(fixture.service.draft(key)).toBeUndefined();
        expect(fixture.service.actor('main.ts')).toBeUndefined();
      } else {
        expect(fixture.service.draft(key)).toMatchObject({ text: '21', valid: true, final: { status: 'refused' } });
      }
      const [settled] = await endingResult;
      if (settled.status === 'fulfilled' && settled.value !== undefined) {
        await settled.value.rollback();
      }
      fixture.service.discardDrafts('main.ts');
      await fixture.service.close();
    },
  );
});

it.each(['relocating', 'closing', 'closed'] as const)(
  'preserves a pre-admission %s refusal at its live owner boundary',
  async (phase) => {
    const fixture = serviceFixture();
    const manifest = await fixture.manifestFor();
    const target = fixture.service.target('main.ts');
    await fixture.service.resolve('main.ts', manifest);
    const release = fixture.holdNextWrite();
    const admitted =
      phase === 'closed' ? undefined : fixture.commit(manifest, { pointer: '/width', value: 20, base: 100 });
    if (admitted !== undefined) {
      await vi.waitFor(() => {
        expect(fixture.writeAttempts).toHaveLength(1);
      });
    }
    const ending = Promise.allSettled([
      phase === 'relocating'
        ? fixture.service.prepareFileOperation({ kind: 'move', oldPath: 'main.ts', newPath: 'renamed.ts' })
        : fixture.service.close(),
    ]);
    if (phase === 'closed') {
      await ending;
    }
    const commit: ParameterCommit = {
      target,
      group: 'default',
      draft: (pointer) => fixture.service.draft(fixture.draftKey(pointer)),
      setDraft: (pointer, draft) => {
        fixture.service.setDraft(fixture.draftKey(pointer), draft);
      },
      subscribeDrafts: fixture.service.subscribeDrafts,
      commit: async (field) => fixture.service.commitValue(target, manifest, { group: 'default', ...field }),
      setValue: async (field) => {
        await fixture.service.submitValue(target, manifest, { group: 'default', ...field });
      },
    };
    const row = createElement(
      TooltipProvider,
      null,
      createElement(ParametersNumber, {
        value: 100,
        defaultValue: 100,
        fieldProjection: {
          instancePointer: '/width',
          parameterId: 'width',
          schema: { resource: 'urn:test:service-parameters', pointer: '/properties/width' },
          representation: 'binary64',
          constraints: {},
          guessed: false,
          status: 'unit-bearing',
          nativeUnit: 'mm',
          displayUnit: 'mm',
          adornment: 'mm',
          quantityKind: lengthKind,
          space: 'linear',
        },
        edit: { kind: 'authoritative', commit },
        onChange: vi.fn(),
        'aria-label': 'Relocating width',
      }),
    );
    let rendered = render(row);
    try {
      const user = userEvent.setup();
      const field = screen.getByRole('spinbutton', { name: 'Relocating width' });
      await user.clear(field);
      await user.type(field, '21');
      await user.keyboard('{Enter}');
      const message =
        phase === 'relocating' ? 'Parameters for main.ts are being relocated.' : 'The parameter service is closed.';
      expect(await screen.findByText(message)).toBeVisible();
      if (phase === 'closed') {
        expect(field).toHaveValue('21');
        expect(fixture.service.draft(fixture.draftKey('/width'))).toBeUndefined();
        expect(fixture.service.actor('main.ts')).toBeUndefined();
        await user.clear(field);
        await user.type(field, '23');
        expect(field).toHaveValue('23');
        expect(fixture.service.draft(fixture.draftKey('/width'))).toBeUndefined();
      } else {
        rendered.unmount();
        rendered = render(row);
        expect(screen.getByRole('spinbutton', { name: 'Relocating width' })).toHaveValue('100');
        expect(screen.getByText(message)).toBeVisible();
        expect(fixture.service.draft(fixture.draftKey('/width'))).toMatchObject({
          text: '21',
          final: { status: 'refused' },
        });
      }
      expect(fixture.writeAttempts).toHaveLength(phase === 'closed' ? 0 : 1);
    } finally {
      rendered.unmount();
      release();
      await admitted;
      const [result] = await ending;
      if (result.status === 'fulfilled' && result.value !== undefined) {
        await result.value.rollback();
      }
      if (phase !== 'closed') {
        expect(result).toMatchObject({ status: 'rejected', reason: { code: 'UNSAVED_PARAMETER_DRAFTS' } });
      }
      fixture.service.discardDrafts('main.ts');
      await fixture.service.close();
    }
  },
);

describe('final parameter teardown admission boundary', () => {
  it.each(['close', 'relocate'] as const)(
    'keeps late intent outside the service while %s teardown is held',
    async (ending) => {
      const fixture = serviceFixture();
      const manifest = await fixture.manifestFor();
      await fixture.service.resolve('main.ts', manifest);
      const actor = fixture.service.actor('main.ts');
      const release = fixture.holdNextWrite();
      const transient = fixture.commit(manifest, { pointer: '/width', value: 20, base: 100, pressure: 'transient' });
      await vi.waitFor(() => {
        expect(fixture.writeAttempts).toHaveLength(1);
      });
      const finishing =
        ending === 'close'
          ? fixture.service.close()
          : fixture.service.prepareFileOperation({ kind: 'move', oldPath: 'main.ts', newPath: 'renamed.ts' });
      const settled = Promise.allSettled([finishing]);
      try {
        await vi.waitFor(() => {
          expect(actor?.getSnapshot().context.closing).toBe(true);
        });
        fixture.service.setDraft(fixture.draftKey('/width'), { text: '21', valid: true });
        await expect(
          fixture.service.commitValue(fixture.service.target('main.ts'), manifest, {
            group: 'default',
            pointer: '/width',
            value: 21,
            base: { pointer: '/width', value: 100, binding: fixtureBinding },
            draft: { text: '21', valid: true },
          }),
        ).rejects.toThrow();
        expect(fixture.service.draft(fixture.draftKey('/width'))).toBeUndefined();
        expect(fixture.writeAttempts).toHaveLength(1);
      } finally {
        release();
        await transient;
        const [result] = await settled;
        if (result.status === 'fulfilled' && result.value !== undefined) {
          await result.value.rollback();
        }
        fixture.service.discardDrafts('main.ts');
        await fixture.service.close();
      }
    },
  );

  it('recreates a completed sibling after another actor refuses close as uncertain', async () => {
    const fixture = serviceFixture();
    const manifest = await fixture.manifestFor();
    await fixture.service.resolve('main.ts', manifest);
    await fixture.service.resolve('other.ts', manifest);
    const completed = fixture.service.actor('main.ts');
    const uncertain = fixture.service.actor('other.ts');
    fixture.loseNextReply();
    expect(
      await fixture.service.commitValue(fixture.service.target('other.ts'), manifest, {
        group: 'default',
        pointer: '/width',
        value: 21,
        base: { pointer: '/width', value: 100, binding: fixtureBinding },
      }),
    ).toMatchObject({ status: 'indeterminate' });
    await expect(fixture.service.close()).rejects.toMatchObject({ code: 'WRITE_UNCERTAIN' });
    expect(completed?.getSnapshot().status).toBe('done');
    expect(uncertain?.getSnapshot().matches({ open: 'uncertain' })).toBe(true);
    try {
      await expect(fixture.service.resolve('main.ts', manifest)).resolves.toBeDefined();
      expect(fixture.service.actor('main.ts')).not.toBe(completed);
      expect(fixture.service.actor('other.ts')).toBe(uncertain);
    } finally {
      fixture.files.delete(`${fixtureRoot}/${parameterEntryPath('other.ts')}`);
      uncertain?.send({ type: 'resolve', resolution: manifest.identity.resolution });
      await fixture.service.resolve('other.ts', manifest);
      await fixture.service.close();
    }
  });
});
