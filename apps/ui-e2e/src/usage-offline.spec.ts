/* oxlint-disable typescript/no-restricted-types -- `null` is the wire's own signed-out and unauthorized value; swapping it for `undefined` would stop modelling what the API returns. */
/**
 * Browser runtime proof of the saved-usage contract (C13-C, closing C10-U6), on the one adaptive build (adaptive app
 * deployment mode W12).
 *
 * Everything under test is the real production UI build served by the harness: the function-rendered `/usage` page
 * and the `tau-billing` snapshot store (C10-U4). The API is *not* running: it is stubbed at the page's `fetch`
 * boundary, deployment answer included (funded). With the API unreachable and the origin up, the page follows this
 * install's remembered funded record and shows the saved snapshot (B4 R4/R5). The prerendered offline `/usage` shell was
 * retired with the `cloud` build, so no row takes the origin offline.
 */
import { beforeEach, describe, expect, test } from 'vitest';
import { page as selectors } from 'vitest/browser';
import * as target from '#support/external-target.js';
import type { TargetSelector, TargetSurface } from '#support/external-target.js';
import {
  accountA,
  accountB,
  formatInstantInPage,
  installBillingApiStub,
  installPurgeChannelRecorder,
  installUncachedViewOverride,
  readBillingStore,
  readOfflineShellManifest,
  readPurgeMessages,
  readShellCaches,
  stubSessionToken,
  subjectIdFor,
  usageSnapshotFixture,
  waitForOfflineShell,
} from '#support/billing-usage-fixture.js';
import type { StubbedAccount } from '#support/billing-usage-fixture.js';

const freshness = selectors.getByTestId('usage-freshness');
const offlineSaving = selectors.getByTestId('usage-offline-saving');
const creditsUsed = selectors.getByTestId('credits-used');
const modelsFilter = selectors.getByRole('button', { name: /Models/u });

/** The usage page's URL. */
const servedUsagePath = '/usage';

const snapshotA = usageSnapshotFixture(accountA);
const snapshotB = usageSnapshotFixture(accountB, { asOf: '2026-09-11T22:15:00.000Z', snapshotRevision: '9' });

const readText = async (selector: TargetSelector, surface?: TargetSurface): Promise<string | null> => {
  const state = await target.read(selector, undefined, surface);
  return state.text;
};
const freshnessText = async (surface?: TargetSurface): Promise<string | null> => readText(freshness, surface);
const savedKeys = async (surface?: TargetSurface): Promise<readonly string[]> => {
  const store = await readBillingStore(surface);
  return store.snapshotKeys;
};
const savedLine = (account: StubbedAccount, asOf: string): string =>
  `Offline — saved usage for ${subjectIdFor(account)}, last updated ${asOf}. Go online for the latest usage.`;

/** Signs in online and waits until the page has both rendered and saved the snapshot. */
const signInAndSave = async (account: StubbedAccount, snapshot = snapshotA): Promise<void> => {
  await installBillingApiStub({ environment: 'development', account, snapshot });
  await target.navigate('/usage');
  await target.expectVisible(freshness, 60_000);
  await expect.poll(freshnessText, { timeout: 60_000 }).toMatch(/^Updated /u);
  await expect
    .poll(
      async () => {
        const keys = await savedKeys();
        return keys.filter((key) => key.includes(account.userId)).length;
      },
      { timeout: 30_000 },
    )
    .toBe(1);
};

/** Re-arms the stub with the API unreachable, so a new page starts with no resolvable session. */
const cutTheApi = async (account: StubbedAccount, snapshot = snapshotA): Promise<void> => {
  await installBillingApiStub({ environment: 'development', account, snapshot, apiReachable: false });
};

describe('Offline usage contract', () => {
  beforeEach(async () => {
    // The offline contract is the service worker's: open the target with it allowed.
    await target.commands.uiOpenTarget({ serviceWorker: true });
  });

  test('should render the saved snapshot with its server instant when a cold page cannot reach the API', async () => {
    await signInAndSave(accountA);
    const asOf = await formatInstantInPage(snapshotA.asOf);

    await cutTheApi(accountA);
    await target.openSecondary(servedUsagePath);

    await target.expectVisible(freshness, 60_000, 'secondary');
    await expect.poll(async () => freshnessText('secondary'), { timeout: 60_000 }).toBe(savedLine(accountA, asOf));
    // The saved amounts render: never a sign-in prompt, a stuck loader or zero usage.
    await target.expectVisible(creditsUsed, 30_000, 'secondary');
    expect(await readText(creditsUsed, 'secondary')).toBe('1 credit used');
    // Filters are request state the server applies; offline there is nothing to re-request.
    await target.expectCount(modelsFilter, 0, 10_000, 'secondary');
    await target.screenshot('body', 'usage-saved-cold-start.png', 'secondary');
  });

  test('should keep serving a saved view and never show an uncached one as zero usage', async () => {
    await signInAndSave(accountA);
    const asOf = await formatInstantInPage(snapshotA.asOf);

    // The same canonical query, reloaded with no API at all, is still served.
    await cutTheApi(accountA);
    await target.reload();
    await expect.poll(freshnessText, { timeout: 60_000 }).toBe(savedLine(accountA, asOf));
    expect(await readText(creditsUsed)).toBe('1 credit used');

    // A view this device never saved — the record key carries the canonical query,
    // and a different reported time zone is a different query.
    await installUncachedViewOverride();
    await target.openSecondary(servedUsagePath);
    await target.expectVisible(freshness, 60_000, 'secondary');
    const uncached = await freshnessText('secondary');
    expect(uncached).not.toContain('Offline — saved usage');
    await target.expectCount(creditsUsed, 0, 10_000, 'secondary');
    await target.screenshot('body', 'usage-uncached-view.png', 'secondary');
    // Recorded rather than pinned to a wording: the limit has to be explained, and what
    // this build actually says is the lane report's finding.
    await target.writeArtifact('usage-uncached-view.txt', `${String(uncached)}\n`);
  });

  test('should keep the session and the usage payload out of CacheStorage', async () => {
    await signInAndSave(accountA);
    const shellCache = await waitForOfflineShell();

    const report = await readShellCaches([stubSessionToken, accountA.userId, subjectIdFor(accountA), snapshotA.asOf]);

    expect(report.leakedMarkers).toEqual([]);
    // The precache, and the cache of hashed files used once; nothing else is cached at all.
    expect(report.cacheNames.filter((name) => name !== shellCache && name !== 'tau-assets')).toEqual([]);
    // The precache holds the generated list: the registry's documents and their interactive tiers.
    const entries = await readOfflineShellManifest();
    const precache = entries.map((entry) => entry.url);
    expect(precache).not.toContain('/usage/index.html');
    expect(report.entryUrls).toEqual(expect.arrayContaining(precache));
    // Anything else is a hashed or digest-addressed file cached on first use, never an API, auth or data response.
    expect(
      report.entryUrls.filter((url) => !precache.includes(url) && !/^\/(?:assets|csharp-language)\//u.test(url)),
    ).toEqual([]);
  });

  test('should leave no saved usage behind after a sign-out', async () => {
    await signInAndSave(accountA);

    await target.navigate('/auth/sign-out');
    await expect
      .poll(async () => readBillingStore(), { timeout: 60_000 })
      .toEqual({ exists: true, snapshotKeys: [], profile: undefined });

    // Reopening with no reachable API must not resurrect the signed-out account's usage.
    await installBillingApiStub({
      environment: 'development',
      account: null,
      snapshot: null,
      apiReachable: false,
    });
    await target.openSecondary(servedUsagePath);

    await target.expectVisible(freshness, 60_000, 'secondary');
    await expect
      .poll(async () => freshnessText('secondary'), { timeout: 30_000 })
      .toBe('Sign in to see your Tau usage.');
    await target.expectCount(creditsUsed, 0, 10_000, 'secondary');
    expect(await readBillingStore('secondary')).toEqual({ exists: true, snapshotKeys: [], profile: undefined });
  });

  test('should keep only the newly bound account and announce the purge to the other tab', async () => {
    await signInAndSave(accountA);
    await installPurgeChannelRecorder();
    await target.openSecondary(servedUsagePath);
    await target.expectVisible(freshness, 60_000, 'secondary');

    await installBillingApiStub({ environment: 'development', account: accountB, snapshot: snapshotB });
    await target.reload();
    await expect.poll(freshnessText, { timeout: 60_000 }).toMatch(/^Updated /u);

    await expect
      .poll(async () => readPurgeMessages('secondary'), { timeout: 30_000 })
      .toContainEqual({ keep: { environment: 'development', ownerId: accountB.userId } });
    await target.closeSecondary();

    await expect.poll(async () => savedKeys(), { timeout: 30_000 }).toEqual([expect.stringContaining(accountB.userId)]);
    const store = await readBillingStore();
    expect(store.profile?.subjectId).toBe(subjectIdFor(accountB));
    expect(store.profile?.environment).toBe('development');
    expect(store.snapshotKeys.join('|')).not.toContain(accountA.userId);
  });

  test('should report a quota failure while online usage still renders', async () => {
    await installBillingApiStub({ environment: 'development', account: accountA, snapshot: snapshotA });
    await target.addInitScript(() => {
      const { put } = IDBObjectStore.prototype;
      IDBObjectStore.prototype.put = function (this: IDBObjectStore, value: unknown, key?: IDBValidKey) {
        if (this.name === 'usageSnapshots') {
          throw new DOMException('Simulated origin quota', 'QuotaExceededError');
        }
        return put.call(this, value, key);
      };
    });

    await target.navigate('/usage');

    await expect.poll(freshnessText, { timeout: 60_000 }).toMatch(/^Updated /u);
    expect(await readText(creditsUsed)).toBe('1 credit used');
    await target.expectVisible(offlineSaving, 30_000);
    expect(await readText(offlineSaving)).toBe('Not enough storage to keep this usage for offline viewing.');
    await target.screenshot('body', 'usage-offline-quota-exceeded.png');
  });

  test('should report unavailable offline storage while online usage still renders', async () => {
    await installBillingApiStub({ environment: 'development', account: accountA, snapshot: snapshotA });
    await target.addInitScript(() => {
      const { open } = IDBFactory.prototype;
      IDBFactory.prototype.open = function (this: IDBFactory, name: string, version?: number) {
        if (name !== 'tau-billing') {
          return open.call(this, name, version);
        }
        const request = { onerror: undefined } as unknown as IDBOpenDBRequest;
        setTimeout(() => {
          request.onerror?.(new Event('error'));
        }, 0);
        return request;
      };
    });

    await target.navigate('/usage');

    await expect.poll(freshnessText, { timeout: 60_000 }).toMatch(/^Updated /u);
    expect(await readText(creditsUsed)).toBe('1 credit used');
    await target.expectVisible(offlineSaving, 30_000);
    expect(await readText(offlineSaving)).toBe('Saving usage for offline viewing is unavailable on this device.');
  });
});
