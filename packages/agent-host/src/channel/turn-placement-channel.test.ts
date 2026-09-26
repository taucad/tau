/**
 * The placement session on rpc (W6 RH-S11, W8 TS-S5): both halves over one `MessageChannel`, with a scripted session.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';

import { connectTurnPlacementChannel, serveTurnPlacementChannel } from '#channel/turn-placement-channel.js';
import type { TurnPlacementSession } from '#channel/turn-placement-channel.js';
import type { ToolRegistry, TurnPlacementFact } from '#waist/ports.js';

const key = { chatId: 'chat-1', turnId: 'turn-1', runId: 'run-1', attempt: 1 };
const registry: ToolRegistry = { list: () => [], invoke: async () => ({ content: null, isError: false }) };
const closers: Array<() => void> = [];

afterEach(() => {
  for (const close of closers.splice(0)) {
    close();
  }
});

const session = (facts: readonly TurnPlacementFact[] = []): TurnPlacementSession & { toolPort: MessagePort } => {
  const tools = new MessageChannel();
  closers.push(() => {
    tools.port2.close();
  });
  return {
    toolPort: tools.port2,
    admit: vi.fn<TurnPlacementSession['admit']>(async ({ requestId, checkoutId }) =>
      checkoutId === 'gone'
        ? { requestId, status: 'refused', code: 'CHECKOUT_UNKNOWN', message: 'Choose another checkout.' }
        : {
            requestId,
            status: 'applied',
            placement: { checkoutId: 'live', mode: 'direct', root: '/project', tools: { port: tools.port1 } },
          },
    ),
    complete: vi.fn<TurnPlacementSession['complete']>(async ({ requestId }) => ({ requestId, status: 'applied' })),
    abandon: vi.fn<TurnPlacementSession['abandon']>(async ({ requestId }) => ({ requestId, status: 'replayed' })),
    acknowledge: vi.fn<TurnPlacementSession['acknowledge']>(async ({ requestId }) => ({
      requestId,
      status: 'applied',
    })),
    reconcile: vi.fn<TurnPlacementSession['reconcile']>(async ({ requestId }) => ({
      requestId,
      status: 'applied',
      held: [{ key, checkoutId: 'live' }],
    })),
    settlements: () => ({
      [Symbol.asyncIterator]: async function* replay(): AsyncGenerator<TurnPlacementFact> {
        yield* facts;
      },
    }),
  };
};

const connect = (served: TurnPlacementSession) => {
  const { port1, port2 } = new MessageChannel();
  const handle = serveTurnPlacementChannel({ port: port1, projectId: 'project-1', session: served });
  const toolsFor = vi.fn((_tools: { readonly port: MessagePort }) => registry);
  const client = connectTurnPlacementChannel({ port: port2, projectId: 'project-1', toolsFor });
  closers.push(() => {
    client.close();
  });
  return { handle, client, toolsFor };
};

describe('the placement session channel', () => {
  it('should hand an admitted attempt its tools through toolsFor and pass a refusal through as data', async () => {
    const served = session();
    const { client, toolsFor } = connect(served);

    await expect(client.admit({ requestId: 'admit-1', key })).resolves.toMatchObject({
      requestId: 'admit-1',
      status: 'applied',
      placement: { checkoutId: 'live', mode: 'direct', root: '/project', tools: registry },
    });
    expect(toolsFor).toHaveBeenCalledWith({ port: expect.any(MessagePort) as unknown });
    await expect(client.admit({ requestId: 'admit-2', key, checkoutId: 'gone' })).resolves.toMatchObject({
      status: 'refused',
      code: 'CHECKOUT_UNKNOWN',
    });
    await expect(client.complete({ requestId: 'complete-1', key, cut: true })).resolves.toEqual({
      requestId: 'complete-1',
      status: 'applied',
    });
    await expect(client.reconcile({ requestId: 'reconcile-1' })).resolves.toMatchObject({
      held: [{ key, checkoutId: 'live' }],
    });
    expect(served.complete).toHaveBeenCalledWith({ requestId: 'complete-1', key, cut: true });
  });

  it('should answer a request it cannot read FRAME_UNREADABLE and never call the session', async () => {
    const served = session();
    const { client } = connect(served);

    await expect(
      client.complete({ requestId: 'complete-1', key: { ...key, attempt: 0 }, cut: true }),
    ).rejects.toMatchObject({ code: 'FRAME_UNREADABLE' });
    await expect(
      client.acknowledge({ requestId: 'ack-1', key, extra: true } as unknown as Parameters<
        typeof client.acknowledge
      >[0]),
    ).rejects.toMatchObject({ code: 'FRAME_UNREADABLE' });
    expect(served.complete).not.toHaveBeenCalled();
    expect(served.acknowledge).not.toHaveBeenCalled();
  });

  it('should stream the settlement facts and tell the server when the client lets go', async () => {
    const fact: TurnPlacementFact = { kind: 'leaseHeld', key, checkoutId: 'live' };
    const { client, handle } = connect(session([fact]));
    const closed = vi.fn();
    handle.onClose(closed);

    const facts: TurnPlacementFact[] = [];
    for await (const heard of client.settlements({ signal: new AbortController().signal })) {
      facts.push(heard);
    }
    expect(facts).toEqual([fact]);

    client.close();
    await vi.waitFor(() => {
      expect(closed).toHaveBeenCalledOnce();
    });
  });
});
