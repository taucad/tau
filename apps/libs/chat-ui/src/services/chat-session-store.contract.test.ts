// @vitest-environment node
import { describe, expect, it, vi } from 'vitest';
import { Chat } from '@ai-sdk/react';
import type { ChatTransport, UIMessage, UIMessageChunk } from 'ai';

const completedReply = (id: string): ReadableStream<UIMessageChunk> =>
  new ReadableStream({
    start(controller) {
      controller.enqueue({ type: 'start', messageId: id });
      controller.enqueue({ type: 'text-start', id: `${id}-text` });
      controller.enqueue({ type: 'text-delta', id: `${id}-text`, delta: 'Reply' });
      controller.enqueue({ type: 'text-end', id: `${id}-text` });
      controller.enqueue({ type: 'finish', finishReason: 'stop' });
      controller.close();
    },
  });

/** A resume attaches to an admitted run, without submitting a new user turn. */
describe('AI SDK resume-stream contract', () => {
  it.each([false, true])(
    'should preserve the user transcript when an admitted stream exists: %s',
    async (hasStream) => {
      const user: UIMessage = { id: 'persisted-user', role: 'user', parts: [{ type: 'text', text: 'Continue' }] };
      const transport = {
        sendMessages: vi.fn<ChatTransport<UIMessage>['sendMessages']>(),
        reconnectToStream: vi.fn(async () => (hasStream ? completedReply('resumed-assistant') : null)),
      } satisfies ChatTransport<UIMessage>;
      const chat = new Chat({ id: 'resume-contract', messages: [user], transport });

      await chat.resumeStream();

      expect(transport.reconnectToStream).toHaveBeenCalledExactlyOnceWith(
        expect.objectContaining({ chatId: 'resume-contract' }),
      );
      expect(transport.sendMessages).not.toHaveBeenCalled();
      expect(chat.messages.filter((message) => message.role === 'user')).toEqual([user]);
      expect(chat.status).toBe('ready');
      expect(chat.error).toBeUndefined();
      expect(chat.messages).toHaveLength(hasStream ? 2 : 1);
      if (hasStream) {
        expect(chat.messages.at(-1)).toMatchObject({
          id: 'resumed-assistant',
          role: 'assistant',
          parts: [{ type: 'text', text: 'Reply', state: 'done' }],
        });
      }
    },
  );
});

/** An outer request finishing must not retire the response started synchronously by its callback. */
describe('AI SDK reentrant finish contract', () => {
  it.each([false, true])('should keep the nested response finishable and stoppable (abort: %s)', async (abort) => {
    const nestedStream = Promise.withResolvers<{
      controller: ReadableStreamDefaultController<UIMessageChunk>;
      signal: AbortSignal | undefined;
    }>();
    const finished: Array<{ id: string; isAbort: boolean; isError: boolean }> = [];
    let nestedRequest: Promise<void> | undefined;
    let requests = 0;
    let requestsBeforeFinishReturns = 0;
    const transport: ChatTransport<UIMessage> = {
      reconnectToStream: async () => null,
      sendMessages: async ({ abortSignal }) => {
        requests += 1;
        if (requests === 1) {
          return completedReply('first-assistant');
        }
        return new ReadableStream({
          start(controller) {
            controller.enqueue({ type: 'start', messageId: 'nested-assistant' });
            abortSignal?.addEventListener(
              'abort',
              () => {
                controller.error(new DOMException('Stopped', 'AbortError'));
              },
              { once: true },
            );
            nestedStream.resolve({ controller, signal: abortSignal });
          },
        });
      },
    };
    const chat = new Chat({
      id: 'reentrant-contract',
      transport,
      onFinish({ message, isAbort, isError }) {
        finished.push({ id: message.id, isAbort, isError });
        if (message.id === 'first-assistant') {
          // Parts bypass asynchronous file conversion, replacing the response before this callback returns.
          nestedRequest = chat.sendMessage({ parts: [{ type: 'text', text: 'Follow up' }] });
          requestsBeforeFinishReturns = requests;
          expect(requests).toBe(2);
        }
      },
    });

    await chat.sendMessage({ text: 'First turn' });
    const { controller, signal } = await nestedStream.promise;
    try {
      if (abort) {
        await chat.stop();
      }
    } finally {
      // Drain even a regressed SDK whose outer finish lost the nested abort controller.
      if (!signal?.aborted) {
        controller.enqueue({ type: 'finish', finishReason: 'stop' });
        controller.close();
      }
      await nestedRequest;
    }

    expect(requests).toBe(2);
    expect(requestsBeforeFinishReturns).toBe(2);
    expect(signal?.aborted).toBe(abort);
    expect(finished).toEqual([
      { id: 'first-assistant', isAbort: false, isError: false },
      { id: 'nested-assistant', isAbort: abort, isError: false },
    ]);
    expect(chat.messages.filter((message) => message.role === 'user').map((message) => message.parts)).toEqual([
      [{ type: 'text', text: 'First turn' }],
      [{ type: 'text', text: 'Follow up' }],
    ]);
    expect(chat.status).toBe('ready');
    expect(chat.error).toBeUndefined();
  });
});

/** Awaited cancellation drains pending work and prevents stale continuations from reviving a response. */
describe('AI SDK awaited stop contract', () => {
  it('should drain a blocked tool callback and its queued update before stop resolves', async () => {
    const enteredTool = Promise.withResolvers<void>();
    const releaseTool = Promise.withResolvers<void>();
    const cancel = vi.fn();
    const transport = {
      reconnectToStream: async () => null,
      sendMessages: vi.fn(
        async () =>
          new ReadableStream<UIMessageChunk>({
            start(controller) {
              controller.enqueue({ type: 'start', messageId: 'tool-assistant' });
              controller.enqueue({ type: 'text-start', id: 'text' });
              controller.enqueue({ type: 'text-delta', id: 'text', delta: 'Before stop' });
              controller.enqueue({
                type: 'tool-input-available',
                toolCallId: 'local-call',
                toolName: 'local',
                input: {},
                dynamic: true,
              });
              controller.enqueue({ type: 'text-delta', id: 'text', delta: ' late text' });
            },
            cancel,
          }),
      ),
    } satisfies ChatTransport<UIMessage>;
    const chat = new Chat<UIMessage>({
      id: 'stop-tool-contract',
      transport,
      sendAutomaticallyWhen: () => true,
      async onToolCall() {
        enteredTool.resolve();
        await releaseTool.promise;
        void chat.addToolOutput({ tool: 'local', toolCallId: 'local-call', output: 'Settled tool' });
      },
    });
    const request = chat.sendMessage({ text: 'Run tool' });
    await enteredTool.promise;
    let stopped = false;
    const stopping = (async () => {
      await chat.stop();
      stopped = true;
    })();
    try {
      await Promise.resolve();
      expect(stopped).toBe(false);
    } finally {
      releaseTool.resolve();
      await Promise.all([stopping, request]);
    }

    expect(cancel).toHaveBeenCalledOnce();
    expect(chat.messages.at(-1)?.parts).toEqual([
      expect.objectContaining({ type: 'text', text: 'Before stop' }),
      expect.objectContaining({ type: 'dynamic-tool', state: 'output-available', output: 'Settled tool' }),
    ]);
    const afterStop = structuredClone(chat.messages);
    await new Promise<void>((resolve) => {
      setTimeout(resolve, 0);
    });
    expect(chat.messages).toEqual(afterStop);
    expect(transport.sendMessages).toHaveBeenCalledOnce();
    expect(chat.status).toBe('ready');
    expect(chat.error).toBeUndefined();
  });

  it('should invalidate an automatic-send decision that resolves after awaited stop', async () => {
    const deciding = Promise.withResolvers<void>();
    const decision = Promise.withResolvers<boolean>();
    const transport = {
      reconnectToStream: async () => null,
      sendMessages: vi.fn(async () => completedReply('automatic-assistant')),
    } satisfies ChatTransport<UIMessage>;
    const chat = new Chat({
      id: 'stop-automatic-contract',
      transport,
      sendAutomaticallyWhen: async () => {
        if (transport.sendMessages.mock.calls.length > 1) {
          return false;
        }
        deciding.resolve();
        return decision.promise;
      },
    });
    const request = chat.sendMessage({ text: 'First turn' });
    await deciding.promise;
    await chat.stop();
    const afterStop = structuredClone(chat.messages);
    decision.resolve(true);
    await request;

    expect(transport.sendMessages).toHaveBeenCalledOnce();
    expect(chat.messages).toEqual(afterStop);
    expect(chat.status).toBe('ready');
    expect(chat.error).toBeUndefined();
  });

  it('should cancel a pending reconnect without consuming its late response', async () => {
    const connection = Promise.withResolvers<Awaited<ReturnType<ChatTransport<UIMessage>['reconnectToStream']>>>();
    const connecting = Promise.withResolvers<AbortSignal | undefined>();
    const cancel = vi.fn();
    const user: UIMessage = { id: 'persisted-user', role: 'user', parts: [{ type: 'text', text: 'Continue' }] };
    const transport = {
      sendMessages: vi.fn<ChatTransport<UIMessage>['sendMessages']>(),
      reconnectToStream: vi.fn<ChatTransport<UIMessage>['reconnectToStream']>(async ({ abortSignal }) => {
        connecting.resolve(abortSignal);
        return connection.promise;
      }),
    } satisfies ChatTransport<UIMessage>;
    const onFinish = vi.fn();
    const chat = new Chat({ id: 'stop-reconnect-contract', messages: [user], transport, onFinish });
    const resuming = chat.resumeStream();
    const signal = await connecting.promise;
    const stopping = chat.stop();
    const wasAborted = signal?.aborted;
    connection.resolve(
      new ReadableStream({
        start(controller) {
          controller.enqueue({ type: 'start', messageId: 'stale-assistant' });
          controller.enqueue({ type: 'text-start', id: 'stale-text' });
          controller.enqueue({ type: 'text-delta', id: 'stale-text', delta: 'Must not appear' });
        },
        cancel,
      }),
    );
    await Promise.all([stopping, resuming]);

    expect(wasAborted).toBe(true);
    expect(cancel).toHaveBeenCalledOnce();
    expect(chat.messages).toEqual([user]);
    expect(transport.sendMessages).not.toHaveBeenCalled();
    expect(onFinish).not.toHaveBeenCalled();
    expect(chat.status).toBe('ready');
    expect(chat.error).toBeUndefined();
  });
});
