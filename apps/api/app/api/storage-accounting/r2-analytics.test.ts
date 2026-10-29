import { describe, expect, it } from 'vitest';
import { r2AnalyticsFixture } from '#api/storage-accounting/r2-analytics.fixture.js';
import { mapR2Analytics, r2AnalyticsWindows, readR2Analytics } from '#api/storage-accounting/r2-analytics.js';

const buckets = {
  public: 'tau-content-staging',
  private: 'tau-content-private-staging',
} as const;

describe('mapR2Analytics (W14 OB3, N50–N53)', () => {
  const figures = mapR2Analytics(r2AnalyticsFixture, buckets);

  it('should report Tau’s buckets by role and every other bucket as `other`', () => {
    const requests = figures.r2Requests ?? [];
    const labels = new Set(requests.map((observation) => observation.attributes['tau.r2.bucket']));

    expect(labels).toStrictEqual(new Set(['public', 'private', 'other']));
    expect(JSON.stringify(figures)).not.toContain('tau-content-prod');
    expect(JSON.stringify(figures)).not.toContain('tau-scratch');
  });

  it('should sum the non-allow-listed buckets into one `other` series per class, action and status', () => {
    expect(figures.r2Requests).toContainEqual({
      value: 12,
      attributes: {
        'tau.r2.bucket': 'other',
        'tau.r2.class': 'A',
        'tau.r2.action': 'PutObject',
        'tau.r2.status': 'success',
        'tau.r2.window': 'hour',
      },
    });
  });

  it('should classify each action by R2’s price list, and count an unknown action as Class A', () => {
    const classOf = (action: string, window: 'hour' | 'month'): string | undefined =>
      figures.r2Requests?.find(
        (observation) =>
          observation.attributes['tau.r2.action'] === action && observation.attributes['tau.r2.window'] === window,
      )?.attributes['tau.r2.class'];

    expect(classOf('PutObject', 'hour')).toBe('A');
    expect(classOf('GetObject', 'hour')).toBe('B');
    expect(classOf('HeadObject', 'hour')).toBe('B');
    expect(classOf('DeleteObject', 'month')).toBe('free');
    expect(figures.r2Requests).toContainEqual({
      value: 1,
      attributes: {
        'tau.r2.bucket': 'public',
        'tau.r2.class': 'A',
        'tau.r2.action': 'other',
        'tau.r2.status': 'other',
        'tau.r2.window': 'hour',
      },
    });
  });

  it('should keep the hour and the month apart', () => {
    expect(figures.r2Requests).toContainEqual({
      value: 9000,
      attributes: {
        'tau.r2.bucket': 'public',
        'tau.r2.class': 'A',
        'tau.r2.action': 'PutObject',
        'tau.r2.status': 'success',
        'tau.r2.window': 'month',
      },
    });
    expect(figures.r2Requests).toContainEqual({
      value: 120,
      attributes: {
        'tau.r2.bucket': 'public',
        'tau.r2.class': 'A',
        'tau.r2.action': 'PutObject',
        'tau.r2.status': 'success',
        'tau.r2.window': 'hour',
      },
    });
  });

  it('should read stored bytes and objects from each bucket’s newest sample, payload plus metadata', () => {
    expect(figures.r2StoredBytes).toStrictEqual([
      { value: 5100, attributes: { 'tau.r2.bucket': 'public' } },
      { value: 303, attributes: { 'tau.r2.bucket': 'private' } },
      { value: 1061, attributes: { 'tau.r2.bucket': 'other' } },
    ]);
    expect(figures.r2Objects).toStrictEqual([
      { value: 410, attributes: { 'tau.r2.bucket': 'public' } },
      { value: 3, attributes: { 'tau.r2.bucket': 'private' } },
      { value: 11, attributes: { 'tau.r2.bucket': 'other' } },
    ]);
  });

  it('should report bandwidth by bucket, direction and window', () => {
    expect(figures.r2BandwidthBytes).toContainEqual({
      value: 2_000_000,
      attributes: {
        'tau.r2.bucket': 'public',
        direction: 'upload',
        'tau.r2.window': 'hour',
      },
    });
    expect(figures.r2BandwidthBytes).toContainEqual({
      value: 7_000_000,
      attributes: {
        'tau.r2.bucket': 'public',
        direction: 'download',
        'tau.r2.window': 'month',
      },
    });
    expect(figures.r2BandwidthBytes).toContainEqual({
      value: 2,
      attributes: {
        'tau.r2.bucket': 'other',
        direction: 'download',
        'tau.r2.window': 'month',
      },
    });
  });
});

describe('r2AnalyticsWindows', () => {
  it('should cover the last full UTC hour and the month to the end of that hour', () => {
    const windows = r2AnalyticsWindows(Date.parse('2026-10-28T21:17:05Z'));

    expect(windows).toStrictEqual({
      hourStart: '2026-10-28T20:00:00.000Z',
      hourEnd: '2026-10-28T21:00:00.000Z',
      monthStart: '2026-10-01T00:00:00.000Z',
      storageSince: '2026-10-26T21:00:00.000Z',
    });
  });
});

describe('readR2Analytics', () => {
  it('should send one query for the account with the token as a bearer credential', async () => {
    const calls: Array<{ url: string; init: RequestInit | undefined }> = [];
    const fetcher: typeof fetch = async (url, init) => {
      calls.push({
        url: url instanceof Request ? url.url : url.toString(),
        init,
      });
      return Response.json(r2AnalyticsFixture);
    };

    const figures = await readR2Analytics(
      { accountId: 'acct-1', token: 'token-1', buckets, fetch: fetcher },
      Date.parse('2026-10-28T21:17:05Z'),
    );

    expect(calls).toHaveLength(1);
    expect(calls[0]?.url).toBe('https://api.cloudflare.com/client/v4/graphql');
    expect(new Headers(calls[0]?.init?.headers).get('authorization')).toBe('Bearer token-1');
    const body = JSON.parse(calls[0]?.init?.body as string) as {
      variables: Record<string, string>;
    };
    expect(body.variables).toMatchObject({
      accountTag: 'acct-1',
      hourStart: '2026-10-28T20:00:00.000Z',
    });
    expect(figures.r2StoredBytes).toHaveLength(3);
  });

  it('should fail the pass on a GraphQL error without echoing the token', async () => {
    const fetcher: typeof fetch = async () =>
      Response.json({
        data: null,
        errors: [{ message: 'not authorized for that account' }],
      });

    const failure = readR2Analytics(
      { accountId: 'acct-1', token: 'secret-token', buckets, fetch: fetcher },
      Date.now(),
    );

    await expect(failure).rejects.toThrow(/not authorized for that account/u);
    await expect(failure).rejects.not.toThrow(/secret-token/u);
  });

  it('should fail the pass on an HTTP error', async () => {
    const fetcher: typeof fetch = async () => new Response('nope', { status: 403 });

    await expect(
      readR2Analytics({ accountId: 'acct-1', token: 'token-1', buckets, fetch: fetcher }, Date.now()),
    ).rejects.toThrow(/403/u);
  });

  it('should fail the pass when Cloudflare answers with no account, so last_success does not advance', async () => {
    const fetcher: typeof fetch = async () => Response.json({ data: { viewer: { accounts: [] } } });

    expect(() => mapR2Analytics({ data: { viewer: { accounts: [] } } }, buckets)).toThrow(/no account/u);
    await expect(
      readR2Analytics({ accountId: 'acct-1', token: 'token-1', buckets, fetch: fetcher }, Date.now()),
    ).rejects.toThrow(/no account/u);
  });
});
