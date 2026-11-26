/**
 * User-timing marks on a chat turn's path, read by the chat performance harness and by a trace (WP-00 of the chat
 * performance plan). A mark stays in this page's performance timeline: nothing is sent, and a page without the User
 * Timing API simply records nothing.
 */

/** The marks a turn leaves on the page, in the order a turn reaches them. @public */
export type ChatTimingMark =
  | 'host-command-connected'
  | 'host-command-sent'
  | 'host-command-answered'
  | 'first-live-event';

/**
 * Record one chat timing mark as `tau.chat.<name>`. Synchronous and never throws, so a measurement can never fail a
 * send.
 *
 * @param name - The mark.
 * @param detail - Bounded labels only (a command verb, an answer status), never ids or content.
 * @public
 */
export const markChatTiming = (name: ChatTimingMark, detail?: Readonly<Record<string, string>>): void => {
  try {
    performance.mark(`tau.chat.${name}`, detail === undefined ? undefined : { detail });
  } catch {
    /* No User Timing API: nothing to record. */
  }
};
