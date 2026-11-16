/* eslint-disable @typescript-eslint/naming-convention -- Sentry span fields are SDK wire names. */
import { describe, expect, it, vi } from 'vitest';
import type { Event } from '@sentry/react';
import type * as SentryReact from '@sentry/react';
import { publishRoute, routePathInstrumentation } from '#lib/sentry-context.lib.js';
import {
  nameSpansByRoute,
  scrubTransaction,
  tracePropagationTargets,
  tracesSampleRate,
  tracingIntegrations,
} from '#lib/sentry-tracing.lib.js';

const rootSpan = vi.hoisted(() => ({ updateName: vi.fn(), setAttribute: vi.fn() }));
const activeSpan = vi.hoisted(() => ({ value: undefined as Record<string, unknown> | undefined }));
vi.mock('@sentry/react', async (importOriginal) => ({
  ...(await importOriginal<typeof SentryReact>()),
  getActiveSpan: () => activeSpan.value,
  getRootSpan: () => rootSpan,
}));

describe('nameSpansByRoute (RR7)', () => {
  it('should name the active page load after the published route, and each navigation after its own', () => {
    for (const [id, path] of [
      ['root', ''],
      ['routes/projects', 'projects'],
      ['routes/w.$workspace.$project', 'w/:workspace/:project'],
    ] as const) {
      routePathInstrumentation.route?.({ id, path, index: undefined, instrument: () => undefined });
    }
    activeSpan.value = {};
    publishRoute(['root', 'routes/projects']);

    const stop = nameSpansByRoute();
    publishRoute(['root', 'routes/w.$workspace.$project']);
    stop();
    publishRoute(['root']);

    expect(rootSpan.updateName.mock.calls).toStrictEqual([['routes/projects'], ['routes/w.$workspace.$project']]);
    expect(rootSpan.setAttribute).toHaveBeenCalledWith('sentry.source', 'route');
    expect(rootSpan.setAttribute).toHaveBeenCalledWith('route.pattern', '/w/:workspace/:project');
    activeSpan.value = undefined;
  });
});

describe('tracesSampleRate', () => {
  it.each(['staging', 'staging-e2e', 'development'])('should trace every page load in %s', (environment) => {
    expect(tracesSampleRate(environment)).toBe(1);
  });

  it.each(['production', 'production-e2e'])('should trace one page load in twenty in %s', (environment) => {
    expect(tracesSampleRate(environment)).toBe(0.05);
    expect(tracingIntegrations(environment).map((integration) => integration.name)).toStrictEqual(['BrowserTracing']);
  });

  it('should not trace without an environment', () => {
    expect(tracesSampleRate(undefined)).toBeUndefined();
    expect(tracingIntegrations(undefined)).toStrictEqual([]);
  });

  it('should install the browser tracing integration where it traces', () => {
    expect(tracingIntegrations('staging').map((integration) => integration.name)).toStrictEqual(['BrowserTracing']);
  });
});

describe('tracePropagationTargets', () => {
  it('should send trace headers to the API origin only', () => {
    const [target] = tracePropagationTargets('https://api.taucad.dev/v1');

    expect(target?.test('https://api.taucad.dev/v1/projects')).toBe(true);
    expect(target?.test('https://api.taucad.dev')).toBe(true);
    expect(target?.test('https://api.taucad.dev.attacker.example/v1')).toBe(false);
    expect(target?.test('https://cdn.taucad.dev/kernel.wasm')).toBe(false);
    expect(target?.test('/api/ph/e')).toBe(false);
  });

  it('should send them nowhere without a parseable API URL', () => {
    expect(tracePropagationTargets(undefined)).toStrictEqual([]);
    expect(tracePropagationTargets('not a url')).toStrictEqual([]);
  });
});

describe('scrubTransaction', () => {
  it('should scrub a URL wherever it sits in a span description', () => {
    const event = {
      type: 'transaction',
      spans: [
        {
          span_id: '1',
          trace_id: '2',
          start_timestamp: 0,
          data: {},
          description: 'fetch("https://api.taucad.dev/v1/x?token=secret#frag")',
        },
        { span_id: '3', trace_id: '2', start_timestamp: 0, data: {}, description: "GET '/v1/y?code=secret'" },
        { span_id: '4', trace_id: '2', start_timestamp: 0, data: {}, description: 'routes/w.$workspace.$project' },
      ],
    } as unknown as Event;

    const descriptions = scrubTransaction(event).spans?.map((span) => span.description);

    expect(descriptions).toStrictEqual([
      'fetch("https://api.taucad.dev/v1/x")',
      "GET '/v1/y'",
      'routes/w.$workspace.$project',
    ]);
  });

  it('should drop query strings and fragments from the request and every span', () => {
    const event = {
      type: 'transaction',
      transaction: 'routes/w.$workspace.$project',
      request: { url: 'https://taucad.dev/w/home/project?code=secret#frag', headers: { cookie: 'a=b' } },
      spans: [
        {
          span_id: '1',
          trace_id: '2',
          start_timestamp: 0,
          description: 'GET https://api.taucad.dev/v1/projects/list?token=secret',
          data: {
            url: 'https://api.taucad.dev/v1/projects/list?token=secret',
            'http.query': '?token=secret',
            'http.fragment': '#x',
          },
        },
      ],
    } as unknown as Event;

    const scrubbed = scrubTransaction(event);

    expect(scrubbed.request).toStrictEqual({ url: 'https://taucad.dev/w/home/project' });
    expect(scrubbed.spans?.[0]?.description).toBe('GET https://api.taucad.dev/v1/projects/list');
    expect(scrubbed.spans?.[0]?.data).toStrictEqual({ url: 'https://api.taucad.dev/v1/projects/list' });
    expect(JSON.stringify(scrubbed)).not.toContain('secret');
  });
});
