import type { MyUIMessage } from '@taucad/chat';

/**
 * The gesture a turn is admitted for, as the page's verbs express it.
 *
 * Four, not five: startup hydration and the transport's auto-retry are both
 * `regenerate` — they differ in what dispatches them, never in what they rewind
 * to. *Try again* arrives as `continue` when the host can still continue the
 * run and as `regenerate` when it cannot; only the admission knows which.
 *
 * @public
 */
export type TurnGesture =
  /** A fresh user message; `messageId` is the one just composed. */
  | Readonly<{ kind: 'send'; messageId: string }>
  /** That user message's text is replaced and the turn re-runs from it. */
  | Readonly<{ kind: 'edit'; messageId: string }>
  /** The chat's last turn runs again, from its own user message. */
  | Readonly<{ kind: 'regenerate' }>
  /**
   * The run the host still holds, continued from where it stopped.
   *
   * Its lease is the same message's, because it is the same turn — a second
   * attempt at the run the first attempt left unfinished (I1).
   */
  | Readonly<{ kind: 'continue' }>;

/**
 * The admission trigger a turn carries on the wire.
 *
 * A `submit` retains nothing because there is nothing before it; the two
 * rewinding triggers name the durable prefix that must be unchanged.
 *
 * @public
 */
export type TurnTrigger =
  | Readonly<{ trigger: 'submit' }>
  | Readonly<{ trigger: 'edit' | 'regenerate'; retainedMessageIds: readonly string[] }>;

/**
 * The turn a gesture leases, whatever it admits as.
 *
 * `undefined` only for a transcript with no user message at all.
 */
type TurnLease = Readonly<{ leaseTurnId: string | undefined }>;

/**
 * What one gesture admits as: the host trigger, and the turn it leases.
 *
 * @public
 */
export type AdmittedTurnIntent = TurnLease & TurnTrigger;

/**
 * A continuation's intent: the same turn, the same run, nothing rewound.
 *
 * It takes a lease exactly as an admission does — an attempt is one
 * lease-holding execution, and a resumed attempt that held none wrote its files
 * unfenced and minted no revision (I1) — but it composes no wire trigger,
 * because the host continues the run from its own durable log rather than being
 * handed a history prefix to rewind to.
 *
 * @public
 */
export type ResumedTurnIntent = TurnLease & Readonly<{ trigger: 'resume' }>;

/** What one gesture admits as. @public */
export type TurnIntent = AdmittedTurnIntent | ResumedTurnIntent;

/**
 * The wire half of an intent, without the lease the page keeps to itself.
 *
 * @param intent - The intent a gesture resolved to.
 * @returns The trigger the host admission carries.
 * @public
 */
export const turnTriggerOf = (intent: AdmittedTurnIntent): TurnTrigger =>
  intent.trigger === 'submit'
    ? { trigger: 'submit' }
    : { trigger: intent.trigger, retainedMessageIds: intent.retainedMessageIds };

/** The ids of every message before the turn `messageId` belongs to. */
const retainedBefore = (messages: readonly MyUIMessage[], messageId: string | undefined): readonly string[] => {
  const turnIndex = messageId === undefined ? -1 : messages.findIndex((message) => message.id === messageId);
  return messages.slice(0, Math.max(turnIndex, 0)).map((message) => message.id);
};

/**
 * The one derivation of a turn's rewind point (V7).
 *
 * Every admission route composes its host trigger and its lease from here.
 * They used to each derive their own, and the bodyless one — *Try again*, and
 * the auto-retry behind it — derived from **the last assistant message**: on
 * any turn after the first that is the *previous* turn's reply, so the
 * admission retained the prefix before turn 1 while sending a transcript
 * ending in turn 2's user message, and the host refused it as an invalid
 * history prefix. The rewind point of a regenerate is the last **user**
 * message; the two coincide only on a first turn, which is why it looked
 * correct.
 *
 * A transcript with no assistant message at all has nothing to rewind: the
 * seeded "New project → first prompt" turn and a first turn the provider
 * refused both admit as the `submit` they are. A `regenerate` there would
 * retain an empty prefix against an empty durable log, which the host refuses.
 *
 * @param messages - The chat's transcript, oldest first.
 * @param gesture - The verb being admitted.
 * @returns The host trigger and the turn id this admission leases.
 * @throws When an `edit` names a message the transcript no longer holds; that
 * turn has no rewind point, and admitting one leases a checkout nothing can
 * dispatch or release.
 * @public
 */
export const turnIntentOf = (messages: readonly MyUIMessage[], gesture: TurnGesture): TurnIntent => {
  if (gesture.kind === 'send') {
    return { trigger: 'submit', leaseTurnId: gesture.messageId };
  }
  if (gesture.kind === 'continue') {
    /* The same turn, continued: the run id is the host's own and the rewind
     * point is nothing, so the only thing left to derive is which message's
     * lease this attempt takes — the one the first attempt took. */
    return { trigger: 'resume', leaseTurnId: messages.findLast((message) => message.role === 'user')?.id };
  }
  if (gesture.kind === 'edit') {
    /* An edit is admitted seconds after the gesture — host availability, the
     * model catalog, and, for a gesture queued behind a live turn, that turn's
     * settlement. The transcript can be replaced in between (a reattach rebuilds
     * it; a stop truncates its tail). Clamping the missing index to 0 made this
     * total by leasing a checkout for a rewind point that does not exist, and
     * the dispatcher then had nothing to edit and returned: no run, no banner,
     * the lease held forever. There is no such turn, so refuse it. */
    if (!messages.some((message) => message.id === gesture.messageId)) {
      throw new Error('That message is no longer in this chat, so it cannot be edited.');
    }
    return {
      trigger: 'edit',
      leaseTurnId: gesture.messageId,
      retainedMessageIds: retainedBefore(messages, gesture.messageId),
    };
  }
  const leaseTurnId = messages.findLast((message) => message.role === 'user')?.id;
  if (!messages.some((message) => message.role === 'assistant')) {
    return { trigger: 'submit', leaseTurnId };
  }
  return { trigger: 'regenerate', leaseTurnId, retainedMessageIds: retainedBefore(messages, leaseTurnId) };
};
