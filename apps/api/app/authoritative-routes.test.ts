/**
 * Static guards for the auth session cookie cache (Tau Brain
 * research/auth-session-cookie-blueprint.md, WP2).
 *
 * 1. A cookie `GET` may be answered from a session snapshot up to a minute
 *    old, so a `GET` that mints something outliving the request (a presigned
 *    URL, a signed link, an HMAC) must read the session from the store:
 *    `@AuthoritativeSession()`, or `@PublicAuth()` when it needs no session.
 *    A controller is checked when its import graph reaches object storage,
 *    file links, an `AUTH_SECRET` reader or `createHmac(`. The graph
 *    over-approximates, which is the safe direction; every handler it
 *    flags that needs neither marker is listed below with its reason.
 * 2. No guarded handler may let a shared cache keep its answer: a written
 *    `Cache-Control` with `public`, `s-maxage` or a positive `max-age`
 *    without `private` is refused unless the handler is `@PublicAuth()`.
 */
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { apiRoot, moduleGraph, sourceFiles } from '#testing/module-graph.js';

/**
 * `GET` handlers the graph flags that mint nothing a revoked session could keep, keyed
 * `file#GET <route>`. Each reason was checked against the handler when it was added.
 */
const cachedReadAllowlist: Readonly<Record<string, string>> = {
  'app/api/durable-events/durable-events.controller.ts#GET :streamId/events':
    'Long-poll of stream events; mints nothing (its 25 s admission window is part of the documented bound)',
  'app/api/git/git-proxy.controller.ts#GET proxy':
    "Relays an upstream git host's bytes; the caller's own remote credential, no Tau-signed link",
  'app/api/git/git-proxy.controller.ts#GET lfs/:handle':
    'Spends a relay handle minted by the POST batch; relays bytes, mints nothing',
  'app/api/git/git.controller.ts#GET :repo/info/refs':
    'Smart-HTTP ref advertisement; LFS links are signed only behind the POST batch',
  'app/api/git/pushes.controller.ts#GET :projectId/git/pushes': 'Push history read; no signed link',
  'app/api/git/usage.controller.ts#GET :projectId/usage': 'Storage usage read; no signed link',
  'app/api/github/github-gist.controller.ts#GET capability':
    'Reports whether gist sharing is available; the token stays server-side',
  'app/api/github/github.controller.ts#GET configuration': 'GitHub App configuration read',
  'app/api/github/github.controller.ts#GET connections': 'Connection list read; tokens stay server-side',
  'app/api/github/github.controller.ts#GET connections/:id/repositories/:repositoryId/access':
    'Reads GitHub access and may delete stale write rows on 403/404 (blueprint F14, benign); mints nothing',
  'app/api/github/github.controller.ts#GET installations': 'Installation list read through server-held tokens',
  'app/api/github/github.controller.ts#GET repositories': 'Repository list read through server-held tokens',
  'app/api/github/github.controller.ts#GET repositories/:id/branches': 'Branch list read through server-held tokens',
  'app/api/github/github.controller.ts#GET repositories/:id': 'Repository read through server-held tokens',
  'app/api/github/github.controller.ts#GET repositories/:id/branch': 'Branch read through server-held tokens',
  'app/api/github/github.controller.ts#GET repositories/:id/tree': 'Tree read through server-held tokens',
  'app/api/jobs/jobs.controller.ts#GET ':
    'Job list read; presigned URLs are only on POST routes and the marked artifact GET',
  'app/api/jobs/jobs.controller.ts#GET :jobId': 'Job state read; no presigned URL',
  'app/api/privacy/privacy.controller.ts#GET ': 'Privacy preferences, read from the database by user id',
  'app/api/voice/voice.controller.ts#GET status': 'Voice availability read',
  '../libs/api-agent-observability/src/telemetry-purposes/telemetry-purpose.controller.ts#GET ':
    'Purpose grants read; no credential',
  '../libs/api-billing/src/billing-attempt.controller.ts#GET attempts/:surface/:attemptKey':
    'Billing attempt state read',
  '../libs/api-billing/src/billing.controller.ts#GET entitlements': 'Entitlements, read from the database on use',
  '../libs/api-billing/src/billing.controller.ts#GET credits': 'Credit balance read',
  '../libs/api-billing/src/billing.controller.ts#GET model-estimates': 'Price estimates read',
  '../libs/api-billing/src/billing.controller.ts#GET holds': 'Credit holds read',
  '../libs/api-billing/src/billing.controller.ts#GET usage': 'Usage read',
  '../libs/api-billing/src/billing.controller.ts#GET operations/:operationId': 'Funded operation state read',
  '../libs/api-billing/src/billing.controller.ts#GET reload-consent': 'Reload consent read',
  '../libs/api-billing/src/billing.controller.ts#GET account-closure': 'Account closure state read',
  '../libs/api-billing/src/billing.controller.ts#GET account-closure/:closureId': 'Account closure state read',
  '../libs/api-billing/src/billing.controller.ts#GET payment-actions': 'Pending payment actions read',
  '../libs/api-billing/src/billing.controller.ts#GET payment-actions/:actionId':
    'Returns a stored Stripe Checkout link it does not mint, usable only to pay into the account (blueprint F14)',
  '../libs/api-hosts/src/hosts.controller.ts#GET ':
    'Paired device list read; pairing credentials are minted only by POST',
  '../libs/api-hosts/src/hosts.controller.ts#GET :id/runs': 'Device run list read',
  '../libs/api-projects/src/collaboration/collaboration.controller.ts#GET ': 'Collaborator list read',
  '../libs/api-projects/src/projects/project-deletion.controller.ts#GET :projectId/deletion': 'Deletion state read',
  '../libs/api-projects/src/projects/project-preview.controller.ts#GET :projectId/preview':
    'Preview bytes streamed through the API; no signed link',
  '../libs/api-projects/src/projects/projects.controller.ts#GET ': 'Project list read',
  '../libs/api-projects/src/publications/project-share.controller.ts#GET :id/share': 'Share settings read',
  '../libs/api-projects/src/publications/publications.controller.ts#GET :id':
    'Publication read; file URLs are unsigned API proxy paths',
  '../libs/api-projects/src/publications/publications.controller.ts#GET :id/files':
    'Publication files streamed through the API; no signed link',
  '../libs/api-projects/src/publications/publications.controller.ts#GET :id/access': 'Publication access read',
};

const signingModules = new Set([
  '../libs/api-object-storage/src/object-storage.service.ts',
  '../libs/api-object-storage/src/file-links.service.ts',
]);

const signsDirectly = (source: string): boolean =>
  /get\(\s*['"]AUTH_SECRET['"]/u.test(source) || source.includes('createHmac(');

const sources = new Map<string, string>();
const read = (file: string): string => {
  let source = sources.get(file);
  if (source === undefined) {
    source = readFileSync(path.join(apiRoot, file), 'utf8');
    sources.set(file, source);
  }
  return source;
};

const routeDecorator = /^\s*@(Get|Post|Put|Patch|Delete|Head|Options|All)\((.*)$/u;

type Handler = { readonly method: string; readonly route: string; readonly decorators: string; readonly line: number };

/** The decorator block around each route decorator: contiguous decorator and comment lines up to the method. */
const handlersOf = (source: string): Handler[] => {
  const lines = source.split('\n');
  const handlers: Handler[] = [];
  for (const [index, line] of lines.entries()) {
    const match = routeDecorator.exec(line);
    if (match === null) {
      continue;
    }
    let start = index;
    while (start > 0 && /^\s*(?:@|\/\/|\*|\/\*)/u.test(lines[start - 1] ?? '')) {
      start -= 1;
    }
    let end = index;
    while (end + 1 < lines.length && !/^\s*(?:public|private|protected|async)\b/u.test(lines[end + 1] ?? '')) {
      end += 1;
    }
    const routeArgument = /^\s*['"`]([^'"`]*)['"`]/u.exec(match[2] ?? '');
    handlers.push({
      method: (match[1] ?? '').toUpperCase(),
      route: routeArgument?.[1] ?? '',
      decorators: lines.slice(start, end + 1).join('\n'),
      line: index,
    });
  }
  return handlers;
};

/** Decorators on the controller class itself. */
const classDecorators = (source: string): string => {
  const lines = source.split('\n');
  const classLine = lines.findIndex((line) => /^export class \w+/u.test(line));
  if (classLine === -1) {
    return '';
  }
  // Walk up over the decorators and their arguments; a blank line, a comment's end or a top-level statement ends them.
  let start = classLine;
  while (start > 0 && !/^(?:\s*$|\s*\*\/|import |export |const |type |let |function )/u.test(lines[start - 1] ?? '')) {
    start -= 1;
  }
  return lines.slice(start, classLine).join('\n');
};

const isMarked = (decorators: string, marker: string): boolean => decorators.includes(`@${marker}()`);

const controllers = sourceFiles().filter((file) => file.endsWith('.controller.ts'));

describe('cached-read boundary', () => {
  it('should mark every GET that can reach a signing primitive @AuthoritativeSession() or @PublicAuth()', () => {
    const unmarked: string[] = [];
    const flagged = new Set<string>();
    for (const file of controllers) {
      const source = read(file);
      const gets = handlersOf(source).filter((handler) => handler.method === 'GET');
      // A controller that never applies a guard reads no session, so no snapshot can answer it.
      if (gets.length === 0 || !/\b(?:UseAuth|UseGuards)\(/u.test(source)) {
        continue;
      }
      const graph = moduleGraph(file);
      const reaches = [...graph.modules].some((module) => signingModules.has(module) || signsDirectly(read(module)));
      if (!reaches) {
        continue;
      }
      const onClass = classDecorators(source);
      if (isMarked(onClass, 'AuthoritativeSession') || isMarked(onClass, 'PublicAuth')) {
        continue;
      }
      for (const handler of gets) {
        const key = `${file}#GET ${handler.route}`;
        flagged.add(key);
        if (
          !isMarked(handler.decorators, 'AuthoritativeSession') &&
          !isMarked(handler.decorators, 'PublicAuth') &&
          cachedReadAllowlist[key] === undefined
        ) {
          unmarked.push(key);
        }
      }
    }

    expect(unmarked).toEqual([]);
    // An allowlist entry the graph no longer flags is stale: remove it.
    expect(Object.keys(cachedReadAllowlist).filter((key) => !flagged.has(key))).toEqual([]);
  });

  it('should hold the three link-minting GETs authoritative', () => {
    const marked = (file: string, route: string): boolean =>
      handlersOf(read(file)).some(
        (handler) =>
          handler.method === 'GET' && handler.route === route && isMarked(handler.decorators, 'AuthoritativeSession'),
      );

    expect(marked('app/api/jobs/jobs.controller.ts', ':jobId/artifacts/:artifactId')).toBe(true);
    expect(marked('app/api/git/catalogue.controller.ts', ':projectId/git/catalogue')).toBe(true);
    expect(marked('app/api/git/revision-salt.controller.ts', 'salt')).toBe(true);
  });
});

const cacheControlValue = /(?:['"]cache-control['"]\s*[:,]\s*|cacheControl\s*[:=]\s*)(['"`])((?:(?!\1).)*)\1/giu;

/** Whether a `Cache-Control` value lets a shared cache keep the answer. */
const sharedCacheable = (value: string): boolean => {
  const directives = value.toLowerCase();
  if (/\bpublic\b/u.test(directives) || /\bs-maxage\b/u.test(directives)) {
    return true;
  }
  const maxAge = /\bmax-age\s*=\s*([^,;\s]+)/u.exec(directives)?.[1];
  const positive = maxAge !== undefined && (maxAge.includes('${') || Number.parseInt(maxAge, 10) > 0);
  return positive && !/\bprivate\b/u.test(directives);
};

describe('cache-control on guarded handlers', () => {
  it('should refuse a shared-cacheable Cache-Control outside @PublicAuth() handlers', () => {
    const files = sourceFiles().filter((file) => file.endsWith('.controller.ts') || /\.constants?\.ts$/u.test(file));
    const refused: string[] = [];
    let examined = 0;
    for (const file of files) {
      const source = read(file);
      const handlers = handlersOf(source);
      const publicClass = isMarked(classDecorators(source), 'PublicAuth');
      const lines = source.split('\n');
      for (const match of source.matchAll(cacheControlValue)) {
        const value = match[2] ?? '';
        examined += 1;
        if (!sharedCacheable(value)) {
          continue;
        }
        const line = source.slice(0, match.index).split('\n').length - 1;
        const handler = handlers.findLast((candidate) => candidate.line <= line);
        const isPublic = publicClass || (handler !== undefined && isMarked(handler.decorators, 'PublicAuth'));
        if (!isPublic) {
          refused.push(`${file}:${String(line + 1)} ${value} (${(lines[line] ?? '').trim()})`);
        }
      }
    }

    expect(refused).toEqual([]);
    // The scan must see the values it judges (billing's private no-store, git's no-cache, the git proxy's own).
    expect(examined).toBeGreaterThan(3);
  });

  it.each([
    ['public, max-age=60', true],
    ['max-age=600', true],
    ['s-maxage=60', true],
    // The classifier reads source text, so the template placeholder is literal here.
    // oxlint-disable-next-line eslint/no-template-curly-in-string -- source text, not a template.
    ['max-age=${String(answer.maxAge)}', true],
    ['private, max-age=60', false],
    ['private, no-store', false],
    ['no-cache, max-age=0, must-revalidate', false],
  ])('should classify %j as shared-cacheable=%s', (value, expected) => {
    expect(sharedCacheable(value)).toBe(expected);
  });
});
