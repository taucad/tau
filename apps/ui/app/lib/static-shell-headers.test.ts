// @vitest-environment node
/**
 * Shell invariant 5 (progressive loading G4, PL3): a static shell answers with the same isolation, content security,
 * reporting and document policies as a function document of the same site.
 *
 * A function document gets its headers from the root middleware and `entry.server.tsx`; a static file gets `netlify.toml`'s `[[headers]]`
 * merged with the `_headers` file the build writes (`scripts/write-content-security-policy-headers.mts`). Netlify
 * applies neither of those to function responses, and both to a rewritten static response. Which path Netlify
 * matches the header rules against on a 200 rewrite is not documented, so the shell's headers are taken for both the
 * requested URL and the shell file, and must agree.
 *
 * The site is chosen by `TAU_FRONTEND_URL` for both: the CSP of the server module when it loads, and the build's
 * `_headers`. The real build output is checked the same way by `scripts/check-static-shells.mts`.
 */
import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { RouterContextProvider } from 'react-router';
import type { EntryContext } from 'react-router';
import { afterEach, describe, expect, it, vi } from 'vitest';
import handleRequest from '#entry.server.js';
import {
  buildReportOnlyContentSecurityPolicy,
  reportOnlyContentSecurityPolicy,
  resolveContentSecurityPolicyEnvironment,
} from '#lib/content-security-policy.server.js';
import { rootMiddleware } from '#lib/root-middleware.server.js';
import { shellDocumentFile, shellSkewCookie, staticShellClasses } from '#lib/route-classes.js';
import { skewProtectionCookieName } from '#lib/skew-protection.server.js';
import { contentSecurityPolicyHeaders } from '#scripts/write-content-security-policy-headers.mts';
import { sampleUrl } from '#scripts/check-static-shells.mts';

const uiRoot = resolve(import.meta.dirname, '../..');
const toml = readFileSync(join(uiRoot, 'netlify.toml'), 'utf8');

/** The headers that must be equal on a shell and on a function document. */
const parityHeaders = [
  'Cross-Origin-Opener-Policy',
  'Cross-Origin-Embedder-Policy',
  'Cross-Origin-Resource-Policy',
  'Content-Security-Policy-Report-Only',
  'Reporting-Endpoints',
  'Document-Policy',
] as const;

type HeaderRule = Readonly<{ pattern: string; values: ReadonlyMap<string, string> }>;

/** Each `[[headers]]` rule of `netlify.toml`, comments and blank lines skipped. */
const tomlHeaderRules = (text: string): HeaderRule[] => {
  const rules: Array<{ pattern: string; values: Map<string, string> }> = [];
  let current: { pattern: string; values: Map<string, string> } | undefined;
  let inValues = false;
  for (const line of text.split('\n')) {
    const trimmed = line.trim();
    if (trimmed === '' || trimmed.startsWith('#')) {
      continue;
    }
    if (trimmed.startsWith('[')) {
      if (trimmed === '[[headers]]') {
        current = { pattern: '', values: new Map() };
        rules.push(current);
        inValues = false;
      } else if (trimmed === '[headers.values]' && current !== undefined) {
        inValues = true;
      } else {
        current = undefined;
        inValues = false;
      }
      continue;
    }
    const assignment = /^([\w-]+) = (?:"([^"]*)"|'([^']*)')$/u.exec(trimmed);
    if (current === undefined || assignment === null) {
      continue;
    }
    const [, key = '', double, single] = assignment;
    const value = double ?? single ?? '';
    if (inValues) {
      current.values.set(key.toLowerCase(), value);
    } else if (key === 'for') {
      current.pattern = value;
    }
  }
  return rules;
};

/** Each path block of a `_headers` file. */
const headersFileRules = (text: string): HeaderRule[] => {
  const rules: Array<{ pattern: string; values: Map<string, string> }> = [];
  for (const line of text.split('\n')) {
    if (line.startsWith('/')) {
      rules.push({ pattern: line.trim(), values: new Map() });
    } else if (line.trim() !== '') {
      const separator = line.indexOf(':');
      rules.at(-1)?.values.set(line.slice(0, separator).trim().toLowerCase(), line.slice(separator + 1).trim());
    }
  }
  return rules;
};

/** Netlify's `*` matches any run of characters, slashes included. */
const matches = (pattern: string, path: string): boolean =>
  new RegExp(`^${pattern.replaceAll(/[.+?^${}()|[\]\\]/gu, String.raw`\$&`).replaceAll('*', '.*')}$`, 'u').test(path);

/** One static response's headers: every matching rule of `netlify.toml`, then of `_headers`. */
const staticHeaders = (path: string, headersFile: string): Map<string, string> => {
  const headers = new Map<string, string>();
  for (const rule of [...tomlHeaderRules(toml), ...headersFileRules(headersFile)]) {
    if (matches(rule.pattern, path)) {
      for (const [name, value] of rule.values) {
        headers.set(name, value);
      }
    }
  }
  return headers;
};

/** The parity headers of a response, by their canonical names; `undefined` when absent. */
const pick = (headers: Headers | ReadonlyMap<string, string>): Record<string, string | undefined> =>
  Object.fromEntries(parityHeaders.map((name) => [name, headers.get(name.toLowerCase()) ?? undefined]));

/**
 * A document as React Router serves it (RR3): the entry inside the root middleware, which sets the isolation, CSP and
 * reporting headers on every response.
 */
const serveDocument = async (request: Request, context: EntryContext): Promise<Response> => {
  const routerContext = new RouterContextProvider();
  return rootMiddleware(
    { request, url: new URL(request.url), params: {}, pattern: '/*', context: routerContext },
    async () => handleRequest(request, 200, new Headers(), context, routerContext),
  ) as Promise<Response>;
};

/**
 * A function document for a project URL, rendered through the root middleware and `entry.server.tsx` as the site `frontendUrl` names serves it. The
 * server module chooses its CSP once, from `TAU_FRONTEND_URL` when it loads, so for another site the CSP is the one
 * that module computes for it ({@link siteContentSecurityPolicy}); every other header is chosen per request.
 */
const functionDocumentHeaders = async (
  frontendUrl: string,
  token?: string,
  path = '/w/home/bracket-v2',
): Promise<Headers> => {
  vi.stubEnv('NETLIFY_SKEW_PROTECTION_TOKEN', token ?? '');
  const context = { staticHandlerContext: { matches: [{ route: { id: 'root' } }] } } as unknown as EntryContext;
  const response = await serveDocument(new Request(new URL(path, frontendUrl), { method: 'HEAD' }), context);
  const headers = new Headers(response.headers);
  headers.set('Content-Security-Policy-Report-Only', siteContentSecurityPolicy(frontendUrl));
  return headers;
};

/** The report-only CSP the server module loads with on the site `frontendUrl` names. */
const siteContentSecurityPolicy = (frontendUrl: string): string =>
  buildReportOnlyContentSecurityPolicy(resolveContentSecurityPolicyEnvironment(frontendUrl));

/** The `_headers` file the build writes for the site `frontendUrl` names. */
const builtHeadersFile = (frontendUrl: string): string =>
  contentSecurityPolicyHeaders(resolveContentSecurityPolicyEnvironment(frontendUrl));

afterEach(() => {
  vi.unstubAllEnvs();
});

it("should send the CSP this site's server module loaded with", async () => {
  const context = { staticHandlerContext: { matches: [{ route: { id: 'root' } }] } } as unknown as EntryContext;
  const response = await serveDocument(
    new Request('http://localhost:3000/w/home/bracket-v2', { method: 'HEAD' }),
    context,
  );
  expect(response.headers.get('Content-Security-Policy-Report-Only')).toBe(reportOnlyContentSecurityPolicy);
  expect(reportOnlyContentSecurityPolicy).toBe(siteContentSecurityPolicy(process.env['TAU_FRONTEND_URL'] ?? ''));
});

describe.each([
  { site: 'production', frontendUrl: 'https://tau.new' },
  { site: 'staging', frontendUrl: 'https://taucad.dev' },
  { site: 'a self-hosted or local site', frontendUrl: 'http://localhost:3000' },
])('the static shells on $site', ({ frontendUrl }) => {
  it.each(staticShellClasses)('should carry the $label function document headers', async (shell) => {
    const ssr = pick(await functionDocumentHeaders(frontendUrl, undefined, sampleUrl(shell)));
    const headersFile = builtHeadersFile(frontendUrl);
    const requested = pick(staticHeaders(sampleUrl(shell), headersFile));
    const shellFile = pick(staticHeaders(`/${shellDocumentFile(shell)}`, headersFile));

    expect(ssr['Cross-Origin-Opener-Policy']).toBe('same-origin');
    expect(ssr['Cross-Origin-Embedder-Policy']).toBe('require-corp');
    expect(ssr['Cross-Origin-Resource-Policy']).toBe('same-origin');
    expect(ssr['Content-Security-Policy-Report-Only']).toContain("default-src 'self';");
    expect(requested).toStrictEqual(ssr);
    expect(shellFile).toStrictEqual(ssr);
  });
});

describe('production shell headers', () => {
  it('should offer no JS profiler on production, function document and shell alike (C6)', async () => {
    const ssr = await functionDocumentHeaders('https://tau.new');
    const shell = staticHeaders('/w/home/bracket-v2', builtHeadersFile('https://tau.new'));
    expect(ssr.has('Document-Policy')).toBe(false);
    expect(shell.has('document-policy')).toBe(false);
  });

  it("should expire the skew cookie a function document sets, with that cookie's attributes", async () => {
    const ssr = await functionDocumentHeaders('https://tau.new', 'deploy-token');
    expect(ssr.get('Set-Cookie')).toBe(
      `${skewProtectionCookieName}=deploy-token; Path=/; Secure; HttpOnly; SameSite=Lax`,
    );
    const shell = staticHeaders('/w/home/bracket-v2', builtHeadersFile('https://tau.new'));
    expect(shell.get('set-cookie')).toBe(shellSkewCookie(skewProtectionCookieName));
    // The Home shell gets its expiry from the marketing edge function, which alone serves it (PL4).
    expect(staticHeaders('/', builtHeadersFile('https://tau.new')).has('set-cookie')).toBe(false);
    // No other static path expires it: the offline shell and the assets leave a tab's pin alone.
    for (const path of ['/usage', '/assets/route-Dq3Xc9.js', '/manifest.webmanifest']) {
      expect(staticHeaders(path, builtHeadersFile('https://tau.new')).has('set-cookie'), path).toBe(false);
    }
  });
});
