/**
 * The daemon's v1 half during the compatibility window (seam blueprint "Mixed builds", I32): one connection's `request`
 * call and its all-chat `events` and `liveEvents` streams, answered by the current launcher. A keyless v1 `start` keeps the
 * run-id replay here, and only here: a v2 start is keyed, and a fresh key on a taken run id is refused.
 *
 * ponytail: the v1 streams carry the chats this connection named in a request, from the moment it named them; the v1
 * clients (the page and `tau agent`) attach or command a chat before they watch it. Deleted with the window.
 */

import { createPortableId } from '#harness/session-record.js';
import { replayedStartOutcome } from '#log/chat-ledger.js';
import type { AgentLiveEvent, HostRunSnapshot } from '#waist/ports.js';
import type { AgentLogEvent, JsonValue } from '#log/event-types.js';
import { iterateStream } from '#launchers/agent-launcher.js';
import type { AgentLauncher } from '#launchers/agent-launcher.js';
import type { CommandAnswer, HostCommand } from '#wire/commands.schema.js';
import type { ReadAnswer } from '#wire/frames.schema.js';
import type { V1Addressed, V1Batch, V1Request, V1Response } from '#channel/wire-v1.js';

const batchBytes = 1_048_576;

/** One connection's v1 surface. @internal */
export type V1Session = Readonly<{
  request(request: V1Request): Promise<V1Response>;
  events(signal: AbortSignal): AsyncIterable<V1Addressed<AgentLogEvent>>;
  liveEvents(signal: AbortSignal): AsyncIterable<V1Addressed<AgentLiveEvent>>;
  close(): void;
}>;

/** A stream of frames pushed to every open listen of one kind on this connection. */
const createStreams = <Frame>() => {
  const open = new Set<ReadableStreamDefaultController<Frame>>();
  return {
    push: (frame: Frame): void => {
      for (const controller of open) {
        try {
          controller.enqueue(frame);
        } catch {
          open.delete(controller);
        }
      }
    },
    listen: (signal: AbortSignal): AsyncIterable<Frame> =>
      iterateStream(
        new ReadableStream<Frame>({
          start(controller) {
            const end = (): void => {
              open.delete(controller);
              try {
                controller.close();
              } catch {
                // Already closed by the connection's end.
              }
            };
            open.add(controller);
            if (signal.aborted) {
              end();
            } else {
              signal.addEventListener('abort', end, { once: true });
            }
          },
        }),
      ),
  };
};

const refusal = (answer: CommandAnswer): Error | undefined =>
  answer.status === 'refused'
    ? Object.assign(new Error(answer.message), {
        code: answer.code,
        ...(answer.details ? { details: answer.details } : {}),
      })
    : undefined;

/**
 * Serve one v1 connection from the v2 launcher.
 *
 * @param launcher - The v2 launcher.
 * @param revisions - The connection's revision root, when the daemon serves one.
 * @returns The connection's v1 surface.
 * @internal
 */
export const createV1Session = (
  launcher: AgentLauncher,
  revisions:
    | Readonly<{ request(input: JsonValue): Promise<Readonly<{ result: JsonValue; status: JsonValue }>> }>
    | undefined,
): V1Session => {
  const ended = new AbortController();
  const rows = createStreams<V1Addressed<AgentLogEvent>>();
  const live = createStreams<V1Addressed<AgentLiveEvent>>();
  const named = new Set<string>();
  const sourceGenerations = new Map<string, string>();

  /** One read that never parks: omitting prior health requests a fresh observation; v1 tail still clamps. */
  const tail = async ({
    chatId,
    cursor,
    limit,
    maxBytes = batchBytes,
  }: Readonly<{ chatId: string; cursor: number; limit: number; maxBytes?: number | undefined }>): Promise<V1Batch> => {
    if (cursor > 0 && !sourceGenerations.has(chatId)) {
      const initial = await launcher.read({
        chatId,
        cursor: 0,
        limit: 1,
        maxBytes: batchBytes,
      });
      if (initial.status === 'batch' && initial.sourceGeneration !== undefined) {
        sourceGenerations.set(chatId, initial.sourceGeneration);
      }
    }
    const answer: ReadAnswer = await launcher.read({
      chatId,
      cursor,
      ...(sourceGenerations.has(chatId) ? { sourceGeneration: sourceGenerations.get(chatId)! } : {}),
      limit,
      maxBytes: Math.min(maxBytes, batchBytes),
    });
    if (answer.status === 'batch') {
      if (answer.sourceGeneration !== undefined) {
        sourceGenerations.set(chatId, answer.sourceGeneration);
      }
      // oxlint-disable-next-line @typescript-eslint/consistent-type-assertions -- in-process rows are the launcher's own log events.
      return { ...answer, events: answer.events as readonly AgentLogEvent[] };
    }
    if (answer.reason === 'identity-mismatch') {
      sourceGenerations.delete(chatId);
    }
    const end = answer.reason === 'identity-mismatch' ? 0 : (answer.expected?.endCursor ?? 0);
    return { cursor: end, nextCursor: end, endCursor: end, events: [] };
  };

  /* Both follows end with the connection or a closed launcher; nothing is lost when one throws, since a v1 reader
   * catches up through `tail`, so the failure is dropped. */
  const follow = async (chatId: string): Promise<void> => {
    try {
      const end = await tail({ chatId, cursor: Number.MAX_SAFE_INTEGER, limit: 1 });
      let cursor = end.endCursor;
      for (;;) {
        // oxlint-disable-next-line no-await-in-loop -- a long poll reads after each batch.
        const answer = await launcher.read({
          chatId,
          cursor,
          sourceGeneration: sourceGenerations.get(chatId),
          limit: 16,
          maxBytes: batchBytes,
          signal: ended.signal,
        });
        if (answer.status === 'refused' || answer.events.length === 0) {
          return;
        }
        for (const event of answer.events) {
          // oxlint-disable-next-line @typescript-eslint/consistent-type-assertions -- in-process rows are the launcher's own log events.
          rows.push({ chatId, event: event as AgentLogEvent });
        }
        cursor = answer.nextCursor;
        if (answer.sourceGeneration !== undefined) {
          sourceGenerations.set(chatId, answer.sourceGeneration);
        }
      }
    } catch {
      // Ended; see above.
    }
  };
  const followLive = async (chatId: string): Promise<void> => {
    try {
      for await (const event of launcher.liveEvents({ chatId, signal: ended.signal })) {
        const { sourceGeneration: _sourceGeneration, ...portable } = event;
        live.push({ chatId, event: portable });
      }
    } catch {
      // Ended; see above.
    }
  };
  const name = (chatId: string): void => {
    if (named.has(chatId)) {
      return;
    }
    named.add(chatId);
    // async-iife: bootstrap -- both catch their own failure and end with the connection.
    void follow(chatId);
    // async-iife: bootstrap -- as above.
    void followLive(chatId);
  };

  const execute = async (command: HostCommand): Promise<CommandAnswer> => {
    const answer = await launcher.execute(command);
    const refused = refusal(answer);
    if (refused) {
      throw refused;
    }
    return answer;
  };
  const key = (): string => `v1-${createPortableId()}`;

  const request = async (input: V1Request): Promise<V1Response> => {
    if (input.type === 'revision') {
      if (revisions === undefined) {
        throw Object.assign(new Error('This agent host does not serve revisions.'), { code: 'REVISIONS_UNAVAILABLE' });
      }
      return { type: 'revision', ...(await revisions.request(input.request)) };
    }
    const { chatId } = input;
    name(chatId);
    switch (input.type) {
      case 'tail': {
        return { type: 'tail', chatId, batch: await tail(input) };
      }
      case 'attach': {
        const answer = await execute({ type: 'attach', commandId: key(), payload: { chatId } });
        const details: Readonly<Record<string, unknown>> = ('details' in answer ? answer.details : undefined) ?? {};
        // oxlint-disable-next-line @typescript-eslint/consistent-type-assertions -- the launcher's attach details carry its own snapshot.
        const snapshot = details['snapshot'] as HostRunSnapshot | undefined;
        return {
          type: 'attach',
          chatId,
          batch: await tail(input),
          leadership: { role: 'leader', generation: String(Math.max(answer.generation, 1)) },
          ...(snapshot === undefined ? {} : { snapshot }),
          takeover: details['takeover'] === true,
        };
      }
      case 'start': {
        const { type: _verb, mode: _mode, baseRevisionId: _base, ...payload } = input;
        /* V9, v1 only: the run id is the idempotency key of a keyless start. A re-send over a reconnected socket is
         * answered with the run it already has. */
        const head = await tail({ chatId, cursor: 0, limit: 1 });
        const outcome =
          head.endCursor === 0 ? 'admit' : replayedStartOutcome(await launcher.host.ledger(chatId), input.runId);
        if (outcome === 'resume' && (await launcher.host.waitForAdmission(chatId, input.runId)) === undefined) {
          await execute({ type: 'resume', commandId: key(), payload: { chatId, runId: input.runId } });
        } else if (outcome !== 'settled' && outcome !== 'resume') {
          // oxlint-disable-next-line @typescript-eslint/consistent-type-assertions -- SC-G8: the v1 schema's message is the log's message.
          await execute({ type: 'start', commandId: key(), payload } as HostCommand);
        }
        return { type: 'result', operation: 'start', snapshot: await launcher.host.snapshot(chatId) };
      }
      case 'resume': {
        const ledger = await launcher.host.ledger(chatId);
        await execute({ type: 'resume', commandId: key(), payload: { chatId, runId: ledger.currentRunId ?? '-' } });
        return { type: 'result', operation: 'resume', snapshot: await launcher.host.snapshot(chatId) };
      }
      default: {
        const { type, ...payload } = input;
        // oxlint-disable-next-line @typescript-eslint/consistent-type-assertions -- the v1 and v2 payloads of these verbs are the same fields.
        await execute({ type, commandId: key(), payload } as HostCommand);
        return { type: 'result', operation: type, snapshot: await launcher.host.snapshot(chatId) };
      }
    }
  };

  return {
    request,
    events: (signal) => rows.listen(signal),
    liveEvents: (signal) => live.listen(signal),
    close: () => {
      ended.abort();
    },
  };
};
