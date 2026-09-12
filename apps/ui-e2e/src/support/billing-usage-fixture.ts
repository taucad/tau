/* oxlint-disable tau-lint/no-direct-indexeddb -- Browser tests inspect the persisted billing-snapshot contract itself. */
/* oxlint-disable eslint/no-await-in-loop -- CacheStorage entries are enumerated in order, one stored body at a time. */
/* oxlint-disable typescript/consistent-type-definitions -- the Vitest command contract is an augmentable interface, as `external-target.ts` declares it. */
/* oxlint-disable typescript/no-restricted-types -- `null` is the wire's own signed-out and unauthorized value; swapping it for `undefined` would stop modelling what the API returns. */
/* oxlint-disable no-restricted-imports -- the fixture has to be the billing wire's own schema, and `apps/ui-e2e` has no manifest or path mapping to reach `@taucad/billing` through, so the two imports below are relative. */
import { server } from 'vitest/browser';
import * as target from '#support/external-target.js';
// eslint-disable-next-line @nx/enforce-module-boundaries -- see the file header
import { wireUsageSnapshotSchema } from '../../../libs/billing/src/index.ts';
// eslint-disable-next-line @nx/enforce-module-boundaries -- see the file header
import type { WireUsageSnapshot } from '../../../libs/billing/src/index.ts';

declare module 'vitest/browser' {
  interface BrowserCommands {
    uiAddContextInitScript(source: string, argument?: unknown): Promise<void>;
    uiSetTargetOffline(offline: boolean): Promise<void>;
  }
}

/** The signed-in account the stubbed `/v1/auth/get-session` reports. */
export type StubbedAccount = {
  readonly userId: string;
  readonly email: string;
  readonly name: string;
};

/** What the stubbed API answers with for the next document this context opens. */
export type BillingApiStub = {
  readonly environment: 'development' | 'staging' | 'prod-us' | 'prod-eu';
  /** `null` is a **confirmed** signed-out session, not an unreachable one. */
  readonly account: StubbedAccount | null;
  /** Body for `GET /v1/billing/usage`; `null` answers 401. */
  readonly snapshot: WireUsageSnapshot | null;
  /**
   * `false` makes every `/v1/` call reject the way an unreachable host does
   * while the origin itself stays up — the cold-start half of B5 R4 without
   * the offline shell in the way.
   */
  readonly apiReachable?: boolean;
};

/** Two accounts whose saved usage must never be visible to one another. */
export const accountA: StubbedAccount = {
  userId: 'usage-e2e-owner-a',
  email: 'usage-e2e-a@tau.invalid',
  name: 'Usage E2E A',
};
export const accountB: StubbedAccount = {
  userId: 'usage-e2e-owner-b',
  email: 'usage-e2e-b@tau.invalid',
  name: 'Usage E2E B',
};

/** Session token the stub issues; the CacheStorage sweep searches stored bodies for it. */
export const stubSessionToken = 'usage-e2e-session-token-3f9c';

/** {@link BillingApiStub} plus the values the serialized script cannot close over. */
type BillingApiStubPayload = BillingApiStub & { readonly sessionToken: string };

/** `subjectId` is the account label the offline freshness line falls back to (C10-U4 §7). */
export const subjectIdFor = (account: StubbedAccount): string => `${account.userId}-account`;

/**
 * One validated `GET /v1/billing/usage` body.
 *
 * Parsed through the wire schema the page and the snapshot store both re-parse
 * with, so an invalid fixture fails here rather than as an empty page.
 *
 * @param account - Owner the snapshot belongs to.
 * @param options - Overrides for the server instant and account revision.
 * @returns The validated snapshot.
 */
export const usageSnapshotFixture = (
  account: StubbedAccount,
  options: { readonly asOf?: string; readonly snapshotRevision?: string } = {},
): WireUsageSnapshot => {
  const asOf = options.asOf ?? '2026-09-12T04:05:06.000Z';
  const subjectId = subjectIdFor(account);
  const envelope = { schemaVersion: 1, environment: 'development', ownerId: account.userId, subjectId } as const;
  const groupTotals = { accountDeltaCreditAtoms: '-12345', netUsedCreditAtoms: '12345', eventCount: '1' } as const;
  return wireUsageSnapshotSchema.parse({
    ...envelope,
    snapshotRevision: options.snapshotRevision ?? '7',
    asOf,
    query: {
      preset: 'custom',
      fromDate: '2026-09-01',
      toDate: '2026-09-13',
      timeZone: 'UTC',
      models: [],
      activities: [],
      projects: [],
    },
    coverage: {
      historyStart: null,
      legacyBefore: null,
      complete: true,
      detailComplete: true,
      excludedUnknownTimeCount: '0',
    },
    availability: { state: 'available', reason: null },
    totals: groupTotals,
    rows: {
      items: [
        {
          ...envelope,
          operationId: `op-${account.userId}`,
          baseTransactionId: `txn-${account.userId}`,
          terminalRevision: '7',
          policyVersion: 'policy-1',
          activationId: 'activation-1',
          meterContractId: 'meter-1',
          category: 'llm',
          model: { id: 'openai-gpt-5.6-luna', displayName: 'Luna', providerId: 'openai' },
          activity: { kind: 'agent', projectHint: 'project-a', chatHint: 'chat-a', parentAttemptKey: null },
          historyVersion: 1,
          admittedAt: asOf,
          dispatchIntentAt: asOf,
          usageOccurredAt: asOf,
          evidenceOccurredAt: asOf,
          timingStatus: 'dispatch_intent',
          kind: 'base',
          resolvedAt: asOf,
          executionStatus: 'succeeded',
          customerState: 'settled',
          authorizedMaxCreditAtoms: '20000',
          chargedCreditAtoms: '12345',
          accountDeltaCreditAtoms: '-12345',
          meteringStatus: 'complete',
          meterItems: [],
          tokens: {
            status: 'complete',
            uncachedInput: '1000',
            cacheRead: '0',
            cacheWrite: '0',
            inputTotal: '1000',
            output: '50',
            reasoning: '10',
          },
        },
      ],
      nextCursor: null,
      complete: true,
    },
    days: { items: [{ day: '2026-09-12', ...groupTotals }], nextCursor: null, complete: true },
    models: {
      items: [{ modelId: 'openai-gpt-5.6-luna', modelDisplayName: 'Luna', ...groupTotals }],
      nextCursor: null,
      complete: true,
    },
    activities: { items: [{ activity: 'agent', ...groupTotals }], nextCursor: null, complete: true },
  });
};

/**
 * Page-side stub installed before any application module evaluates.
 *
 * Two jobs the harness cannot do from Node: inject `TAU_BILLING_ENVIRONMENT`
 * (the built document carries the build host's `window.ENV`, and only a value
 * present *before* the document's own env script survives its merge), and
 * answer the API at the `fetch` boundary so no API process is needed. While the
 * context is offline every `/v1/` call rejects the way an unreachable host
 * does, which is what makes "offline" mean both the origin and the API.
 */
const billingApiStubScript = (stub: BillingApiStubPayload): void => {
  const host = globalThis as unknown as { ENV?: Record<string, unknown> };
  // eslint-disable-next-line @typescript-eslint/naming-convention -- injected client environment key
  host.ENV = { ...host.ENV, TAU_BILLING_ENVIRONMENT: stub.environment };
  const fetchFromNetwork = globalThis.fetch.bind(globalThis);
  const json = (body: unknown, status = 200): Response =>
    new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
  globalThis.fetch = async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    const requestUrl = new URL(input instanceof Request ? input.url : String(input), location.href);
    if (!requestUrl.pathname.startsWith('/v1/')) {
      return fetchFromNetwork(input, init);
    }
    if (!navigator.onLine || stub.apiReachable === false) {
      throw new TypeError('Failed to fetch');
    }
    if (requestUrl.pathname === '/v1/auth/get-session') {
      return stub.account === null
        ? json(null)
        : json({
            session: {
              id: `session-${stub.account.userId}`,
              userId: stub.account.userId,
              token: stub.sessionToken,
              expiresAt: '2099-01-01T00:00:00.000Z',
              createdAt: '2026-01-01T00:00:00.000Z',
              updatedAt: '2026-01-01T00:00:00.000Z',
            },
            user: {
              id: stub.account.userId,
              email: stub.account.email,
              name: stub.account.name,
              emailVerified: true,
              image: null,
              createdAt: '2026-01-01T00:00:00.000Z',
              updatedAt: '2026-01-01T00:00:00.000Z',
            },
          });
    }
    if (requestUrl.pathname === '/v1/auth/sign-out') {
      return json({ success: true });
    }
    if (requestUrl.pathname === '/v1/billing/usage') {
      return stub.snapshot === null ? json({ message: 'Unauthorized' }, 401) : json(stub.snapshot);
    }
    // Everything else fails fast rather than hanging on a port nothing listens on.
    return json({ message: 'Not stubbed' }, 503);
  };
};

/**
 * Arms the stubbed API for every document this browser context opens from now
 * on, including pages created later.
 *
 * Calling it again re-arms it: the newest script wraps the previous one, so the
 * latest answer wins. That is how an account switch and a sign-out are staged.
 *
 * @param stub - What the next document's API should answer.
 * @returns Resolves once the script is registered on the context.
 */
export const installBillingApiStub = async (stub: BillingApiStub): Promise<void> => {
  await server.commands.uiAddContextInitScript(billingApiStubScript.toString(), {
    ...stub,
    sessionToken: stubSessionToken,
  });
};

/**
 * Cuts the whole browser context off from the network.
 *
 * @param offline - `true` to make both the origin and the API unreachable.
 * @returns Resolves once the context is in that state.
 */
export const setTargetOffline = async (offline: boolean): Promise<void> => {
  await server.commands.uiSetTargetOffline(offline);
};

/** What the `tau-billing` database holds, from the page's own origin. */
export type BillingStoreState = {
  readonly exists: boolean;
  readonly snapshotKeys: readonly string[];
  readonly profile: { readonly environment: string; readonly subjectId: string } | undefined;
};

/**
 * Reads the C10-U4 store without importing an application module.
 *
 * @param surface - Which open page to read from.
 * @returns The record keys and the selected local profile.
 */
export const readBillingStore = async (surface?: 'primary' | 'secondary'): Promise<BillingStoreState> =>
  target.evaluate(
    async () => {
      const databases = await indexedDB.databases();
      if (!databases.some(({ name }) => name === 'tau-billing')) {
        return { exists: false, snapshotKeys: [], profile: undefined };
      }
      const db = await new Promise<IDBDatabase>((resolve, reject) => {
        const request = indexedDB.open('tau-billing');
        request.addEventListener(
          'success',
          () => {
            resolve(request.result);
          },
          { once: true },
        );
        request.addEventListener(
          'error',
          () => {
            reject(request.error ?? new Error('Failed to open the billing snapshot database'));
          },
          { once: true },
        );
      });
      const result = async <T>(request: IDBRequest<T>): Promise<T> =>
        new Promise<T>((resolve, reject) => {
          request.addEventListener(
            'success',
            () => {
              resolve(request.result);
            },
            { once: true },
          );
          request.addEventListener(
            'error',
            () => {
              reject(request.error ?? new Error('Failed to read the billing snapshot database'));
            },
            { once: true },
          );
        });
      try {
        if (!db.objectStoreNames.contains('usageSnapshots')) {
          return { exists: true, snapshotKeys: [], profile: undefined };
        }
        const snapshotKeys = await result<IDBValidKey[]>(
          db.transaction('usageSnapshots').objectStore('usageSnapshots').getAllKeys(),
        );
        const profile = await result<unknown>(
          db.transaction('selectedProfile').objectStore('selectedProfile').get('selected'),
        );
        return {
          exists: true,
          snapshotKeys: snapshotKeys.map(String),
          profile: profile as BillingStoreState['profile'],
        };
      } finally {
        db.close();
      }
    },
    undefined,
    surface,
  );

/** One CacheStorage entry, with whether its body carried a searched-for secret. */
export type ShellCacheReport = {
  readonly cacheNames: readonly string[];
  readonly entryUrls: readonly string[];
  readonly leakedMarkers: readonly string[];
};

/**
 * Enumerates every CacheStorage entry this origin holds and searches each
 * stored body for the markers that would prove account data was cached.
 *
 * @param markers - Distinctive strings from the session and usage payloads.
 * @param surface - Which open page to read from.
 * @returns Cache names, entry URLs, and any marker found in a stored body.
 */
export const readShellCaches = async (
  markers: readonly string[],
  surface?: 'primary' | 'secondary',
): Promise<ShellCacheReport> =>
  target.evaluate(
    async (searched: readonly string[]) => {
      const cacheNames = await caches.keys();
      const entryUrls: string[] = [];
      const leakedMarkers = new Set<string>();
      for (const cacheName of cacheNames) {
        const cache = await caches.open(cacheName);
        const requests = await cache.keys();
        for (const request of requests) {
          entryUrls.push(new URL(request.url).pathname);
          const response = await cache.match(request);
          const body = response === undefined ? '' : await response.text();
          for (const marker of searched) {
            if (body.includes(marker)) {
              leakedMarkers.add(marker);
            }
          }
        }
      }
      return { cacheNames, entryUrls, leakedMarkers: [...leakedMarkers] };
    },
    markers,
    surface,
  );

/**
 * Waits until the offline shell has installed one complete version.
 *
 * Readiness is the sentinel the worker writes last, so a partially populated
 * cache never counts as installed.
 *
 * @param timeout - How long to wait.
 * @returns The installed shell version.
 */
export const waitForOfflineShell = async (timeout = 120_000): Promise<string> => {
  await target.waitFor(
    async () => {
      const names = await caches.keys();
      const shell = names.find((name) => name.startsWith('tau-offline-shell-'));
      if (shell === undefined) {
        return false;
      }
      const cache = await caches.open(shell);
      const version = shell.slice('tau-offline-shell-'.length);
      return (await cache.match(`/__tau-offline-shell/${version}.ready`)) !== undefined;
    },
    undefined,
    { timeout },
  );
  return target.evaluate(async () => {
    // A controlled navigation needs an *active* worker, not only a complete cache.
    await navigator.serviceWorker.ready;
    const names = await caches.keys();
    return names.find((name) => name.startsWith('tau-offline-shell-')) ?? '';
  });
};

/**
 * Records every `tau-financial-session-purge` announcement a page receives.
 *
 * Registered on the context, so a page opened afterwards observes the purge a
 * later account switch in another tab announces.
 *
 * @returns Resolves once the recorder is registered.
 */
export const installPurgeChannelRecorder = async (): Promise<void> => {
  await server.commands.uiAddContextInitScript(
    ((): void => {
      const received: unknown[] = [];
      (globalThis as unknown as { __tauPurgeMessages?: unknown[] }).__tauPurgeMessages = received;
      new BroadcastChannel('tau-financial-session-purge').addEventListener('message', (event: MessageEvent) => {
        received.push(event.data);
      });
    }).toString(),
  );
};

/**
 * Reads what {@link installPurgeChannelRecorder} observed in one page.
 *
 * @param surface - Which open page to read from.
 * @returns The announcements, oldest first.
 */
export const readPurgeMessages = async (surface?: 'primary' | 'secondary'): Promise<readonly unknown[]> =>
  target.evaluate(
    () => (globalThis as unknown as { __tauPurgeMessages?: unknown[] }).__tauPurgeMessages ?? [],
    undefined,
    surface,
  );

/**
 * Reports a different IANA zone, so the canonical usage query — and therefore
 * the snapshot record key — names a view this device never saved.
 *
 * @returns Resolves once the override is registered on the context.
 */
export const installUncachedViewOverride = async (): Promise<void> => {
  await server.commands.uiAddContextInitScript(
    ((): void => {
      const { resolvedOptions } = Intl.DateTimeFormat.prototype;
      Intl.DateTimeFormat.prototype.resolvedOptions = function (
        this: Intl.DateTimeFormat,
      ): Intl.ResolvedDateTimeFormatOptions {
        return { ...resolvedOptions.call(this), timeZone: 'Pacific/Kiritimati' };
      };
    }).toString(),
  );
};

/**
 * Formats an instant the way the freshness line does, inside the page, so the
 * assertion carries the *server* `asOf` rather than a value re-derived in Node
 * under a different locale or zone.
 *
 * @param instant - The snapshot's `asOf`.
 * @param surface - Which open page to format in.
 * @returns The rendered instant.
 */
export const formatInstantInPage = async (instant: string, surface?: 'primary' | 'secondary'): Promise<string> =>
  target.evaluate((value: string) => new Date(value).toLocaleString(), instant, surface);

/** How the shell cache stored one of its prerendered documents. */
export type CachedShellDocument = {
  readonly redirected: boolean;
  readonly status: number;
  readonly url: string;
};

/**
 * Reads a shell document straight out of CacheStorage.
 *
 * A navigation request's redirect mode is `manual`, so a stored response whose
 * `redirected` flag is set can never be replayed to one.
 *
 * @param path - Manifest path of the document, e.g. `/usage`.
 * @returns The stored response's identity, or `undefined` when it is absent.
 */
export const readCachedShellDocument = async (path: string): Promise<CachedShellDocument | undefined> =>
  target.evaluate(async (documentPath: string) => {
    const names = await caches.keys();
    const shell = names.find((name) => name.startsWith('tau-offline-shell-'));
    if (shell === undefined) {
      return undefined;
    }
    const cache = await caches.open(shell);
    const stored = await cache.match(documentPath);
    return stored === undefined ? undefined : { redirected: stored.redirected, status: stored.status, url: stored.url };
  }, path);

/** The build-generated allowlist injected into the worker's own bytes. */
export type OfflineShellManifest = {
  readonly version: string;
  readonly documents: readonly string[];
  readonly assets: readonly string[];
};

/**
 * Reads the allowlist the build generated, from the served worker.
 *
 * The manifest is an `esbuild` `define` baked into `offline-shell-worker.js`,
 * so this is the deployed allowlist itself rather than a copy of it.
 *
 * @returns The version, documents and assets the worker may cache.
 */
export const readOfflineShellManifest = async (): Promise<OfflineShellManifest> =>
  target.evaluate(async () => {
    const response = await fetch('/offline-shell-worker.js');
    const source = await response.text();
    const list = (key: string): string[] => {
      const match = new RegExp(`${key}: (\\[[^\\]]*\\])`, 'u').exec(source);
      if (match?.[1] === undefined) {
        throw new Error(`The served offline shell worker has no ${key} allowlist`);
      }
      return JSON.parse(match[1]) as string[];
    };
    const version = /version: "([^"]+)"/u.exec(source)?.[1];
    if (version === undefined) {
      throw new Error('The served offline shell worker has no version');
    }
    return { version, documents: list('documents'), assets: list('assets') };
  });
