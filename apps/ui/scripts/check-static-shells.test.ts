// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { staticShellClasses } from '#lib/route-classes.js';
import type { StaticShellClass } from '#lib/route-classes.js';
import {
  checkShell,
  findSentinelLeaks,
  firstDifference,
  publishedBuildId,
  sampleUrl,
  staticHeadersFor,
  visitors,
} from '#scripts/check-static-shells.mts';

const [projectClass] = staticShellClasses as readonly [StaticShellClass];

const shell = (body = '<main><div aria-busy="true">Loading workspace</div></main>'): string =>
  `<!DOCTYPE html><html><head><title>Tau</title></head><body>${body}<script>window.ENV = { ...{"TAU_BUILD_ID":"1700000000000"} }</script><script>window.__reactRouterContext = {"ssr":true,"url":"/w/__shell/__shell"};</script></body></html>`;

const functionHeaders = (): Headers =>
  new Headers({
    'Cross-Origin-Opener-Policy': 'same-origin',
    'Cross-Origin-Embedder-Policy': 'require-corp',
    'Cross-Origin-Resource-Policy': 'same-origin',
    'Content-Security-Policy-Report-Only': "default-src 'self'; report-to default;",
    'Reporting-Endpoints': 'default="/api/reports"',
  });

const matchingStaticHeaders = (): Map<string, string> =>
  new Map([
    ['cross-origin-opener-policy', 'same-origin'],
    ['cross-origin-embedder-policy', 'require-corp'],
    ['cross-origin-resource-policy', 'same-origin'],
    ['content-security-policy-report-only', "default-src 'self'; report-to default;"],
    ['reporting-endpoints', 'default="/api/reports"'],
  ]);

const holding = (): Parameters<typeof checkShell>[0] => ({
  routeClass: projectClass,
  prerendered: shell(),
  shellRenders: [shell(), shell()],
  functionDocument: shell(),
  functionHeaders: functionHeaders(),
  staticHeaders: [matchingStaticHeaders(), matchingStaticHeaders()],
  serverBuildId: '1700000000000',
});

describe('checkShell', () => {
  it('should pass a shell that holds every invariant', () => {
    expect(checkShell(holding())).toStrictEqual([]);
  });

  it('should fail a shell whose bytes depend on the visitor or the clock (invariants 1 and 2)', () => {
    const problems = checkShell({ ...holding(), shellRenders: [shell(), shell('<main class="dark">x</main>')] });
    expect(problems).toHaveLength(1);
    expect(problems[0]).toContain(visitors[1].label);
  });

  it("should fail a shell that is not the function's document for a real URL", () => {
    const problems = checkShell({ ...holding(), functionDocument: shell('<main>bracket-v2</main>') });
    expect(problems).toStrictEqual([expect.stringContaining('/w/home/bracket-v2 differs from the shell')]);
  });

  it("should fail a shell that publishes another build id than the server's /health/build", () => {
    expect(checkShell({ ...holding(), serverBuildId: '1700000060000' })).toStrictEqual([
      expect.stringContaining('build id 1700000000000'),
    ]);
  });

  it('should fail a shell whose static headers differ from the function document', () => {
    const lostIsolation = matchingStaticHeaders();
    lostIsolation.delete('cross-origin-embedder-policy');
    lostIsolation.set('document-policy', 'js-profiling');
    const problems = checkShell({ ...holding(), staticHeaders: [matchingStaticHeaders(), lostIsolation] });
    expect(problems).toStrictEqual([
      expect.stringContaining(
        'cross-origin-embedder-policy: the function sends "require-corp", the shell gets undefined',
      ),
      expect.stringContaining('document-policy: the function sends undefined, the shell gets "js-profiling"'),
    ]);
  });

  it('should fail a shell that renders its placeholder (invariant 6)', () => {
    const leaky = shell('<main><h1>__shell</h1></main>');
    const problems = checkShell({
      ...holding(),
      prerendered: leaky,
      shellRenders: [leaky, leaky],
      functionDocument: leaky,
    });
    expect(problems).toStrictEqual([expect.stringContaining('renders its placeholder')]);
  });
});

describe('findSentinelLeaks', () => {
  it.each([
    ['text', '<main>Workspace __shell</main>'],
    ['a title', '<title>__shell · Tau</title>'],
    ['a link', '<a href="/w/__shell/__shell/preview">Preview</a>'],
    [
      'loader data',
      String.raw`<script>window.__reactRouterContext.streamController.enqueue("[\"projectSlug\",\"__shell\"]");</script>`,
    ],
  ])('should find the placeholder in %s', (_place, html) => {
    expect(findSentinelLeaks(html, '__shell')).not.toStrictEqual([]);
  });

  it("should not count the router context's own request URL", () => {
    expect(findSentinelLeaks(shell(), '__shell')).toStrictEqual([]);
  });
});

describe('document helpers', () => {
  it('should read the build id a document publishes, escaped or not', () => {
    expect(publishedBuildId(shell())).toBe('1700000000000');
    expect(publishedBuildId(String.raw`{\"TAU_BUILD_ID\":\"42\"}`)).toBe('42');
    expect(publishedBuildId('<html></html>')).toBeUndefined();
  });

  it('should point at the first differing byte', () => {
    expect(firstDifference('abc', 'abc')).toBeUndefined();
    expect(firstDifference('abcd', 'abXd')).toMatch(/^at byte 2: /u);
  });

  it('should render a real URL of the class for the function', () => {
    expect(sampleUrl(projectClass)).toBe('/w/home/bracket-v2');
  });

  it('should send two visitors that differ in every fact a per-request render could read', () => {
    const [first, second] = visitors;
    for (const name of ['user-agent', 'accept-language']) {
      expect(first.headers[name]).not.toBe(second.headers[name]);
    }
    expect(first.headers['cookie']).toBeUndefined();
    expect(second.headers['cookie']).toContain('tau-theme=dark');
    expect(second.headers['sec-gpc']).toBe('1');
  });
});

describe('staticHeadersFor', () => {
  const netlifyToml = [
    '[[headers]]',
    'for = "/*"',
    '[headers.values]',
    '# Cross-Origin Policies',
    'Cross-Origin-Opener-Policy = "same-origin"',
    `Reporting-Endpoints = 'default="/api/reports"'`,
    '',
    '[[redirects]]',
    'from = "/w/:workspace/:project"',
    'to = "/w/__shell/__shell/index.html"',
    '',
    '[[headers]]',
    'for = "/assets/*"',
    '[headers.values]',
    'Cache-Control = "public, max-age=31536000, immutable"',
    '',
    '[[headers]]',
    'for = "/w/*"',
    '[headers.values]',
    'Set-Cookie = "tau_skew=; Max-Age=0"',
  ].join('\n');
  const headersFile =
    "/*\n  Content-Security-Policy-Report-Only: default-src 'self';\n  Document-Policy: js-profiling\n";

  it("should merge every matching rule of netlify.toml and the build's _headers", () => {
    expect(Object.fromEntries(staticHeadersFor('/w/home/bracket-v2', { netlifyToml, headersFile }))).toStrictEqual({
      'cross-origin-opener-policy': 'same-origin',
      'reporting-endpoints': 'default="/api/reports"',
      'set-cookie': 'tau_skew=; Max-Age=0',
      'content-security-policy-report-only': "default-src 'self';",
      'document-policy': 'js-profiling',
    });
  });

  it('should skip rules for other paths, and the keys of redirect rules', () => {
    const headers = staticHeadersFor('/usage', { netlifyToml, headersFile });
    expect(headers.has('cache-control')).toBe(false);
    expect(headers.has('set-cookie')).toBe(false);
    expect(headers.has('from')).toBe(false);
  });
});
