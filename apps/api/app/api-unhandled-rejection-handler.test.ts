import process from 'node:process';
import { Logger } from '@nestjs/common';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { installApiUnhandledRejectionHandler } from '#api-unhandled-rejection-handler.js';
import { ChatAbortError, clearAbortTracking, registerChatAbort } from '#api/chat/utils/chat-abort.js';

const emitUnhandledRejection = (reason: unknown): void => {
  process.emit('unhandledRejection', reason, Promise.resolve());
};

describe('installApiUnhandledRejectionHandler', () => {
  let uninstall: (() => void) | undefined;

  beforeEach(() => {
    clearAbortTracking();
    vi.spyOn(Logger, 'error').mockImplementation(() => undefined);
  });

  afterEach(() => {
    uninstall?.();
    uninstall = undefined;
    clearAbortTracking();
    vi.restoreAllMocks();
  });

  it('should suppress branded chat cancellation rejections', () => {
    uninstall = installApiUnhandledRejectionHandler();

    expect(() => {
      emitUnhandledRejection(new ChatAbortError('chat_123'));
    }).not.toThrow();
  });

  it('should suppress tracked generic AbortError rejections', () => {
    uninstall = installApiUnhandledRejectionHandler();
    registerChatAbort('chat_123');

    const error = new Error('The operation was aborted');
    error.name = 'AbortError';

    expect(() => {
      emitUnhandledRejection(error);
    }).not.toThrow();
  });

  it('should still rethrow unrelated unhandled rejections', () => {
    uninstall = installApiUnhandledRejectionHandler();
    const expectedError = new Error('database connection exploded');
    let thrown: unknown;

    try {
      emitUnhandledRejection(expectedError);
    } catch (error) {
      thrown = error;
    }

    expect(thrown).toBe(expectedError);
  });

  it('should keep suppressing Fastify duplicate-route races with an operator log', () => {
    uninstall = installApiUnhandledRejectionHandler();
    const error = Object.assign(new Error('Route GET:/v1/chat already declared'), {
      code: 'FST_ERR_DUPLICATED_ROUTE',
    });

    expect(() => {
      emitUnhandledRejection(error);
    }).not.toThrow();
    expect(Logger.error).toHaveBeenCalledOnce();
  });
});
