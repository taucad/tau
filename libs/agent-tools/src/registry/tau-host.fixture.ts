/**
 * A Tau agent host's two collaborators for this package's tests that drive one: a scripted model and W8's placement
 * port. The host package keeps its own fixtures off its export map, so the same shapes live here.
 */
import type {
  JsonValue,
  ModelStreamEvent,
  ModelStreamRequest,
  ModelTransport,
  ToolRegistry,
  TurnPlacementFact,
  TurnPlacementPort,
} from '@taucad/agent-host';

/** One scripted model response: optional text, then tool calls. */
export type ScriptedResponse = {
  readonly text?: string | undefined;
  readonly toolCalls?:
    | ReadonlyArray<{ readonly id: string; readonly name: string; readonly input: JsonValue }>
    | undefined;
};

/**
 * The scripted model (V08): each request is answered by the next response, and every request is kept.
 *
 * @param responses - The responses, in order.
 * @returns The transport and the requests it received.
 */
export const scriptedTransport = (
  responses: readonly ScriptedResponse[],
): ModelTransport & { readonly requests: ModelStreamRequest[] } => {
  const requests: ModelStreamRequest[] = [];
  let cursor = 0;
  return {
    requests,
    funding: { type: 'unfunded' },
    async *stream(request): AsyncGenerator<ModelStreamEvent> {
      requests.push(request);
      const response = responses[cursor];
      cursor += 1;
      if (!response) {
        throw new Error(`Scripted model exhausted after ${String(cursor - 1)} calls.`);
      }
      if (response.text !== undefined) {
        yield { type: 'text-delta', text: response.text };
      }
      for (const call of response.toolCalls ?? []) {
        yield { type: 'tool-input', toolCallId: call.id, toolName: call.name, input: call.input };
      }
      yield {
        type: 'usage',
        usage: {
          input: 100,
          output: 10,
          cacheRead: 0,
          cacheWrite: 0,
          totalTokens: 110,
          cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 },
        },
      };
      yield { type: 'completed', stopReason: response.toolCalls?.length ? 'toolUse' : 'stop' };
    },
  };
};

/**
 * W8's placement port, answering every verb: the attempt runs on the given tools and its completion settles at once.
 * Every CAD run needs a placement (D13).
 *
 * ponytail: the host package's `fakePlacement` fixture is not on its export map, so the same shape lives here.
 */
export const placementOver = (registry: ToolRegistry): TurnPlacementPort => {
  const facts: TurnPlacementFact[] = [];
  let wake: () => void = () => undefined;
  return {
    admit: async ({ requestId, checkoutId }) => ({
      requestId,
      status: 'applied',
      placement: { checkoutId: checkoutId ?? 'checkout-live', mode: 'direct', root: '/work', tools: registry },
    }),
    complete: async ({ requestId, key }) => {
      facts.push({
        kind: 'settled',
        key,
        row: {
          type: 'turn.finalized',
          runId: key.runId,
          attempt: key.attempt,
          turnId: key.turnId,
          chatId: key.chatId,
          projectId: 'project-1',
          changedPaths: [],
          trigger: 'turn',
          runIds: [key.runId],
        },
      });
      wake();
      return { requestId, status: 'applied' };
    },
    abandon: async ({ requestId }) => ({ requestId, status: 'applied' }),
    reconcile: async ({ requestId }) => ({ requestId, status: 'applied', held: [] }),
    async *settlements({ signal }) {
      const nextFact = async (): Promise<void> =>
        new Promise<void>((resolve) => {
          wake = resolve;
          signal.addEventListener('abort', () => {
            resolve();
          });
        });
      let next = 0;
      while (!signal.aborted) {
        while (next < facts.length) {
          const fact = facts[next++];
          if (fact !== undefined) {
            yield fact;
          }
        }
        // oxlint-disable-next-line no-await-in-loop -- a listen waits for the next fact.
        await nextFact();
      }
    },
    acknowledge: async ({ requestId }) => ({ requestId, status: 'applied' }),
  };
};
