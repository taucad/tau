/**
 * One admitted attempt's dispatch owner. Durable task phases/reservations remain in records.jsonl;
 * this machine owns only the in-process execution and cancellation acknowledgement.
 * Cancellation requests the existing owner and waits for its settlement, preserving compensation.
 */
import { createAsyncLogic, setup, types } from 'xstate';

/** Dispatch identity comes from one durable admission. @internal */
export type ProjectTaskDispatchIdentity = Readonly<{ projectId: string; taskId: string; attemptId: string }>;
/** Only a matching cancellation may reach the admitted execution. @internal */
export type ProjectTaskDispatchEvent = Readonly<{ type: 'cancel'; attemptId: string }>;

const executeAttempt = createAsyncLogic<void, ProjectTaskDispatchIdentity>({
  run: async (): Promise<void> => {
    throw new Error('Project task executeAttempt effect was not provided.');
  },
});

/** All terminal events are stale after the invocation settles. @internal */
export const projectTaskDispatchIgnoredEvents: ReadonlyArray<readonly [string, string]> = [['ended', 'cancel']];

/**
 * Preserve static refinement metadata in the pinned runtime's transition wrapper.
 * The installed XState alpha types omit this supported wrapper, as in the ACP owner.
 *
 * @param action - Handwritten model action.
 * @param transition - Pure transition function.
 * @returns The runtime wrapper typed as its transition, until upstream declares that wrapper.
 * @internal
 */
const refines = <Transition>(action: 'Cancel' | 'Settled' | 'Failed', transition: Transition): Transition =>
  // oxlint-disable-next-line @typescript-eslint/consistent-type-assertions -- Alpha.59 supports this wrapper at runtime but omits its type; the ACP owner uses the same compatibility seam.
  ({ to: transition, meta: { tla: action } }) as unknown as Transition;

/** Pure dispatch protocol; cancellation never stops the actor before resource settlement. @internal */
export const projectTaskDispatchMachine = setup({
  schemas: {
    input: types<ProjectTaskDispatchIdentity>(),
    context: types<ProjectTaskDispatchIdentity & { error?: string }>(),
    events: { cancel: types<Omit<ProjectTaskDispatchEvent, 'type'>>() },
    output: types<{ error?: string }>(),
    transitionMeta: types<{ tla: 'Cancel' | 'Settled' | 'Failed' }>(),
  },
  states: { executing: {}, ended: { type: 'final' } },
  actors: { executeAttempt },
  actions: {
    requestCancellation: (_input: Readonly<{ attemptId: string }>): void => {
      throw new Error('Project task requestCancellation effect was not provided.');
    },
  },
}).createMachine({
  id: 'projectTaskDispatch',
  version: '1',
  context: ({ input }) => ({ ...input }),
  initial: 'executing',
  onError: refines('Failed', ({ event }: Readonly<{ event: Readonly<{ error: unknown }> }>) => ({
    target: '.ended',
    context: { error: String(event.error) },
  })),
  states: {
    executing: {
      on: {
        cancel: refines('Cancel', ({ context, event, actions }, enq) => {
          if (event.attemptId !== context.attemptId) {
            // Late cancellation of a previous attempt is idempotently ignored.
            return {};
          }
          enq(actions.requestCancellation, { attemptId: context.attemptId });
          return {};
        }),
      },
      invoke: {
        src: 'executeAttempt',
        input: ({ context }) => ({
          projectId: context.projectId,
          taskId: context.taskId,
          attemptId: context.attemptId,
        }),
        onDone: { target: 'ended', meta: { tla: 'Settled' } },
        onError: refines('Failed', ({ event }: Readonly<{ event: Readonly<{ error: unknown }> }>) => ({
          target: 'ended',
          context: { error: String(event.error) },
        })),
      },
    },
    ended: { type: 'final' },
  },
  output: ({ context }) => ({ error: context.error }),
});
