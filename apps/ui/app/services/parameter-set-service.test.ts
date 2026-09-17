import { parameterEntryPath } from '@taucad/types';
import { compileParameterManifest } from '@taucad/parameters';
import type { ParameterManifest } from '@taucad/parameters';
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

describe('createParameterSetService', () => {
  it('owns one checked parameter update through close', async () => {
    const rootDirectory = '/projects/example';
    const sourcePath = `${rootDirectory}/main.ts`;
    const dependencyPath = `${rootDirectory}/shared.ts`;
    const path = `${rootDirectory}/${parameterEntryPath('main.ts')}`;
    const configurationEntry = 'provider-configuration/runtime/export/stl/options/schema-revision';
    const configurationPath = `${rootDirectory}/${parameterEntryPath(configurationEntry)}`;
    const renamedConfigurationEntry = 'provider-configuration/runtime/export/stl/options/schema-revision-2';
    const renamedConfigurationPath = `${rootDirectory}/${parameterEntryPath(renamedConfigurationEntry)}`;
    const sourceBytes = encoder.encode('export const width = 100;');
    const dependencyBytes = encoder.encode('export const scale = 1;');
    const files = new Map<string, Uint8Array<ArrayBuffer>>([
      [sourcePath, sourceBytes],
      [dependencyPath, dependencyBytes],
      [
        path,
        encoder.encode(
          JSON.stringify({
            recordVersion: 1,
            profile: 'tau-json-structure-units-03-v1',
            activeGroup: 'default',
            groups: { default: { values: { width: 100 } } },
          }),
        ),
      ],
    ]);
    const listeners = new Map<string, Set<() => void>>();
    const checkedUpdateStarted = Promise.withResolvers<void>();
    const releaseCheckedUpdate = Promise.withResolvers<void>();
    const retryUpdateStarted = Promise.withResolvers<void>();
    const releaseRetryUpdate = Promise.withResolvers<void>();
    const writeFileChecked = vi.fn(
      async (input: Parameters<Parameters<typeof createParameterSetService>[0]['client']['writeFileChecked']>[0]) => {
        const writesToSource = writeFileChecked.mock.calls.filter(([call]) => call.path === path).length;
        if (input.path === path && writesToSource === 2) {
          checkedUpdateStarted.resolve();
          await releaseCheckedUpdate.promise;
        }
        if (input.path === path && writesToSource === 3) {
          retryUpdateStarted.resolve();
          await releaseRetryUpdate.promise;
        }
        const conflict = input.preconditions.find(
          ({ path: preconditionPath, expected }) => !sameBytes(files.get(preconditionPath), expected),
        );
        if (conflict !== undefined) {
          const actual = files.get(conflict.path);
          return {
            status: 'conflict',
            conflicts: [
              {
                path: conflict.path,
                actual: actual === undefined ? null : new Uint8Array(actual),
              },
            ],
          } as const;
        }
        const data = typeof input.data === 'string' ? encoder.encode(input.data) : input.data;
        files.set(input.path, new Uint8Array(data));
        return {
          status: 'applied',
          content: new Uint8Array(data),
        } as const;
      },
    );
    // oxlint-disable-next-line @typescript-eslint/consistent-type-assertions -- structural test double covers the service's six-method authority seam
    const client = {
      exists: async (candidate: string) => files.has(candidate),
      readFile: async (candidate: string) => {
        const content = files.get(candidate);
        return content === undefined ? new Uint8Array() : new Uint8Array(content);
      },
      writeFileChecked,
      move: async (source: string, target: string) => {
        const content = files.get(source);
        if (content === undefined) {
          throw new Error(`Missing move source: ${source}`);
        }
        files.set(target, content);
        files.delete(source);
        return { type: 'file', size: content.byteLength, mtimeMs: 0 } as const;
      },
      unlink: async (candidate: string) => {
        files.delete(candidate);
      },
      rmdir: async (candidate: string) => {
        for (const path of files.keys()) {
          if (path === candidate || path.startsWith(`${candidate}/`)) {
            files.delete(path);
          }
        }
      },
      mkdir: async () => undefined,
    } as unknown as Parameters<typeof createParameterSetService>[0]['client'];
    const service = createParameterSetService({
      rootDirectory,
      client,
      subscribe: (candidate, listener) => {
        const current = listeners.get(candidate) ?? new Set();
        current.add(listener);
        listeners.set(candidate, current);
        return () => current.delete(listener);
      },
    });
    const sourceRevision = revision(`sha256:${'1'.repeat(64)}`);
    const manifest = await compileParameterManifest({
      declaration: {
        schema: {
          $schema: 'https://json-structure.org/meta/extended/v0/#',
          $id: 'urn:test:browser-parameters',
          $uses: ['JSONSchemaUnits'],
          name: 'Parameters',
          type: 'object',
          properties: { width: { type: 'double', ucumUnit: 'mm' } },
        },
        defaults: { width: 100 },
        bindings: {
          '/width': {
            parameterId: 'width',
            quantityKind: 'http://qudt.org/vocab/quantitykind/Length',
            space: 'linear',
          },
        },
      },
      scope: {
        kind: 'source',
        authority: 'browser-filesystem',
        root: rootDirectory,
        entry: 'main.ts',
      },
      source: {
        id: 'fixture',
        version: '1',
        revision: sourceRevision,
        capability: 'json-structure',
      },
      dependency: sourceRevision,
      middleware: sourceRevision,
      sourceFiles: {
        'main.ts': await digestBytes(sourceBytes),
        'shared.ts': await digestBytes(dependencyBytes),
      },
    });
    const configurationManifest = await compileParameterManifest({
      declaration: {
        schema: manifest.schema,
        resources: manifest.resources,
        defaults: manifest.defaults,
        bindings: manifest.bindingDeclarations,
      },
      scope: {
        kind: 'provider',
        provider: 'runtime',
        configuration: 'export/stl/options',
      },
      source: {
        id: 'runtime:export/stl/options',
        version: '1',
        revision: sourceRevision,
        capability: 'json-structure',
      },
      dependency: sourceRevision,
      middleware: sourceRevision,
    });
    const configurationTarget = service.target(configurationEntry, 'provider-configuration');

    files.set(sourcePath, encoder.encode('export const width = 101;'));
    await expect(service.resolve('main.ts', manifest)).rejects.toMatchObject({ code: 'STALE_MANIFEST' });
    files.set(sourcePath, sourceBytes);
    files.set(dependencyPath, encoder.encode('export const scale = 2;'));
    await expect(service.resolve('main.ts', manifest)).rejects.toMatchObject({ code: 'STALE_MANIFEST' });
    expect(writeFileChecked).not.toHaveBeenCalled();
    files.set(dependencyPath, dependencyBytes);

    const [sourceSnapshot, duplicateSnapshot] = await Promise.all([
      service.resolve('main.ts', manifest),
      service.resolve('main.ts', manifest),
    ]);
    expect(duplicateSnapshot).toEqual(sourceSnapshot);
    expect(service.snapshot('main.ts')).toEqual(sourceSnapshot);
    const widthBinding = manifest.bindings['/width'];
    if (widthBinding === undefined) {
      throw new Error('Expected the compiled width binding.');
    }
    const input = {
      editorInstance: 'editor-a',
      binding: {
        target: service.target('main.ts'),
        group: 'default',
        parameterId: widthBinding.parameter.value,
        resource: widthBinding.schema.resource,
        pointer: '/width',
        nativeUnit: 'mm',
        representation: 'binary64',
        constraints: {},
      },
      acknowledgedValue: 100,
      acknowledgedRevision: sourceSnapshot.identity,
      display: { locale: 'en', unit: 'mm' },
    } as const;
    const retained = service.input(input);
    retained.attach()();
    const detach = retained.attach();
    await Promise.resolve();
    expect(retained.actor.getSnapshot().status).toBe('active');
    retained.actor.send({ type: 'focus' });
    retained.actor.send({ type: 'changeRaw', text: 'not a quantity' });
    detach();
    const remounted = service.input(input);
    expect(remounted.actor).toBe(retained.actor);
    expect(remounted.actor.getSnapshot().context.draft?.raw).toBe('not a quantity');
    remounted.actor.send({ type: 'pressEscape' });
    remounted.actor.send({ type: 'focus' });
    remounted.actor.send({ type: 'changeRaw', text: '2.1 cm' });
    expect(remounted.actor.getSnapshot().context.draft).toMatchObject({
      raw: '2.1 cm',
      status: 'complete-valid',
      nativeValue: 21,
    });
    remounted.actor.send({ type: 'pressEnter' });
    await vi.waitFor(() => {
      expect(remounted.actor.getSnapshot().context.acknowledged.value).toBe(21);
      expect(remounted.actor.getSnapshot().context.draft).toBeUndefined();
    });
    remounted.attach()();
    await service.resolveTarget(configurationTarget, configurationManifest);
    expect(files.has(configurationPath)).toBe(false);
    await service.replaceTargetValues(configurationTarget, configurationManifest, { values: { width: 75 } });
    const relocation = await service.prepareFileOperation({
      kind: 'move',
      oldPath: configurationEntry,
      newPath: renamedConfigurationEntry,
    });
    // A reader that arrives mid-relocation waits for the operation instead of failing.
    let relocatedReadSettled = false;
    const relocatedRead = (async () => {
      await service.resolve(configurationEntry, configurationManifest);
      relocatedReadSettled = true;
    })();
    await Promise.resolve();
    expect(relocatedReadSettled).toBe(false);
    await relocation.commit();
    await relocatedRead;
    expect(files.has(configurationPath)).toBe(false);
    expect(files.has(renamedConfigurationPath)).toBe(true);
    const update = service.replaceValues('main.ts', manifest, { width: 125 });
    await checkedUpdateStarted.promise;
    files.set(sourcePath, encoder.encode('export const width = 999;'));
    releaseCheckedUpdate.resolve();
    await expect(update).rejects.toMatchObject({ code: 'STALE_MANIFEST' });
    files.set(sourcePath, sourceBytes);
    await service.resolve('main.ts', manifest);
    const retryUpdate = service.replaceValues('main.ts', manifest, { width: 125 });
    await retryUpdateStarted.promise;
    remounted.actor.send({ type: 'focus' });
    remounted.actor.send({ type: 'changeRaw', text: 'not a quantity' });
    let closeSettled = false;
    const close = (async (): Promise<void> => {
      await service.close();
      closeSettled = true;
    })();
    await Promise.resolve();
    expect(closeSettled).toBe(false);
    releaseRetryUpdate.resolve();
    await retryUpdate;
    await expect(close).rejects.toMatchObject({
      code: 'UNSAVED_PARAMETER_DRAFTS',
      drafts: [{ entry: 'main.ts', reason: 'invalid' }],
    });
    retained.actor.send({ type: 'discard' });
    await service.close();

    expect(writeFileChecked).toHaveBeenCalledTimes(4);
    expect(configurationTarget).toEqual({
      authority: 'provider-configuration',
      root: rootDirectory,
      entry: configurationEntry,
    });
    expect(parseEntry(files.get(renamedConfigurationPath))).toMatchObject({
      groups: { default: { values: { width: 75 } } },
    });
    expect(parseEntry(files.get(path))).toMatchObject({
      recordVersion: 1,
      profile: 'tau-json-structure-units-03-v1',
      groups: {
        default: {
          values: { width: 125 },
          bindings: { '/width': { unit: 'mm', representation: 'binary64' } },
        },
      },
    });
    expect(decoder.decode(files.get(path))).toContain('"recordVersion": 1');
    expect(decoder.decode(files.get(renamedConfigurationPath))).toContain('"width": 75');
    expect([...listeners.values()].every((current) => current.size === 0)).toBe(true);
    await expect(service.close()).resolves.toBeUndefined();
  });
});

const fixtureRoot = '/projects/fixture';
const fixtureRecordPath = `${fixtureRoot}/${parameterEntryPath('main.ts')}`;
const lengthKind = 'http://qudt.org/vocab/quantitykind/Length';

type WriteInput = Parameters<Parameters<typeof createParameterSetService>[0]['client']['writeFileChecked']>[0];

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
  const editor = (manifest: ParameterManifest, editorInstance: string, pointer: '/width' | '/height' = '/width') => {
    const binding = manifest.bindings[pointer]!;
    return service.input({
      editorInstance,
      binding: {
        target: service.target('main.ts'),
        group: 'default',
        parameterId: binding.parameter.value,
        resource: binding.schema.resource,
        pointer,
        nativeUnit: 'mm',
        quantityKind: lengthKind,
        space: 'linear',
        representation: 'binary64',
        constraints: {},
      },
      display: { locale: 'en', unit: 'mm' },
    }).actor;
  };
  const type = (actor: ReturnType<typeof editor>, text: string, enter = true): void => {
    actor.send({ type: 'focus' });
    actor.send({ type: 'changeRaw', text });
    if (enter) {
      actor.send({ type: 'pressEnter' });
    }
  };
  const stored = (name: string): unknown =>
    (parseEntry(files.get(fixtureRecordPath)) as { groups?: Record<string, { values: Record<string, unknown> }> })
      .groups?.['default']?.values[name];
  return {
    service,
    files,
    writes,
    manifestFor,
    editor,
    type,
    stored,
    setSource: (text: string) => {
      files.set(`${fixtureRoot}/main.ts`, encoder.encode(text));
    },
    notify: () => {
      for (const listener of listeners.get(parameterEntryPath('main.ts')) ?? []) {
        listener();
      }
    },
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

const interaction = (actor: { getSnapshot(): { value: unknown } }): unknown =>
  (actor.getSnapshot().value as { active: { interaction: unknown } }).active.interaction;

describe('parameter set service behaviours', () => {
  it('commits a retained row after a source edit leaves every value unchanged', async () => {
    const fixture = serviceFixture();
    const first = await fixture.manifestFor();
    await fixture.service.resolve('main.ts', first);
    const width = fixture.editor(first, 'width');
    const height = fixture.editor(first, 'height', '/height');
    fixture.type(width, '110');
    await vi.waitFor(() => {
      expect(fixture.stored('width')).toBe(110);
    });
    fixture.type(height, '12', false);
    fixture.setSource('source:2');
    const edited = await fixture.manifestFor('source:2');
    await fixture.service.resolve('main.ts', edited);
    expect(height.getSnapshot().context.draft?.conflict).toBeUndefined();
    fixture.type(width, '120');
    await vi.waitFor(() => {
      expect(fixture.stored('width')).toBe(120);
    });
    height.send({ type: 'pressEnter' });
    await vi.waitFor(() => {
      expect(fixture.stored('height')).toBe(12);
    });
    expect(fixture.writes).toHaveLength(3);
    await fixture.service.close();
  });

  it('forwards a stale rejection to the row and commits after rebind', async () => {
    const fixture = serviceFixture();
    const manifest = await fixture.manifestFor();
    await fixture.service.resolve('main.ts', manifest);
    const release = fixture.hold();
    const first = fixture.editor(manifest, 'first');
    const second = fixture.editor(manifest, 'second');
    fixture.type(first, '30');
    fixture.type(second, '40');
    release();
    await vi.waitFor(() => {
      expect(interaction(second)).toBe('conflicted');
    });
    second.send({ type: 'rebind' });
    second.send({ type: 'pressEnter' });
    await vi.waitFor(() => {
      expect(fixture.stored('width')).toBe(40);
    });
    await fixture.service.close();
  });

  it('forwards an indeterminate write to the row as a failure', async () => {
    const fixture = serviceFixture();
    const manifest = await fixture.manifestFor();
    await fixture.service.resolve('main.ts', manifest);
    const width = fixture.editor(manifest, 'width');
    fixture.loseNextReply();
    fixture.type(width, '30');
    await vi.waitFor(() => {
      expect(width.getSnapshot().context.submission?.outcome).toMatchObject({ status: 'indeterminate' });
    });
    expect(interaction(width)).toBe('failed');
  });

  it('retains a displaced drag and settles the release that replaced it', async () => {
    const fixture = serviceFixture();
    const manifest = await fixture.manifestFor();
    await fixture.service.resolve('main.ts', manifest);
    const release = fixture.hold();
    const busy = fixture.editor(manifest, 'busy', '/height');
    fixture.type(busy, '11');
    const dragged = fixture.service.input({
      editorInstance: 'dragged',
      pressure: 'continual',
      binding: fixture.editor(manifest, 'probe').getSnapshot().context.acknowledged.binding,
      display: { locale: 'en', unit: 'mm' },
    }).actor;
    const other = fixture.service.input({
      editorInstance: 'other',
      pressure: 'continual',
      binding: dragged.getSnapshot().context.acknowledged.binding,
      display: { locale: 'en', unit: 'mm' },
    }).actor;
    dragged.send({ type: 'pointerChanged', value: 30 });
    dragged.send({ type: 'pointerChanged', value: 35 });
    dragged.send({ type: 'pointerReleased' });
    other.send({ type: 'pointerChanged', value: 40 });
    expect(other.getSnapshot().context.diagnostic?.code).toBe('CANCELLED_BEFORE_APPLY');
    release();
    await vi.waitFor(() => {
      expect(fixture.stored('width')).toBe(35);
    });
  });

  it('drops a pending settlement when its row is disposed by a relocation', async () => {
    const fixture = serviceFixture();
    const manifest = await fixture.manifestFor();
    await fixture.service.resolve('main.ts', manifest);
    const width = fixture.editor(manifest, 'width');
    const release = fixture.hold();
    fixture.type(width, '30');
    const prepared = fixture.service.prepareFileOperation({ kind: 'delete', path: 'main.ts', directory: false });
    release();
    const operation = await prepared;
    await operation.commit();
    expect(width.getSnapshot().status).toBe('done');
    expect(fixture.service.actor('main.ts')).toBeUndefined();
    expect(fixture.files.has(fixtureRecordPath)).toBe(false);
  });

  it('refuses to relocate unsaved drafts, reports them, and proceeds after discard', async () => {
    const fixture = serviceFixture();
    const manifest = await fixture.manifestFor();
    await fixture.service.resolve('main.ts', manifest);
    const width = fixture.editor(manifest, 'width');
    fixture.type(width, '30', false);
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
    fixture.type(fixture.editor(manifest, 'width'), '30', false);
    await expect(fixture.service.close()).rejects.toMatchObject({
      code: 'UNSAVED_PARAMETER_DRAFTS',
      message: 'Some parameter edits were typed but not entered. Enter or discard them first.',
    });
    expect(fixture.service.unsavedDrafts()).toHaveLength(1);
    fixture.service.discardDrafts();
    await expect(fixture.service.close()).resolves.toBeUndefined();
    expect(fixture.writes).toHaveLength(0);
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
    const legacy = JSON.stringify({ activeGroup: 'default', groups: { default: { values: { width: 7 } } } });
    const fixture = serviceFixture(legacy);
    const manifest = await fixture.manifestFor();
    await expect(fixture.service.resolve('main.ts', manifest)).rejects.toMatchObject({ code: 'INVALID_RECORD' });
    expect(fixture.writes).toHaveLength(0);
    expect(decoder.decode(fixture.files.get(fixtureRecordPath))).toBe(legacy);
    await fixture.service.resetRecord('main.ts');
    expect(fixture.writes[0]?.preconditions).toEqual([{ path: fixtureRecordPath, expected: encoder.encode(legacy) }]);
    await expect(fixture.service.resolve('main.ts', manifest)).resolves.toMatchObject({
      entry: { recordVersion: 1, groups: { default: { values: {} } } },
    });
  });

  it('commits one non-numeric field without rewriting the group', async () => {
    const fixture = serviceFixture();
    const manifest = await fixture.manifestFor();
    await fixture.service.replaceValues('main.ts', manifest, { width: 50 });
    await fixture.service.submitValue(fixture.service.target('main.ts'), manifest, {
      group: 'default',
      pointer: '/label',
      value: 'lid',
    });
    expect([fixture.stored('width'), fixture.stored('label')]).toEqual([50, 'lid']);
  });

  it('refuses to create a row before its authority is known and seeds one after resolve', async () => {
    const fixture = serviceFixture();
    const manifest = await fixture.manifestFor();
    expect(() => fixture.editor(manifest, 'early')).toThrow(expect.objectContaining({ code: 'TARGET_UNAVAILABLE' }));
    await fixture.service.resolve('main.ts', manifest);
    expect(fixture.editor(manifest, 'late').getSnapshot().context.acknowledged).toMatchObject({ value: 100 });
  });

  it('refreshes rows from an external record change', async () => {
    const fixture = serviceFixture();
    const manifest = await fixture.manifestFor();
    await fixture.service.replaceValues('main.ts', manifest, { width: 50 });
    const width = fixture.editor(manifest, 'width');
    const snapshot = fixture.service.snapshot('main.ts')!;
    fixture.files.set(
      fixtureRecordPath,
      encoder.encode(
        JSON.stringify({ ...snapshot.entry, groups: { default: { values: { width: 64 } } }, lastOperation: undefined }),
      ),
    );
    fixture.notify();
    await vi.waitFor(() => {
      expect(width.getSnapshot().context.acknowledged.value).toBe(64);
    });
  });
});
