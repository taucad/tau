import { describe, expect, it, vi } from 'vitest';
import { createAsyncLogic, toPromise } from 'xstate';
import type { AnyMachineSnapshot } from 'xstate';
import { StepClock } from '@taucad/xstate-testing/clock';
import { guardActors } from '@taucad/xstate-testing/inspect';
import { unansweredEvents } from '@taucad/xstate-testing/paths';
import {
  createProjectIdentityActor,
  createProjectIdentityResolver,
  createProjectManifestConversionActor,
  parseProjectIdentityBytes,
  serializeProjectIdentity,
  projectIdentityMachine,
  projectIdentityResolverMachine,
} from '@taucad/project-core/identity';
import type {
  ProjectIdentityActors,
  ProjectIdentityInput,
  ProjectIdentityLocation,
  ProjectIdentityRecord,
  InitializeProjectIdentityInput,
  ProjectIdentityResult,
  ProjectManifestConversionInput,
  ProjectManifestReplacementResult,
} from '@taucad/project-core/identity';

const id = 'proj_0123456789ABCDEFGHIJK';
const otherId = 'proj_zzzzzzzzzzzzzzzzzzzzz';
const record: ProjectIdentityRecord = { version: 1, projectId: id };
const input: ProjectIdentityInput = { locationKey: '/project', mode: 'ensure' };
const effects = (
  initial?: ProjectIdentityRecord,
): { actors: ProjectIdentityActors; reads: ReturnType<typeof vi.fn>; writes: ReturnType<typeof vi.fn> } => {
  const reads = vi.fn();
  const writes = vi.fn();
  let stored = initial;
  return {
    reads,
    writes,
    actors: {
      readIdentity: createAsyncLogic<ProjectIdentityRecord | undefined, ProjectIdentityLocation>({
        run: async ({ signal }) => {
          signal.throwIfAborted();
          reads();
          return stored;
        },
      }),
      mintIdentity: createAsyncLogic<string, ProjectIdentityLocation>({
        run: async ({ signal }) => {
          signal.throwIfAborted();
          return id;
        },
      }),
      initializeIdentity: createAsyncLogic<ProjectIdentityRecord, InitializeProjectIdentityInput>({
        run: async ({ input, signal }) => {
          signal.throwIfAborted();
          writes();
          stored ??= { version: 1, projectId: input.projectId };
          return stored;
        },
      }),
    },
  };
};

describe('project identity lifecycle', () => {
  it('validates bounded strict durable records', () => {
    expect(parseProjectIdentityBytes(serializeProjectIdentity(record))).toEqual(record);
    expect(() =>
      parseProjectIdentityBytes(new TextEncoder().encode(JSON.stringify({ ...record, name: 'extra' }))),
    ).toThrow();
    expect(() => parseProjectIdentityBytes(new Uint8Array(1025))).toThrow('exceeds 1024');
  });

  it('preserves a supplied cloud identity without minting another', async () => {
    const host = effects();
    const guard = guardActors();
    const actor = createProjectIdentityActor({
      input: { ...input, preferredProjectId: otherId },
      actors: host.actors,
      clock: new StepClock(),
      inspect: guard.inspect,
    });
    actor.start();
    expect(await toPromise(actor)).toEqual({ status: 'resolved', projectId: otherId });
    expect(host.writes).toHaveBeenCalledTimes(1);
    actor.stop();
  });

  it('never overwrites conflicting established identity', async () => {
    const host = effects(record);
    const guard = guardActors();
    const actor = createProjectIdentityActor({
      input: { ...input, preferredProjectId: otherId },
      actors: host.actors,
      clock: new StepClock(),
      inspect: guard.inspect,
    });
    actor.start();
    expect(await toPromise(actor)).toEqual({ status: 'conflict', expectedProjectId: otherId, actualProjectId: id });
    expect(host.writes).not.toHaveBeenCalled();
    actor.stop();
  });

  it('keeps read-only missing identity missing and uses preloaded evidence without another read', async () => {
    const host = effects();
    const guard = guardActors();
    const actor = createProjectIdentityActor({
      input: { ...input, mode: 'read', initialIdentity: { record: undefined } },
      actors: host.actors,
      clock: new StepClock(),
      inspect: guard.inspect,
    });
    actor.start();
    expect(await toPromise(actor)).toEqual({ status: 'missing' });
    expect(host.reads).not.toHaveBeenCalled();
    expect(host.writes).not.toHaveBeenCalled();
    actor.stop();
  });

  it('coalesces concurrent callers, caches warm results, invalidates and bounds retained records', async () => {
    const host = effects(record);
    const guard = guardActors();
    const resolver = createProjectIdentityResolver({
      actors: host.actors,
      capacity: 2,
      clock: new StepClock(),
      inspect: guard.inspect,
    });
    resolver.actor.start();
    try {
      expect(await Promise.all([resolver.resolve(input), resolver.resolve(input)])).toEqual([
        { status: 'resolved', projectId: id },
        { status: 'resolved', projectId: id },
      ]);
      expect(host.reads).toHaveBeenCalledTimes(1);
      await resolver.resolve(input);
      expect(host.reads).toHaveBeenCalledTimes(1);
      resolver.invalidate({ locationKey: input.locationKey });
      await resolver.resolve(input);
      await resolver.resolve({ ...input, locationKey: '/second' });
      await resolver.resolve({ ...input, locationKey: '/third' });
      expect(Object.keys(resolver.actor.getSnapshot().context.cache)).toHaveLength(2);
      expect(Object.keys(resolver.actor.getSnapshot().context.pending)).toHaveLength(0);
      await resolver.resolve(input);
      expect(host.reads).toHaveBeenCalledTimes(5);
      await resolver.resolve({ ...input, fresh: true });
      expect(host.reads).toHaveBeenCalledTimes(6);
    } finally {
      resolver.actor.stop();
    }
  });

  it('validates supplied current evidence without allocating I/O children or trusting old cache', async () => {
    const host = effects();
    const guard = guardActors();
    const resolver = createProjectIdentityResolver({
      actors: host.actors,
      capacity: 0,
      clock: new StepClock(),
      inspect: guard.inspect,
    });
    resolver.actor.start();
    try {
      expect(await resolver.resolve({ ...input, initialIdentity: { record } })).toEqual({
        status: 'resolved',
        projectId: id,
      });
      expect(
        await resolver.resolve({
          ...input,
          preferredProjectId: id,
          initialIdentity: { record: { version: 1, projectId: otherId } },
        }),
      ).toEqual({ status: 'conflict', expectedProjectId: id, actualProjectId: otherId });
      expect(host.reads).not.toHaveBeenCalled();
      expect(host.writes).not.toHaveBeenCalled();
      expect(resolver.actor.getSnapshot().context.sequence).toBe(0);
      expect(Object.keys(resolver.actor.getSnapshot().context.cache)).toHaveLength(0);
    } finally {
      resolver.actor.stop();
    }
  });

  it('fences older pending reads when current supplied identity replaces their evidence', async () => {
    const host = effects();
    const guard = guardActors();
    let finishRead: ((record: ProjectIdentityRecord) => void) | undefined;
    const resolver = createProjectIdentityResolver({
      actors: {
        ...host.actors,
        readIdentity: createAsyncLogic<ProjectIdentityRecord | undefined, ProjectIdentityLocation>({
          run: async () =>
            new Promise((resolve) => {
              finishRead = resolve;
            }),
        }),
      },
      clock: new StepClock(),
      inspect: guard.inspect,
    });
    resolver.actor.start();
    try {
      const older = resolver.resolve(input);
      expect(
        await resolver.resolve({ ...input, initialIdentity: { record: { version: 1, projectId: otherId } } }),
      ).toEqual({ status: 'resolved', projectId: otherId });
      expect(await older).toMatchObject({ status: 'failed' });
      finishRead?.(record);
      await Promise.resolve();
      expect(await resolver.resolve(input)).toEqual({ status: 'resolved', projectId: otherId });
    } finally {
      resolver.actor.stop();
    }
  });

  it('coalesces identical supplied-absence initialization requests without canceling their winner', async () => {
    const host = effects();
    const guard = guardActors();
    const resolver = createProjectIdentityResolver({
      actors: host.actors,
      clock: new StepClock(),
      inspect: guard.inspect,
    });
    resolver.actor.start();
    try {
      const request = { ...input, preferredProjectId: otherId, initialIdentity: { record: undefined } };
      expect(await Promise.all([resolver.resolve(request), resolver.resolve(request)])).toEqual([
        { status: 'resolved', projectId: otherId },
        { status: 'resolved', projectId: otherId },
      ]);
      expect(host.reads).not.toHaveBeenCalled();
      expect(host.writes).toHaveBeenCalledTimes(1);
    } finally {
      resolver.actor.stop();
    }
  });

  it('fences pending and cached identities when supplied current evidence says the record is absent', async () => {
    const host = effects();
    const guard = guardActors();
    let finishRead: ((record: ProjectIdentityRecord | undefined) => void) | undefined;
    let finishWrite: ((record: ProjectIdentityRecord) => void) | undefined;
    const resolver = createProjectIdentityResolver({
      actors: {
        ...host.actors,
        readIdentity: createAsyncLogic<ProjectIdentityRecord | undefined, ProjectIdentityLocation>({
          run: async () =>
            new Promise((resolve) => {
              finishRead = resolve;
            }),
        }),
        initializeIdentity: createAsyncLogic<ProjectIdentityRecord, InitializeProjectIdentityInput>({
          run: async () =>
            new Promise((resolve) => {
              finishWrite = resolve;
            }),
        }),
      },
      clock: new StepClock(),
      inspect: guard.inspect,
    });
    resolver.actor.start();
    try {
      await resolver.resolve({ ...input, initialIdentity: { record } });
      const older = resolver.resolve({ ...input, fresh: true, initialIdentity: { record: undefined } });
      const finishOlderRead = finishRead;
      const initializing = resolver.resolve({
        ...input,
        preferredProjectId: otherId,
        initialIdentity: { record: undefined },
      });
      expect(await older).toMatchObject({ status: 'failed' });
      expect(Object.keys(resolver.actor.getSnapshot().context.cache)).toHaveLength(0);
      const duringInitialization = resolver.resolve({ ...input, mode: 'read' });
      finishRead?.(undefined);
      expect(await duringInitialization).toEqual({ status: 'missing' });
      finishWrite?.({ version: 1, projectId: otherId });
      expect(await initializing).toEqual({ status: 'resolved', projectId: otherId });
      finishOlderRead?.(record);
      await Promise.resolve();
      expect(await resolver.resolve(input)).toEqual({ status: 'resolved', projectId: otherId });
    } finally {
      resolver.actor.stop();
    }
  });

  it('settles pending callers on invalidation and stop and does not cache stale late reads', async () => {
    const host = effects();
    const guard = guardActors();
    const resolver = createProjectIdentityResolver({
      actors: {
        ...host.actors,
        readIdentity: createAsyncLogic<ProjectIdentityRecord | undefined, ProjectIdentityLocation>({
          run: async ({ signal }) =>
            new Promise((resolve) => {
              signal.addEventListener(
                'abort',
                () => {
                  resolve(record);
                },
                { once: true },
              );
            }),
        }),
      },
      clock: new StepClock(),
      inspect: guard.inspect,
    });
    resolver.actor.start();
    const pending = resolver.resolve(input);
    resolver.invalidate({ locationKey: input.locationKey });
    expect(await pending).toMatchObject({ status: 'failed' });
    expect(Object.keys(resolver.actor.getSnapshot().context.cache)).toHaveLength(0);
    const next = resolver.resolve(input);
    resolver.actor.stop();
    expect(await next).toMatchObject({ status: 'failed' });
    expect(await resolver.resolve(input)).toMatchObject({ status: 'failed' });
  });

  it.each(['resolved', 'conflict', 'failed'] as const)(
    'converts only after durable identity is established (%s)',
    async (status) => {
      const writes = vi.fn();
      const guard = guardActors();
      const actor = createProjectManifestConversionActor({
        input: { projectId: id },
        clock: new StepClock(),
        inspect: guard.inspect,
        actors: {
          establishIdentity: createAsyncLogic<ProjectIdentityResult, ProjectManifestConversionInput>({
            run: async () =>
              status === 'resolved'
                ? { status, projectId: id }
                : status === 'conflict'
                  ? { status, expectedProjectId: id, actualProjectId: otherId }
                  : { status, message: 'Read-only storage.' },
          }),
          replaceManifest: createAsyncLogic<ProjectManifestReplacementResult, ProjectManifestConversionInput>({
            run: async () => {
              writes();
              return 'converted';
            },
          }),
        },
      });
      actor.start();
      expect(await toPromise(actor)).toMatchObject({ status: status === 'resolved' ? 'converted' : status });
      expect(writes).toHaveBeenCalledTimes(status === 'resolved' ? 1 : 0);
      actor.stop();
    },
  );

  it('cancels conversion before identity persistence finishes without replacing the manifest', async () => {
    const guard = guardActors();
    const writes = vi.fn();
    const actor = createProjectManifestConversionActor({
      input: { projectId: id },
      clock: new StepClock(),
      inspect: guard.inspect,
      actors: {
        establishIdentity: createAsyncLogic<ProjectIdentityResult, ProjectManifestConversionInput>({
          run: async ({ signal }) =>
            new Promise((resolve) => {
              signal.addEventListener(
                'abort',
                () => {
                  resolve({ status: 'resolved', projectId: id });
                },
                { once: true },
              );
            }),
        }),
        replaceManifest: createAsyncLogic<ProjectManifestReplacementResult, ProjectManifestConversionInput>({
          run: async () => {
            writes();
            return 'converted';
          },
        }),
      },
    });
    actor.start();
    actor.send({ type: 'cancel' });
    expect(await toPromise(actor)).toEqual({ status: 'failed', message: 'Manifest conversion was canceled.' });
    expect(writes).not.toHaveBeenCalled();
    actor.stop();
  });

  it('adopts the durable winner when another opener wins initialization', async () => {
    const host = effects();
    const guard = guardActors();
    const actor = createProjectIdentityActor({
      input,
      actors: {
        ...host.actors,
        initializeIdentity: createAsyncLogic<ProjectIdentityRecord, InitializeProjectIdentityInput>({
          run: async () => ({ version: 1, projectId: otherId }),
        }),
      },
      clock: new StepClock(),
      inspect: guard.inspect,
    });
    actor.start();
    expect(await toPromise(actor)).toEqual({ status: 'resolved', projectId: otherId });
    actor.stop();
  });

  it('does not cache failed persistence or missing records', async () => {
    const host = effects();
    const guard = guardActors();
    const resolver = createProjectIdentityResolver({
      actors: {
        ...host.actors,
        initializeIdentity: createAsyncLogic<ProjectIdentityRecord, InitializeProjectIdentityInput>({
          run: async () => {
            throw new Error('Storage is read-only.');
          },
        }),
      },
      clock: new StepClock(),
      inspect: guard.inspect,
    });
    resolver.actor.start();
    try {
      expect(await resolver.resolve(input)).toEqual({ status: 'failed', message: 'Storage is read-only.' });
      expect(await resolver.resolve({ ...input, mode: 'read' })).toEqual({ status: 'missing' });
      expect(Object.keys(resolver.actor.getSnapshot().context.cache)).toHaveLength(0);
      expect(host.reads).toHaveBeenCalledTimes(2);
    } finally {
      resolver.actor.stop();
    }
  });

  it('answers sampled public events throughout reachable resolution and coordinator states', () => {
    const serializeState = (snapshot: AnyMachineSnapshot): string => JSON.stringify(snapshot.value);
    expect(
      unansweredEvents(projectIdentityMachine, { input, events: [{ type: 'cancel' }], limit: 50, serializeState }),
    ).toEqual([]);
    expect(
      unansweredEvents(projectIdentityResolverMachine, {
        input: {},
        events: [{ type: 'clear' }, { type: 'invalidate', locationKey: '/project' }],
        limit: 50,
        serializeState,
      }),
    ).toEqual([]);
  });
});
