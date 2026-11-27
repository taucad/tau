// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { staticShellClasses } from '#lib/route-classes.js';
import type { StaticShellClass } from '#lib/route-classes.js';
import { clientFactsScript } from '#lib/client-facts.js';
import {
  checkShell,
  findSentinelLeaks,
  findStrayPrerenderOutputs,
  findUnlistedInlineScripts,
  inlineScripts,
  scriptHashSource,
  firstDifference,
  publishedBuildId,
  sampleUrl,
  staticHeadersFor,
  visitors,
} from '#scripts/check-static-shells.mts';

const [projectClass, homeClass] = staticShellClasses as readonly [StaticShellClass, StaticShellClass];

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
  strayFiles: [],
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

  it("should fail an edge shell whose prerendered files are left at its URL's static path", () => {
    expect(checkShell({ ...holding(), routeClass: homeClass, strayFiles: ['index.html', '_root.data'] })).toStrictEqual(
      [
        expect.stringContaining('index.html is still in the client output'),
        expect.stringContaining('_root.data is still in the client output'),
      ],
    );
  });
});

describe('findStrayPrerenderOutputs', () => {
  it("should name an edge shell's prerendered document and data files that remain", () => {
    const present = new Set(['index.html', '_root.data', '__shell/home/index.html']);
    expect(findStrayPrerenderOutputs(homeClass, (file) => present.has(file))).toStrictEqual([
      'index.html',
      '_root.data',
    ]);
    expect(findStrayPrerenderOutputs(homeClass, (file) => file === '__shell/home/index.html')).toStrictEqual([]);
    // The name the prerender writes under trailing-slash-aware data requests (RR4).
    expect(findStrayPrerenderOutputs(homeClass, (file) => file === '_.data')).toStrictEqual(['_.data']);
  });

  it('should leave a rewrite shell, which is served from its prerendered file, alone', () => {
    expect(findStrayPrerenderOutputs(projectClass, () => true)).toStrictEqual([]);
  });
});

describe('findUnlistedInlineScripts', () => {
  it("should pass a listed script, the client environment and React Router's scripts", () => {
    const html = shell(`<script>${clientFactsScript}</script><main></main>`);
    expect(findUnlistedInlineScripts(html)).toStrictEqual([]);
  });

  it.each([
    ['the client environment', 'window.ENV = { ...{"TAU_BUILD_ID":"1"}, ...(window.ENV ?? {}) }'],
    [
      'the icon sprite loader',
      '(()=>{if(document.getElementById("tau-svg-sprite"))return;Promise.all(["/assets/sprite-A.svg"])})();',
    ],
    ["React Router's stream", 'window.__reactRouterContext.streamController.close();'],
    [
      "React Router's route-module loader",
      'import "/assets/manifest-5a734f6b.js";\nimport("/assets/entry.client-B.js");',
    ],
    [
      "React Router's scroll restoration",
      '((storageKey2, restoreKey) => {\n  })("react-router-scroll-positions", null)',
    ],
    ["React's streaming runtime", '$RC("B:1","S:1")'],
    ["React's streaming timer", 'requestAnimationFrame(function(){$RT=performance.now()});'],
  ])('should recognise %s as a script whose source is not fixed', (_kind, source) => {
    expect(findUnlistedInlineScripts(`<script>${source}</script>`)).toStrictEqual([]);
  });

  it('should fail an inline script whose hash is not listed, naming its hash', () => {
    const problems = findUnlistedInlineScripts(shell('<script>document.title="x"</script>'));
    expect(problems).toStrictEqual([
      expect.stringContaining(
        `${scriptHashSource('document.title="x"')} is not listed in app/lib/inline-script-hashes.ts`,
      ),
    ]);
  });

  it('should fail a listed script whose source changed', () => {
    expect(findUnlistedInlineScripts(shell(`<script>${clientFactsScript} </script>`))).toHaveLength(1);
  });

  it('should fail a shell with an unlisted script through checkShell', () => {
    const html = shell('<script>alert(1)</script>');
    const problems = checkShell({
      ...holding(),
      prerendered: html,
      shellRenders: [html, html],
      functionDocument: html,
    });
    expect(problems).toStrictEqual([expect.stringContaining('is not listed in app/lib/inline-script-hashes.ts')]);
  });

  it('should read only scripts that run inline: not external scripts or data blocks', () => {
    expect(
      inlineScripts(
        '<script src="/a.js"></script><script type="application/json">{}</script><script type="module">import "/b.js";</script>',
      ),
    ).toStrictEqual(['import "/b.js";']);
  });

  it('should hash as CSP does: SHA-256 of the UTF-8 text, base64', () => {
    // As `printf %s "alert('Hello, world.');" | openssl dgst -sha256 -binary | base64` gives it.
    expect(scriptHashSource("alert('Hello, world.');")).toBe("'sha256-qznLcsROx4GACP2dm0UCKCzCG+HiZ1guq6ZZDob/Tng='");
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
    expect(sampleUrl(homeClass)).toBe('/');
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
