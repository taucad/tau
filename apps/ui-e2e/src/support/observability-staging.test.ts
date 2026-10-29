import { EventEmitter } from 'node:events';
import type { Page, Request, Response as BrowserResponse } from 'playwright';
import { mock } from 'vitest-mock-extended';
import { describe, expect, it, vi } from 'vitest';
// oxlint-disable no-restricted-imports -- The Node-only target runs without browser aliases.
import {
  createObservabilityRunId,
  observabilityUrl,
  observabilityRequestKind,
  observeHarnessPage,
  pollSentryEventIds,
} from './observability-staging.ts';
// oxlint-enable no-restricted-imports

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

it('should classify diagnostic requests without exposing tokens, paths or foreign origins', () => {
  expect(observabilityRequestKind('https://taucad.dev/__debug/observability?e2e_run=private')).toBe('document');
  expect(observabilityRequestKind('https://taucad.dev/api/monitoring?secret=private')).toBe('monitoring');
  expect(observabilityRequestKind('https://taucad.dev/api/ph/private?token=private')).toBe('posthog');
  expect(observabilityRequestKind('https://api.taucad.dev/v1/__debug/observability/failure')).toBe('api-failure');
  expect(observabilityRequestKind('https://foreign.invalid/api/monitoring?private')).toBe('other');
  expect(observabilityRequestKind('https://taucad.dev/invitations/private')).toBe('other');
});

it('should retain only bounded envelope ids and counts when a failed page closes', () => {
  const output = vi.spyOn(console, 'info').mockImplementation(() => undefined);
  try {
    // oxlint-disable-next-line unicorn/prefer-event-target -- Playwright Page uses the Node EventEmitter contract.
    const events = new EventEmitter();
    const page = mock<Page>();
    page.on.mockImplementation((name, listener) => {
      events.on(name, listener);
      return page;
    });
    page.once.mockImplementation((name, listener) => {
      events.once(name, listener);
      return page;
    });
    observeHarnessPage(page, runId);
    const eventId = 'a'.repeat(32);
    const request = mock<Request>({
      url: () => 'https://taucad.dev/api/monitoring?secret=private',
      // eslint-disable-next-line @typescript-eslint/naming-convention -- Sentry envelope header field.
      postData: () => JSON.stringify({ event_id: eventId, secret: 'private' }) + '\nprivate payload',
    });
    events.emit('request', request);
    events.emit('requestfailed', request);
    events.emit('pageerror', new Error('private page error'));
    events.emit('response', mock<BrowserResponse>({ url: request.url, status: () => 503 }));
    events.emit('close');
    expect(output).toHaveBeenLastCalledWith('Harness observation finished', {
      runId,
      counts: { 'monitoring:requests': 1, 'monitoring:failed': 1, pageErrors: 1, 'monitoring:status:503': 1 },
      eventIds: [eventId],
    });
    expect(JSON.stringify(output.mock.calls)).not.toContain('private');
  } finally {
    output.mockRestore();
  }
});
