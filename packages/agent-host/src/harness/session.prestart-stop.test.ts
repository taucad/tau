/**
 * A tool the stream started early keeps its one result directly after its call when the run is stopped.
 *
 * A tool call is dispatched the moment the stream completes it, before pi runs the batch. A Stop that landed between
 * the completed reply and the batch made pi answer the call with a provisional abort result and move on to its next
 * request, which the abort ended as one more assistant row. The session recorded the tool's real result only after
 * pi's loop had returned, so the result was written after that assistant row: a history no reader may build from,
 * and one in which the provider is handed two results for one call on every later turn (launch audit, C-1).
 */
import { describe, expect, it } from 'vitest';
import { createMemoryEventLogFile } from '#harness/harness.fixture.js';
import { createAgentSession } from '#harness/session.js';
import { historyWellFormed } from '#host/run-history.js';
import type { AgentLogEvent, ProviderMessage } from '#log/event-types.js';
import type {
  DurableEventLog,
  ModelStreamEvent,
  ModelStreamRequest,
  ModelTransport,
  ToolRegistry,
} from '#waist/ports.js';

type Step = () => AsyncGenerator<ModelStreamEvent>;

/** A transport that plays its steps in order, then answers in plain text. */
const scriptedTransport = (steps: readonly Step[]): ModelTransport & { readonly requests: ModelStreamRequest[] } => {
  const queue = [...steps];
  const requests: ModelStreamRequest[] = [];
  return {
    funding: { type: 'unfunded' },
    requests,
    async *stream(request) {
      requests.push(request);
      const step = queue.shift();
      if (step) {
        yield* step();
        return;
      }
      yield { type: 'text-delta', text: 'Done.' };
      yield { type: 'completed', stopReason: 'stop' };
    },
  };
};

const readCalls = (...ids: readonly string[]): Step =>
  async function* () {
    for (const id of ids) {
      yield { type: 'tool-input', toolCallId: id, toolName: 'read_file', input: { targetFile: `${id}.ts` } };
    }
    yield { type: 'completed', stopReason: 'toolUse' };
  };

/** A read that takes a while and honours the abort signal, as the registry's read RPCs do. */
const slowReadRegistry: ToolRegistry = {
  list: () => [
    {
      name: 'read_file',
      description: 'Read a file.',
      inputSchema: { type: 'object', properties: { targetFile: { type: 'string' } } },
    },
  ],
  invoke: async (invocation) =>
    new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        resolve({ content: { content: 'export const main = 1;' }, isError: false });
      }, 200);
      invocation.signal.addEventListener('abort', () => {
        clearTimeout(timer);
        reject(new DOMException('aborted', 'AbortError'));
      });
    }),
};

const model = { id: 'stub', contextWindow: 200_000, providerKind: 'anthropic' } as const;

/** A log that calls `onToolUseReply` once, right after the completed tool-calling reply is written. */
const stoppingAtToolUseReply = (log: DurableEventLog, onToolUseReply: () => void): DurableEventLog => {
  let fired = false;
  return new Proxy(log, {
    get(target, property, receiver) {
      if (property === 'append') {
        return async (event: AgentLogEvent) => {
          const outcome = await target.append(event);
          const message =
            event.type === 'message.appended'
              ? event.message
              : event.type === 'message.envelope-replaced'
                ? event.replacement
                : undefined;
          if (!fired && message?.role === 'assistant' && message.metadata?.stopReason === 'toolUse') {
            fired = true;
            onToolUseReply();
          }
          return outcome;
        };
      }
      const value: unknown = Reflect.get(target, property, receiver);
      // oxlint-disable-next-line typescript/no-unsafe-return, typescript/no-unsafe-call, typescript/no-unsafe-member-access -- a transparent proxy binds whatever method the log has
      return typeof value === 'function' ? value.bind(target) : value;
    },
  });
};

const shapeOf = (messages: readonly ProviderMessage[]): string[] =>
  messages.map((message) => ('toolCallId' in message ? `${message.role}(${message.toolCallId})` : message.role));

describe('a Stop between a tool-calling reply and its batch', () => {
  it.each([
    { name: 'one early tool', ids: ['call-1'] },
    { name: 'two early tools', ids: ['call-1', 'call-2'] },
  ])('records the result of $name directly after its call', async ({ ids }) => {
    const file = createMemoryEventLogFile();
    const session = await (async () => {
      let stop = (): void => undefined;
      const created = await createAgentSession({
        chatId: 'chat-1',
        runId: 'run-1',
        leaderEpoch: 'epoch-1',
        systemPrompt: 'system',
        model,
        modelTransport: scriptedTransport([readCalls(...ids)]),
        toolRegistry: slowReadRegistry,
        eventLog: stoppingAtToolUseReply(await file.open(), () => {
          stop();
        }),
      });
      stop = () => {
        created.abort();
      };
      return created;
    })();

    const outcome = await session.prompt({ id: 'user-1', role: 'user', content: 'Read the files.' });
    const snapshot = await session.snapshot();
    const history = snapshot.messages;
    await session.close();

    expect(outcome).toEqual({ outcome: 'aborted' });
    expect(historyWellFormed(history)).toBe(true);
    const outputs = history.filter((message) => message.role === 'tool-output');
    expect(outputs.map((message) => message.toolCallId)).toEqual(ids);
    /* Nothing follows an early tool's call but its own result and its siblings' rows. */
    const lastOutput = history.findLastIndex((message) => message.role === 'tool-output');
    const firstInput = history.findIndex((message) => message.role === 'tool-input');
    expect(history.slice(firstInput, lastOutput + 1).every((message) => message.role.startsWith('tool-'))).toBe(true);

    /* The next turn hands the provider that history as it stands: one result per call, each after its call. */
    const next = scriptedTransport([]);
    const sessionTwo = await createAgentSession({
      chatId: 'chat-1',
      runId: 'run-2',
      leaderEpoch: 'epoch-2',
      systemPrompt: 'system',
      model,
      modelTransport: next,
      toolRegistry: slowReadRegistry,
      eventLog: await file.open(),
    });
    await sessionTwo.prompt({ id: 'user-2', role: 'user', content: 'Carry on.' });
    await sessionTwo.close();
    const sent = shapeOf(next.requests[0]?.messages ?? []);
    for (const id of ids) {
      expect(sent.filter((entry) => entry === `tool-output(${id})`)).toHaveLength(1);
      expect(sent.indexOf(`tool-output(${id})`)).toBeGreaterThan(sent.indexOf(`tool-input(${id})`));
    }
  });
});
