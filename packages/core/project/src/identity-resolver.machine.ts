/**
 * One storage authority's bounded identity cache and concurrent-resolution owner.
 * Cached identities rehydrate from readIdentity. Hosts MUST invalidate on identity
 * file changes, directory replacement, root revocation and reconnect. Destructive
 * authorization uses fresh requests. Only active operations retain child actors.
 */
import { setup, types } from 'xstate';
import type { ActorRefFrom } from 'xstate';
import { knownProjectIdentityResult, projectIdentityMachine } from '#identity.machine.js';
import type { ProjectIdentityInput, ProjectIdentityResult } from '#identity.machine.js';

/** Resolver request; fresh bypasses cached identity for ownership-sensitive work. @public */
export type ResolveProjectIdentityInput = ProjectIdentityInput & Readonly<{ fresh?: boolean }>;
/** A pending resolution owns its temporary child and the callers sharing it. @public */
export type PendingProjectIdentity = Readonly<{
  locationKey: string;
  token: number;
  child: ActorRefFrom<typeof projectIdentityMachine>;
  requests: readonly string[];
}>;
/** Bounded cached state, rehydrated only through injected durable reads. @public */
export type ProjectIdentityResolverContext = Readonly<{
  capacity: number;
  cache: Readonly<Record<string, string>>;
  order: readonly string[];
  pending: Readonly<Record<string, PendingProjectIdentity>>;
  sequence: number;
}>;
/** Resource limit for successful identity records. @public */
export type ProjectIdentityResolverInput = Readonly<{ capacity?: number }>;

const withoutKey = <Value>(record: Readonly<Record<string, Value>>, key: string): Record<string, Value> => {
  const { [key]: _removed, ...remaining } = record;
  return remaining;
};

const normalizeResolveInput = (input: ResolveProjectIdentityInput): ResolveProjectIdentityInput =>
  input.fresh ? { ...input, initialIdentity: undefined } : input;

const cacheResult = (
  context: ProjectIdentityResolverContext,
  locationKey: string,
  result: ProjectIdentityResult,
): Pick<ProjectIdentityResolverContext, 'cache' | 'order'> => {
  const cacheKey = JSON.stringify(locationKey);
  if (context.capacity === 0 || (result.status !== 'resolved' && context.cache[cacheKey] === undefined)) {
    return { cache: context.cache, order: context.order };
  }
  if (result.status === 'resolved' && context.cache[cacheKey] === result.projectId) {
    return { cache: context.cache, order: context.order };
  }
  let cache = { ...context.cache };
  let { order } = context;
  if (result.status === 'resolved' && context.capacity > 0) {
    if (cache[cacheKey] === undefined) {
      order = [...order, cacheKey];
    }
    cache[cacheKey] = result.projectId;
    if (order.length > context.capacity) {
      const oldest = order[0];
      if (oldest !== undefined) {
        cache = withoutKey(cache, oldest);
      }
      order = order.slice(1);
    }
  } else {
    cache = withoutKey(cache, cacheKey);
    order = order.filter((entry) => entry !== cacheKey);
  }
  return { cache, order };
};

const resolverDefinition = setup({
  schemas: {
    input: types<ProjectIdentityResolverInput>(),
    context: types<ProjectIdentityResolverContext>(),
    events: {
      resolve: types<{ requestId: string; input: ResolveProjectIdentityInput }>(),
      invalidate: types<{ locationKey: string }>(),
      settled: types<{ key: string; token: number; result: ProjectIdentityResult }>(),
      clear: types<Record<never, never>>(),
    },
    emitted: { resolved: types<{ requestId: string; result: ProjectIdentityResult }>() },
  },
  actors: { resolution: projectIdentityMachine },
}).createMachine({
  id: 'projectIdentityResolver',
  context: ({ input }) => ({
    capacity: Math.max(0, Math.min(4096, Math.floor(input.capacity ?? 1024))),
    cache: {},
    order: [],
    pending: {},
    sequence: 0,
  }),
  initial: 'ready',
  onError: ({ context, event }, enq) => {
    const message = event.error instanceof Error ? event.error.message : String(event.error);
    for (const pending of Object.values(context.pending)) {
      enq.stop(pending.child);
      for (const requestId of pending.requests) {
        enq.emit({ type: 'resolved', requestId, result: { status: 'failed', message } });
      }
    }
    return { target: '.ready', context: { pending: {}, cache: {}, order: [] } };
  },
  states: { ready: {} },
  on: {
    resolve: ({ context, event, self }, enq) => {
      const currentInput = normalizeResolveInput(event.input);
      const known = knownProjectIdentityResult(currentInput);
      const key = JSON.stringify([
        currentInput.locationKey,
        currentInput.mode,
        currentInput.preferredProjectId,
        currentInput.initialIdentity,
      ]);
      const matchingInitialization = context.pending[key];
      if (currentInput.initialIdentity !== undefined && known === undefined && matchingInitialization !== undefined) {
        return {
          context: {
            pending: {
              ...context.pending,
              [key]: { ...matchingInitialization, requests: [...matchingInitialization.requests, event.requestId] },
            },
          },
        };
      }
      // Explicit current absence must fence older reads and cached evidence before
      // initialization, just as a supplied current record does below.
      if (
        currentInput.initialIdentity !== undefined &&
        known === undefined &&
        (context.cache[JSON.stringify(event.input.locationKey)] !== undefined ||
          Object.values(context.pending).some((active) => active.locationKey === event.input.locationKey))
      ) {
        enq.raise({ type: 'invalidate', locationKey: event.input.locationKey });
        enq.raise(event);
        return {};
      }
      if (known !== undefined) {
        if (currentInput.initialIdentity === undefined) {
          enq.emit({ type: 'resolved', requestId: event.requestId, result: known });
          return {};
        }
        let pending = { ...context.pending };
        for (const [key, active] of Object.entries(pending)) {
          if (active.locationKey !== event.input.locationKey) {
            continue;
          }
          enq.stop(active.child);
          pending = withoutKey(pending, key);
          for (const requestId of active.requests) {
            enq.emit({
              type: 'resolved',
              requestId,
              result: {
                status: 'failed',
                message: 'New identity evidence superseded this resolution; resolve it again.',
              },
            });
          }
        }
        enq.emit({ type: 'resolved', requestId: event.requestId, result: known });
        return { context: { pending, ...cacheResult(context, event.input.locationKey, known) } };
      }
      const cacheKey = JSON.stringify(event.input.locationKey);
      const cached = context.cache[cacheKey];
      if (!event.input.fresh && event.input.initialIdentity === undefined && cached !== undefined) {
        const expected = event.input.preferredProjectId;
        const result: ProjectIdentityResult =
          expected === undefined || expected === cached
            ? { status: 'resolved', projectId: cached }
            : { status: 'conflict', expectedProjectId: expected, actualProjectId: cached };
        enq.emit({ type: 'resolved', requestId: event.requestId, result });
        return {};
      }
      const existing = context.pending[key];
      if (existing !== undefined) {
        return {
          context: {
            pending: { ...context.pending, [key]: { ...existing, requests: [...existing.requests, event.requestId] } },
          },
        };
      }
      if (Object.keys(context.pending).length >= 64) {
        enq.emit({
          type: 'resolved',
          requestId: event.requestId,
          result: { status: 'failed', message: 'Too many identity resolutions are active; retry after one completes.' },
        });
        return {};
      }
      const token = context.sequence + 1;
      const child = enq.spawn('resolution', {
        id: `identity-${String(token)}`,
        input: {
          ...currentInput,
          parent: { ref: self, key, token },
        },
      });
      return {
        context: {
          sequence: token,
          pending: {
            ...context.pending,
            [key]: { locationKey: event.input.locationKey, token, child, requests: [event.requestId] },
          },
        },
      };
    },
    settled: ({ context, event }, enq) => {
      const active = context.pending[event.key];
      if (active === undefined || active.token !== event.token) {
        return {};
      }
      enq.stop(active.child);
      let pending = { ...context.pending };
      pending = withoutKey(pending, event.key);
      for (const requestId of active.requests) {
        enq.emit({ type: 'resolved', requestId, result: event.result });
      }
      return { context: { pending, ...cacheResult(context, active.locationKey, event.result) } };
    },
    invalidate: ({ context, event }, enq) => {
      const cacheKey = JSON.stringify(event.locationKey);
      let cache = { ...context.cache };
      cache = withoutKey(cache, cacheKey);
      let pending = { ...context.pending };
      for (const [key, active] of Object.entries(pending)) {
        if (active.locationKey !== event.locationKey) {
          continue;
        }
        enq.stop(active.child);
        pending = withoutKey(pending, key);
        for (const requestId of active.requests) {
          enq.emit({
            type: 'resolved',
            requestId,
            result: { status: 'failed', message: 'Project identity was invalidated; resolve it again.' },
          });
        }
      }
      return { context: { cache, pending, order: context.order.filter((key) => key !== cacheKey) } };
    },
    clear: ({ context }, enq) => {
      for (const active of Object.values(context.pending)) {
        enq.stop(active.child);
        for (const requestId of active.requests) {
          enq.emit({
            type: 'resolved',
            requestId,
            result: { status: 'failed', message: 'Project identity storage was disconnected; resolve it again.' },
          });
        }
      }
      return { context: { cache: {}, order: [], pending: {} } };
    },
  },
});
type ResolverDefinition = typeof resolverDefinition;
/** Named declaration for the bounded coordinator. @public */
// oxlint-disable-next-line typescript/no-empty-interface, typescript/no-empty-object-type, typescript/consistent-type-definitions -- named machine declaration prevents expansion.
export interface ProjectIdentityResolverMachine extends ResolverDefinition {}
/** Cache and deduplicate identity resolution through transient operation children. @public */
export const projectIdentityResolverMachine: ProjectIdentityResolverMachine = resolverDefinition;
