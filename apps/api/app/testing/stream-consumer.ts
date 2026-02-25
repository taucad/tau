/**
 * Stream consumption utilities using AI SDK's own headless parsers.
 *
 * Reuses the same code path that `useChat` / `DefaultChatTransport` uses in
 * the browser, ensuring test assertions match production behavior exactly.
 */
import { parseJsonEventStream } from '@ai-sdk/provider-utils';
import { readUIMessageStream, uiMessageChunkSchema } from 'ai';
import type { UIMessage, UIMessageChunk } from 'ai';

/**
 * Layer 1: Collect raw UIMessageChunks from an SSE response.
 * Validates each chunk against the AI SDK schema.
 * Useful for asserting on streaming behavior (event ordering, partial deltas).
 */
export async function collectStreamChunks(response: Response): Promise<UIMessageChunk[]> {
  const { body } = response;
  if (!body) {
    throw new Error('Response body is null');
  }

  const chunkStream = parseJsonEventStream({
    stream: body,
    // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-explicit-any -- AI SDK schema type mismatch between LazySchema versions
    schema: uiMessageChunkSchema as any,
  }).pipeThrough(
    new TransformStream({
      transform(chunk, controller) {
        if (!chunk.success) {
          throw chunk.error;
        }

        controller.enqueue(chunk.value as UIMessageChunk);
      },
    }),
  );

  const chunks: UIMessageChunk[] = [];
  const reader = chunkStream.getReader();

  // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition -- read loop
  while (true) {
    // eslint-disable-next-line no-await-in-loop -- sequential stream read
    const result = await reader.read();
    if (result.done) {
      break;
    }

    chunks.push(result.value as UIMessageChunk);
  }

  return chunks;
}

/**
 * Layer 2: Parse a stream of UIMessageChunks into the final UIMessage state.
 * Uses readUIMessageStream, the same processor that builds UIMessage objects
 * from chunks in the browser.
 */
export async function collectFinalMessage(chunks: UIMessageChunk[]): Promise<UIMessage> {
  const stream = new ReadableStream<UIMessageChunk>({
    start(controller) {
      for (const chunk of chunks) {
        controller.enqueue(chunk);
      }

      controller.close();
    },
  });

  let lastMessage: UIMessage | undefined;

  for await (const message of readUIMessageStream({ stream })) {
    lastMessage = message;
  }

  if (!lastMessage) {
    throw new Error('No message produced from stream');
  }

  return lastMessage;
}
