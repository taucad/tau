import { describe, expect, it, vi } from 'vitest';
import { logProviderStreamErrors, logProviderStreamFailure } from '#api/chat/utils/provider-stream-error-log.js';
import { ChatAbortError } from '#api/chat/utils/chat-abort.js';

const consumeStream = async <T>(stream: AsyncIterable<T>): Promise<T[]> => {
  const values: T[] = [];
  for await (const value of stream) {
    values.push(value);
  }

  return values;
};

const createFailingStream = <T>(error: unknown): AsyncIterable<T> => ({
  [Symbol.asyncIterator]: () => ({
    next: async (): Promise<IteratorResult<T>> => {
      throw error;
    },
  }),
});

const googleInvalidArgumentByteList = [
  ...new TextEncoder().encode(
    JSON.stringify([
      {
        error: {
          code: 400,
          message: 'Request contains an invalid argument.',
          errors: [{ message: 'Request contains an invalid argument.', domain: 'global', reason: 'badRequest' }],
          status: 'INVALID_ARGUMENT',
        },
      },
    ]),
  ),
].join(',');

describe('provider stream failure logging', () => {
  it('should log provider error details with safe request context', () => {
    const logger = { error: vi.fn() };
    const error = new Error('Provider request failed with status code 400') as Error & {
      code?: string;
      response?: unknown;
    };
    error.response = {
      status: 400,
      statusText: 'Bad Request',
      data: {
        error: {
          code: 400,
          status: 'INVALID_REQUEST',
          message: 'Invalid provider payload. Unknown field "badField".',
          details: [
            {
              fieldViolations: [
                {
                  field: 'request.body.badField',
                  description: 'Unknown field "badField"',
                },
              ],
            },
          ],
        },
        request: {
          headers: {
            authorization: 'Bearer should-not-log',
            cookie: 'tau.session_token=should-not-log',
          },
          prompt: 'SECRET PROMPT SHOULD NOT LOG',
        },
      },
    };

    logProviderStreamFailure(
      logger,
      {
        chatId: 'chat_provider_400',
        modelId: 'provider-model',
        providerId: 'provider-id',
      },
      error,
    );

    expect(logger.error).toHaveBeenCalledOnce();
    const [payload, message] = logger.error.mock.calls[0] as [Record<string, unknown>, string];

    expect(message).toBe('Chat model stream failed for provider-model');
    expect(payload).toMatchObject({
      chatId: 'chat_provider_400',
      modelId: 'provider-model',
      providerId: 'provider-id',
      providerError: {
        name: 'Error',
        message: 'Provider request failed with status code 400',
        code: 'INVALID_REQUEST',
        status: 400,
        providerStatus: 'INVALID_REQUEST',
        statusText: 'Bad Request',
        providerMessage: 'Invalid provider payload. Unknown field "badField".',
      },
    });

    const serializedPayload = JSON.stringify(payload);
    expect(serializedPayload).toContain('Unknown field');
    expect(serializedPayload).toContain('badField');
    expect(serializedPayload).not.toContain('Bearer should-not-log');
    expect(serializedPayload).not.toContain('tau.session_token=should-not-log');
    expect(serializedPayload).not.toContain('SECRET PROMPT SHOULD NOT LOG');
  });

  it('should skip provider failure logging and close cleanly for branded client cancellation', async () => {
    const logger = { error: vi.fn() };
    const abortController = new AbortController();
    const abortError = new ChatAbortError('chat_cancelled');
    abortController.abort(abortError);

    await expect(
      consumeStream(
        logProviderStreamErrors({
          abortSignal: abortController.signal,
          context: {
            chatId: 'chat_cancelled',
            modelId: 'provider-model',
            providerId: 'provider-id',
          },
          logger,
          stream: createFailingStream(abortError),
        }),
      ),
    ).resolves.toEqual([]);

    expect(logger.error).not.toHaveBeenCalled();
  });

  it('should log real provider errors from the stream wrapper', async () => {
    const logger = { error: vi.fn() };
    const abortController = new AbortController();
    const providerError = new Error('Provider failed before returning a chunk');

    try {
      await consumeStream(
        logProviderStreamErrors({
          abortSignal: abortController.signal,
          context: {
            chatId: 'chat_provider_error',
            modelId: 'provider-model',
            providerId: 'provider-id',
          },
          logger,
          stream: createFailingStream(providerError),
        }),
      );
      expect.fail('Expected provider failure to be rethrown');
    } catch (error) {
      expect(error).toBe(providerError);
      expect(error).toBeInstanceOf(Error);
      expect((error as Error).message).toBe('Provider failed before returning a chunk');
    }

    expect(logger.error).toHaveBeenCalledOnce();
    const [payload, message] = logger.error.mock.calls[0] as [Record<string, unknown>, string];
    expect(message).toBe('Chat model stream failed for provider-model');
    expect(payload).toMatchObject({
      chatId: 'chat_provider_error',
      modelId: 'provider-model',
      providerError: {
        name: 'Error',
        message: 'Provider failed before returning a chunk',
      },
    });
  });

  it('should decode Google byte-list provider errors in stream failure logs', () => {
    const logger = { error: vi.fn() };
    const error = new Error(`Google request failed with status code 400: ${googleInvalidArgumentByteList}`);

    logProviderStreamFailure(
      logger,
      {
        chatId: 'chat_google_byte_list',
        modelId: 'google-gemini-3.5-flash',
        providerId: 'vertexai',
      },
      error,
    );

    expect(logger.error).toHaveBeenCalledOnce();
    const [payload] = logger.error.mock.calls[0] as [Record<string, unknown>, string];
    expect(payload).toMatchObject({
      providerError: {
        code: 'INVALID_ARGUMENT',
        status: 400,
        providerStatus: 'INVALID_ARGUMENT',
        providerMessage: 'Request contains an invalid argument.',
        providerReason: 'badRequest',
        decodedBody: {
          bodyKind: 'byte-list',
          providerCode: 'INVALID_ARGUMENT',
        },
      },
    });
  });

  it('should log unbranded abort errors even when the request signal is aborted', async () => {
    const logger = { error: vi.fn() };
    const abortController = new AbortController();
    abortController.abort(new Error('Plain abort reason'));

    const transportAbortError = new Error('The operation was aborted');
    transportAbortError.name = 'AbortError';

    try {
      await consumeStream(
        logProviderStreamErrors({
          abortSignal: abortController.signal,
          context: {
            chatId: 'chat_unbranded_abort',
            modelId: 'provider-model',
            providerId: 'provider-id',
          },
          logger,
          stream: createFailingStream(transportAbortError),
        }),
      );
      expect.fail('Expected unbranded abort error to be rethrown');
    } catch (error) {
      expect(error).toBe(transportAbortError);
      expect(error).toBeInstanceOf(Error);
      expect((error as Error).name).toBe('AbortError');
      expect((error as Error).message).toBe('The operation was aborted');
    }

    expect(logger.error).toHaveBeenCalledOnce();
    const [payload] = logger.error.mock.calls[0] as [Record<string, unknown>, string];
    expect(payload).toMatchObject({
      chatId: 'chat_unbranded_abort',
      providerError: {
        name: 'AbortError',
        message: 'The operation was aborted',
      },
    });
  });
});
