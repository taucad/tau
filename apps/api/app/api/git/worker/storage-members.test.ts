import { describe, expect, it } from 'vitest';
import { dnsMembers, parseMemberRecords } from '#api/git/worker/storage-members.js';

/** DC2: the deployed member list tau-storage reads from its own internal DNS. */
describe('storage members', () => {
  it('should read machine ids from Fly’s `<id> <region>` TXT answer, however it is chunked', () => {
    expect(
      parseMemberRecords([['e2865123a62986 syd,5683d5e1b46e18 syd', ',9185079a124e98 ', 'syd'], ['garbage!! syd']]),
    ).toEqual(['5683d5e1b46e18', '9185079a124e98', 'e2865123a62986']);
  });

  it('should keep the last good list when a lookup fails, and reuse an answer within its ttl', async () => {
    let lookups = 0;
    let failing = false;
    const read = dnsMembers('vms.tau-storage.internal', 0, async () => {
      lookups += 1;
      if (failing) {
        throw new Error('SERVFAIL');
      }
      return [['e2865123a62986 syd']];
    });
    expect(await read()).toEqual(['e2865123a62986']);
    failing = true;
    expect(await read()).toEqual(['e2865123a62986']);
    expect(lookups).toBe(2);

    const cached = dnsMembers('vms.tau-storage.internal', 60_000, async () => {
      lookups += 1;
      return [['5683d5e1b46e18 syd']];
    });
    await cached();
    await cached();
    expect(lookups).toBe(3);
  });
});
