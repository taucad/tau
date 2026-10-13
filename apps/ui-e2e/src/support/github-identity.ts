/**
 * The two GitHub test identities the live GitHub rows sign in as (GitHub
 * capability audit C10, A4; R17), and the one place their secrets are read.
 *
 * Node side only. The browser spec learns which variable *names* are missing,
 * never a value: the values are read here and typed into GitHub's own pages by
 * Playwright, with the context's trace stopped first, because a trace records
 * every filled value and every DOM snapshot an upload would publish.
 *
 * GitHub asks an unrecognised browser for a device code by email unless the
 * account has two-factor authentication, so each identity carries its TOTP
 * secret and the code is computed here (RFC 6238, SHA-1, 30 s, six digits).
 */

import { createHmac } from 'node:crypto';
import process from 'node:process';
import type { BrowserCommandContext } from 'vitest/node';

/** The driver page, typed from the command context so the spec never imports the driver. */
type Page = Awaited<ReturnType<BrowserCommandContext['context']['newPage']>>;

/** Which test identity: the first is connected first; the second is the one *Add account* adds. */
export type GithubIdentity = 'first' | 'second';

/** The environment variable names of one identity: login, password, TOTP secret. */
export const githubIdentityVariables: Readonly<Record<GithubIdentity, readonly [string, string, string]>> =
  Object.freeze({
    first: ['TAU_E2E_GITHUB_USERNAME', 'TAU_E2E_GITHUB_PASSWORD', 'TAU_E2E_GITHUB_TOTP_SECRET'],
    second: ['TAU_E2E_GITHUB_SECOND_USERNAME', 'TAU_E2E_GITHUB_SECOND_PASSWORD', 'TAU_E2E_GITHUB_SECOND_TOTP_SECRET'],
  });

/**
 * The opt-in that says a cloud API with the GitHub App and GitHub sign-in
 * configured for this run's origin is listening at `TAU_E2E_API_URL`. Without
 * it the live GitHub rows skip even when the identities are present.
 */
export const liveGithubOptIn = 'TAU_E2E_LIVE_GITHUB';

/**
 * The names a live GitHub row still needs, in a stable order. Empty means it runs.
 *
 * @param identities - The identities the row signs in as.
 * @param environment - Where to look; the process environment by default.
 * @returns Every missing variable name, never a value.
 */
export const missingLiveGithubVariables = (
  identities: readonly GithubIdentity[],
  environment: Readonly<Record<string, string | undefined>> = process.env,
): readonly string[] => [
  ...identities.flatMap((identity) => githubIdentityVariables[identity].filter((name) => !environment[name])),
  ...(environment[liveGithubOptIn] === 'true' ? [] : [liveGithubOptIn]),
];

const base32Alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';

const decodeBase32 = (encoded: string): Uint8Array<ArrayBuffer> => {
  const bits = [...encoded.replaceAll(/[\s=-]/gu, '').toUpperCase()]
    .map((character) => {
      const value = base32Alphabet.indexOf(character);
      if (value === -1) {
        throw new Error('A GitHub TOTP secret must be base32.');
      }
      return value.toString(2).padStart(5, '0');
    })
    .join('');
  const bytes: number[] = [];
  for (let offset = 0; offset + 8 <= bits.length; offset += 8) {
    bytes.push(Number.parseInt(bits.slice(offset, offset + 8), 2));
  }
  return Uint8Array.from(bytes);
};

/**
 * The current six-digit TOTP code for a base32 secret (RFC 6238).
 *
 * @param secret - The base32 secret GitHub shows when two-factor is set up.
 * @param now - Milliseconds since the epoch.
 * @returns The code, zero-padded.
 */
export const totpCode = (secret: string, now = Date.now()): string => {
  const counter = Buffer.alloc(8);
  counter.writeBigUInt64BE(BigInt(Math.floor(now / 30_000)));
  const digest = createHmac('sha1', decodeBase32(secret)).update(counter).digest();
  /* RFC 4226 dynamic truncation: the low nibble of the last byte picks four
   * bytes, and the top bit of those is dropped. */
  const offset = (digest.at(-1) ?? 0) % 16;
  const value = digest.readUInt32BE(offset) % 2 ** 31;
  return String(value % 1_000_000).padStart(6, '0');
};

const required = (name: string): string => {
  const value = process.env[name];
  if (!value) {
    throw new Error(`${name} is required for this live GitHub row.`);
  }
  return value;
};

const visibleSoon = async (page: Page, selector: string, waitMilliseconds: number): Promise<boolean> => {
  try {
    await page.locator(selector).first().waitFor({ state: 'visible', timeout: waitMilliseconds });
    return true;
  } catch {
    return false;
  }
};

/**
 * Finish whatever GitHub shows between Tau's redirect and its return: the
 * account chooser `prompt=select_account` opens, the sign-in form, the
 * two-factor prompt and the authorize screen, each only when GitHub shows it.
 *
 * @param page - The page GitHub's authorize flow is on.
 * @param identity - Who to sign in as.
 * @param returned - Whether the page is back on Tau.
 */
export const completeGithubAuthorization = async (
  page: Page,
  identity: GithubIdentity,
  returned: (url: URL) => boolean,
): Promise<void> => {
  const [loginName, passwordName, totpName] = githubIdentityVariables[identity];
  /* The page is still on Tau when this starts; it is back only after GitHub
   * was asked, which an account GitHub remembers answers with a bare redirect. */
  let leftForGithub = false;
  const observe = (request: { url: () => string }): void => {
    leftForGithub ||= new URL(request.url()).hostname === 'github.com';
  };
  page.on('request', observe);
  try {
    await page.waitForURL((url) => url.hostname === 'github.com' || (leftForGithub && returned(url)), {
      timeout: 60_000,
    });
  } finally {
    page.off('request', observe);
  }
  if (returned(new URL(page.url()))) {
    return;
  }
  /* `prompt=select_account` over a signed-in GitHub session: choose another account. */
  const another = page.getByRole('link', { name: /use a different account/iu });
  if (await another.isVisible().catch(() => false)) {
    await another.click();
  }
  if (await visibleSoon(page, '#login_field', 15_000)) {
    await page.locator('#login_field').fill(required(loginName));
    await page.locator('#password').fill(required(passwordName));
    await page.locator('input[type="submit"][name="commit"]').click();
  }
  if (await visibleSoon(page, '#app_totp', 15_000)) {
    /* Six digits submit the form by themselves. */
    await page.locator('#app_totp').fill(totpCode(required(totpName)));
  }
  /* First authorization of this app by this account; later runs go straight back. */
  const authorize = page.locator('#js-oauth-authorize-btn, button[name="authorize"][value="1"]');
  if (await visibleSoon(page, '#js-oauth-authorize-btn, button[name="authorize"][value="1"]', 15_000)) {
    await authorize.first().click();
  }
  await page.waitForURL(returned, { timeout: 120_000 });
};
