import { createGatewayModelTransport } from '#transport/gateway-model-transport.js';
import type { GatewayModelTransportOptions } from '#transport/gateway-model-transport.js';
import type { ProviderMessage } from '#log/event-types.js';
import type { ModelStreamRequest } from '#waist/ports.js';

/**
 * A request's history as a chat that only appended holds it: each assistant row stamped by the request that produced
 * it. A row with no stamp replays no native reasoning (P2), so a fixture that expects a replay needs its rows stamped.
 *
 * @param request - The request whose history to stamp; each row is stamped as this request's model and settings.
 * @param options - Transport options a stamp depends on, when the test's transport sets any.
 * @returns The history, every assistant row carrying `metadata.prefix`.
 */
export const stampedHistory = async (
  request: ModelStreamRequest,
  options?: Pick<GatewayModelTransportOptions, 'release'>,
): Promise<ProviderMessage[]> => {
  const transport = createGatewayModelTransport({
    baseUrl: 'https://gateway.example',
    model: { contextWindow: 200_000, maxTokens: 8192 },
    ...options,
    /* The stamp rides the codec's first event, whatever it is, so a refusal is enough to read it. */
    fetch: async () => new Response('{}', { status: 500 }),
  });
  const messages: ProviderMessage[] = [];
  for (const message of request.messages) {
    if (message.role !== 'assistant') {
      messages.push(message);
      continue;
    }
    const replies = transport.stream({ ...request, messages: [...messages] })[Symbol.asyncIterator]();
    // eslint-disable-next-line no-await-in-loop -- each stamp is computed over the rows stamped before it
    const first = await replies.next();
    // eslint-disable-next-line no-await-in-loop -- as above
    await replies.return?.(undefined);
    if (first.done === true || first.value.type !== 'message-metadata') {
      throw new TypeError('The transport sent no prefix stamp.');
    }
    messages.push({ ...message, metadata: { ...message.metadata, prefix: first.value.metadata['prefix'] } });
  }
  return messages;
};
