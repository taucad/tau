import { beforeAll, describe, expect, it } from 'vitest';
import { WebSocket } from 'ws';
import { closeAccount, createAccount } from '#support/account.js';
import type { Account } from '#support/account.js';
import { apiUrl, baseUrl } from '#support/api.js';
import { openBrowser, screenshot, visibleText } from '#support/checkout.js';
import { projectChat } from '#support/pages.js';
import { matrixRow, runId } from '#support/results.js';

/** How the Zoo kernel socket closed for an account: the close code and reason, or `timeout`. */
const zooClose = async (account: Account): Promise<{ readonly code: number | 'timeout'; readonly reason: string }> => {
  const url = new URL('/v1/kernels/zoo', apiUrl);
  url.protocol = url.protocol === 'https:' ? 'wss:' : 'ws:';
  const cookie = [...account.api.jar].map(([name, value]) => `${name}=${value}`).join('; ');
  return new Promise((resolve) => {
    // The browser sends the session cookie and the app origin on the upgrade; `ws` lets the harness do the same.
    const socket = new WebSocket(url, { headers: { origin: baseUrl, cookie } });
    const timer = setTimeout(() => {
      socket.terminate();
      resolve({ code: 'timeout', reason: 'no close within 30 s' });
    }, 30_000);
    socket.on('error', () => undefined);
    socket.on('close', (code, reason) => {
      clearTimeout(timer);
      resolve({ code, reason: reason.toString() });
    });
  });
};

describe('kernels', () => {
  let account: Account;

  beforeAll(async () => {
    account = await createAccount('en01');
    return async () => closeAccount(account);
  });

  it(
    'should refuse the Zoo kernel to a free account and say Pro is required [EN-01 P0]',
    matrixRow('EN-01', 'P0', async (evidence) => {
      const close = await zooClose(account);
      evidence.push(`Zoo socket closed ${close.code} "${close.reason}"`);
      const browsing = await openBrowser(account, { kernel: 'zoo' });
      try {
        const { page } = browsing;
        // The banner is the row's subject; the Zoo workspace may keep the chat composer collapsed.
        const project = await projectChat(page).create(`E2E EN-01 ${runId}`, { composer: false });
        const banner = page.getByRole('region', { name: 'Zoo execution access' });
        await banner.waitFor({ timeout: 90_000 }).catch(() => undefined);
        const shown = (await visibleText(banner)) || 'no banner within 90 s';
        evidence.push(`project ${project}`, `banner "${shown}"`, await screenshot(page, 'en-01-zoo-free'));
        expect(close).toEqual({ code: 4403, reason: 'PRO_REQUIRED' });
        expect(shown).toContain('Zoo execution requires Pro. Upgrade to Pro, then retry.');
        return { outcome: 'pass', evidence };
      } finally {
        await browsing.browser.close();
      }
    }),
    300_000,
  );
});
