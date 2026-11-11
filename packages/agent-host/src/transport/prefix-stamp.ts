/**
 * The prefix stamp (provider reasoning replay contract, P1 and P2).
 *
 * Each generation request is described by a chained digest of everything it sends before the reply: the codec epoch,
 * the model, the system text, the tool definitions and every message, with native reasoning left out. The stamp rides
 * back on the reply's metadata and is persisted on its assistant row as `metadata.prefix`. A later request recomputes
 * the chain, and from it:
 *
 * - **P2, reasoning validity.** A row's native reasoning (a thinking block, a tool call's thought signature) is
 *   replayed only while the chain at the row's position still equals the digest the row recorded, on the model that
 *   minted it. A provider binds reasoning to the prefix it was minted under: Anthropic refuses a block whose prefix
 *   changed, OpenAI drops it. Any other row is stale, and so is a row with no stamp.
 * - **P1, prefix continuity.** The newest stamped row tells whether the previous request's prefix was reproduced, and
 *   what changed when it was not.
 *
 * Both verdicts are pure functions of the request and the stamps its rows carry, so a restart, a replay and another
 * device all reach the same ones. That is what makes leaving a block out safe: a block left out once stays out, and
 * the reasoning minted after it never saw it.
 */
import type { Context } from '@earendil-works/pi-ai';
import { shortHash } from '@earendil-works/pi-ai/utils/hash';
import { canonicalJson } from '#log/canonical-json.js';
import type { PrefixBreakCause, PrefixStamp } from '#log/prefix-stamp.js';

/**
 * What a stamp depends on besides the request: pi-ai's codecs, which decide the bytes a context becomes, and this
 * module's own rules. Bump the suffix when {@link stampPrefix} changes what it digests, and whenever the transport
 * changes which reasoning a request replays: a row stamped under other rules was minted beside reasoning this build
 * might leave out, so its stamp must stop matching. `/1` stamped without the replay rule; `/2` obeys it.
 *
 * @internal
 */
export const prefixCodecEpoch = 'pi-ai@1.4.0/2';

/** One request, as {@link stampPrefix} reads it. @internal */
export type PrefixStampInput = Readonly<{
  /** {@link prefixCodecEpoch}; a parameter so a test can move it. */
  epoch: string;
  /** The pi model the context is sent to. */
  model: Readonly<{ api: string; provider: string; id: string }>;
  /** The system text, in the forms the wires carry: the joined prompt, then each block. */
  system: readonly string[];
  tools: Readonly<NonNullable<Context['tools']>>;
  /** The messages as sent, after the attachment budget is fitted. */
  messages: Readonly<Context['messages']>;
  /** The stamp each message's durable row carries, by message index. */
  stamps: ReadonlyArray<PrefixStamp | undefined>;
  settings: string;
  release?: string | undefined;
  summary?: string | undefined;
  cleared: number;
  evicted: number;
}>;

/** A stamped request: its stamp, and the rows whose native reasoning it must leave out. @internal */
export type StampedPrefix = Readonly<{
  stamp: PrefixStamp;
  /** Indices into the request's messages: same-model assistant rows whose recorded prefix no longer matches. */
  stale: ReadonlySet<number>;
}>;

type Message = Context['messages'][number];

/**
 * The part of a message a provider binds reasoning to. Thinking blocks and tool-call thought signatures are native
 * reasoning and are left out, so leaving a stale one out of a request does not move the chain.
 *
 * @param message - One message of the request.
 * @returns The content the chain digests.
 */
const boundContent = (message: Message): unknown => {
  if (message.role === 'assistant') {
    return {
      role: message.role,
      model: [message.api, message.provider, message.model],
      content: message.content.flatMap((block): unknown[] => {
        if (block.type === 'thinking') {
          return [];
        }
        if (block.type === 'toolCall') {
          const { thoughtSignature: _reasoning, ...call } = block;
          return [call];
        }
        return [block];
      }),
    };
  }
  if (message.role === 'toolResult') {
    return {
      role: message.role,
      toolCallId: message.toolCallId,
      toolName: message.toolName,
      isError: message.isError,
      content: message.content,
    };
  }
  return { role: message.role, content: message.content };
};

/**
 * Whether pi's codecs send the message at all: they skip an assistant message that ended in an error or an abort.
 *
 * @param message - One message of the request.
 * @returns `false` for a reply the codec drops.
 */
const isSent = (message: Message): boolean =>
  message.role !== 'assistant' || (message.stopReason !== 'error' && message.stopReason !== 'aborted');

const sameModel = (message: Message, model: PrefixStampInput['model']): boolean =>
  message.role === 'assistant' &&
  message.api === model.api &&
  message.provider === model.provider &&
  message.model === model.id;

const isNativeReasoning = (block: Extract<Message, { role: 'assistant' }>['content'][number]): boolean =>
  block.type === 'thinking' || (block.type === 'toolCall' && block.thoughtSignature !== undefined);

/**
 * How many native reasoning payloads a message carries onto the wire.
 *
 * @param message - One message of the request.
 * @returns The count of thinking blocks and signed tool calls; zero for a reply the codec never sends.
 */
const nativeReasoningIn = (message: Message): number =>
  message.role === 'assistant' && isSent(message)
    ? message.content.filter((block) => isNativeReasoning(block)).length
    : 0;

/**
 * A message with its native reasoning left out (P2). Everything the chain digests is kept, so the chain does not move.
 *
 * @internal
 * @param message - A stale row of the request.
 * @returns The same row without thinking blocks and tool-call thought signatures.
 */
export const withoutNativeReasoning = (message: Message): Message =>
  message.role === 'assistant'
    ? {
        ...message,
        content: message.content.flatMap((block): typeof message.content => {
          if (block.type === 'thinking') {
            return [];
          }
          if (block.type === 'toolCall' && block.thoughtSignature !== undefined) {
            const { thoughtSignature: _stale, ...call } = block;
            return [call];
          }
          return [block];
        }),
      }
    : message;

/**
 * Why the request's prefix differs from the one its comparison row was produced under, outermost cache tier first.
 *
 * @param now - This request's stamp, without its break.
 * @param then - The comparison row's stamp.
 * @param reproduced - Whether the chain at the row's position equals the digest the row recorded.
 * @returns The cause, or `undefined` when the prefix was reproduced with the same settings.
 */
const causeOf = (now: PrefixStamp, then: PrefixStamp, reproduced: boolean): PrefixBreakCause | undefined => {
  const released = now.release !== then.release;
  if (now.tools !== then.tools) {
    return released ? 'definitions' : 'tools';
  }
  if (now.system !== then.system) {
    return released ? 'definitions' : 'instructions';
  }
  if (!reproduced) {
    if (now.summary !== then.summary) {
      return 'compaction';
    }
    if ((now.cleared ?? 0) !== (then.cleared ?? 0)) {
      return 'clearing';
    }
    return (now.evicted ?? 0) === (then.evicted ?? 0) ? 'unsanctioned' : 'attachment-eviction';
  }
  return now.settings === then.settings ? undefined : 'settings';
};

/**
 * Stamp one request: say which of its rows may replay native reasoning, and whether it reproduced the previous
 * request's prefix.
 *
 * The comparison row is the newest stamped assistant row the request holds: the reply to the previous request, whose
 * recorded digest covers everything that request sent. A row of another model is a `model` break. A request that
 * holds a compaction summary and no stamped row is a `compaction` break: the retained tail kept no assistant row.
 *
 * @internal
 * @param input - The request, as it is about to be sent.
 * @returns The stamp to persist on the reply's row, and the rows whose native reasoning the request leaves out.
 */
export const stampPrefix = (input: PrefixStampInput): StampedPrefix => {
  const system = shortHash(canonicalJson(input.system));
  /* The epoch rides in the tools digest, the outermost tier, so a codec upgrade reads as a release changing the
   * definitions (`definitions`) and never as an unexplained edit. */
  const tools = shortHash(
    canonicalJson([
      input.epoch,
      input.tools
        .map(({ name, description, parameters }) => ({ name, description, parameters }))
        .toSorted((left, right) => (left.name < right.name ? -1 : left.name > right.name ? 1 : 0)),
    ]),
  );
  /* The chain opens with everything the messages sit behind; each step digests the previous digest and one message.
   * ponytail: a synchronous 64-bit digest, since Web Crypto's costs a thread hop per step and a request digests one
   * step per message. An accidental collision would replay one stale block; SHA-256 if inputs ever turn adversarial.
   * The whole request is digested on each call, attachments included: batch by message if that ever shows in a
   * profile. */
  let chain = shortHash(canonicalJson([input.model, system, tools]));
  /* The newest stamped row, the chain everything before it produces now, and the reasoning it added to the chat. */
  let comparison:
    | { readonly stamp: PrefixStamp; readonly native: boolean; readonly before: string; readonly minted: number }
    | undefined;
  const stale = new Set<number>();
  let replayed = 0;
  for (const [index, message] of input.messages.entries()) {
    const stamp = message.role === 'assistant' ? input.stamps[index] : undefined;
    const native = sameModel(message, input.model);
    if (stamp !== undefined) {
      comparison = { stamp, native, before: chain, minted: native ? nativeReasoningIn(message) : 0 };
    }
    /* P2. Another model's row is not this rule's: the transport already renders its reasoning as text. */
    if (native && stamp?.digest === chain) {
      replayed += nativeReasoningIn(message);
    } else if (native) {
      stale.add(index);
    }
    if (isSent(message)) {
      chain = shortHash(`${chain}\n${canonicalJson(boundContent(message))}`);
    }
  }
  const stamp: PrefixStamp = {
    digest: chain,
    system,
    tools,
    settings: input.settings,
    ...(input.release === undefined ? {} : { release: input.release }),
    ...(input.summary === undefined ? {} : { summary: input.summary }),
    ...(input.cleared === 0 ? {} : { cleared: input.cleared }),
    ...(input.evicted === 0 ? {} : { evicted: input.evicted }),
    ...(replayed === 0 ? {} : { replayed }),
  };
  const cause =
    comparison === undefined
      ? input.summary === undefined
        ? undefined
        : 'compaction'
      : comparison.native
        ? causeOf(stamp, comparison.stamp, comparison.before === comparison.stamp.digest)
        : 'model';
  if (cause === undefined) {
    return { stamp, stale };
  }
  /* What the previous request replayed, plus what its reply minted, less what this request still replays: the
   * reasoning this break took from the model, whether left out of a stale row or summarised away with its row.
   * Unknown across a model change, and when no stamped row survived to compare with. */
  const dropped = comparison?.native === true ? (comparison.stamp.replayed ?? 0) + comparison.minted - replayed : 0;
  return { stamp: { ...stamp, break: cause, ...(dropped > 0 ? { dropped } : {}) }, stale };
};
