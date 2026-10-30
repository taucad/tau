/**
 * The crash prompt's offer (browser observability SB12, D9): whether to ask what the person was
 * doing when the page died, and where their answer goes.
 *
 * Tau detected the failure the user saw but could not catch in the moment, so the prompt is the one
 * place their words can reach the event. It is offered **once per tab**, only for a kill the person
 * was there for, and never while a page is dying repeatedly — a prompt in a kill loop is noise on
 * top of a bad experience, and the second kill's own report already carries `consecutive_kills`.
 *
 * Ordinary errors keep the error page and toasts; this is not a general feedback surface.
 */

import { Topic } from '@taucad/events';
import { reportUiFeedback } from '#lib/error-reporting.js';
import { killLoopThreshold } from '#lib/memory-kill-signal.js';
import { readSessionStorage } from '#lib/session-storage.js';
import type { DetectedMemoryKill } from '#lib/memory-kill-signal.js';

/** Marks this tab as already asked, so a later load does not ask again. */
const offeredKey = 'tau:crash-prompt';

/** Longest message accepted, so one request cannot carry a file's worth of text. */
export const crashFeedbackMessageLimit = 2000;

/** What the prompt is offered for. @public */
export type CrashFeedbackOffer = Readonly<{
  /** The kill the feedback will be attached to. */
  classification: DetectedMemoryKill['classification'];
  /** The event the report created, when the SDK captured it on the spot. */
  eventId: string | undefined;
}>;

let offer: CrashFeedbackOffer | undefined;
const offers = new Topic<void>({ name: 'crash-feedback:offer' });

const announce = (): void => {
  offers.emit();
};

const markOfferedInTab = (): boolean => {
  try {
    const storage = readSessionStorage();
    if (storage === undefined) {
      return true;
    }
    if (storage.getItem(offeredKey) !== null) {
      return false;
    }
    storage.setItem(offeredKey, '1');
    return true;
  } catch {
    // No storage: ask at most once on this page, which is the best this tab can promise.
    return true;
  }
};

/**
 * Whether this kill is one to ask about: the person was looking at the page, and it is not the
 * second in a row (a loop waits for a stable load instead).
 *
 * @param kill - The detected kill.
 * @returns Whether the prompt may be offered for it.
 * @public
 */
export const isPromptableKill = (kill: DetectedMemoryKill): boolean =>
  kill.classification === 'foreground' && kill.consecutiveKills < killLoopThreshold;

/**
 * Offer the prompt for a kill just reported, if it is one to ask about and this tab has not been
 * asked yet.
 *
 * @param kill - The detected kill.
 * @param eventId - The id of the event its report created, when the SDK captured it on the spot.
 * @public
 */
export const offerCrashFeedback = (kill: DetectedMemoryKill, eventId: string | undefined): void => {
  if (offer !== undefined || !isPromptableKill(kill) || !markOfferedInTab()) {
    return;
  }
  offer = { classification: kill.classification, eventId };
  announce();
};

/**
 * The standing offer, for the prompt to render.
 *
 * @returns The offer, or `undefined` when there is nothing to ask about.
 * @public
 */
export const readCrashFeedbackOffer = (): CrashFeedbackOffer | undefined => offer;

/**
 * Watch the offer.
 *
 * @param listener - Called when the offer appears or is answered.
 * @returns The unsubscribe.
 * @public
 */
export const subscribeCrashFeedback = (listener: () => void): (() => void) => offers.subscribe(listener);

/** The person closed the prompt without writing anything: it does not come back. @public */
export const dismissCrashFeedback = (): void => {
  if (offer === undefined) {
    return;
  }
  offer = undefined;
  announce();
};

/**
 * Send what the person wrote, as feedback on that kill's event, and close the prompt either way:
 * a send that failed is not worth asking them to type it again.
 *
 * @param answer - The message, and an email only if they chose to leave one.
 * @returns Whether the SDK took the feedback.
 * @public
 */
export const submitCrashFeedback = async (answer: Readonly<{ message: string; email?: string }>): Promise<boolean> => {
  const standing = offer;
  const message = answer.message.trim().slice(0, crashFeedbackMessageLimit);
  dismissCrashFeedback();
  if (standing === undefined || message === '') {
    return false;
  }
  return reportUiFeedback({
    message,
    ...(answer.email === undefined || answer.email.trim() === '' ? {} : { email: answer.email.trim() }),
    ...(standing.eventId === undefined ? {} : { associatedEventId: standing.eventId }),
  });
};

/** Forget the standing offer and this tab's mark. For tests. @public */
export const resetCrashFeedback = (): void => {
  offer = undefined;
  try {
    readSessionStorage()?.removeItem(offeredKey);
  } catch {
    // Nothing to forget without storage.
  }
};
