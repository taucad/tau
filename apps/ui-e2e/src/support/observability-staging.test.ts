import { describe, expect, it, vi } from 'vitest';
// oxlint-disable-next-line no-restricted-imports -- The Node-only target runs without browser aliases.
import { createObservabilityRunId, observabilityUrl, pollSentryEventIds } from './observability-staging.ts';

const runId = 'e2e-test';

describe('staging observability correlation', () => {
  it('should isolate each run on the fixed staging origin', () => {
    const first = createObservabilityRunId();
    expect(createObservabilityRunId()).not.toBe(first);
    const url = new URL(observabilityUrl(first, 'uncaught'));
    expect(url.origin).toBe('https://taucad.dev');
    expect(url.searchParams.get('e2e_run')).toBe(first);
    expect(url.searchParams.get('trigger')).toBe('uncaught');
    expect(() => observabilityUrl('bad query:token')).toThrow(TypeError);
    expect(() => observabilityUrl('bad query:token')).toThrow('Invalid observability run id');
  });

  it('should retry indexing and transient errors then return only distinct event ids', async () => {
    const fetchEvents = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(new Response('{}', { status: 429 }))
      .mockResolvedValueOnce(Response.json({ data: [] }))
      .mockResolvedValueOnce(Response.json({ data: [{ id: 'a' }, { id: 'a' }, { id: 'b' }] }));
    expect(await pollSentryEventIds({ token: 'test', runId, pollInterval: 1, fetchEvents })).toEqual(['a', 'b']);
    const request = fetchEvents.mock.calls[0]?.[0];
    if (!(request instanceof URL)) {
      throw new TypeError('Expected a URL query');
    }
    expect(request.searchParams.get('query')).toBe('e2e_run:e2e-test');
    expect(request.searchParams.get('environment')).toBe('staging');
    expect(request.searchParams.getAll('field')).toEqual(['id']);
  });

  it('should stop without exposing an authorization response body', async () => {
    const fetchEvents = vi.fn<typeof fetch>().mockResolvedValue(new Response('private sentinel', { status: 403 }));
    await expect(pollSentryEventIds({ token: 'test', runId, fetchEvents })).rejects.toThrow(
      new Error('Sentry event query refused (HTTP 403)'),
    );
    expect(fetchEvents).toHaveBeenCalledOnce();
  });

  it('should redact malformed response content', async () => {
    const fetchEvents = vi.fn<typeof fetch>().mockResolvedValue(new Response('private sentinel'));
    await expect(pollSentryEventIds({ token: 'test', runId, fetchEvents })).rejects.toThrow(
      new TypeError('Sentry event query returned invalid JSON'),
    );
  });

  it('should bound empty indexing results', async () => {
    const fetchEvents = vi.fn<typeof fetch>().mockImplementation(async () => Response.json({ data: [] }));
    await expect(
      pollSentryEventIds({ token: 'test', runId, fetchEvents, pollTimeout: 10, pollInterval: 2 }),
    ).rejects.toThrow(new Error('Sentry event query exceeded its bounded observation window'));
  });

  it('should refuse a window longer than three minutes', async () => {
    await expect(pollSentryEventIds({ token: 'test', runId, pollTimeout: 180_001 })).rejects.toThrow(
      new TypeError('Sentry polling requires a token and bounded positive timing'),
    );
  });
});
