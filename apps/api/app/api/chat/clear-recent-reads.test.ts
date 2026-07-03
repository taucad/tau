import { describe, expect, it, vi } from 'vitest';
import { clearReadDedupForChat, MissingReadDedupClearerError } from '#api/chat/clear-recent-reads.js';
import type { ReadDedupClearer } from '#api/chat/clear-recent-reads.js';

describe('clearReadDedupForChat', () => {
  it('should clear the chat through the explicit read-dedup clearer when a store is active', async () => {
    const clearChat = vi.fn(async () => 2);
    const readDedupClearer: ReadDedupClearer = { clearChat };

    await clearReadDedupForChat({
      chatId: 'chat-1',
      readDedupClearer,
      storeActive: true,
    });

    expect(clearChat).toHaveBeenCalledWith('chat-1');
  });

  it('should no-op when no LangGraph store is active', async () => {
    const clearChat = vi.fn(async () => 0);
    const readDedupClearer: ReadDedupClearer = { clearChat };

    await clearReadDedupForChat({
      chatId: 'chat-without-store',
      readDedupClearer,
      storeActive: false,
    });

    expect(clearChat).not.toHaveBeenCalled();
  });

  it('should throw loudly when a store is active but no read-dedup clearer is wired', async () => {
    try {
      await clearReadDedupForChat({
        chatId: 'chat-missing-clearer',
        storeActive: true,
      });
      expect.fail('Expected missing clearer to throw');
    } catch (error) {
      expect(error).toBeInstanceOf(MissingReadDedupClearerError);
      expect((error as Error).name).toBe('MissingReadDedupClearerError');
      expect((error as Error).message).toContain('implementation bug');
      expect((error as Error).message).toContain('StoreService.getReadDedupClearer()');
    }
  });
});
