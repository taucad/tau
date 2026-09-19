/* oxlint-disable typescript/no-restricted-types -- `null` is the wire's own signed-out and unauthorized value; swapping it for `undefined` would stop modelling what the API returns. */
/**
 * Browser runtime proof of the offline usage contract (C13-C, closing C10-U6).
 *
 * Everything under test is the real production UI build served by the harness:
 * the prerendered `/usage` document, the generated offline-shell worker
 * (C10-U5) and the `tau-billing` snapshot store (C10-U4). The API is *not*
 * running — it is stubbed at the page's `fetch` boundary — and the two ways it
 * can be unreachable are kept apart on purpose:
 *
 * - **API unreachable, origin up** exercises the saved-snapshot half (B4 R4/R5):
 *   the document still comes from the server, so the shell is not involved.
 * - **Everything offline** (`context.setOffline`) is the shell's own contract
 *   (B5 R4): only CacheStorage can answer the navigation.
 *
 * After the first visit the worker is active, so every later navigation goes
 * through it, on the manifest path `/usage` itself: the server answers it with
 * `301 → /usage/`, and the worker must store and pass through that document
 * without its redirect identity (see the `both the origin and the API
 * unreachable` case, which pins exactly that).
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
  readCachedShellDocument,
  readOfflineShellManifest,
  readPurgeMessages,
  readShellCaches,
  setTargetOffline,
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

/** The manifest document path; the server answers it with `301 → /usage/`, which the worker must absorb. */
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
  `Offline — saved usage for ${subjectIdFor(account)}, last updated ${asOf}. Reconnect for the latest usage.`;

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

/**
 * Whether the harness is serving a cloud build.
 *
 * `TAU_CLOUD_ENABLED=true` is a *build-time* input: without it `app/routes.ts`
 * drops the `/usage` route and `react-router.config.ts`'s `buildEnd` never
 * generates the offline shell, so there is no contract here to be right or
 * wrong about. Asked of the served bytes rather than of this runner's
 * environment, because an Nx dependency task inherits only the caller's
 * environment — the build that is running is the only thing that decides.
 */
const cloudBuildServed = async (): Promise<boolean> => {
  await target.navigate('/offline-shell-worker.js');
  return target.evaluate(async () => {
    const response = await fetch('/offline-shell-worker.js');
    return response.ok;
  });
};

describe('Offline usage contract', () => {
  beforeEach(async ({ skip }) => {
    skip(
      !(await cloudBuildServed()),
      'The harness is serving a self-host UI build, which has no /usage route and no offline shell: rerun after `TAU_CLOUD_ENABLED=true nx run ui:build`.',
    );
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
    expect(await readText(creditsUsed, 'secondary')).toBe('1.23 credits');
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
    expect(await readText(creditsUsed)).toBe('1.23 credits');

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

  test('should serve the usage shell with both the origin and the API unreachable', async () => {
    await signInAndSave(accountA);
    const shell = await waitForOfflineShell();
    expect(shell).toMatch(/^tau-offline-shell-/u);

    const stored = await readCachedShellDocument('/usage');
    // A navigation request's redirect mode is `manual`, so a stored response carrying
    // the redirect flag is a network error the moment the worker replays it — which is
    // what `express.static`'s `/usage` → `/usage/` directory redirect leaves behind.
    expect(stored, 'the shell must store the usage document as a non-redirected response').toMatchObject({
      redirected: false,
      status: 200,
    });

    // The worker is active from here on, so this navigation goes through it while the
    // origin is still up: a shell that cannot replay its document breaks `/usage` online
    // too, not only offline.
    await target.navigate('/usage');
    await target.expectVisible(freshness, 60_000);

    await setTargetOffline(true);
    await target.openSecondary(servedUsagePath);

    const asOf = await formatInstantInPage(snapshotA.asOf, 'secondary');
    await target.expectVisible(freshness, 60_000, 'secondary');
    await expect.poll(async () => freshnessText('secondary'), { timeout: 60_000 }).toBe(savedLine(accountA, asOf));
    expect(await readText(creditsUsed, 'secondary')).toBe('1.23 credits');
    await target.screenshot('body', 'usage-offline-cold-start.png', 'secondary');
  });

  test('should keep the session and the usage payload out of CacheStorage', async () => {
    await signInAndSave(accountA);
    const shellCache = await waitForOfflineShell();

    const report = await readShellCaches([stubSessionToken, accountA.userId, subjectIdFor(accountA), snapshotA.asOf]);

    expect(report.leakedMarkers).toEqual([]);
    expect(report.cacheNames).toEqual([shellCache]);
    // Exactly U5's generated allowlist — its static assets, its neutral prerendered
    // documents and the readiness sentinel written last. Nothing else is cached at
    // all, so no API response can be.
    const manifest = await readOfflineShellManifest();
    expect([...report.entryUrls].sort()).toEqual(
      [...manifest.assets, ...manifest.documents, `/__tau-offline-shell/${manifest.version}.ready`].sort(),
    );
    expect(manifest.documents).toEqual(['/usage']);
    expect(manifest.assets.filter((path) => !path.startsWith('/'))).toEqual([]);
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
    expect(await readText(creditsUsed)).toBe('1.23 credits');
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
    expect(await readText(creditsUsed)).toBe('1.23 credits');
    await target.expectVisible(offlineSaving, 30_000);
    expect(await readText(offlineSaving)).toBe('Saving usage for offline viewing is unavailable on this device.');
  });
});
