import { parameterEntryPath } from '@taucad/types';
import { compileParameterManifest } from '@taucad/parameters';
import type { ParameterManifest, ParameterSetRequestBase } from '@taucad/parameters';
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
const serviceFixture = (initialRecord?: string) => {
  const files = new Map<string, Uint8Array<ArrayBuffer>>([[`${fixtureRoot}/main.ts`, encoder.encode('source:1')]]);
  if (initialRecord !== undefined) {
    files.set(fixtureRecordPath, encoder.encode(initialRecord));
  }
  const listeners = new Map<string, Set<() => void>>();
  let gate: Promise<void> | undefined;
  let loseNextReply = false;
  const writes: WriteInput[] = [];
  const writeFileChecked = async (input: WriteInput) => {
    await gate;
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
    exists: async (path: string) => files.has(path),
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
  const service = createParameterSetService({
    rootDirectory: fixtureRoot,
    client,
    subscribe: (path, listener) => {
      const current = listeners.get(path) ?? new Set();
      current.add(listener);
      listeners.set(path, current);
      return () => current.delete(listener);
    },
  });
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
      ...(input.pressure === undefined ? {} : { pressure: input.pressure }),
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
    loseNextReply: () => {
      loseNextReply = true;
    },
  };
};

describe('parameter set service behaviours', () => {
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
    const changes = vi.fn();
    fixture.service.subscribeDrafts(changes);
    fixture.service.setDraft(fixture.draftKey('/width'), { text: '30', valid: true });

    expect(fixture.service.draft(fixture.draftKey('/width'))).toEqual({ text: '30', valid: true });
    expect(changes).toHaveBeenCalledOnce();
    fixture.service.discardDrafts();
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
