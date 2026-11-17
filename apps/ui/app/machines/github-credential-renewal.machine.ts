import { createActor, setup, types } from 'xstate';
import { eventSchemas } from '@taucad/ui-core/lib/xstate.lib';
import { faultMessage, reportAppRuntimeFault } from '#runtime/app-runtime-faults.js';

/**
 * When a project's GitHub credential is minted again (app state orchestration charter I15; plan § 4 A10).
 *
 * The revision client's GitHub lease (`hooks/use-revision-status.ts`) asks for a re-mint a while before the credential
 * expires, and a minute after a mint that could not move the deadline. Until A10 a module `setTimeout` held that wait;
 * now it is an `after` on the actor's clock, so the scoped hook holds no timer. The lease keeps one renewal actor per
 * project and owns what a renewal does: the machine only says when one is due.
 *
 * `idle → waiting → idle`: `schedule` (re)arms the wait for its delay, counted from zero; `cancel` drops it. Once the
 * wait runs out, the actor emits `due` and goes back to `idle`.
 */

/** `setTimeout`, which the clock wraps, fires at once past this, so a far deadline is clamped to it. Milliseconds. */
export const longestRenewalDelayMilliseconds = 2_147_483_647;

/** State owned by githubCredentialRenewalMachine. @public */
export type GithubCredentialRenewalMachineContext = Readonly<{
  /** How long the armed wait runs, from the `schedule` that armed it. */
  delayMilliseconds: number;
  /** The first effect fault no transition modelled; the machine keeps answering (MC-R12, D23). */
  fault: string | undefined;
}>;

/** Events accepted by githubCredentialRenewalMachine. @public */
export type GithubCredentialRenewalMachineEvent =
  /** Re-mint after `delayMilliseconds`; a wait already armed is replaced and counts from zero. */
  | { readonly type: 'schedule'; readonly delayMilliseconds: number }
  /** Drop the armed wait: the remote changed, closed or a test reset the lease. */
  | { readonly type: 'cancel' };

/** The machine's public alphabet, in the union's order. @public */
export const githubCredentialRenewalEventTypes = ['schedule', 'cancel'] as const satisfies ReadonlyArray<
  GithubCredentialRenewalMachineEvent['type']
>;

/**
 * The (state, event) pairs this machine ignores (MC-R17): a cancel with no wait armed is a repeat.
 *
 * @public
 */
export const githubCredentialRenewalIgnoredEvents: ReadonlyArray<readonly [state: string, eventType: string]> = [
  ['idle', 'cancel'],
];

/** What the machine emits once the armed wait has run out. @public */
export type GithubCredentialRenewalEmitted = Readonly<{ type: 'due' }>;

/**
 * Clamp a wait to what the clock can hold; a negative or non-finite one runs out at once, as `setTimeout`'s did.
 *
 * @param delayMilliseconds - The wait asked for.
 * @returns The wait the machine arms.
 */
const clampDelay = (delayMilliseconds: number): number =>
  Number.isFinite(delayMilliseconds) ? Math.min(Math.max(delayMilliseconds, 0), longestRenewalDelayMilliseconds) : 0;

/**
 * When one project's GitHub credential is minted again.
 *
 * @public
 */
export const githubCredentialRenewalMachine = setup({
  schemas: {
    context: types<GithubCredentialRenewalMachineContext>(),
    events: eventSchemas<GithubCredentialRenewalMachineEvent>(),
    emitted: eventSchemas<GithubCredentialRenewalEmitted>(),
  },
  delays: {
    renewal: ({ context }) => context.delayMilliseconds,
  },
}).createMachine({
  id: 'github-credential-renewal',
  version: '1',
  /* A fault no transition modelled is recorded and reported once, and the machine keeps answering (MC-R12, D23). */
  onError: ({ context, event }, enq) => {
    if (context.fault !== undefined) {
      return {};
    }
    enq(reportAppRuntimeFault, event.error);
    return { context: { fault: faultMessage(event.error, 'GitHub credential renewal fault') } };
  },
  context: { delayMilliseconds: 0, fault: undefined },
  initial: 'idle',
  states: {
    idle: {
      on: {
        schedule: {
          target: 'waiting',
          context: ({ event }) => ({ delayMilliseconds: clampDelay(event.delayMilliseconds) }),
        },
      },
    },
    waiting: {
      on: {
        /* `reenter` re-arms the wait for the schedule that replaces this one. */
        schedule: {
          target: 'waiting',
          reenter: true,
          context: ({ event }) => ({ delayMilliseconds: clampDelay(event.delayMilliseconds) }),
        },
        cancel: { target: 'idle' },
      },
      after: {
        renewal: (_, enq) => {
          enq.emit({ type: 'due' });
          return { target: 'idle' };
        },
      },
    },
  },
});

/** One project's renewal: arm, drop, and stop when the lease is let go. @public */
export type GithubCredentialRenewal = Readonly<{
  /** Re-mint after `delayMilliseconds`, replacing a wait already armed. */
  schedule: (delayMilliseconds: number) => void;
  /** Drop the armed wait. */
  cancel: () => void;
  /** Stop the actor; nothing is emitted after this. */
  stop: () => void;
}>;

/**
 * Start one project's renewal actor. A module-level lease outlives every mount, so this is its owner, not a component
 * (I1): the revision client's lease map creates one per project and stops it when the lease is reset.
 *
 * It counts on XState's clock, as the runtime's actors do in production, where no clock is injected; a test that fakes
 * `setTimeout` moves it, and the machine's own rows step it with a `StepClock`.
 *
 * @param onDue - Runs each time an armed wait runs out.
 * @returns The renewal's commands.
 * @public
 */
export const startGithubCredentialRenewal = (onDue: () => void): GithubCredentialRenewal => {
  const actor = createActor(githubCredentialRenewalMachine);
  actor.on('due', onDue);
  actor.start();
  return {
    schedule: (delayMilliseconds) => {
      actor.send({ type: 'schedule', delayMilliseconds });
    },
    cancel: () => {
      actor.send({ type: 'cancel' });
    },
    stop: () => {
      actor.stop();
    },
  };
};
