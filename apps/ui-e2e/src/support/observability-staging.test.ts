import { EventEmitter } from 'node:events';
import type { Page, Request, Response as BrowserResponse } from 'playwright';
import { mock } from 'vitest-mock-extended';
import { describe, expect, it, vi } from 'vitest';
// oxlint-disable no-restricted-imports -- The Node-only target runs without browser aliases.
import {
  createObservabilityRunId,
  diagnoseMissingDesktopSignals,
  isEventEnvelope,
  observabilityRequestKind,
  observabilityUrl,
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
    expect(
      await pollSentryEventIds({
        token: 'test',
        runId,
        pollInterval: 1,
        fetchEvents,
      }),
    ).toEqual(['a', 'b']);
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
      pollSentryEventIds({
        token: 'test',
        runId,
        fetchEvents,
        pollTimeout: 10,
        pollInterval: 2,
      }),
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
      counts: {
        'monitoring:requests': 1,
        'monitoring:failed': 1,
        pageErrors: 1,
        'monitoring:status:503': 1,
      },
      eventIds: [eventId],
    });
    expect(JSON.stringify(output.mock.calls)).not.toContain('private');
  } finally {
    output.mockRestore();
  }
});

/* eslint-disable @typescript-eslint/naming-convention -- Sentry envelope header fields are wire names. */
describe('isEventEnvelope', () => {
  const header = JSON.stringify({
    event_id: 'a'.repeat(32),
    dsn: 'https://key@o1.ingest.us.sentry.io/2',
  });

  it('should match an envelope that carries an error event, whatever else it carries', () => {
    expect(isEventEnvelope([header, '{"type":"event"}', '{"message":"x"}'].join('\n'))).toBe(true);
    expect(
      isEventEnvelope([header, '{"type":"attachment","length":2}', 'hi', '{"type":"event"}', '{}'].join('\n')),
    ).toBe(true);
  });

  it('should not match a session update, a transaction, or a body that is not an envelope', () => {
    expect(isEventEnvelope([JSON.stringify({ sent_at: 'now' }), '{"type":"session"}', '{"sid":"s"}'].join('\n'))).toBe(
      false,
    );
    expect(isEventEnvelope([header, '{"type":"transaction"}', '{"type":"event"}'].join('\n'))).toBe(false);
    expect(isEventEnvelope(undefined)).toBe(false);
    expect(isEventEnvelope('not json')).toBe(false);
  });
});
/* eslint-enable @typescript-eslint/naming-convention -- Sentry envelope header fields are wire names. */

describe('diagnoseMissingDesktopSignals', () => {
  const window = {
    token: 'test',
    release: 'tau-desktop@0.5.0-staging.1',
    since: '2026-11-18T23:37:40Z',
    until: '2026-11-18T23:44:10.000Z',
  };

  const requestUrl = (input: Parameters<typeof fetch>[0]): URL =>
    input instanceof URL ? input : new URL(typeof input === 'string' ? input : input.url);

  const answer = (url: URL): Response => {
    const path = url.pathname;
    if (path.endsWith('/events/')) {
      return url.searchParams.get('project') === '-1'
        ? Response.json({
            data: [
              {
                environment: 'production',
                'count()': 1,
                message: 'private message',
              },
            ],
          })
        : Response.json({
            data: [
              { environment: 'staging', 'count()': 2 },
              { environment: 'staging-e2e', 'count()': 1 },
            ],
          });
    }
    if (path.endsWith('/releases/')) {
      return Response.json([{ version: 'tau-desktop@0.5.0-staging.10' }, { version: window.release }]);
    }
    if (path.endsWith('/sessions/')) {
      return Response.json({
        groups: [
          {
            by: { 'session.status': 'healthy' },
            totals: { 'sum(session)': 3 },
          },
        ],
      });
    }
    return Response.json({
      groups: [
        {
          by: { outcome: 'accepted', reason: null },
          totals: { 'sum(quantity)': 4 },
        },
        {
          by: { outcome: 'filtered', reason: 'release-version' },
          totals: { 'sum(quantity)': 2 },
        },
      ],
    });
  };

  it('should report counts and Sentry names for each cause, and nothing from an event', async () => {
    const fetchSentry = vi.fn<typeof fetch>().mockImplementation(async (input) => answer(requestUrl(input)));
    const diagnostics = await diagnoseMissingDesktopSignals(['desktop-boot-unhealthy'], window, fetchSentry);
    expect(diagnostics).toEqual({
      signalByEnvironment: { 'desktop-boot-unhealthy': { production: 1 } },
      releaseEventsByEnvironment: { staging: 2, 'staging-e2e': 1 },
      releaseListed: { listed: true },
      releaseSessions: { healthy: 3 },
      errorOutcomes: { accepted: 4, 'filtered:release-version': 2 },
    });
    expect(JSON.stringify(diagnostics)).not.toContain('private');
    const urls = fetchSentry.mock.calls.map(([input]) => requestUrl(input));
    const signalQuery = urls.find((url) => url.searchParams.get('project') === '-1');
    expect(signalQuery?.searchParams.get('query')).toBe(
      'project:tau-desktop tau_event:desktop-boot-unhealthy release:"tau-desktop@0.5.0-staging.1"',
    );
    expect(signalQuery?.searchParams.getAll('environment')).toEqual([]);
    const stats = urls.find((url) => url.pathname.endsWith('/stats_v2/'));
    expect(stats?.searchParams.get('start')).toBe('2026-11-18T23:00:00.000Z');
    expect(stats?.searchParams.get('end')).toBe('2026-11-19T00:00:00.000Z');
    expect(stats?.searchParams.getAll('groupBy')).toEqual(['outcome', 'reason']);
  });

  it('should report a refused or failed read by status and still run the others', async () => {
    const fetchSentry = vi.fn<typeof fetch>().mockImplementation(async (input) => {
      const url = requestUrl(input);
      if (url.pathname.endsWith('/stats_v2/')) {
        return new Response('private sentinel', { status: 403 });
      }
      if (url.pathname.endsWith('/sessions/')) {
        throw new Error('private failure');
      }
      return answer(url);
    });
    const diagnostics = await diagnoseMissingDesktopSignals(['file_service.start_failed'], window, fetchSentry);
    expect(diagnostics.errorOutcomes).toEqual({ unreadable: 'HTTP 403' });
    expect(diagnostics.releaseSessions).toEqual({ unreadable: 'no response' });
    expect(diagnostics.releaseListed).toEqual({ listed: true });
    expect(JSON.stringify(diagnostics)).not.toContain('private');
  });
});
