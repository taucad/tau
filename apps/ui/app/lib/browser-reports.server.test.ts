// @vitest-environment node
/* eslint-disable @typescript-eslint/naming-convention -- Reporting API wire names. */
import { describe, expect, it } from 'vitest';
import {
  browserCrashFromReport,
  isFromOrigin,
  parseReports,
  reportsPerDelivery,
  routeIdForUrl,
  scrubCspReport,
} from '#lib/browser-reports.server.js';

const page = 'https://taucad.dev/w/home/bracket?share=secret#view';

describe('parseReports', () => {
  it('should keep well-formed reports and drop the rest', () => {
    const reports = parseReports(
      JSON.stringify([
        { type: 'crash', url: page, age: 10, user_agent: 'Chrome', body: { reason: 'oom' } },
        { type: 'crash', url: page },
        { type: 1, url: page, body: {} },
        'nonsense',
      ]),
    );

    expect(reports).toStrictEqual([
      { type: 'crash', url: page, age: 10, user_agent: 'Chrome', body: { reason: 'oom' } },
    ]);
  });

  it('should refuse a body that is not a JSON array, and cap a long one', () => {
    expect(parseReports('{"type":"crash"}')).toBeUndefined();
    expect(parseReports('not json')).toBeUndefined();
    const many = Array.from({ length: 50 }, () => ({ type: 'crash', url: page, body: {} }));
    expect(parseReports(JSON.stringify(many))).toHaveLength(reportsPerDelivery);
  });
});

describe('isFromOrigin', () => {
  it('should keep reports about this origin only', () => {
    expect(isFromOrigin({ type: 'crash', url: page, body: {} }, 'https://taucad.dev')).toBe(true);
    expect(
      isFromOrigin({ type: 'crash', url: 'https://taucad.dev.evil.example/w', body: {} }, 'https://taucad.dev'),
    ).toBe(false);
    expect(isFromOrigin({ type: 'crash', url: 'not a url', body: {} }, 'https://taucad.dev')).toBe(false);
  });
});

describe('routeIdForUrl', () => {
  it('should name the editor routes and nothing else', () => {
    expect(routeIdForUrl(page)).toBe('routes/w.$workspace.$project');
    expect(routeIdForUrl('https://taucad.dev/w/home/bracket/preview')).toBe('routes/w.$workspace.$project_.preview');
    expect(routeIdForUrl('https://taucad.dev/w/home')).toBeUndefined();
    expect(routeIdForUrl('https://taucad.dev/')).toBeUndefined();
  });
});

describe('browserCrashFromReport', () => {
  it('should read a visible top-level out-of-memory crash with a scrubbed URL', () => {
    expect(
      browserCrashFromReport({
        type: 'crash',
        url: page,
        user_agent: 'Chrome/140',
        body: { reason: 'oom', is_top_level: true, page_visibility: 'visible', stack: 'ignored' },
      }),
    ).toStrictEqual({
      reason: 'oom',
      visibility: 'visible',
      isTopLevel: true,
      url: 'https://taucad.dev/w/home/bracket',
      routeId: 'routes/w.$workspace.$project',
      userAgent: 'Chrome/140',
    });
  });

  it('should file a missing or made-up reason as unknown and leave unknown fields out', () => {
    expect(browserCrashFromReport({ type: 'crash', url: 'https://taucad.dev/', body: {} })).toStrictEqual({
      reason: 'unknown',
      url: 'https://taucad.dev/',
    });
    expect(
      browserCrashFromReport({
        type: 'crash',
        url: 'https://taucad.dev/',
        body: { reason: '<script>', page_visibility: 'x' },
      }),
    ).toStrictEqual({ reason: 'unknown', url: 'https://taucad.dev/' });
  });
});

describe('scrubCspReport', () => {
  it('should strip query strings from every URL field and drop the sample', () => {
    const scrubbed = scrubCspReport({
      type: 'csp-violation',
      url: page,
      body: {
        documentURL: page,
        referrer: 'https://taucad.dev/auth?code=secret',
        blockedURL: 'https://cdn.example/x.js?token=secret',
        sourceFile: 'https://taucad.dev/assets/a.js?v=secret',
        effectiveDirective: 'script-src-elem',
        sample: 'secret()',
        disposition: 'report',
      },
    });

    expect(scrubbed).toStrictEqual({
      type: 'csp-violation',
      url: 'https://taucad.dev/w/home/bracket',
      body: {
        documentURL: 'https://taucad.dev/w/home/bracket',
        referrer: 'https://taucad.dev/auth',
        blockedURL: 'https://cdn.example/x.js',
        sourceFile: 'https://taucad.dev/assets/a.js',
        effectiveDirective: 'script-src-elem',
        disposition: 'report',
      },
    });
    expect(JSON.stringify(scrubbed)).not.toContain('secret');
  });

  it('should leave a keyword blocked URL as it is', () => {
    expect(scrubCspReport({ type: 'csp-violation', url: page, body: { blockedURL: 'inline' } }).body).toStrictEqual({
      blockedURL: 'inline',
    });
  });
});
