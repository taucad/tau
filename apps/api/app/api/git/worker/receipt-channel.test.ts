import { describe, expect, it, vi } from 'vitest';
import { developmentSigningKeyJson } from '#api/git/forwarding/contract/development-keys.js';
import { parseSigningKey } from '#api/git/forwarding/contract/keys.js';
import type { SigningKey } from '#api/git/forwarding/contract/keys.js';
import type { StorageReceiptFacts } from '#api/git/forwarding/contract/receipt.js';
import { createReceiptChannel } from '#api/git/worker/receipt-channel.js';

/** A posted receipt the API rate-limited is sent again after `Retry-After`, not dropped (DC1 review). */
describe('receipt channel', () => {
  const facts = {
    kind: 'retained',
    owner: 'user-dc1-channel',
    project: 'proj-dc1-channel',
  } as unknown as StorageReceiptFacts;

  it('should post again after a 429’s Retry-After and stop once accepted', async () => {
    vi.useFakeTimers();
    try {
      const send = vi
        .fn<typeof fetch>()
        .mockResolvedValueOnce(new Response(null, { status: 429, headers: { 'retry-after': '2' } }))
        .mockResolvedValueOnce(new Response(null, { status: 202 }));
      const warn = vi.fn();
      const channel = createReceiptChannel({
        key: parseSigningKey(developmentSigningKeyJson('receipt'), 'receipt'),
        receiptUrl: 'http://api.test/v1/internal/storage/receipts',
        logger: { warn },
        fetch: send,
      });

      const posted = channel.post(facts);
      await vi.advanceTimersByTimeAsync(1999);
      expect(send).toHaveBeenCalledTimes(1);
      await vi.advanceTimersByTimeAsync(1);
      await posted;

      expect(send).toHaveBeenCalledTimes(2);
      expect(warn).not.toHaveBeenCalled();
    } finally {
      vi.useRealTimers();
    }
  });

  it('should drop a receipt it cannot sign, and resolve, rather than reject after a durable commit', async () => {
    const send = vi.fn<typeof fetch>();
    const warn = vi.fn();
    const channel = createReceiptChannel({
      key: { kid: 'broken' } as unknown as SigningKey,
      receiptUrl: 'http://api.test/v1/internal/storage/receipts',
      logger: { warn },
      fetch: send,
    });

    await expect(channel.post(facts)).resolves.toBeUndefined();

    expect(send).not.toHaveBeenCalled();
    expect(warn).toHaveBeenCalledWith(
      expect.objectContaining({ kind: 'retained' }),
      'A receipt could not be signed for posting; it was dropped',
    );
  });
});
