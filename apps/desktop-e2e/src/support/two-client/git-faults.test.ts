import { afterEach, beforeEach, expect, test } from 'vitest';
import { chromium } from 'playwright';
import type { Browser, BrowserContext, Page, Response } from 'playwright';

import { desktopE2EApiUrl } from '#support/config.js';
import { gitRefusalResponse, routeGitOffline, routeGitRefusal } from '#support/two-client/git-faults.js';

/**
 * Proof that the C62 fault helper injects what it claims (convention P2/C61).
 *
 * A fault helper nobody exercises is the exact shape of evidence this closeout
 * exists to stop trusting: the refusal specs it serves would pass just as
 * happily against a handler that silently fell through to the network. These
 * four checks cost one chromium launch each and no API, no Electron and no
 * database: `route.fulfill` answers before the request leaves the browser, so
 * `desktopE2EApiUrl` is deliberately *not* listening while they run — which is
 * also what makes "the route is gone" observable.
 *
 * The probes are document navigations rather than `fetch` because a navigation
 * is same-origin by definition; a `fetch` from `about:blank` would be judged by
 * CORS on a body this helper is not in the business of decorating.
 */

const receivePackUrl = `${desktopE2EApiUrl}/v1/git/two-client-probe/git-receive-pack`;
const lfsBatchUrl = `${desktopE2EApiUrl}/v1/git/two-client-probe/info/lfs/objects/batch`;

let browser: Browser | undefined;
let context: BrowserContext | undefined;
let page: Page | undefined;

beforeEach(async () => {
  browser = await chromium.launch();
  context = await browser.newContext();
  page = await context.newPage();
});

afterEach(async () => {
  await browser?.close();
  browser = undefined;
  context = undefined;
  page = undefined;
});

const target = (): { context: BrowserContext } => {
  if (!context) {
    throw new Error('No browser context is open.');
  }
  return { context };
};

const visit = async (url: string): Promise<Response> => {
  if (!page) {
    throw new Error('No page is open.');
  }
  const response = await page.goto(url);
  if (!response) {
    throw new Error(`No response was recorded for ${url}.`);
  }
  return response;
};

test('answers the git wire with the API envelope a browser would have read', async () => {
  const fault = await routeGitRefusal(target(), { status: 403, code: 'GIT_SYNC_NOT_ENTITLED' });

  const visited = await visit(receivePackUrl);

  expect(visited.status()).toBe(403);
  expect(await visited.headerValue('content-type')).toBe('application/json; charset=utf-8');
  expect(JSON.parse(await visited.text())).toStrictEqual({
    error: 'Syncing files to Tau Cloud is a paid plan feature.',
    code: 'GIT_SYNC_NOT_ENTITLED',
    statusCode: 403,
    path: '/v1/git/two-client-probe/git-receive-pack',
    requestId: 'desktop-e2e-git-fault',
  });
  expect(fault.requests()).toStrictEqual([receivePackUrl]);
});

test('keeps an LFS batch refusal in git-lfs shape with its file list', async () => {
  const files = [{ oid: 'a'.repeat(64), size: 4096, path: 'exports/shell.step' }];
  await routeGitRefusal(target(), {
    status: 413,
    code: 'GIT_LFS_QUOTA_EXCEEDED',
    message: 'Storage quota exceeded: this push needs 4096 bytes more than the plan allows.',
    files,
    shortfallBytes: 4096,
  });

  const { contentType } = gitRefusalResponse({ status: 413, code: 'GIT_LFS_QUOTA_EXCEEDED', files }, '/x');
  expect(contentType).toBe('application/vnd.git-lfs+json');

  const visited = await visit(lfsBatchUrl);
  expect(visited.status()).toBe(413);
  expect(await visited.headerValue('content-type')).toBe('application/vnd.git-lfs+json');
  expect(JSON.parse(await visited.text())).toStrictEqual({
    code: 'GIT_LFS_QUOTA_EXCEEDED',
    message: 'Storage quota exceeded: this push needs 4096 bytes more than the plan allows.',
    shortfallBytes: 4096,
    remainingBytes: 0,
    files,
  });
});

test('counts the requests it answered and answers none after removal', async () => {
  const fault = await routeGitRefusal(target(), { status: 401 });

  await visit(receivePackUrl);
  await visit(lfsBatchUrl);
  expect(fault.requestsMatching('git-receive-pack')).toStrictEqual([receivePackUrl]);
  expect(fault.requests()).toHaveLength(2);

  await fault.remove();
  await visit(receivePackUrl).catch(() => undefined);

  expect(fault.requests()).toHaveLength(2);
});

test('aborts the git wire when the client is taken offline', async () => {
  const fault = await routeGitOffline(target());

  /* `ERR_CONNECTION_FAILED` is what `abort('connectionfailed')` synthesises; a
   * handler that merely fell through to the network would reach a closed
   * `desktopE2EApiUrl` and say `ERR_CONNECTION_REFUSED` instead, and the check
   * would pass for the wrong reason. */
  await expect(visit(receivePackUrl)).rejects.toThrow(/ERR_CONNECTION_FAILED/u);
  expect(fault.requests()).toStrictEqual([receivePackUrl]);
});
