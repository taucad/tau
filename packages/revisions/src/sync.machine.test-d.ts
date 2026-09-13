import { expectTypeOf } from 'vitest';
import type { AnyStateMachine } from 'xstate';

import { selectSyncFacet, syncMachine } from '#sync.machine.js';
import type {
  SyncActors,
  SyncFacet,
  SyncMachineContext,
  SyncMachineEvent,
  SyncPushActorOutput,
  SyncPushOutcome,
  SyncQueueRecord,
} from '#sync.machine.js';

expectTypeOf(syncMachine).toExtend<AnyStateMachine>();

/* The facet is the whole of what the Sync row and the header chip read, and it
 * carries no tick: a backoff count on it would be exactly the unsettled value
 * A38 forbids. */
expectTypeOf(selectSyncFacet).returns.toEqualTypeOf<SyncFacet>();
expectTypeOf<SyncFacet>().not.toHaveProperty('attempt');

/* The durable queue is a record with a version, never a machine snapshot. */
expectTypeOf<SyncQueueRecord['version']>().toEqualTypeOf<1>();

/* No function in context (A38): every field must survive `JSON.stringify` apart
 * from the parent ref the composition rules hand every child. */
expectTypeOf<Omit<SyncMachineContext, 'parentRef'>>().not.toMatchObjectType<Record<string, () => unknown>>();

/* `Sync now` exists only as the correlated pair `publish.machine` waits on. */
expectTypeOf<Extract<SyncMachineEvent, { type: 'syncNow' }>>().toEqualTypeOf<
  Readonly<{ type: 'syncNow'; pushId?: string }>
>();
expectTypeOf<SyncPushOutcome>().toEqualTypeOf<'backedUp' | 'queued' | 'conflicted' | 'failed'>();

/* Per ref, always: the record set must never be able to block history (A39). */
expectTypeOf<SyncPushActorOutput['refs']>().toExtend<ReadonlyArray<Readonly<{ name: string }>>>();

/* Every effect this machine has is injectable, including the `merge` W10 owns. */
expectTypeOf<SyncActors>().toHaveProperty('readPending');
expectTypeOf<SyncActors>().toHaveProperty('writePending');
expectTypeOf<SyncActors>().toHaveProperty('push');
expectTypeOf<SyncActors>().toHaveProperty('fetch');
expectTypeOf<SyncActors>().toHaveProperty('merge');
expectTypeOf<SyncActors>().toHaveProperty('connectivity');
