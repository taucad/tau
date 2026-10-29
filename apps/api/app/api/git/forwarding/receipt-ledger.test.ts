import { describe, expect, it } from 'vitest';
import { memoryReceiptLedger, receiptClaimSeconds } from '#api/git/forwarding/receipt-ledger.js';

/** The in-process ledger forgets a claim when the Redis key would have expired (DC1 review). */
describe('memory receipt ledger', () => {
  it('should refuse a replay inside the claim window and forget the claim after it', async () => {
    let now = 1_000_000;
    const ledger = memoryReceiptLedger(() => now);

    expect(await ledger.claim('rid-1', 'commit')).toBe(true);
    now += receiptClaimSeconds * 1000 - 1;
    expect(await ledger.claim('rid-1', 'commit')).toBe(false);
    now += 1;
    expect(await ledger.claim('rid-1', 'commit')).toBe(true);
  });
});
