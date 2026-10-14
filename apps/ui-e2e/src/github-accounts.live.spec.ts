/**
 * Two GitHub identities against a live GitHub App (GitHub capability audit
 * C10 and A4; R17, D51).
 *
 * - **C10:** with one GitHub account connected, *Add account* sends a second
 *   authorize with `prompt=select_account`, and both accounts are listed.
 * - **A4:** linking GitHub from a Tau account whose email the GitHub account
 *   does not share is refused with Better Auth's `email_doesn't_match`
 *   (`allowDifferentEmails: false`), and the Share pane says why in D51's
 *   sentence rather than "Try again". The Tau account is created per run with
 *   a random address, so the GitHub identity's email always differs.
 *
 * Both rows drive github.com itself, so they need what CI does not have yet:
 * the two identities' secrets (`#support/github-identity.js` names them) and a
 * cloud API with the GitHub App and GitHub sign-in configured for this run's
 * origin, declared by `TAU_E2E_LIVE_GITHUB=true`. Without them each row skips
 * and names exactly what is missing; the values never reach this file.
 */

import { describe, expect, inject, test } from 'vitest';
import { page as selectors } from 'vitest/browser';
import * as target from '#support/external-target.js';

const missing = inject('liveGithubMissing');

/** Why a row skipped: every missing variable by name, and what the opt-in asserts. */
const skipNote = (names: readonly string[]): string =>
  `Skipped: set ${names.join(', ')}. TAU_E2E_LIVE_GITHUB=true asserts a cloud API with the GitHub App and GitHub sign-in configured for this origin at TAU_E2E_API_URL.`;

/** A fresh Tau account for one row; its random address differs from any GitHub identity's. */
const signUpTauAccount = async (row: string): Promise<void> => {
  await target.authenticateTauTestUser({
    email: `${row}-${globalThis.crypto.randomUUID()}@e2e.tau`,
    name: `GitHub ${row.toUpperCase()} E2E`,
    password: 'Tau-test-password-7!',
  });
};

/** The picker's account list: one option per connected GitHub account. */
const listedAccounts = async (): Promise<number> => {
  await target.click(selectors.getByRole('button', { name: /^GitHub account\b/u }));
  const options = selectors.getByRole('listbox').getByRole('option');
  await target.expectVisible(options.first(), 30_000);
  const { count } = await target.read(options);
  await target.keyboardPress('Escape');
  return count;
};

describe('GitHub accounts against a live GitHub App (C10, A4)', () => {
  test('C10: Add account asks GitHub to choose an account and lists both', async (context) => {
    context.skip(missing.c10.length > 0, skipNote(missing.c10));
    await target.setViewport({ width: 1440, height: 900 });
    await signUpTauAccount('c10');
    await target.navigate('/import');

    const connect = selectors.getByRole('button', { name: 'Connect GitHub', exact: true });
    await target.expectVisible(connect, 60_000);
    await target.commands.uiAuthorizeGithub('first', connect.selector);
    await target.expectVisible(selectors.getByRole('button', { name: /^GitHub account\b/u }), 120_000);
    expect(await listedAccounts()).toBe(1);

    await target.click(selectors.getByRole('button', { name: 'GitHub account options' }));
    const addAccount = selectors.getByRole('menuitem', { name: 'Add account' });
    await target.expectVisible(addAccount);
    const added = await target.commands.uiAuthorizeGithub('second', addAccount.selector);
    expect(added.prompt, 'the second authorize lets the person choose another account').toBe('select_account');
    await target.expectVisible(selectors.getByRole('button', { name: /^GitHub account\b/u }), 120_000);
    await expect.poll(listedAccounts, { timeout: 60_000 }).toBe(2);
  });

  test('A4: a GitHub account with another email is refused in words, not "Try again"', async (context) => {
    context.skip(missing.a4.length > 0, skipNote(missing.a4));
    await target.setViewport({ width: 1440, height: 900 });
    await signUpTauAccount('a4');
    await target.navigate('/__e2e/project-file-tree');
    await target.expectUrl(/\/w\/[^/]+\/[^/]+$/u, 180_000);
    await target.click(selectors.getByRole('button', { name: 'Share', exact: true }).first());
    const share = selectors.getByRole('region', { name: 'Share project' });
    await target.expectVisible(share, 60_000);
    await target.click(share.getByRole('tab', { name: 'GitHub Gist' }));

    const connect = share.getByRole('button', { name: 'Connect GitHub', exact: true });
    await target.expectVisible(connect, 60_000);
    await target.commands.uiAuthorizeGithub('second', connect.selector);

    await target.expectVisible(
      selectors
        .getByRole('region', { name: 'Share project' })
        .getByText(
          'This GitHub account uses a different email address from your Tau account. Sign in to GitHub with an account that uses the same email, then try again.',
          { exact: true },
        ),
      120_000,
    );
    expect(
      await target.isVisible(
        selectors.getByText('GitHub authorization could not be completed. Try again.', { exact: true }),
      ),
    ).toBe(false);
  });
});
