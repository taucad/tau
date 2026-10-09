import { beforeAll, describe, expect, it } from 'vitest';
import { closeAccount, createAccount } from '#support/account.js';
import type { Account } from '#support/account.js';
import { baseUrl } from '#support/api.js';
import { openBrowser, screenshot, visibleText, withBrowser } from '#support/checkout.js';
import type { Browsing } from '#support/checkout.js';
import { billingSettings, marketingLinks, topupModal } from '#support/pages.js';
import { matrixRow, runId } from '#support/results.js';
import type { Verdict } from '#support/results.js';

/**
 * The staging commercial configuration the copy must match: tau-cloud `stacks/cloud/staging/billing-commercial.json`
 * (offers `top-up-v1` and `pro-monthly-v1`). An atom is 1/10,000 of a credit.
 */
const commercial = {
  topUp: { minimumPrincipalMinor: 500, maximumPrincipalMinor: 500_000, creditAtomsPerPrincipalMinor: 10_000 },
  pro: { principalMinor: 2000, grantCreditAtoms: 20_000_000, ceilingCreditAtoms: 40_000_000 },
} as const;
const atomsPerCredit = 10_000;

/** Whole US dollars and grouped credits as the copy prints them. */
const dollars = (minor: number): string => (minor / 100).toLocaleString('en-US');
const credits = (atoms: number): string => (atoms / atomsPerCredit).toLocaleString('en-US');

/**
 * The marketing page's text as served, with tags dropped and whitespace folded. The served links name tau.new on every
 * host, so rows read links through `marketingLinks`, as a browser shows them.
 */
const pageCopy = async (path: string): Promise<{ readonly status: number; readonly text: string }> => {
  const response = await fetch(`${baseUrl}${path}`);
  const html = await response.text();
  const text = html
    .replaceAll(/<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>/gu, ' ')
    .replaceAll(/<[^>]+>/gu, ' ')
    .replaceAll('&amp;', '&')
    .replaceAll(/\s+/gu, ' ');
  return { status: response.status, text };
};

/** The expected sentences missing from `text`, as one evidence line. */
const missing = (text: string, expected: readonly string[]): string[] =>
  expected.filter((phrase) => !text.includes(phrase));

describe('marketing funnel', () => {
  it(
    'should send "Choose Pro in Tau" to Settings → Billing on this host [MK-01 P0]',
    matrixRow('MK-01', 'P0', async (evidence): Promise<Verdict> => {
      const pricing = await withBrowser(undefined, async ({ page }) =>
        marketingLinks(page, '/pricing/', page.getByRole('link', { name: 'Choose Pro in Tau' })),
      );
      const [href] = pricing.hrefs;
      evidence.push(
        `/pricing/ ${pricing.status ?? 'no response'} in the browser: "Choose Pro in Tau" → ${href ?? 'no such link'}`,
      );
      if (href === undefined) {
        return { outcome: 'fail', defect: 'unclassified', evidence };
      }
      const target = new URL(href);
      if (target.origin !== baseUrl) {
        // Never followed: the harness does not drive another host, and tau.new is production.
        evidence.push(
          `the CTA leaves ${baseUrl} for ${target.origin} as the browser shows it (apps/www client.mjs did not point it here)`,
        );
        return { outcome: 'fail', defect: 'unclassified', evidence };
      }
      const response = await fetch(target, { redirect: 'manual' });
      const location = new URL(response.headers.get('location') ?? target.href, target);
      evidence.push(`${target.pathname} ${response.status} → ${location.pathname}${location.search}`);
      expect(`${location.pathname}${location.search}`).toBe('/?settings=billing');
      return { outcome: 'pass', evidence };
    }),
  );

  it(
    'should keep the query through the /settings/billing redirect [MK-02 P1 smoke]',
    matrixRow('MK-02', 'P1', async () => {
      const probe = `probe-${runId}`;
      const response = await fetch(`${baseUrl}/settings/billing?payment_action=${probe}`, { redirect: 'manual' });
      const location = response.headers.get('location') ?? '';
      const evidence = [
        `${response.status} location ${location}`,
        `Netlify request ${response.headers.get('x-nf-request-id') ?? 'unknown'}`,
      ];
      // No redirect at all breaks the same contract: the query cannot be carried into /?settings=billing.
      if (response.status < 300 || response.status > 399) {
        return { outcome: 'fail', defect: 'F-04', evidence: [...evidence, 'no redirect from /settings/billing'] };
      }
      const isPreserved = new URL(location, baseUrl).searchParams.get('payment_action') === probe;
      return isPreserved ? { outcome: 'pass', evidence } : { outcome: 'fail', defect: 'F-04', evidence };
    }),
  );
});

describe('marketing copy in the app', () => {
  let account: Account;
  let browsing: Browsing;

  beforeAll(async () => {
    account = await createAccount('mk');
    return async () => closeAccount(account);
  });

  beforeAll(async () => {
    browsing = await openBrowser(account);
    return async () => browsing.browser.close();
  });

  it(
    'should link the legal pages on this host [MK-03 P1]',
    matrixRow('MK-03', 'P1', async (evidence): Promise<Verdict> => {
      const { page } = browsing;
      await billingSettings(page).open();
      await billingSettings(page).addCredits();
      const terms = topupModal(page).dialog.getByRole('link', { name: 'Terms' });
      // A modal without the link, or a link without an href, fails in its own words rather than as a driver timeout.
      const href = await terms.getAttribute('href', { timeout: 15_000 }).catch(() => null);
      if (href === null) {
        evidence.push('Add credits modal has no "Terms" link with an href', await screenshot(page, 'mk-03-terms'));
        return { outcome: 'fail', defect: 'unclassified', evidence };
      }
      const { hrefs: marketing } = await withBrowser(undefined, async (visitor) =>
        marketingLinks(visitor.page, '/pricing/', visitor.page.locator('a[href*="/legal/"]')),
      );
      const legal = await fetch(`${baseUrl}/legal/terms`);
      evidence.push(
        `Add credits "Terms" → ${href}`,
        `/pricing/ legal links in the browser: ${marketing.join(', ')}`,
        `${baseUrl}/legal/terms answers ${legal.status}`,
        await screenshot(page, 'mk-03-terms'),
      );
      const foreign = [href, ...marketing].filter((link) => new URL(link, baseUrl).origin !== baseUrl);
      if (foreign.length > 0) {
        evidence.push(`${foreign.length} legal links leave ${baseUrl}: ${foreign.join(', ')}`);
        return { outcome: 'fail', defect: 'unclassified', evidence };
      }
      return { outcome: 'pass', evidence };
    }),
  );

  it(
    'should price Pro, credits and top-ups as the staging commercial configuration does [MK-04 P1]',
    matrixRow('MK-04', 'P1', async (evidence): Promise<Verdict> => {
      const { page } = browsing;
      const creditsPerDollar = (commercial.topUp.creditAtomsPerPrincipalMinor * 100) / atomsPerCredit;
      const appExpected = [
        `$${dollars(commercial.pro.principalMinor)}/month USD, plus applicable tax`,
        `${credits(commercial.pro.grantCreditAtoms)} credits every month`,
        `Unused plan credits roll over, up to ${credits(commercial.pro.ceilingCreditAtoms)}`,
        `Buy credits any time — ${creditsPerDollar} credits per US$1`,
      ];
      const wwwExpected = [
        `US$${dollars(commercial.pro.principalMinor)}`,
        `${credits(commercial.pro.grantCreditAtoms)} credits every month`,
        `Unused plan credits roll over, up to ${credits(commercial.pro.ceilingCreditAtoms)}`,
        `Credits cost US$1 per ${creditsPerDollar}, with top-ups from US$${dollars(
          commercial.topUp.minimumPrincipalMinor,
        )} to US$${dollars(commercial.topUp.maximumPrincipalMinor)}`,
      ];
      const settings = billingSettings(page);
      await settings.open();
      // The plan grid renders once entitlements resolve, after the balance card.
      await settings.subscribe().waitFor({ timeout: 60_000 });
      const appText = await visibleText(page.locator('body'));
      await settings.addCredits();
      const modal = topupModal(page);
      await modal.chooseAmount(7);
      const input = modal.dialog.getByLabel('Custom amount');
      const bounds = [await input.getAttribute('min'), await input.getAttribute('max')];
      const www = await pageCopy('/pricing/');
      const appMissing = missing(appText, appExpected);
      const wwwMissing = missing(www.text, wwwExpected);
      const proCard = await visibleText(
        page
          .locator('div')
          .filter({ hasText: /^Pro Plan/u })
          .last(),
      );
      evidence.push(
        `app plan cards: ${appMissing.length === 0 ? 'all of' : 'missing'} ${JSON.stringify(appMissing.length === 0 ? appExpected : appMissing)}`,
        ...(appMissing.length === 0 ? [] : [`app Pro card reads "${proCard.slice(0, 400)}"`]),
        `top-up amount bounds ${bounds.join('–')} dollars`,
        `/pricing/ ${www.status}: ${wwwMissing.length === 0 ? 'all of' : 'missing'} ${JSON.stringify(wwwMissing.length === 0 ? wwwExpected : wwwMissing)}`,
        await screenshot(page, 'mk-04-topup-bounds'),
      );
      expect(bounds).toEqual([
        String(commercial.topUp.minimumPrincipalMinor / 100),
        String(commercial.topUp.maximumPrincipalMinor / 100),
      ]);
      expect(appMissing).toEqual([]);
      expect(wwwMissing).toEqual([]);
      return { outcome: 'pass', evidence };
    }),
  );
});
