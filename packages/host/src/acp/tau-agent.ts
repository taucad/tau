import { AgentSideConnection, ClientSideConnection, PROTOCOL_VERSION, RequestError } from '@agentclientprotocol/sdk';
import type { AnyMessage, SessionUpdate, Stream } from '@agentclientprotocol/sdk';
import type { AgentRunOutcome, TauTurnTransport, TauTurnTransportInput } from '@taucad/agent-host';
import type { AcpWireFrame } from '#acp/spawn.js';

/** Observable protocol projections; the adapter never writes them back into the chat log. @public */
export type TauAgentAcpOptions = Readonly<{
  onFrame?: ((frame: AcpWireFrame) => void) | undefined;
  onUpdate?: ((update: SessionUpdate) => void | Promise<void>) | undefined;
}>;

const duplex = (
  onFrame: TauAgentAcpOptions['onFrame'],
): Readonly<{
  client: Stream;
  agent: Stream;
  close: () => void;
}> => {
  let clientInput: ReadableStreamDefaultController<AnyMessage>;
  let agentInput: ReadableStreamDefaultController<AnyMessage>;
  const clientReadable = new ReadableStream<AnyMessage>({
    start: (controller) => {
      clientInput = controller;
    },
  });
  const agentReadable = new ReadableStream<AnyMessage>({
    start: (controller) => {
      agentInput = controller;
    },
  });
  return {
    client: {
      readable: clientReadable,
      writable: new WritableStream<AnyMessage>({
        write: (frame) => {
          onFrame?.({ direction: 'client->agent', frame: JSON.stringify(frame) });
          agentInput.enqueue(frame);
        },
      }),
    },
    agent: {
      readable: agentReadable,
      writable: new WritableStream<AnyMessage>({
        write: (frame) => {
          onFrame?.({ direction: 'agent->client', frame: JSON.stringify(frame) });
          clientInput.enqueue(frame);
        },
      }),
    },
    close: () => {
      clientInput.close();
      agentInput.close();
    },
  };
};

const run = async (input: TauTurnTransportInput, options: TauAgentAcpOptions): Promise<AgentRunOutcome> => {
  const streams = duplex(options.onFrame);
  const sessionId = `tau:${input.chatId}:${input.runId}:${String(input.attempt)}`;
  let initialized = false;
  let sessionCreated = false;
  let execution: Promise<AgentRunOutcome> | undefined;
  let outcome: AgentRunOutcome | undefined;
  const requireSession = (id: string): void => {
    if (!sessionCreated || id !== sessionId) {
      throw RequestError.invalidParams('Unknown Tau session.');
    }
  };
  // oxlint-disable-next-line typescript/no-deprecated -- stable v1 AgentSideConnection matches the host's existing ACP client owner.
  const agent = new AgentSideConnection(
    (connection) => ({
      authenticate: () => {
        throw RequestError.methodNotFound('authenticate');
      },
      initialize: () => {
        initialized = true;
        return {
          protocolVersion: PROTOCOL_VERSION,
          agentCapabilities: {},
          agentInfo: { name: 'Tau CAD', version: '0.1.0' },
        };
      },
      newSession: (request) => {
        if (!initialized || sessionCreated || request.cwd !== (input.root ?? '/') || request.mcpServers.length > 0) {
          throw RequestError.invalidParams(
            'Tau requires one initialized session on its admitted root, without MCP attachments.',
          );
        }
        sessionCreated = true;
        return { sessionId };
      },
      prompt: async (request) => {
        requireSession(request.sessionId);
        if (execution !== undefined) {
          throw RequestError.invalidParams('This Tau attempt has already been prompted.');
        }
        execution = input.execute({
          live: async (event) => {
            if (event.type === 'text-delta' || event.type === 'thinking-delta') {
              await connection.sessionUpdate({
                sessionId,
                update: {
                  sessionUpdate: event.type === 'text-delta' ? 'agent_message_chunk' : 'agent_thought_chunk',
                  content: { type: 'text', text: event.delta },
                },
              });
            }
          },
          durable: async (event) => {
            if (event.type !== 'message.appended') {
              return;
            }
            const { message } = event;
            if (message.role === 'tool-input') {
              await connection.sessionUpdate({
                sessionId,
                update: {
                  sessionUpdate: 'tool_call',
                  toolCallId: message.toolCallId,
                  title: message.toolName,
                  status: 'in_progress',
                  rawInput: message.content,
                },
              });
            } else if (message.role === 'tool-output') {
              await connection.sessionUpdate({
                sessionId,
                update: {
                  sessionUpdate: 'tool_call_update',
                  toolCallId: message.toolCallId,
                  status: message.isError ? 'failed' : 'completed',
                  rawOutput: message.content,
                },
              });
            }
          },
          needsInput: async (request) => {
            /* Native Tau approvals pause the attempt. Its host inbox owns the decision and next attempt;
             * ACP permission is a projection and must not create another live approval loop. */
            await connection.requestPermission({
              sessionId,
              toolCall: { toolCallId: request.toolCallId, title: request.prompt, status: 'pending' },
              options: [{ optionId: 'native-pause', name: 'Continue In Tau', kind: 'allow_once' }],
            });
          },
        });
        outcome = await execution;
        return { stopReason: outcome.outcome === 'aborted' ? 'cancelled' : 'end_turn' };
      },
      cancel: (request) => {
        requireSession(request.sessionId);
        input.abort();
      },
    }),
    streams.agent,
  );
  // oxlint-disable-next-line typescript/no-deprecated -- stable v1 duplex uses the same client connection as external ACP routes.
  const client = new ClientSideConnection(
    () => ({
      sessionUpdate: async ({ update }) => {
        await options.onUpdate?.(update);
      },
      requestPermission: () => ({ outcome: { outcome: 'cancelled' } }),
    }),
    streams.client,
  );
  let cancellation: Promise<void> | undefined;
  const cancelTurn = async (): Promise<void> => {
    try {
      await client.cancel({ sessionId });
    } catch {
      input.abort();
    }
  };
  const cancel = (): void => {
    cancellation = cancelTurn();
  };
  try {
    await client.initialize({ protocolVersion: PROTOCOL_VERSION, clientCapabilities: {} });
    await client.newSession({ cwd: input.root ?? '/', mcpServers: [] });
    input.signal.addEventListener('abort', cancel, { once: true });
    if (input.signal.aborted) {
      await client.cancel({ sessionId });
      return { outcome: 'aborted' };
    }
    await client.prompt({
      sessionId,
      prompt: [
        {
          type: 'text',
          text: typeof input.message?.content === 'string' ? input.message.content : 'Continue the admitted Tau turn.',
        },
      ],
    });
    if (outcome === undefined) {
      throw new Error('Tau ACP prompt ended without executing its admitted turn.');
    }
    return outcome;
  } finally {
    input.signal.removeEventListener('abort', cancel);
    await cancellation;
    streams.close();
    await Promise.all([client.closed, agent.closed]);
  }
};

/**
 * Create an in-process ACP boundary around the existing, already-admitted Tau Pi driver.
 * @param options - Observers for protocol frames and read-only session projections.
 * @returns The portable host's admitted-turn transport.
 */
export const createTauAgentAcpTransport = (options: TauAgentAcpOptions = {}): TauTurnTransport => ({
  run: async (input) => run(input, options),
});
