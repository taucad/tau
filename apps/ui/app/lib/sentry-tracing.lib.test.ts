/* eslint-disable @typescript-eslint/naming-convention -- Sentry span fields are SDK wire names. */
import { describe, expect, it } from 'vitest';
import type { Event } from '@sentry/react';
import {
  scrubTransaction,
  tracePropagationTargets,
  tracesSampleRate,
  tracingIntegrations,
} from '#lib/sentry-tracing.lib.js';

describe('tracesSampleRate', () => {
  it.each(['staging', 'staging-e2e', 'development'])('should trace every page load in %s', (environment) => {
    expect(tracesSampleRate(environment)).toBe(1);
  });

  it.each([undefined, 'production', 'production-e2e'])(
    'should not trace in %s until the staging cost is measured',
    (environment) => {
      expect(tracesSampleRate(environment)).toBeUndefined();
      expect(tracingIntegrations(environment)).toStrictEqual([]);
    },
  );

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
