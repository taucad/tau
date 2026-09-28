import type { UIMessage } from 'ai';
import type { MyUIMessage } from '@taucad/chat';
import type { AgentLogEvent, UserProviderMessage } from '@taucad/agent-host';
import type { AgentChannelAdmissionConfig, AgentChannelModel, HostCommand } from '@taucad/agent-host/wire';
import { isRecord } from '@taucad/utils/schema';
import { isAttachmentUrl } from '#utils/attachment.utils.js';

/**
 * The gesture a turn is admitted for, as the page's verbs express it.
 *
 * Four gestures: startup hydration and an explicit Try again are both
 * `regenerate` — they differ in what dispatches them, never in what they rewind
 * to. Resume is only `continue` and never falls through to `regenerate`.
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
    const continuing = messages.findLast((message) => message.role === 'user')?.id;
    if (continuing === undefined) {
      /* No user message, no turn. The error card renders over an empty
       * transcript while the host record behind *Try again* survives a reload,
       * so this is reachable — and admitting it leases under `prepare`'s
       * fallback key, the run id, which fences the continuation's writes under
       * a turn no message has and names a turn id in the settlement that the
       * saved-turn card can never match. Refused visibly instead (I1). */
      throw new Error('This chat has nothing to continue from yet.');
    }
    return { trigger: 'resume', leaseTurnId: continuing };
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

type JsonValue = Extract<AgentLogEvent, { readonly type: 'message.appended' }>['message']['content'];

/** The one user turn the host log records, including content-addressed files. @public */
export const userProviderMessageOf = <Message extends UIMessage>(messages: readonly Message[]): UserProviderMessage => {
  const message = messages.findLast((candidate) => candidate.role === 'user');
  if (!message) {
    throw new TypeError('Browser agent host admission requires a user message.');
  }
  const content: JsonValue[] = [];
  for (const part of message.parts) {
    if (part.type === 'text') {
      content.push({ type: 'text', text: part.text });
      continue;
    }
    if (part.type === 'file') {
      if (isAttachmentUrl(part.url)) {
        const byteLength = part.providerMetadata?.['common']?.['byteLength'];
        content.push({
          type: 'file-ref',
          path: part.url,
          mimeType: part.mediaType,
          ...(typeof byteLength === 'number' && Number.isInteger(byteLength) && byteLength >= 0 ? { byteLength } : {}),
          ...(part.filename === undefined ? {} : { filename: part.filename }),
        });
        continue;
      }
      const match = /^data:(image\/[^;,]+);base64,(.*)$/u.exec(part.url);
      if (!match) {
        throw new TypeError(`Browser agent host cannot record file part URL "${part.url}".`);
      }
      content.push({ type: 'image', mimeType: match[1]!, data: match[2]! });
    }
  }
  const first = content[0];
  const textOnly = content.length === 1 && isRecord(first) && first['type'] === 'text';
  return {
    id: message.id,
    role: 'user',
    content: textOnly && typeof first['text'] === 'string' ? first['text'] : content,
  };
};

/** The sender's command key and the page's current admission/selection. @public */
export type CommandContext = Readonly<{
  chatId: string;
  commandId: string;
  /** The existing run for Resume; a Start uses the sender's command id. */
  runId?: string;
  config?: AgentChannelAdmissionConfig;
  checkoutId?: string;
  selection?: AgentChannelModel;
}>;

/**
 * Turn a gesture into one host command before the session actor receives it.
 * The transcript includes the newly composed Send or edited user message, so
 * the command names exactly what the person saw when taking the gesture.
 * Re-sending the same command repeats its key and payload byte-for-byte.
 * @public
 */
export const commandOf = (
  gesture: TurnGesture,
  transcript: readonly MyUIMessage[],
  context: CommandContext,
): HostCommand => {
  const intent = turnIntentOf(transcript, gesture);
  if (intent.trigger === 'resume') {
    if (context.runId === undefined) {
      throw new Error('This chat has no run to resume.');
    }
    return {
      type: 'resume',
      commandId: context.commandId,
      payload: {
        chatId: context.chatId,
        runId: context.runId,
        ...(context.selection === undefined ? {} : { selection: context.selection }),
      },
    };
  }
  const message = transcript.find((candidate) => candidate.id === intent.leaseTurnId && candidate.role === 'user');
  if (message === undefined) {
    throw new Error('That user message is no longer in this chat.');
  }
  return {
    type: 'start',
    commandId: context.commandId,
    payload: {
      chatId: context.chatId,
      runId: context.commandId,
      message: userProviderMessageOf([message]),
      trigger: intent.trigger,
      ...(intent.trigger === 'submit' ? {} : { retainedMessageIds: [...intent.retainedMessageIds] }),
      ...(context.config === undefined ? {} : { config: context.config }),
      ...(context.checkoutId === undefined ? {} : { checkoutId: context.checkoutId }),
    },
  };
};
