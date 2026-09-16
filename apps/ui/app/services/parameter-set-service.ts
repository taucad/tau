import type { ComposedViewClient } from '@taucad/fs-client/composed-view-client';
import type { FileOperation, PreparedFileOperation } from '@taucad/fs-client/file-content-service';
import { createActor, fromCallback, fromPromise, waitFor } from 'xstate';
import type { ActorRefFrom } from 'xstate';
import { fileParameterEntrySchema, parameterEntryPath, parametersDirectory } from '@taucad/types';
import type { JSONValue } from '@taucad/types';
import { loadParameterSnapshot, refreshParameterSnapshot, commitParameterChange } from '@taucad/parameters/authority';
import type { ParameterAuthority } from '@taucad/parameters/authority';
import { parameterSetMachine, submitParameterRequest } from '@taucad/parameters/set-machine';
import { parameterInputMachine } from '@taucad/parameters/input-machine';
import type {
  ParameterInputBinding,
  ParameterInputMachineInput,
  ParameterInputMachineEmitted,
} from '@taucad/parameters/input-machine';
import { valueAtPointer } from '@taucad/parameters';
import type {
  ParameterManifest,
  ParameterSetAuthoritySnapshot,
  ParameterSetIdentity,
  ParameterSetOperation,
  ParameterSetOutcome,
  ParameterSetRequest,
  ParameterSetTarget,
} from '@taucad/parameters';
import { joinPath, parentDirectory } from '@taucad/utils/path';

type TargetState = {
  target: ParameterSetTarget;
  manifestRef: { current: ParameterManifest };
  actor: ActorRefFrom<typeof parameterSetMachine>;
  unsubscribe: () => void;
};

type InputState = {
  actor: ActorRefFrom<typeof parameterInputMachine>;
  handle: RetainedParameterInput;
  attachments: number;
  targetKey: string;
  label: string;
  unsubscribe: () => void;
};

/** Project-retained parameter input actor and its view attachment. */
export type RetainedParameterInput = Readonly<{
  actor: ActorRefFrom<typeof parameterInputMachine>;
  attach(): () => void;
}>;

/**
 * Editors describe the field they are binding; the service supplies the acknowledged value and
 * revision from the authority it owns, and keeps them current without a React round trip.
 */
export type ParameterInputRequest = Omit<ParameterInputMachineInput, 'acknowledgedValue' | 'acknowledgedRevision'> &
  Readonly<{
    acknowledgedValue?: ParameterInputMachineInput['acknowledgedValue'];
    acknowledgedRevision?: ParameterSetIdentity;
  }>;

/** Project-lifetime facade over one native parameter actor per authority target. */
export type ParameterSetService = Readonly<{
  target(filePath: string, authority?: string): ParameterSetTarget;
  snapshot(filePath: string): ParameterSetAuthoritySnapshot | undefined;
  /** The live set actor for an entry, once `resolve`/`resolveTarget` has created it. */
  actor(filePath: string): ActorRefFrom<typeof parameterSetMachine> | undefined;
  input(input: ParameterInputRequest): RetainedParameterInput;
  resolve(filePath: string, manifest: ParameterManifest): Promise<ParameterSetAuthoritySnapshot>;
  resolveTarget(target: ParameterSetTarget, manifest: ParameterManifest): Promise<ParameterSetAuthoritySnapshot>;
  submit(filePath: string, manifest: ParameterManifest, request: ParameterSetRequest): Promise<ParameterSetOutcome>;
  submitTarget(
    target: ParameterSetTarget,
    manifest: ParameterManifest,
    request: ParameterSetRequest,
  ): Promise<ParameterSetOutcome>;
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
  movePath(oldPath: string, newPath: string, directory: boolean): Promise<void>;
  deletePath(path: string, directory: boolean): Promise<void>;
  prepareFileOperation(operation: FileOperation): Promise<PreparedFileOperation>;
  setBackupOwner(owner: (() => Promise<string>) | undefined): void;
  close(): Promise<void>;
}>;

const operationError = (outcome: Exclude<ParameterSetOutcome, { status: 'committed' }>): Error =>
  Object.assign(new Error('message' in outcome ? outcome.message : 'Parameter operation did not commit.'), {
    code: 'code' in outcome ? outcome.code : outcome.status,
  });

const digestBytes = async (bytes: Uint8Array<ArrayBuffer>): Promise<string> => {
  const digest = new Uint8Array(await globalThis.crypto.subtle.digest('SHA-256', bytes));
  return `sha256:${[...digest].map((byte) => byte.toString(16).padStart(2, '0')).join('')}`;
};

const staleManifest = (message: string): Error => Object.assign(new Error(message), { code: 'STALE_MANIFEST' });

/** Create the single browser parameter-set owner for a project. */
export const createParameterSetService = (
  options: Readonly<{
    rootDirectory: string;
    client: Pick<
      ComposedViewClient,
      'exists' | 'readFile' | 'writeFileChecked' | 'move' | 'unlink' | 'rmdir' | 'mkdir'
    >;
    subscribe(path: string, listener: () => void): () => void;
    onError?(error: unknown): void;
  }>,
): ParameterSetService => {
  let sequence = 0;
  let backupOwner: (() => Promise<string>) | undefined;
  const clients = new Map<string, TargetState>();
  const inputs = new Map<string, InputState>();
  /** Editor submissions awaiting their set actor's `settled` emission, keyed by request ID. */
  const pendingSubmissions = new Map<
    string,
    Readonly<{ actor: ActorRefFrom<typeof parameterInputMachine>; generation: number }>
  >();
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
  const inputKey = (input: ParameterInputRequest): string =>
    JSON.stringify([
      targetKey(input.binding.target),
      input.editorInstance,
      input.binding.group,
      input.binding.parameterId,
      input.binding.resource,
      input.binding.pointer,
    ]);
  const absolutePath = (filePath: string): string => joinPath(options.rootDirectory, parameterEntryPath(filePath));
  const actorFor = (filePath: string): ActorRefFrom<typeof parameterSetMachine> | undefined =>
    [...clients.values()].find(({ target }) => target.entry === filePath)?.actor;
  const currentFor = (filePath: string): ParameterSetAuthoritySnapshot | undefined =>
    actorFor(filePath)?.getSnapshot().context.current;
  const boundValue = (
    current: ParameterSetAuthoritySnapshot,
    binding: ParameterInputBinding,
  ): number | string | undefined => {
    const value = valueAtPointer(current.entry.groups[binding.group]?.values ?? {}, binding.pointer);
    return typeof value === 'number' || typeof value === 'string' ? value : undefined;
  };
  /**
   * Authority changes reach editors actor-to-actor, and only where the editor's own field moved.
   * A foreign edit therefore refreshes exactly one input instead of every bound field, and a stale
   * revision on an untouched field is rebased by the planner from the request's `base`.
   */
  const refreshInputs = (target: ParameterSetTarget, current: ParameterSetAuthoritySnapshot): void => {
    const key = targetKey(target);
    for (const state of inputs.values()) {
      if (state.targetKey !== key) {
        continue;
      }
      const { acknowledged } = state.actor.getSnapshot().context;
      const value = boundValue(current, acknowledged.binding);
      if (value === undefined || Object.is(value, acknowledged.value)) {
        continue;
      }
      state.actor.send({
        type: 'refreshAuthority',
        binding: acknowledged.binding,
        value,
        revision: current.identity,
      });
    }
  };
  const pathMatches = (candidate: string, path: string): boolean =>
    candidate === path || candidate.startsWith(`${path}/`);
  const assertNotRelocating = (filePath: string): void => {
    if ([...relocatingPaths].some((path) => pathMatches(filePath, path))) {
      throw Object.assign(new Error(`Parameters for ${filePath} are being relocated.`), {
        code: 'PARAMETER_RELOCATING',
      });
    }
  };

  type SourcePrecondition = Readonly<{
    path: string;
    // oxlint-disable-next-line typescript/no-restricted-types -- null is the filesystem CAS contract for an absent file.
    expected: Uint8Array<ArrayBuffer> | null;
  }>;
  const sourcePreconditions = async (
    manifest: ParameterManifest,
    signal: AbortSignal,
  ): Promise<readonly SourcePrecondition[]> => {
    if (manifest.scope.kind !== 'source') {
      return [];
    }
    const sourceFiles = Object.entries(manifest.identity.sourceFiles);
    if (sourceFiles.length === 0) {
      throw staleManifest('The parameter manifest has no source-file snapshot.');
    }
    return Promise.all(
      sourceFiles.map(async ([filePath, expectedDigest]) => {
        signal.throwIfAborted();
        const path = joinPath(options.rootDirectory, filePath.replace(/^\/+/, ''));
        if (!(await options.client.exists(path))) {
          if (expectedDigest !== 'missing') {
            throw staleManifest(`The parameter source ${filePath} no longer matches its manifest.`);
          }
          return { path, expected: null };
        }
        const bytes = await options.client.readFile(path);
        if (expectedDigest === 'missing' || (await digestBytes(bytes)) !== expectedDigest) {
          throw staleManifest(`The parameter source ${filePath} no longer matches its manifest.`);
        }
        return { path, expected: bytes };
      }),
    );
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
      semanticPreconditions: async (_target, signal) => sourcePreconditions(manifestRef.current, signal),
      backupLegacy: async () => {
        if (backupOwner === undefined) {
          throw Object.assign(new Error('Revision backup owner is unavailable.'), { code: 'LEGACY_READ_ONLY' });
        }
        return backupOwner();
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
                  authority: {
                    ...authority,
                    backupLegacy: backupOwner === undefined ? undefined : authority.backupLegacy,
                  },
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
    let last: ParameterSetAuthoritySnapshot | undefined;
    const subscription = actor.subscribe((snapshot) => {
      const { current } = snapshot.context;
      if (current !== undefined && current !== last) {
        last = current;
        refreshInputs(target, current);
      }
    });
    // Settlement is forwarded actor-to-actor inside the emission, so the editing row is
    // acknowledged in the same synchronous turn as the checked write, ahead of any React work.
    const settlement = actor.on('settled', (event) => {
      const requestId = event.request?.requestId ?? event.outcome.requestId;
      const pending = pendingSubmissions.get(requestId);
      if (pending === undefined) {
        return;
      }
      pendingSubmissions.delete(requestId);
      pending.actor.send({ type: 'settleSubmission', generation: pending.generation, outcome: event.outcome });
    });
    const state: TargetState = {
      target,
      manifestRef,
      actor,
      unsubscribe: () => {
        settlement.unsubscribe();
        subscription.unsubscribe();
      },
    };
    actor.start();
    clients.set(key, state);
    return state;
  };

  const disposeInput = (key: string, state: InputState): void => {
    if (inputs.get(key) !== state) {
      return;
    }
    inputs.delete(key);
    state.unsubscribe();
    for (const [requestId, pending] of pendingSubmissions) {
      if (pending.actor === state.actor) {
        pendingSubmissions.delete(requestId);
      }
    }
    state.actor.send({ type: 'close' });
    state.actor.stop();
  };

  const input = (actorInput: ParameterInputRequest): RetainedParameterInput => {
    if (closed || closing) {
      throw new DOMException('The parameter service is closed.', 'AbortError');
    }
    const key = inputKey(actorInput);
    let state = inputs.get(key);
    if (state === undefined) {
      const current = clients.get(targetKey(actorInput.binding.target))?.actor.getSnapshot().context.current;
      const acknowledgedValue =
        (current === undefined ? undefined : boundValue(current, actorInput.binding)) ?? actorInput.acknowledgedValue;
      const acknowledgedRevision = current?.identity ?? actorInput.acknowledgedRevision;
      if (acknowledgedValue === undefined || acknowledgedRevision === undefined) {
        throw Object.assign(new Error('Parameter authority is unavailable for this editor binding.'), {
          code: 'TARGET_UNAVAILABLE',
        });
      }
      const actor = createActor(parameterInputMachine, {
        input: { ...actorInput, acknowledgedValue, acknowledgedRevision },
      });
      const settleLocally = (event: ParameterInputMachineEmitted, outcome: ParameterSetOutcome): void => {
        pendingSubmissions.delete(event.request.requestId);
        actor.send({ type: 'settleSubmission', generation: event.request.draftGeneration, outcome });
      };
      const dispatch = (event: ParameterInputMachineEmitted, state: TargetState): void => {
        pendingSubmissions.set(event.request.requestId, { actor, generation: event.request.draftGeneration });
        state.actor.send({ type: 'submit', request: event.request });
      };
      /** Only an unresolved target needs the async path; a ready one submits in this same turn. */
      const resolveThenDispatch = async (event: ParameterInputMachineEmitted, state: TargetState): Promise<void> => {
        try {
          await resolveState(state.target.entry, state);
          dispatch(event, state);
        } catch (error) {
          settleLocally(event, {
            status: 'known-not-applied-failure',
            requestId: event.request.requestId,
            code: 'RESOLUTION_FAILED',
            message: error instanceof Error ? error.message : 'Parameter authority is unavailable.',
          });
          options.onError?.(error);
        }
      };
      const submission = actor.on('parameterSetIntent', (event) => {
        const targetState = clients.get(targetKey(actorInput.binding.target));
        if (targetState?.actor.getSnapshot().status !== 'active') {
          settleLocally(event, {
            status: 'known-not-applied-failure',
            requestId: event.request.requestId,
            code: 'TARGET_UNAVAILABLE',
            message: 'Parameter authority is unavailable.',
          });
          return;
        }
        if (targetState.actor.getSnapshot().context.current === undefined) {
          // async-iife: bootstrap -- the intent handler cannot return the resolution promise.
          void resolveThenDispatch(event, targetState);
          return;
        }
        dispatch(event, targetState);
      });
      const handle: RetainedParameterInput = {
        actor,
        attach: () => {
          const retained = inputs.get(key);
          if (retained === undefined) {
            return () => undefined;
          }
          let attached = true;
          retained.attachments += 1;
          retained.actor.send({ type: 'attach' });
          return () => {
            if (!attached) {
              return;
            }
            attached = false;
            retained.attachments = Math.max(0, retained.attachments - 1);
            if (retained.attachments === 0) {
              retained.actor.send({ type: 'detach' });
            }
          };
        },
      };
      state = {
        actor,
        handle,
        attachments: 0,
        targetKey: targetKey(actorInput.binding.target),
        label: `${actorInput.binding.group}:${actorInput.binding.pointer}`,
        unsubscribe: () => {
          submission.unsubscribe();
        },
      };
      inputs.set(key, state);
      actor.start();
    }
    return state.handle;
  };

  async function resolveState(_filePath: string, state: TargetState): Promise<ParameterSetAuthoritySnapshot> {
    const matches = (): boolean =>
      state.actor.getSnapshot().context.current?.manifest.revision === state.manifestRef.current.revision;
    if (
      (!matches() || (!state.actor.getSnapshot().context.current?.access.writeAllowed && backupOwner !== undefined)) &&
      !state.actor.getSnapshot().matches({ open: 'loading' })
    ) {
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

  async function closeState(state: TargetState, invalidDrafts: readonly string[]): Promise<void> {
    if (invalidDrafts.length > 0) {
      throw Object.assign(new Error('Resolve or discard invalid parameter drafts before closing.'), {
        code: 'INVALID_DRAFTS',
      });
    }
    state.actor.send({ type: 'close' });
    const snapshot = await waitFor(
      state.actor,
      (snapshot) => snapshot.status === 'done' || snapshot.matches({ open: 'uncertain' }),
    );
    if (snapshot.status !== 'done') {
      throw Object.assign(new Error('The last parameter write remains uncertain.'), { code: 'WRITE_UNCERTAIN' });
    }
  }

  const resolveTarget = async (
    target: ParameterSetTarget,
    manifest: ParameterManifest,
  ): Promise<ParameterSetAuthoritySnapshot> => resolveState(target.entry, stateFor(target.entry, manifest, target));

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
      await resolveState(filePath, state);
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
        draftGeneration: sequence,
        fingerprint: `${requestId}:${JSON.stringify(operation)}`,
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
    fileParameterEntrySchema.parse({
      activeGroup: 'default',
      groups: { default: { values } },
    }).groups['default']!.values;

  const retire = async (filePath: string): Promise<void> => {
    const items = [...clients].filter(([, state]) => state.target.entry === filePath);
    await Promise.all(
      items.map(async ([key, state]) => {
        const invalidDrafts = [...inputs.values()]
          .filter(
            (inputState) =>
              inputState.targetKey === targetKey(state.target) &&
              inputState.actor.getSnapshot().context.draft?.dirty === true,
          )
          .map(({ label }) => label);
        await closeState(state, invalidDrafts);
        state.unsubscribe();
        clients.delete(key);
        for (const [inputKey, inputState] of inputs) {
          if (inputState.targetKey === targetKey(state.target)) {
            disposeInput(inputKey, inputState);
          }
        }
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
    const sourcePath = operation.kind === 'move' ? operation.oldPath : operation.path;
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
    const matches = (candidate: string): boolean => pathMatches(candidate, sourcePath);
    try {
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

  return {
    target: targetFor,
    snapshot: currentFor,
    actor: actorFor,
    input,
    resolve,
    resolveTarget,
    submit: async (filePath, manifest, request) =>
      submitRequest({ filePath, manifest, request, target: targetFor(filePath) }),
    submitTarget: async (target, manifest, request) =>
      submitRequest({ filePath: target.entry, manifest, request, target }),
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
    },
    renameGroup: async (filePath, manifest, { group, nextGroup }) => {
      await submitOperation({
        filePath,
        manifest,
        operation: { kind: 'rename-group', group, nextGroup },
        target: targetFor(filePath),
      });
    },
    movePath: async (oldPath, newPath, _directory) => {
      const prepared = await prepareFileOperation({ kind: 'move', oldPath, newPath });
      try {
        await prepared.commit();
      } catch (error) {
        await prepared.rollback();
        throw error;
      }
    },
    deletePath: async (path, directory) => {
      const prepared = await prepareFileOperation({ kind: 'delete', path, directory });
      try {
        await prepared.commit();
      } catch (error) {
        await prepared.rollback();
        throw error;
      }
    },
    prepareFileOperation,
    setBackupOwner: (owner) => {
      backupOwner = owner;
    },
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
        const invalidDrafts = new Map<string, string[]>();
        for (const state of inputs.values()) {
          if (state.actor.getSnapshot().context.draft?.dirty === true) {
            const current = invalidDrafts.get(state.targetKey) ?? [];
            current.push(state.label);
            invalidDrafts.set(state.targetKey, current);
          }
        }
        const states = [...clients.values()];
        await Promise.all(
          states.map(async (state) => closeState(state, invalidDrafts.get(targetKey(state.target)) ?? [])),
        );
        for (const [key, state] of inputs) {
          disposeInput(key, state);
        }
        for (const state of states) {
          state.unsubscribe();
        }
        clients.clear();
        pendingSubmissions.clear();
        closed = true;
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
