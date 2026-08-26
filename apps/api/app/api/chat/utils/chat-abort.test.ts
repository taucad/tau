import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  ChatAbortError,
  isChatAbortError,
  registerChatAbort,
  isExpectedChatCancellationRejection,
  clearAbortTracking,
} from '#api/chat/utils/chat-abort.js';

describe('ChatAbortError', () => {
  it('should be abort-shaped while preserving chat cancellation metadata', () => {
    const error = new ChatAbortError('chat_123');

    expect(error.name).toBe('AbortError');
    expect(error.message).toBe('Chat chat_123 was cancelled by client');
    expect(error.chatId).toBe('chat_123');
    expect(error.kind).toBe('chat-client-abort');
    expect(error.code).toBe('CHAT_CLIENT_ABORT');
  });

  it('should be an instance of Error', () => {
    const error = new ChatAbortError('chat_123');

    expect(error).toBeInstanceOf(Error);
  });
});

describe('isChatAbortError', () => {
  it('should return true for ChatAbortError instances', () => {
    const error = new ChatAbortError('chat_123');

    expect(isChatAbortError(error)).toBe(true);
  });

  it('should return false for plain Error instances', () => {
    const error = new Error('some error');

    expect(isChatAbortError(error)).toBe(false);
  });

  it('should return false for errors with matching abort shape but no brand', () => {
    const error = new Error('fake');
    error.name = 'AbortError';
    Object.assign(error, {
      chatId: 'chat_123',
      code: 'CHAT_CLIENT_ABORT',
      kind: 'chat-client-abort',
    });

    expect(isChatAbortError(error)).toBe(false);
  });

  it('should return false for plain objects mimicking the shape', () => {
    const fake = {
      name: 'AbortError',
      chatId: 'chat_123',
      code: 'CHAT_CLIENT_ABORT',
      kind: 'chat-client-abort',
      message: 'fake',
    };

    expect(isChatAbortError(fake)).toBe(false);
  });

  it('should return false for null and undefined', () => {
    expect(isChatAbortError(null)).toBe(false);
    expect(isChatAbortError(undefined)).toBe(false);
  });

  it('should return false for primitives', () => {
    expect(isChatAbortError('AbortError')).toBe(false);
    expect(isChatAbortError(42)).toBe(false);
    expect(isChatAbortError(true)).toBe(false);
  });

  it('should work with AbortController.signal.reason', () => {
    const controller = new AbortController();
    controller.abort(new ChatAbortError('chat_456'));

    expect(isChatAbortError(controller.signal.reason)).toBe(true);
  });

  it('should return false for default AbortController reason', () => {
    const controller = new AbortController();
    controller.abort();

    expect(isChatAbortError(controller.signal.reason)).toBe(false);
  });
});

describe('abort tracking', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    clearAbortTracking();
  });

  afterEach(() => {
    clearAbortTracking();
    vi.useRealTimers();
  });

  describe('isExpectedChatCancellationRejection', () => {
    it('should return false when no aborts are tracked', () => {
      const error = new Error('The operation was aborted');
      error.name = 'AbortError';

      expect(isExpectedChatCancellationRejection(error)).toBe(false);
    });

    it('should return true for AbortError when a chat abort is tracked', () => {
      registerChatAbort('chat_123');

      const error = new Error('The operation was aborted');
      error.name = 'AbortError';

      expect(isExpectedChatCancellationRejection(error)).toBe(true);
    });

    it('should return true for node-fetch style errors with type=aborted', () => {
      registerChatAbort('chat_123');

      const error = new Error('The operation was aborted') as Error & { type: string };
      error.type = 'aborted';

      expect(isExpectedChatCancellationRejection(error)).toBe(true);
    });

    it('should return true for branded chat cancellation without requiring tracker state', () => {
      const error = new ChatAbortError('chat_123');

      expect(isExpectedChatCancellationRejection(error)).toBe(true);
    });

    it('should return false for non-AbortError even when a chat abort is tracked', () => {
      registerChatAbort('chat_123');

      const error = new Error('Something else went wrong');

      expect(isExpectedChatCancellationRejection(error)).toBe(false);
    });

    it('should return false for non-Error values', () => {
      registerChatAbort('chat_123');

      expect(isExpectedChatCancellationRejection('AbortError')).toBe(false);
      expect(isExpectedChatCancellationRejection(null)).toBe(false);
      expect(isExpectedChatCancellationRejection(undefined)).toBe(false);
    });
  });

  describe('tracking lifecycle', () => {
    it('should auto-cleanup after the tracking window expires', () => {
      registerChatAbort('chat_123');

      const error = new Error('The operation was aborted');
      error.name = 'AbortError';

      expect(isExpectedChatCancellationRejection(error)).toBe(true);

      vi.advanceTimersByTime(10_000);

      expect(isExpectedChatCancellationRejection(error)).toBe(false);
    });

    it('should extend the window when re-registering the same chat', () => {
      registerChatAbort('chat_123');

      vi.advanceTimersByTime(7000);

      registerChatAbort('chat_123');

      vi.advanceTimersByTime(7000);

      const error = new Error('The operation was aborted');
      error.name = 'AbortError';
      expect(isExpectedChatCancellationRejection(error)).toBe(true);

      vi.advanceTimersByTime(3001);
      expect(isExpectedChatCancellationRejection(error)).toBe(false);
    });

    it('should track multiple chats independently', () => {
      registerChatAbort('chat_1');
      registerChatAbort('chat_2');

      const error = new Error('The operation was aborted');
      error.name = 'AbortError';

      vi.advanceTimersByTime(10_000);

      expect(isExpectedChatCancellationRejection(error)).toBe(false);
    });

    it('should clear all state via clearAbortTracking', () => {
      registerChatAbort('chat_1');
      registerChatAbort('chat_2');

      clearAbortTracking();

      const error = new Error('The operation was aborted');
      error.name = 'AbortError';
      expect(isExpectedChatCancellationRejection(error)).toBe(false);
    });
  });
});
