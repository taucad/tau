#!/usr/bin/env node
/**
 * Static-shell invariants on the web build (progressive loading PL3, Brain `research/progressive-loading-architecture.md`,
 * "Enforcement by design", shell invariants 1, 2, 5 and 6).
 *
 * For each static-shell class of the route-class registry (`app/lib/route-classes.ts`) it reads the prerendered shell
 * and renders documents through the server build (`build/server/index.js`), the one the function serves, and checks:
 *
 * 1. **Neutral bytes.** The shell rendered for two visitors with different cookies (theme, sidebar, consent, a stale
 *    skew token), user agents, languages and `Sec-GPC`, a day apart, is byte-identical to the prerendered file.
 * 2. **Deterministic bytes.** Within the build the bytes depend on no clock and no random id (the same renders). Two
 *    builds of one commit differ only in the build identity (`TAU_BUILD_ID`), which is per deploy by design: it is what
 *    the build-skew guard compares with `/health/build`.
 * 3. **Same document as the function.** The function's document for a real URL of the class (`/w/home/bracket-v2`)
 *    equals the shell, so a visitor gets the same bytes, frame included, either way.
 * 4. **Skew.** The shell publishes the build id the server's `/health/build` answers, so a tab opened from it is
 *    recognised as replaced after the next deploy.
 * 5. **Headers.** The function document's COOP, COEP, CORP, report-only CSP, `Reporting-Endpoints` and
 *    `Document-Policy` equal the static headers the shell gets on this site (`netlify.toml` and the `_headers` the
 *    build writes for `TAU_FRONTEND_URL`). **Script hashes:** every inline script of the shell is either one whose
 *    CSP hash is listed in `app/lib/inline-script-hashes.ts`, or one whose source is not fixed and is recognised by
 *    how it begins (the client environment, the icon sprite loader, React Router's and React's own scripts); any
 *    other inline script fails, so a new Tau
 *    inline script is listed with its hash before it ships.
 * 6. **Sentinel guard.** The shell's placeholder (`__shell`) appears in no rendered text, attribute or loader data.
 * 7. **Nothing left behind (edge shells).** The Home shell's prerendered `index.html` and root data file (`_.data`, or
 *    `_root.data` without trailing-slash-aware data requests) are gone from the client output: Netlify's function
 *    yields to a static file, so either would answer the `/` and root data requests the marketing edge function leaves
 *    to the function (`scripts/place-static-shells.ts`).
 *
 * Shell invariant 7 (no early kernel) is `check-critical-budget.mts`, which reads every prerendered document.
 *
 * Usage (after `nx build ui`, with the build's TAU_API_URL, TAU_WEBSOCKET_URL and TAU_FRONTEND_URL):
 *   node apps/ui/scripts/check-static-shells.mts
 *
 * Exit codes:
 *   0  Every shell holds every invariant
 *   1  An invariant fails, or a build output is missing
 */
import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import process from 'node:process';
import { fileURLToPath, pathToFileURL } from 'node:url';
import type { ServerBuild } from 'react-router';
/* oxlint-disable no-restricted-imports -- Native Node build check reads app modules without bundler aliases. */
import { prerenderedFiles, shellDocumentFile, shellSentinel, staticShellClasses } from '../app/lib/route-classes.ts';
import type { StaticShellClass } from '../app/lib/route-classes.ts';
import { resolveContentSecurityPolicyEnvironment } from '../app/lib/content-security-policy.server.ts';
import { tauInlineScriptHashes } from '../app/lib/inline-script-hashes.ts';
import { contentSecurityPolicyHeaders } from './write-content-security-policy-headers.mts';
/* oxlint-enable no-restricted-imports */

/** The headers a shell and a function document of the same site must agree on. */
export const parityHeaders = [
  'cross-origin-opener-policy',
  'cross-origin-embedder-policy',
  'cross-origin-resource-policy',
  'content-security-policy-report-only',
  'reporting-endpoints',
  'document-policy',
] as const;

/** One visitor's request facts: everything a per-request render could have read. */
export type Visitor = Readonly<{ label: string; headers: Readonly<Record<string, string>> }>;

/** Two visitors who differ in every fact the document used to depend on. */
export const visitors: readonly [Visitor, Visitor] = [
  {
    label: 'a first visit on a Mac',
    headers: {
      'user-agent':
        'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36',
      'accept-language': 'en-US,en;q=0.9',
      'sec-fetch-dest': 'document',
    },
  },
  {
    label: 'a returning Windows visitor with every presentation cookie, GPC and a stale skew token',
    headers: {
      'user-agent':
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36',
      'accept-language': 'de-DE,de;q=0.9',
      'sec-fetch-dest': 'document',
      'sec-gpc': '1',
      cookie: [
        'tau-theme=dark',
        'tau-sidebar-op=false',
        'tau-cookie-consent=declined',
        'tau-project-count=7',
        'tau-layout-flags=%7B%22chat%22%3Atrue%7D',
        'tau-chat-model=anthropic-claude-haiku-5.5',
        'tau-entry=app',
        'tau_skew=older-deploy',
      ].join('; '),
    },
  },
];

/** The project URL a function document is rendered for, beside the shell. */
export const sampleUrl = (routeClass: StaticShellClass): string =>
  routeClass.match.replace(':workspace', 'home').replace(':project', 'bracket-v2').replaceAll(/:\w+/gu, 'sample');

/**
 * The places a shell's sentinel leaks into: rendered text and attributes, and the loader data and context the router
 * hands to the client. The router context's `url` field is the prerender's own request URL; the client router reads
 * `window.location` instead, so that one occurrence is not a leak.
 *
 * @param html - The shell document.
 * @param sentinel - The placeholder parameter.
 * @returns One excerpt per leak.
 */
export const findSentinelLeaks = (html: string, sentinel: string): string[] => {
  const leaks: string[] = [];
  const markup = html.replaceAll(/<script\b[^>]*>[\s\S]*?<\/script\s*>/giu, (script) => {
    const withoutContextUrl = script.replaceAll(
      new RegExp(String.raw`\\?"url\\?":\\?"[^"\\]*${sentinel}[^"\\]*\\?"`, 'gu'),
      '',
    );
    if (withoutContextUrl.includes(sentinel)) {
      const at = withoutContextUrl.indexOf(sentinel);
      leaks.push(`script: …${withoutContextUrl.slice(Math.max(0, at - 60), at + 60)}…`);
    }
    return '';
  });
  let at = markup.indexOf(sentinel);
  while (at !== -1) {
    leaks.push(`markup: …${markup.slice(Math.max(0, at - 60), at + 60)}…`);
    at = markup.indexOf(sentinel, at + sentinel.length);
  }
  return leaks;
};

/**
 * The build id a document publishes to the page (`window.ENV.TAU_BUILD_ID`).
 *
 * @param html - The document.
 * @returns The id, or `undefined` when the document publishes none.
 */
export const publishedBuildId = (html: string): string | undefined => /TAU_BUILD_ID\\?":\\?"(\d+)/u.exec(html)?.[1];

/**
 * The CSP hash source of an inline script's text: SHA-256 of its UTF-8 bytes, base64 (CSP3 § 6.7.3.3).
 *
 * @param source - The script element's text.
 * @returns The `'sha256-…'` source expression.
 */
export const scriptHashSource = (source: string): string =>
  `'sha256-${createHash('sha256').update(source, 'utf8').digest('base64')}'`;

/**
 * The text of each inline script a document runs: every `<script>` without `src`, other than a data block.
 *
 * @param html - The document.
 * @returns Each script's text, in document order.
 */
export const inlineScripts = (html: string): string[] =>
  [...html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script\s*>/giu)]
    .filter(
      ([, attributes = '']) =>
        !/\bsrc\s*=/iu.test(attributes) && !/\btype\s*=\s*["']?application\/(?:ld\+)?json/iu.test(attributes),
    )
    .map((match) => match[2] ?? '');

/**
 * The inline scripts whose source is not fixed, so no hash can be listed for them, recognised by how they begin: the
 * client environment carries the build id and the site's environment (per deploy); the icon sprite loader carries the
 * build's hashed sprite URLs (per build); React Router's context, stream and route-module loader carry loader data and
 * the build's asset URLs (per build, and per request on a function document); its scroll restoration and React's
 * streaming runtime (`$RC`, `$RB`, `$RT`) belong to those libraries' versions and to the document's Suspense boundaries.
 */
export const unfixedInlineScripts: ReadonlyArray<Readonly<{ label: string; pattern: RegExp }>> = [
  { label: 'the client environment', pattern: /^window\.ENV = \{/u },
  { label: 'the icon sprite loader', pattern: /^\(\(\)=>\{if\(document\.getElementById\("tau-svg-sprite"\)\)return;/u },
  { label: "React Router's context and stream", pattern: /^window\.__reactRouterContext[ .]/u },
  { label: "React Router's route-module loader", pattern: /^import "\/assets\/manifest-[\w-]+\.js";\n/u },
  { label: "React Router's scroll restoration", pattern: /^\(\(storageKey\d*, restoreKey\) => \{/u },
  { label: "React's streaming runtime", pattern: /^(?:\$R[A-Z]|requestAnimationFrame\(function\(\)\{\$RT=)/u },
];

/**
 * Every inline script of a document that is neither listed with its CSP hash nor recognised as one whose source is
 * not fixed (shell invariant 5, "the CSP and its script hashes").
 *
 * @param html - The document.
 * @param listed - The listed hash sources.
 * @returns One message per unlisted script.
 */
export const findUnlistedInlineScripts = (
  html: string,
  listed: readonly string[] = Object.values(tauInlineScriptHashes),
): string[] =>
  inlineScripts(html)
    .filter(
      (source) =>
        !listed.includes(scriptHashSource(source)) && !unfixedInlineScripts.some(({ pattern }) => pattern.test(source)),
    )
    .map(
      (source) =>
        `an inline script whose hash ${scriptHashSource(source)} is not listed in app/lib/inline-script-hashes.ts: ${JSON.stringify(source.slice(0, 120))}`,
    );

/**
 * The first difference between two documents, for a readable failure.
 *
 * @param expected - One document.
 * @param actual - The other.
 * @returns `undefined` when equal, else both sides around the first differing character.
 */
export const firstDifference = (expected: string, actual: string): string | undefined => {
  if (expected === actual) {
    return undefined;
  }
  let index = 0;
  while (index < expected.length && expected[index] === actual[index]) {
    index++;
  }
  const around = (text: string): string => JSON.stringify(text.slice(Math.max(0, index - 80), index + 80));
  return `at byte ${String(index)}: ${around(expected)} vs ${around(actual)}`;
};

/** Netlify's `*` matches any run of characters, slashes included. */
const pathMatches = (pattern: string, path: string): boolean =>
  new RegExp(`^${pattern.replaceAll(/[.+?^${}()|[\]\\]/gu, String.raw`\$&`).replaceAll('*', '.*')}$`, 'u').test(path);

/**
 * The headers Netlify gives a static file: each matching `[[headers]]` rule of `netlify.toml`, then of `_headers`.
 *
 * @param path - The requested path.
 * @param files - The two files' text.
 * @returns The headers by lower-cased name.
 */
export const staticHeadersFor = (
  path: string,
  files: Readonly<{ netlifyToml: string; headersFile: string }>,
): Map<string, string> => {
  const headers = new Map<string, string>();
  for (const [name, value] of [
    ...tomlHeaders(files.netlifyToml, path),
    ...headersFileHeaders(files.headersFile, path),
  ]) {
    headers.set(name, value);
  }
  return headers;
};

/** The values of each `[[headers]]` rule of `netlify.toml` whose `for` matches `path`, in file order. */
const tomlHeaders = (text: string, path: string): Array<[string, string]> => {
  const headers: Array<[string, string]> = [];
  let pattern: string | undefined;
  let inValues = false;
  for (const line of text.split('\n')) {
    const trimmed = line.trim();
    if (trimmed.startsWith('[')) {
      inValues = trimmed === '[headers.values]' && pattern !== undefined;
      if (trimmed !== '[headers.values]') {
        pattern = trimmed === '[[headers]]' ? '' : undefined;
      }
      continue;
    }
    const assignment = /^([\w-]+) = (?:"([^"]*)"|'([^']*)')$/u.exec(trimmed);
    if (pattern === undefined || assignment === null) {
      continue;
    }
    const [, key = '', double, single] = assignment;
    if (!inValues && key === 'for') {
      pattern = double ?? single ?? '';
    } else if (inValues && pathMatches(pattern, path)) {
      headers.push([key.toLowerCase(), double ?? single ?? '']);
    }
  }
  return headers;
};

/** The values of each path block of a `_headers` file that matches `path`, in file order. */
const headersFileHeaders = (text: string, path: string): Array<[string, string]> => {
  const headers: Array<[string, string]> = [];
  let pattern: string | undefined;
  for (const line of text.split('\n')) {
    if (line.startsWith('/')) {
      pattern = line.trim();
    } else if (line.trim() !== '' && pattern !== undefined && pathMatches(pattern, path)) {
      const separator = line.indexOf(':');
      headers.push([line.slice(0, separator).trim().toLowerCase(), line.slice(separator + 1).trim()]);
    }
  }
  return headers;
};

/**
 * The prerendered files an edge shell must not leave at its URL's own static path.
 *
 * @param routeClass - A static-shell class.
 * @param exists - Whether a file exists, relative to the client output directory.
 * @returns The files that remain; always empty for a rewrite shell, which is served from its prerendered file.
 */
export const findStrayPrerenderOutputs = (
  routeClass: StaticShellClass,
  exists: (file: string) => boolean,
): string[] => {
  if (routeClass.via !== 'edge') {
    return [];
  }
  const { document, data } = prerenderedFiles(routeClass.shellPath);
  return [document, ...data].filter((file) => exists(file));
};

/**
 * Every failed invariant of one shell.
 *
 * @param input - The prerendered shell, the documents the server build rendered, its build id and the static headers.
 * @returns One message per failure; empty when the shell holds.
 */
export const checkShell = (
  input: Readonly<{
    routeClass: StaticShellClass;
    prerendered: string;
    shellRenders: readonly string[];
    functionDocument: string;
    functionHeaders: Headers;
    staticHeaders: ReadonlyArray<ReadonlyMap<string, string>>;
    serverBuildId: string | undefined;
    /** {@link findStrayPrerenderOutputs} for this shell. */
    strayFiles: readonly string[];
  }>,
): string[] => {
  const { routeClass } = input;
  const problems: string[] = [];
  for (const [index, render] of input.shellRenders.entries()) {
    const difference = firstDifference(input.prerendered, render);
    if (difference !== undefined) {
      problems.push(
        `the shell rendered for ${visitors[index]?.label ?? 'a visitor'} differs from the prerendered file ${difference}`,
      );
    }
  }
  const asFunction = firstDifference(input.prerendered, input.functionDocument);
  if (asFunction !== undefined) {
    problems.push(`the function's document for ${sampleUrl(routeClass)} differs from the shell ${asFunction}`);
  }
  const shellBuildId = publishedBuildId(input.prerendered);
  if (shellBuildId === undefined || shellBuildId !== input.serverBuildId) {
    problems.push(
      `the shell publishes build id ${String(shellBuildId)}, the server's /health/build ${String(input.serverBuildId)}`,
    );
  }
  problems.push(...findUnlistedInlineScripts(input.prerendered));
  for (const leak of findSentinelLeaks(input.prerendered, shellSentinel)) {
    problems.push(`the shell renders its placeholder: ${leak}`);
  }
  for (const headers of input.staticHeaders) {
    for (const name of parityHeaders) {
      const expected = input.functionHeaders.get(name) ?? undefined;
      const actual = headers.get(name);
      if (expected !== actual) {
        problems.push(
          `${name}: the function sends ${JSON.stringify(expected)}, the shell gets ${JSON.stringify(actual)}`,
        );
      }
    }
  }
  for (const file of input.strayFiles) {
    problems.push(`${file} is still in the client output, where it would answer requests the function serves`);
  }
  return problems.map((problem) => `${routeClass.label}: ${problem}`);
};

const scriptDirectory = fileURLToPath(new URL('.', import.meta.url));
const appDirectory = join(scriptDirectory, '..');
const buildDirectory = join(appDirectory, 'build');

const main = async (): Promise<number> => {
  const frontendUrl = process.env['TAU_FRONTEND_URL'];
  if (frontendUrl === undefined || frontendUrl === '') {
    console.error('check-static-shells: TAU_FRONTEND_URL is required (the build environment)');
    return 1;
  }
  const serverEntry = join(buildDirectory, 'server', 'index.js');
  if (!existsSync(serverEntry)) {
    console.error(`check-static-shells: ${serverEntry} is missing; run nx build ui first`);
    return 1;
  }
  // The function runs with NODE_ENV=production (a functions-scope site variable), and the build prerenders under it.
  process.env['NODE_ENV'] ??= 'production';
  const { createRequestHandler } = await import('react-router');
  const build = (await import(pathToFileURL(serverEntry).href)) as ServerBuild;
  const handle = createRequestHandler(build, 'production');
  const render = async (path: string, visitor: Visitor): Promise<Response> =>
    handle(new Request(new URL(path, frontendUrl), { headers: visitor.headers }));

  const files = {
    netlifyToml: readFileSync(join(appDirectory, 'netlify.toml'), 'utf8'),
    headersFile: contentSecurityPolicyHeaders(resolveContentSecurityPolicyEnvironment(frontendUrl)),
  };
  const health = await render('/health/build', visitors[0]);
  const healthBody = (await health.json()) as { buildId?: unknown };
  const serverBuildId =
    typeof healthBody.buildId === 'number' || typeof healthBody.buildId === 'string'
      ? String(healthBody.buildId)
      : undefined;

  const problems: string[] = [];
  const realNow = Date.now.bind(Date);
  /* oxlint-disable no-await-in-loop -- A render reads the patched Date.now, so renders run one at a time. */
  for (const routeClass of staticShellClasses) {
    const file = join(buildDirectory, 'client', shellDocumentFile(routeClass));
    if (!existsSync(file)) {
      problems.push(`${routeClass.label}: ${file} was not prerendered`);
      continue;
    }
    const shellRenders: string[] = [];
    for (const [index, visitor] of visitors.entries()) {
      // A day later for the second visitor: nothing in the document may read the clock.
      Date.now = () => realNow() + index * 86_400_000;
      try {
        const response = await render(routeClass.shellPath, visitor);
        shellRenders.push(await response.text());
      } finally {
        Date.now = realNow;
      }
    }
    const functionResponse = await render(sampleUrl(routeClass), visitors[1]);
    problems.push(
      ...checkShell({
        routeClass,
        prerendered: readFileSync(file, 'utf8'),
        shellRenders,
        functionDocument: await functionResponse.text(),
        functionHeaders: functionResponse.headers,
        staticHeaders: [
          staticHeadersFor(sampleUrl(routeClass), files),
          staticHeadersFor(`/${shellDocumentFile(routeClass)}`, files),
        ],
        serverBuildId,
        strayFiles: findStrayPrerenderOutputs(routeClass, (relative) =>
          existsSync(join(buildDirectory, 'client', relative)),
        ),
      }),
    );
    if (problems.length === 0) {
      console.log(
        `✓ ${routeClass.label}: ${shellDocumentFile(routeClass)} is neutral, deterministic, equal to the function's document, carries build ${String(serverBuildId)} and the function's headers, and lists every fixed inline script's hash`,
      );
    }
  }
  /* oxlint-enable no-await-in-loop */
  for (const problem of problems) {
    console.error(`✗ ${problem}`);
  }
  return problems.length === 0 ? 0 : 1;
};

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  process.exitCode = await main();
}
