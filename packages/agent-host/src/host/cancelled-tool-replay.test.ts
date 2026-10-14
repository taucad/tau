import { expect, it, vi } from 'vitest';
import { z } from 'zod';
import { createTauAgentHost } from '#host/tau-agent-host.js';
import { createMemoryLogFile, hostOptions, tools, readLog } from '#host/tau-agent-host.fixture.js';
import { createGatewayModelTransport } from '#transport/gateway-model-transport.js';
import { authoritativeGatewayWireFixtures } from '#transport/gateway-wire.fixture.js';
import type { ModelStreamEvent, ModelTransport } from '#waist/ports.js';

const wireSchema = z.object({
  messages: z.array(
    z.object({
      content: z.union([
        z.string(),
        z.array(
          z.object({
            type: z.string(),
            id: z.string().optional(),
            // eslint-disable-next-line @typescript-eslint/naming-convention -- Anthropic wire field.
            tool_use_id: z.string().optional(),
          }),
        ),
      ]),
    }),
  ),
});

it.each(['follow-up', 'Resume'] as const)(
  'should preserve an executed tool across cancellation and %s without executing it again',
  async (mode) => {
    const file = createMemoryLogFile();
    const called = Promise.withResolvers<void>();
    const bodies: Array<z.infer<typeof wireSchema>> = [];
    let calls = 0;
    const gateway = createGatewayModelTransport({
      baseUrl: 'https://gateway.example',
      model: { contextWindow: 200_000, maxTokens: 8192 },
      fetch: async (_input, init) => {
        if (typeof init?.body !== 'string') {
          throw new TypeError('Expected a serialized provider request.');
        }
        bodies.push(wireSchema.parse(JSON.parse(init.body)));
        return new Response(authoritativeGatewayWireFixtures.anthropicToolTurn.join(''), {
          status: 200,
          headers: { 'content-type': 'text/event-stream' },
        });
      },
    });
    const transport: ModelTransport = {
      funding: { type: 'unfunded' },
      async *stream(request) {
        if (++calls === 1) {
          yield {
            type: 'tool-input',
            toolCallId: 'toolu_completed',
            toolName: 'read_file',
            input: { targetFile: 'main.ts' },
          };
          if (!request.signal.aborted) {
            await new Promise<void>((resolve) => {
              request.signal.addEventListener(
                'abort',
                () => {
                  resolve();
                },
                { once: true },
              );
            });
          }
          yield { type: 'completed', stopReason: 'aborted' };
          return;
        }
        // Exercise the actual outbound codec over the history rebuilt by the host.
        const events: ModelStreamEvent[] = [];
        for await (const event of gateway.stream({
          ...request,
          modelId: 'claude-fixture-4',
          providerKind: 'anthropic',
        })) {
          events.push(event);
        }
        expect(events.at(-1)).toMatchObject({ type: 'completed' });
        yield { type: 'text-delta', text: 'Continued from the recorded result.' };
        yield { type: 'completed', stopReason: 'stop' };
      },
    };
    const invoke = vi.fn(async () => {
      called.resolve();
      return { content: 'export const main = 1', isError: false };
    });
    const host = createTauAgentHost(
      hostOptions({
        openEventLog: file.open,
        transport,
        toolRegistry: tools(invoke),
        idPrefix: 'cancelled-replay',
      }),
    );
    try {
      const first = host.admit({
        chatId: 'chat',
        runId: 'run-1',
        trigger: 'submit',
        message: { id: 'user-1', role: 'user', content: 'Read main.ts' },
      });
      await called.promise;
      await host.cancel({ runId: 'run-1', commandId: 'cancel-1' });
      await first;
      expect(await host.snapshot('chat')).toMatchObject({ state: 'cancelled' });
      const cancelledRows = await readLog(file);
      if (mode === 'follow-up') {
        await host.admit({
          chatId: 'chat',
          runId: 'run-2',
          trigger: 'submit',
          message: { id: 'user-2', role: 'user', content: 'Continue' },
        });
      } else {
        await host.resume('chat', { commandId: 'resume-1' });
      }
      expect(bodies).toHaveLength(1);
      const blocks = bodies[0]!.messages.flatMap((message) => (Array.isArray(message.content) ? message.content : []));
      const inputs = blocks.filter((block) => block.type === 'tool_use').map((block) => block.id);
      const outputs = blocks.filter((block) => block.type === 'tool_result').map((block) => block.tool_use_id);
      expect(outputs).toEqual(['toolu_completed']);
      expect(inputs).toEqual(outputs);
      expect(invoke).toHaveBeenCalledTimes(1);
      const finalRows = await readLog(file);
      expect(finalRows.slice(0, cancelledRows.length)).toEqual(cancelledRows);
      expect(await host.snapshot('chat')).toMatchObject({ state: 'completed' });
    } finally {
      await host.close();
    }
  },
);
