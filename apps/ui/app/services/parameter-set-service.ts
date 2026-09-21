import { Topic } from '@taucad/events';
import type { RootedContentClient } from '@taucad/fs-client/rooted-content-client';
import type { FileOperation, PreparedFileOperation } from '@taucad/fs-client/file-content-service';
import { createActor, fromCallback, fromPromise, waitFor } from 'xstate';
import type { ActorRefFrom } from 'xstate';
import { fileParameterEntrySchema, parameterEntryPath, parametersDirectory } from '@taucad/types';
import type { JSONValue } from '@taucad/types';
import { loadParameterSnapshot, refreshParameterSnapshot, commitParameterChange } from '@taucad/parameters/authority';
import type { ParameterAuthority } from '@taucad/parameters/authority';
import { parameterSetMachine, submitParameterRequest } from '@taucad/parameters/set-machine';
import { serializeParameterRecord } from '@taucad/parameters';
import type {
  ParameterManifest,
  ParameterSetAuthoritySnapshot,
  ParameterSetOperation,
  ParameterSetOutcome,
  ParameterSetRequest,
  ParameterSetRequestBase,
  ParameterSetTarget,
  ParameterSnapshot,
} from '@taucad/parameters';
import { joinPath, parentDirectory } from '@taucad/utils/path';

type TargetState = {
  target: ParameterSetTarget;
  manifestRef: { current: ParameterManifest };
  actor: ActorRefFrom<typeof parameterSetMachine>;
};

/** The field one retained draft belongs to. */
export type ParameterDraftKey = Readonly<{
  target: ParameterSetTarget;
  group: string;
  pointer: string;
}>;

/**
 * One row's in-progress edit, retained here so it survives the row unmounting (collapse, expand,
 * search) and so a close or rename can refuse to discard it silently.
 */
export type ParameterDraft = Readonly<{
  /** Exactly what the person typed. */
  text: string;
  /** Whether that text parses and admits; an invalid draft cannot be entered. */
  valid: boolean;
}>;

/** One editor draft that has not reached the authority. */
export type UnsavedParameterDraft = Readonly<{
  entry: string;
  label: string;
  /** `unsubmitted` holds a valid value never entered; `invalid` cannot be submitted as typed. */
  reason: 'invalid' | 'unsubmitted';
}>;

/** A close or file operation the service refused because editors still hold unsaved drafts. */
export type UnsavedParameterDraftsRefusal = Readonly<{
  operation: 'close' | 'relocate';
  drafts: readonly UnsavedParameterDraft[];
}>;

/** Project-lifetime facade over one native parameter actor per authority target. */
export type ParameterSetService = Readonly<{
  target(filePath: string, authority?: string): ParameterSetTarget;
  /** The entry's held record, with the exact bytes its last committed write persisted. */
  snapshot(filePath: string): Pick<ParameterSnapshot, 'entry' | 'identity' | 'bytes'> | undefined;
  /** The live set actor for an entry, once `resolve`/`resolveTarget` has created it. */
  actor(filePath: string): ActorRefFrom<typeof parameterSetMachine> | undefined;
  /** Observe set actors being created or retired, for `useSyncExternalStore` readers of `actor`. */
  subscribeActors(listener: () => void): () => void;
  /**
   * Replace an unreadable (invalid or unsupported) record with an empty current record, checked
   * against the preserved bytes so a concurrent repair is never overwritten.
   */
  resetRecord(filePath: string): Promise<void>;
  /** The draft a row left behind, if it has one. */
  draft(key: ParameterDraftKey): ParameterDraft | undefined;
  /** Retain or clear one row's draft; `undefined` clears it. */
  setDraft(key: ParameterDraftKey, draft: ParameterDraft | undefined): void;
  /** Observe drafts being discarded elsewhere, so a mounted row re-reads its own. */
  subscribeDrafts(listener: () => void): () => void;
  /**
   * Commit one field of one group against the authority's current record. `base` scopes the
   * conflict to this field, so another field's commit never refuses this one.
   */
  commitValue(
    target: ParameterSetTarget,
    manifest: ParameterManifest,
    field: Readonly<{
      group: string;
      pointer: string;
      value: JSONValue;
      base?: ParameterSetRequestBase;
      pressure?: ParameterSetRequest['pressure'];
    }>,
  ): Promise<ParameterSetOutcome>;
  resolve(filePath: string, manifest: ParameterManifest): Promise<ParameterSetAuthoritySnapshot>;
  resolveTarget(target: ParameterSetTarget, manifest: ParameterManifest): Promise<ParameterSetAuthoritySnapshot>;
  readSettled(filePath: string): Promise<Uint8Array<ArrayBuffer> | undefined>;
  replaceValues(
    filePath: string,
    manifest: ParameterManifest,
    values: Readonly<Record<string, unknown>>,
  ): Promise<void>;
  replaceTargetValues(
    target: ParameterSetTarget,
    manifest: ParameterManifest,
    input: Readonly<{
      values: Readonly<Record<string, unknown>>;
      expected?: ParameterSetAuthoritySnapshot['identity'];
    }>,
  ): Promise<void>;
  /**
   * Commit one field against the authority's current group values, so a form still holding a
   * pre-commit value of another field never writes it back.
   */
  submitValue(
    target: ParameterSetTarget,
    manifest: ParameterManifest,
    field: Readonly<{ group: string; pointer: string; value: JSONValue; base: ParameterSetRequestBase }>,
  ): Promise<void>;
  selectGroup(filePath: string, manifest: ParameterManifest, group: string): Promise<void>;
  createGroup(
    filePath: string,
    manifest: ParameterManifest,
    input: Readonly<{
      group: string;
      values?: Readonly<Record<string, unknown>>;
    }>,
  ): Promise<void>;
  deleteGroup(filePath: string, manifest: ParameterManifest, group: string): Promise<void>;
  renameGroup(
    filePath: string,
    manifest: ParameterManifest,
    input: Readonly<{ group: string; nextGroup: string }>,
  ): Promise<void>;
  /** Discard drafts under one path, or the drafts named by the last refusal. */
  discardDrafts(filePath?: string): void;
  /** Observe refusals caused by unsaved drafts, so the UI can ask to discard or keep them. */
  subscribeUnsavedDrafts(listener: (refusal: UnsavedParameterDraftsRefusal) => void): () => void;
  prepareFileOperation(operation: FileOperation): Promise<PreparedFileOperation>;
  close(): Promise<void>;
}>;

const operationError = (outcome: Exclude<ParameterSetOutcome, { status: 'committed' }>): Error =>
  Object.assign(new Error('message' in outcome ? outcome.message : 'Parameter operation did not commit.'), {
    code: 'code' in outcome ? outcome.code : outcome.status,
  });

/** Immutably set one RFC 6901 pointer inside a group's values, creating intermediate objects. */
export const withPointerValue = (
  values: Readonly<Record<string, JSONValue>>,
  pointer: string,
  value: JSONValue,
): Readonly<Record<string, JSONValue>> => {
  const [head, ...rest] = pointer
    .split('/')
    .slice(1)
    .map((segment) => segment.replaceAll('~1', '/').replaceAll('~0', '~'));
  if (head === undefined) {
    return values;
  }
  const child = values[head];
  const nested =
    rest.length === 0
      ? value
      : withPointerValue(
          typeof child === 'object' && child !== null && !Array.isArray(child) ? child : {},
          `/${rest.map((segment) => segment.replaceAll('~', '~0').replaceAll('/', '~1')).join('/')}`,
          value,
        );
  return { ...values, [head]: nested };
};

/** A person-readable field name for a pointer, such as `/dimensions/cellSize` → `Dimensions › Cell size`. */
const draftLabel = (group: string, pointer: string): string => {
  const path = pointer
    .split('/')
    .slice(1)
    .map((segment) => {
      const words = segment
        .replaceAll('~1', '/')
        .replaceAll('~0', '~')
        .replaceAll(/[_-]+/gu, ' ')
        .replaceAll(/([a-z\d])([A-Z])/gu, '$1 $2')
        .toLowerCase();
      return words.charAt(0).toUpperCase() + words.slice(1);
    })
    .join(' › ');
  return group === 'default' ? path : `${path} (${group})`;
};

export const createParameterSetService = (
  options: Readonly<{
    rootDirectory: string;
    client: Pick<
      RootedContentClient,
      'exists' | 'readFile' | 'writeFileChecked' | 'move' | 'unlink' | 'rmdir' | 'mkdir'
    >;
    subscribe(path: string, listener: () => void): () => void;
    onError?(error: unknown): void;
  }>,
): ParameterSetService => {
  let sequence = 0;
  const clients = new Map<string, TargetState>();
  /** Retained row drafts, keyed by field. A plain map: rows own their own editing state. */
  const drafts = new Map<string, Readonly<{ key: ParameterDraftKey; draft: ParameterDraft; label: string }>>();
  const unsavedRefusals = new Topic<UnsavedParameterDraftsRefusal>({ name: 'unsaved-parameter-drafts' });
  const draftChanges = new Topic<void>({ name: 'parameter-drafts' });
  const actorChanges = new Topic<void>({ name: 'parameter-set-actors' });
  const actorsChanged = (): void => {
    actorChanges.emit();
  };
  const relocatingPaths = new Set<string>();
  const activeRelocations = new Set<Promise<void>>();
  const pendingCleanups = new Map<string, () => Promise<void>>();
  const cleanupInFlight = new Set<Promise<void>>();
  let closed = false;
  let closing = false;
  let closePromise: Promise<void> | undefined;
  const targetFor = (filePath: string, authority = 'browser-filesystem'): ParameterSetTarget => ({
    authority,
    root: options.rootDirectory,
    entry: filePath,
  });
  const targetKey = (target: ParameterSetTarget): string =>
    JSON.stringify([target.authority, target.root, target.checkout ?? null, target.entry]);
  const draftKey = (key: ParameterDraftKey): string => JSON.stringify([targetKey(key.target), key.group, key.pointer]);
  const absolutePath = (filePath: string): string => joinPath(options.rootDirectory, parameterEntryPath(filePath));
  const actorFor = (filePath: string): ActorRefFrom<typeof parameterSetMachine> | undefined =>
    [...clients.values()].find(({ target }) => target.entry === filePath)?.actor;
  const currentFor = (filePath: string): ParameterSnapshot | undefined =>
    actorFor(filePath)?.getSnapshot().context.current;
  const pathMatches = (candidate: string, path: string): boolean =>
    candidate === path || candidate.startsWith(`${path}/`);
  const isRelocating = (filePath: string): boolean => [...relocatingPaths].some((path) => pathMatches(filePath, path));
  const assertNotRelocating = (filePath: string): void => {
    if (isRelocating(filePath)) {
      throw Object.assign(new Error(`Parameters for ${filePath} are being relocated.`), {
        code: 'PARAMETER_RELOCATING',
      });
    }
  };

  const stateFor = (filePath: string, manifest: ParameterManifest, target = targetFor(filePath)): TargetState => {
    if (closed || closing) {
      throw new DOMException('The parameter service is closed.', 'AbortError');
    }
    assertNotRelocating(filePath);
    const key = targetKey(target);
    const existing = clients.get(key);
    if (existing !== undefined) {
      const changed = existing.manifestRef.current.revision !== manifest.revision;
      existing.manifestRef.current = manifest;
      if (changed) {
        existing.actor.send({ type: 'resolve', resolution: manifest.identity.resolution });
      }
      return existing;
    }
    const manifestRef = { current: manifest };
    const authority: ParameterAuthority = {
      path: () => absolutePath(filePath),
      read: async (_target, signal) => {
        signal.throwIfAborted();
        const path = absolutePath(filePath);
        return (await options.client.exists(path)) ? options.client.readFile(path) : null;
      },
      writeChecked: async ({ signal, ...write }) => {
        signal?.throwIfAborted();
        return options.client.writeFileChecked(write);
      },
    };
    const actor = createActor(
      parameterSetMachine.provide({
        actors: {
          loadParameterSet: fromPromise(async ({ input, signal }) =>
            input.current !== undefined && input.current.manifest.revision === manifestRef.current.revision
              ? refreshParameterSnapshot({ current: input.current, authority, signal })
              : loadParameterSnapshot({
                  target,
                  authority,
                  manifest: async () => manifestRef.current,
                  signal,
                  resolution: input.resolution,
                }),
          ),
          commitParameterSet: fromPromise(async ({ input: change, signal }) =>
            commitParameterChange({ change, authority, signal }),
          ),
          observeParameterSet: fromCallback(({ sendBack }) => {
            try {
              return options.subscribe(parameterEntryPath(filePath), () => {
                sendBack({ type: 'watch.changed' });
              });
            } catch (error) {
              sendBack({
                type: 'watch.error',
                message: error instanceof Error ? error.message : 'Observation failed.',
              });
              return () => undefined;
            }
          }),
        },
      }),
      { input: { target, resolution: manifest.identity.resolution } },
    );
    const state: TargetState = { target, manifestRef, actor };
    actor.start();
    clients.set(key, state);
    actorsChanged();
    return state;
  };

  async function resolveState(state: TargetState): Promise<ParameterSetAuthoritySnapshot> {
    const matches = (): boolean =>
      state.actor.getSnapshot().context.current?.manifest.revision === state.manifestRef.current.revision;
    if (!matches() && !state.actor.getSnapshot().matches({ open: 'loading' })) {
      state.actor.send({ type: 'resolve', resolution: state.manifestRef.current.identity.resolution });
    }
    const snapshot = await waitFor(
      state.actor,
      (snapshot) =>
        snapshot.matches({ open: 'disconnected' }) ||
        snapshot.matches({ open: 'uncertain' }) ||
        snapshot.status === 'done' ||
        (snapshot.context.current?.manifest.revision === state.manifestRef.current.revision &&
          snapshot.matches({ open: 'ready' })),
    );
    if (
      snapshot.context.current === undefined ||
      snapshot.matches({ open: 'disconnected' }) ||
      snapshot.matches({ open: 'uncertain' }) ||
      snapshot.status === 'done'
    ) {
      throw Object.assign(new Error(snapshot.context.diagnostic?.message ?? 'Parameter authority is unavailable.'), {
        code: snapshot.context.diagnostic?.code ?? 'RESOLUTION_FAILED',
      });
    }
    return snapshot.context.current;
  }

  const draftsUnder = (filePath: string | undefined): Array<Readonly<{ key: string; draft: UnsavedParameterDraft }>> =>
    [...drafts].flatMap(([key, retained]) => {
      const { entry } = retained.key.target;
      if (filePath !== undefined && !pathMatches(entry, filePath)) {
        return [];
      }
      return [
        {
          key,
          draft: { entry, label: retained.label, reason: retained.draft.valid ? 'unsubmitted' : 'invalid' },
        },
      ];
    });
  let lastRefusedDraftKeys: readonly string[] = [];
  const refuseUnsaved = (operation: UnsavedParameterDraftsRefusal['operation'], filePath?: string): void => {
    const retained = draftsUnder(filePath);
    const unsaved = retained.map(({ draft }) => draft);
    if (unsaved.length === 0) {
      return;
    }
    lastRefusedDraftKeys = retained.map(({ key }) => key);
    unsavedRefusals.emit({ operation, drafts: unsaved });
    const unsubmitted = unsaved.filter(({ reason }) => reason === 'unsubmitted').length;
    throw Object.assign(
      new Error(
        unsubmitted === unsaved.length
          ? 'Some parameter edits were typed but not entered. Enter or discard them first.'
          : 'Some parameter edits are invalid or were not entered. Fix, enter or discard them first.',
      ),
      { code: 'UNSAVED_PARAMETER_DRAFTS', drafts: unsaved },
    );
  };

  async function closeState(state: TargetState): Promise<void> {
    state.actor.send({ type: 'close' });
    const snapshot = await waitFor(
      state.actor,
      (snapshot) => snapshot.status === 'done' || snapshot.matches({ open: 'uncertain' }),
    );
    if (snapshot.status !== 'done') {
      throw Object.assign(new Error('The last parameter write remains uncertain.'), { code: 'WRITE_UNCERTAIN' });
    }
  }

  /** A reader that arrives mid-relocation waits for the file operation to settle instead of failing. */
  const resolveTarget = async (
    target: ParameterSetTarget,
    manifest: ParameterManifest,
  ): Promise<ParameterSetAuthoritySnapshot> => {
    while (isRelocating(target.entry) && activeRelocations.size > 0) {
      // oxlint-disable-next-line no-await-in-loop -- each settled relocation can reveal a newer one.
      await Promise.all(activeRelocations);
    }
    return resolveState(stateFor(target.entry, manifest, target));
  };

  const resolve = async (filePath: string, manifest: ParameterManifest): Promise<ParameterSetAuthoritySnapshot> =>
    resolveTarget(targetFor(filePath), manifest);

  const submitRequest = async (
    input: Readonly<{
      filePath: string;
      manifest: ParameterManifest;
      request: ParameterSetRequest;
      target: ParameterSetTarget;
    }>,
  ): Promise<ParameterSetOutcome> => {
    const { filePath, manifest, request, target } = input;
    const state = stateFor(filePath, manifest, target);
    if (state.actor.getSnapshot().context.current === undefined) {
      await resolveState(state);
    }
    return submitParameterRequest(state.actor, request);
  };

  const submitOperation = async (
    input: Readonly<{
      filePath: string;
      manifest: ParameterManifest;
      operation: ParameterSetOperation;
      target: ParameterSetTarget;
      expected?: ParameterSetAuthoritySnapshot['identity'];
    }>,
  ): Promise<void> => {
    const { filePath, manifest, operation, target } = input;
    const state = stateFor(filePath, manifest, target);
    const current = state.actor.getSnapshot().context.current ?? (await resolveTarget(state.target, manifest));
    const requestId = `browser:${filePath}:${++sequence}`;
    const outcome = await submitRequest({
      filePath,
      manifest,
      request: {
        requestId,
        expected: input.expected ?? current.identity,
        pressure: 'final',
        operation,
      },
      target: state.target,
    });
    if (outcome.status !== 'committed') {
      throw operationError(outcome);
    }
  };

  const valuesFor = (values: Readonly<Record<string, unknown>>): Readonly<Record<string, JSONValue>> =>
    fileParameterEntrySchema.parse({ activeGroup: 'default', groups: { default: { values } } }).groups['default']!
      .values;

  const retire = async (filePath: string): Promise<void> => {
    const items = [...clients].filter(([, state]) => state.target.entry === filePath);
    await Promise.all(
      items.map(async ([key, state]) => {
        await closeState(state);
        clients.delete(key);
        actorsChanged();
      }),
    );
  };

  const runCleanup = async (key: string): Promise<void> => {
    const cleanup = pendingCleanups.get(key);
    if (cleanup === undefined) {
      return;
    }
    const operation = (async (): Promise<void> => {
      try {
        await cleanup();
        pendingCleanups.delete(key);
      } catch (error) {
        options.onError?.(error);
      }
    })();
    cleanupInFlight.add(operation);
    await operation;
    cleanupInFlight.delete(operation);
  };

  const prepareFileOperation = async (operation: FileOperation): Promise<PreparedFileOperation> => {
    if (closed || closing) {
      throw new DOMException('The parameter service is closed.', 'AbortError');
    }
    const operationPath = operation.kind === 'move' ? operation.oldPath : operation.path;
    const protectedPaths = operation.kind === 'move' ? [operation.oldPath, operation.newPath] : [operation.path];
    for (const path of protectedPaths) {
      relocatingPaths.add(path);
    }
    const settled = Promise.withResolvers<void>();
    activeRelocations.add(settled.promise);
    let finished = false;
    const finish = (): void => {
      if (finished) {
        return;
      }
      finished = true;
      for (const path of protectedPaths) {
        relocatingPaths.delete(path);
      }
      activeRelocations.delete(settled.promise);
      settled.resolve();
    };
    const matches = (candidate: string): boolean => pathMatches(candidate, operationPath);
    try {
      refuseUnsaved('relocate', operationPath);
      await Promise.all(
        [...new Set([...clients.values()].map(({ target }) => target.entry))]
          .filter((candidate) => matches(candidate))
          .map(async (candidate) => retire(candidate)),
      );
    } catch (error) {
      finish();
      throw error;
    }

    if (operation.kind === 'move') {
      const sidecars = [
        {
          source: joinPath(options.rootDirectory, parameterEntryPath(operation.oldPath)),
          target: joinPath(options.rootDirectory, parameterEntryPath(operation.newPath)),
        },
        {
          source: joinPath(options.rootDirectory, parametersDirectory, operation.oldPath),
          target: joinPath(options.rootDirectory, parametersDirectory, operation.newPath),
        },
      ];
      const movedSidecars: Array<(typeof sidecars)[number]> = [];
      return {
        commit: async () => {
          await Promise.all(
            sidecars.map(async (sidecar) => {
              if (await options.client.exists(sidecar.source)) {
                await options.client.mkdir(parentDirectory(sidecar.target), { recursive: true });
                await options.client.move(sidecar.source, sidecar.target);
                movedSidecars.push(sidecar);
              }
            }),
          );
          finish();
        },
        rollback: async () => {
          await Promise.all(
            [...movedSidecars].toReversed().map(async (sidecar) => {
              if ((await options.client.exists(sidecar.target)) && !(await options.client.exists(sidecar.source))) {
                await options.client.mkdir(parentDirectory(sidecar.source), { recursive: true });
                await options.client.move(sidecar.target, sidecar.source);
              }
            }),
          );
          finish();
        },
      };
    }

    const sidecar = joinPath(
      options.rootDirectory,
      operation.directory ? joinPath(parametersDirectory, operation.path) : parameterEntryPath(operation.path),
    );
    return {
      commit: async () => {
        pendingCleanups.set(sidecar, async () => {
          if (await options.client.exists(sidecar)) {
            await (operation.directory
              ? options.client.rmdir(sidecar, { recursive: true })
              : options.client.unlink(sidecar));
          }
        });
        await runCleanup(sidecar);
        finish();
      },
      rollback: async () => {
        finish();
      },
    };
  };

  const commitValue: ParameterSetService['commitValue'] = async (target, manifest, field) => {
    const state = stateFor(target.entry, manifest, target);
    const current = state.actor.getSnapshot().context.current ?? (await resolveState(state));
    const requestId = `browser:${target.entry}:${++sequence}`;
    return submitRequest({
      filePath: target.entry,
      manifest,
      target: state.target,
      request: {
        requestId,
        expected: current.identity,
        pressure: field.pressure ?? 'final',
        ...(field.base === undefined ? {} : { base: field.base }),
        operation: {
          kind: 'native-value',
          group: field.group,
          pointer: field.pointer,
          value: field.value,
        },
      },
    });
  };

  return {
    target: targetFor,
    snapshot: currentFor,
    actor: actorFor,
    draft: (key) => drafts.get(draftKey(key))?.draft,
    setDraft: (key, draft) => {
      const mapKey = draftKey(key);
      if (draft === undefined) {
        if (!drafts.delete(mapKey)) {
          return;
        }
      } else {
        drafts.set(mapKey, { key, draft, label: draftLabel(key.group, key.pointer) });
      }
      draftChanges.emit();
    },
    subscribeDrafts: (listener) => draftChanges.subscribe(listener),
    commitValue,
    resolve,
    resolveTarget,
    readSettled: async (filePath) => {
      const state = [...clients.values()].find(({ target }) => target.entry === filePath);
      if (state !== undefined) {
        const settled = await waitFor(
          state.actor,
          (snapshot) =>
            snapshot.matches({ open: 'ready' }) ||
            snapshot.matches({ open: 'disconnected' }) ||
            snapshot.matches({ open: 'uncertain' }) ||
            snapshot.status === 'done',
        );
        if (!settled.matches({ open: 'ready' })) {
          throw new Error(settled.context.diagnostic?.message ?? 'Parameter writes have not settled.');
        }
      }
      const path = absolutePath(filePath);
      if (!(await options.client.exists(path))) {
        return undefined;
      }
      const bytes = await options.client.readFile(path);
      return bytes;
    },
    replaceValues: async (filePath, manifest, values) => {
      await submitOperation({
        filePath,
        manifest,
        operation: {
          kind: 'replace-group-values',
          group: currentFor(filePath)?.entry.activeGroup ?? 'default',
          values: valuesFor(values),
        },
        target: targetFor(filePath),
      });
    },
    replaceTargetValues: async (target, manifest, { values, expected }) => {
      await submitOperation({
        filePath: target.entry,
        manifest,
        operation: {
          kind: 'replace-group-values',
          group: currentFor(target.entry)?.entry.activeGroup ?? 'default',
          values: valuesFor(values),
        },
        target,
        ...(expected === undefined ? {} : { expected }),
      });
    },
    submitValue: async (target, manifest, { group, pointer, value, base }) => {
      const outcome = await commitValue(target, manifest, { group, pointer, value, base });
      if (outcome.status !== 'committed') {
        throw operationError(outcome);
      }
    },
    selectGroup: async (filePath, manifest, group) => {
      await submitOperation({
        filePath,
        manifest,
        operation: { kind: 'select-group', group },
        target: targetFor(filePath),
      });
    },
    createGroup: async (filePath, manifest, { group, values }) => {
      await submitOperation({
        filePath,
        manifest,
        operation: { kind: 'create-group', group, ...(values === undefined ? {} : { values: valuesFor(values) }) },
        target: targetFor(filePath),
      });
    },
    deleteGroup: async (filePath, manifest, group) => {
      await submitOperation({
        filePath,
        manifest,
        operation: { kind: 'delete-group', group },
        target: targetFor(filePath),
      });
      const discarded = [...drafts].filter(
        ([, retained]) => retained.key.target.entry === filePath && retained.key.group === group,
      );
      for (const [key] of discarded) {
        drafts.delete(key);
      }
      if (discarded.length > 0) {
        draftChanges.emit();
      }
    },
    renameGroup: async (filePath, manifest, { group, nextGroup }) => {
      await submitOperation({
        filePath,
        manifest,
        operation: { kind: 'rename-group', group, nextGroup },
        target: targetFor(filePath),
      });
      const renamed = [...drafts].filter(
        ([, retained]) => retained.key.target.entry === filePath && retained.key.group === group,
      );
      for (const [key, retained] of renamed) {
        drafts.delete(key);
        const nextKey = { ...retained.key, group: nextGroup };
        drafts.set(draftKey(nextKey), {
          ...retained,
          key: nextKey,
          label: draftLabel(nextGroup, nextKey.pointer),
        });
      }
      if (renamed.length > 0) {
        draftChanges.emit();
      }
    },
    subscribeActors: (listener) => actorChanges.subscribe(listener),
    resetRecord: async (filePath) => {
      const path = absolutePath(filePath);
      const preserved = (await options.client.exists(path)) ? await options.client.readFile(path) : null;
      const result = await options.client.writeFileChecked({
        path,
        data: serializeParameterRecord(
          fileParameterEntrySchema.parse({ activeGroup: 'default', groups: { default: { values: {} } } }),
        ),
        preconditions: [{ path, expected: preserved }],
      });
      if (result.status === 'conflict') {
        throw Object.assign(new Error('The parameter record changed while it was being reset.'), {
          code: 'STALE_MANIFEST',
        });
      }
      actorFor(filePath)?.send({ type: 'watch.changed' });
    },
    discardDrafts: (filePath) => {
      const keys =
        filePath === undefined && lastRefusedDraftKeys.length > 0
          ? lastRefusedDraftKeys
          : draftsUnder(filePath).map(({ key }) => key);
      let changed = false;
      for (const key of keys) {
        changed = drafts.delete(key) || changed;
      }
      if (filePath === undefined) {
        lastRefusedDraftKeys = [];
      }
      if (changed) {
        draftChanges.emit();
      }
    },
    subscribeUnsavedDrafts: (listener) => unsavedRefusals.subscribe(listener),
    prepareFileOperation,
    close: async () => {
      if (closed) {
        return;
      }
      if (closePromise !== undefined) {
        return closePromise;
      }
      closing = true;
      const operation = async (): Promise<void> => {
        await Promise.all(activeRelocations);
        await Promise.all(cleanupInFlight);
        await Promise.all([...pendingCleanups].map(async ([key]) => runCleanup(key)));
        if (pendingCleanups.size > 0) {
          throw Object.assign(new Error('Parameter sidecar cleanup is incomplete.'), {
            code: 'PARAMETER_FILE_OPERATION_INCOMPLETE',
          });
        }
        refuseUnsaved('close');
        const states = [...clients.values()];
        await Promise.all(states.map(async (state) => closeState(state)));
        clients.clear();
        drafts.clear();
        closed = true;
        actorsChanged();
      };
      closePromise = operation();
      try {
        await closePromise;
      } catch (error) {
        closePromise = undefined;
        closing = false;
        throw error;
      }
    },
  };
};
