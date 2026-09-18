import type { BrowserContext, Route } from 'playwright';
import { desktopE2EApiUrl } from '#support/config.js';

/**
 * Route-level Tau Hosted Remote faults for one client (defect C62).
 *
 * A lapsed plan cannot be seeded: `billing.protect_payment_identity` refuses to
 * delete a subscription row or to pull its `paid_through` back, which is where
 * `two-client/tau-cloud.ts` stops. From the client's side a lapse is *only* the
 * status and body the server starts sending, so this module produces those
 * bytes directly and leaves billing alone. The same helper covers 401, 403,
 * 404 and 413 — every refusal class the blueprint's N1 vocabulary names — and
 * the offline case the existing cases already drive with `route.abort`.
 *
 * Scoped to the `/v1/git/` routes by default so auth, projects and chat keep
 * working while only the git wire refuses, which is what a real entitlement
 * refusal looks like; and installed per client `BrowserContext`, so the shared
 * API is untouched for the other client in the same run.
 *
 * The bodies are the API's own, not invented ones. Playwright always sends
 * `Origin`, so `GitProtocolExceptionFilter` hands the request to the global
 * `HttpExceptionFilter` and the client reads the five-field envelope
 * `{ error, code, statusCode, path, requestId }` — note the server's sentence
 * lands in `error`, not `message`. The one exception is an LFS batch refusal,
 * which `git.controller.ts` returns as a value rather than throwing: it keeps
 * git-lfs's own media type and its `{ code, message, shortfallBytes,
 * remainingBytes, files }` shape (`git-lfs.service.ts:129-141`).
 */

/** The part of a two-client client this module drives. */
export type GitFaultTarget = Readonly<{ context: BrowserContext }>;

/** One over-quota file, as `reserveLfsObjects` reports it. */
export type GitLfsQuotaFile = Readonly<{ oid: string; size: number; path?: string }>;

/** A refusal to answer every matching git request with. */
export type GitRefusal = Readonly<{
  status: number;
  /** The API's own error code. Defaults to the status' generic code. */
  code?: string;
  /** The server's sentence. Defaults to the one `apps/api` sends for `code`. */
  message?: string;
  /** Present only for an LFS batch refusal; switches the body to git-lfs's shape. */
  files?: readonly GitLfsQuotaFile[];
  shortfallBytes?: number;
  remainingBytes?: number;
}>;

/** An installed fault, and what it has answered so far. */
export type GitFault = Readonly<{
  /** Every request URL this fault has answered, oldest first. */
  requests: () => readonly string[];
  /** Requests whose path contains `fragment` — e.g. `git-receive-pack`. */
  requestsMatching: (fragment: string) => readonly string[];
  /** Uninstall the fault; matching requests reach the API again. */
  remove: () => Promise<void>;
}>;

/**
 * The sentence `apps/api` sends with each code, copied from its source.
 *
 * A spec that asserts the rendered sentence must compare against what the
 * server would really have said, or it proves the client renders a fixture.
 */
const serverSentences = new Map<string, string>([
  ['UNAUTHORIZED', 'Unauthorized'],
  ['GIT_SYNC_NOT_ENTITLED', 'Syncing files to Tau Cloud is a paid plan feature.'],
  ['GIT_REPOSITORY_NOT_FOUND', 'Repository not found'],
  ['FORBIDDEN', 'Forbidden'],
]);

const genericCodes = new Map<number, string>([
  [400, 'BAD_REQUEST'],
  [401, 'UNAUTHORIZED'],
  [403, 'FORBIDDEN'],
  [404, 'NOT_FOUND'],
  [413, 'GIT_QUOTA_EXCEEDED'],
  [429, 'TOO_MANY_REQUESTS'],
  [503, 'SERVICE_UNAVAILABLE'],
]);

/** The default git wire pattern: every Hosted Remote route, and nothing else. */
export const gitWirePattern = `${desktopE2EApiUrl}/v1/git/**`;

/**
 * Render one refusal exactly as the API would render it to a browser.
 *
 * @param refusal - The refusal to render.
 * @param path - The request path, which the envelope echoes.
 * @returns The content type and serialized body.
 */
export const gitRefusalResponse = (
  refusal: GitRefusal,
  path: string,
): Readonly<{ contentType: string; body: string }> => {
  const code = refusal.code ?? genericCodes.get(refusal.status) ?? 'HTTP_EXCEPTION';
  const message = refusal.message ?? serverSentences.get(code) ?? 'An error occurred';
  if (refusal.files) {
    return {
      contentType: 'application/vnd.git-lfs+json',
      body: JSON.stringify({
        code,
        message,
        shortfallBytes: refusal.shortfallBytes ?? 0,
        remainingBytes: refusal.remainingBytes ?? 0,
        files: refusal.files,
      }),
    };
  }
  return {
    contentType: 'application/json; charset=utf-8',
    body: JSON.stringify({
      error: message,
      code,
      statusCode: refusal.status,
      path,
      requestId: 'desktop-e2e-git-fault',
    }),
  };
};

/**
 * Install a fault on one client's git wire from this point in the run onward.
 *
 * Call it before the first push to assert a refusal class, or mid-run — after
 * the row already reads *Backed up* — to assert what the client does when the
 * plan lapses under it.
 *
 * @param target - The client whose context the fault is installed on.
 * @param respond - What to do with each matching request.
 * @param pattern - The URL glob to intercept. Defaults to the git wire.
 * @returns The installed fault.
 */
const installGitFault = async (
  target: GitFaultTarget,
  respond: (route: Route, url: string) => Promise<void>,
  pattern: string,
): Promise<GitFault> => {
  const seen: string[] = [];
  const handler = async (route: Route): Promise<void> => {
    const url = route.request().url();
    seen.push(url);
    await respond(route, url);
  };
  await target.context.route(pattern, handler);
  return {
    requests: () => [...seen],
    requestsMatching: (fragment) => seen.filter((url) => url.includes(fragment)),
    /* Named, so removing this fault leaves any other handler a spec installed
     * on the same pattern in place. */
    remove: async () => target.context.unroute(pattern, handler),
  };
};

/**
 * Answer every matching git request with one server refusal.
 *
 * @param target - The client to refuse.
 * @param refusal - The status, code and body to answer with.
 * @param pattern - The URL glob to intercept. Defaults to the git wire.
 * @returns The installed fault, for counting and removal.
 */
export const routeGitRefusal = async (
  target: GitFaultTarget,
  refusal: GitRefusal,
  pattern: string = gitWirePattern,
): Promise<GitFault> =>
  installGitFault(
    target,
    async (route, url) => {
      const { contentType, body } = gitRefusalResponse(refusal, new URL(url).pathname);
      await route.fulfill({ status: refusal.status, contentType, body });
    },
    pattern,
  );

/**
 * Take one client's git wire offline without touching the other's.
 *
 * `context.setOffline` would be the whole-context verb, but the two-client tier
 * shares one API between the clients and the existing cases already scope the
 * outage to the git routes (`two-client.spec.ts:1114`). This is that line, with
 * the request counting and removal the refusal path has.
 *
 * @param target - The client to take offline.
 * @param pattern - The URL glob to intercept. Defaults to the git wire.
 * @returns The installed fault, for counting and removal.
 */
export const routeGitOffline = async (target: GitFaultTarget, pattern: string = gitWirePattern): Promise<GitFault> =>
  installGitFault(target, async (route) => route.abort('connectionfailed'), pattern);

/**
 * Answer a `git-receive-pack` POST with real report-status pkt-lines (W10).
 *
 * The Hosted Remote's D20 ceiling refusal has no HTTP status at all: it is the
 * `pre-receive` hook's bytes, relayed verbatim (Rule 19, NI13), so a JSON
 * envelope cannot produce it and `routeGitRefusal` is the wrong shape. The
 * client recognises it by the fixed marker the hook opens with, which is why
 * the marker below must stay byte-identical to `ceilingRefusalMarker` in
 * `apps/api/app/api/git/git.constants.ts` and its copy in
 * `packages/revisions/src/remotes.ts`.
 *
 * @param target - The client to refuse.
 * @param reason - The hook's whole sentence, including its marker and file list.
 * @param ref - The ref the refusal names.
 * @returns The installed fault.
 */
export const routeGitHookRefusal = async (
  target: GitFaultTarget,
  reason: string,
  ref = 'refs/heads/main',
): Promise<GitFault> => {
  const pktLine = (text: string): string => `${(text.length + 4).toString(16).padStart(4, '0')}${text}`;
  /* A single-line `ng` reason: the hook's own newlines would end the pkt-line,
   * so they arrive as the vertical-bar separator the hook's own relay uses. */
  const report = `${pktLine('unpack ok\n')}${pktLine(`ng ${ref} ${reason.replaceAll('\n', ' | ')}\n`)}0000`;
  /* `git-receive-pack` advertises `side-band-64k` and isomorphic-git asks for
   * it, so the report-status stream arrives multiplexed on band 1. A bare
   * pkt-line stream parses as garbage and the client reports "could not be
   * reached" instead of the refusal — which is exactly the wrong answer to
   * prove. */
  const body = Buffer.from(`${pktLine(`\u0001${report}`)}0000`, 'binary');
  return installGitFault(
    target,
    async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/x-git-receive-pack-result',
        body,
      });
    },
    '**/git-receive-pack',
  );
};
