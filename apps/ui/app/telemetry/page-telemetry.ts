/**
 * Runtime telemetry for one page: the browser editor, a shared page, or the desktop renderer (runtime observability
 * PR-3, `host-browser.ts`). One reporter per page; every runtime client the page or its workers open reports into it.
 *
 * - **Who reports** (AR-W4-02, AR-W5-01): a Tau Cloud build (`tauTelemetryHostCloud`), or any build signed in to the
 *   API it is configured for. A reporter sends only to the page's own `TAU_API_URL`, so a self-host build never
 *   reaches Tau Cloud; a deployment that has not answered the entry-free policy probe `on` receives nothing else.
 * - **Consent** (AR-W4-03): one most-restrictive-wins rule over GPC, the analytics-cookie decision, the sticky device
 *   preference and, signed in, the account's `allowsUsageMetrics`.
 * - **Identity** (AR-W15-06, AR-W16-07, FR-19): three-state, from the same `useSession` the user menu reads, pinned on
 *   the account id and never on the session cookie. While it is unresolved every entry is held (256, drop-oldest);
 *   a page that never resolves drains as signed-out after 15 minutes.
 * - **Worker facts** (AR-W16-03, AR-W17-02): a client is asked for `facts` only once the policy is `on`; on `off` the
 *   page stops listening and listens again when the cached answer expires (FR-22).
 *
 * The legacy observability middleware is untouched and ungated until PR-7 (AR-W4-13).
 *
 * @module
 */

import {
  createIngestReporter,
  isCloudHost,
  resolveTelemetryConsent,
  toLateEntry,
  toRuntimeEntry,
  toViewerEntry,
} from '@taucad/telemetry/client';
import type {
  CachedTelemetryPolicy,
  DevicePreference,
  HostDeployment,
  IngestReporter,
  ReportingConsent,
  RuntimeEntryContext,
  RuntimeIngestEntry,
  RuntimeLateInput,
  RuntimeObservationInput,
  ViewerEventInput,
  TelemetryPolicyStore,
} from '@taucad/telemetry/client';

/** The page's identity, three-state (AR-W15-06). Never the session token. */
export type BrowserIdentity =
  | Readonly<{ kind: 'unresolved' }>
  | Readonly<{ kind: 'signed-in'; accountId: string }>
  | Readonly<{ kind: 'signed-out' }>;

/** The analytics-cookie decision (`@taucad/consent`); the desktop renderer has none and stays `unknown`. */
export type AnalyticsDecision = 'accepted' | 'declined' | 'unknown';

/** Who issued an attempt on this page. */
export type PageCaller = 'editor' | 'agent' | 'geospec' | 'quicklook' | 'converter' | 'capture' | 'viewer';

/** The observable part of a runtime client; `observe` is absent on adapters that never ask for worker facts. */
export type ObservedRuntimeClient = {
  observe?: (mode: 'facts' | 'off') => void;
  on(event: 'operation', handler: (observation: RuntimeObservationInput) => void): () => void;
  on(event: 'operation-late', handler: (late: RuntimeLateInput) => void): () => void;
  terminate(): void;
};

/** The page context forwarded to a page worker (agent host, GeoSpec runner), which maps its own observations. */
export type PageTelemetryContext = Omit<RuntimeEntryContext, 'caller'>;

/** What a page composition reads from its environment; injected so the rules are testable. */
export type PageTelemetryDependencies = Readonly<{
  /** The compile-time Cloud-host signal (`#cloud/telemetry-host`). */
  cloudBuild: boolean;
  /** The desktop renderer (route `desktop`, platform `electron`). */
  isDesktop: boolean;
  /** The page's own API origin; `undefined` before the environment is known. */
  apiUrl: () => string | undefined;
  release: () => string;
  device: () => 'constrained' | 'standard';
  platform: () => 'chromium' | 'firefox' | 'webkit' | 'electron';
  os: () => 'windows' | 'macos' | 'linux' | 'ios' | 'android' | 'other';
  globalPrivacyControl: () => boolean;
  /** The sticky three-state device preference (`tau-telemetry`). */
  readDevicePreference: () => DevicePreference;
  writeDevicePreference: (value: DevicePreference) => void;
  /** `localStorage`, or `undefined` where it is unavailable. */
  storage: () => Pick<Storage, 'getItem' | 'setItem' | 'removeItem'> | undefined;
  /** Desktop only: `telemetry:consent` to main on every resolved change; a no-op on the web. */
  notifyDesktopMain: (consent: ReportingConsent) => void;
  fetch?: typeof globalThis.fetch;
}>;

/** One page's runtime telemetry. */
export type PageTelemetry = Readonly<{
  /** The resolved consent under the one rule. */
  consent: () => ReportingConsent;
  /** The page's entry context, without a caller. */
  context: () => PageTelemetryContext;
  /** The reporter, composed once the host predicate holds. */
  ensureReporter: () => IngestReporter | undefined;
  /** Every producer on the page records through this. */
  record: (entry: RuntimeIngestEntry) => void;
  /** An entry a page worker mapped and forwarded; anything else is ignored. */
  recordForwarded: (entry: unknown) => void;
  /** FR-17: one closed viewer event. */
  recordViewerEvent: (input: ViewerEventInput) => void;
  /** Report a runtime client's attempts under `caller`; returns the unsubscribe. */
  observeRuntimeClient: (client: ObservedRuntimeClient, caller: PageCaller) => () => void;
  /** A consent input changed. */
  onConsentInputsChanged: (input: Readonly<{ updatePending: boolean }>) => void;
  /** `pagehide`: settle clients unless the page entered the back/forward cache, then flush with keepalive. */
  pageHide: (persisted: boolean) => void;
  /** The context a page worker stamps on its entries, or `undefined` when nothing would be recorded. */
  workerContext: () => PageTelemetryContext | undefined;
  setIdentity: (next: BrowserIdentity) => void;
  setServerPreference: (value: boolean | undefined) => void;
  setAnalyticsDecision: (value: AnalyticsDecision) => void;
  /** `visibilitychange: hidden` and `freeze`: send what is ready, without keepalive. */
  flush: () => Promise<void>;
  /** The current hold, for tests and diagnostics. */
  heldCount: () => number;
}>;

/** Entries held while the identity is unresolved (AR-W15-06). */
export const pageHoldBound = 256;
/** Milliseconds before an unresolved page drains its hold as signed-out (AR-W16-07). */
export const pageHoldDrainAfter = 15 * 60_000;
/** Milliseconds of the first and the longest wait before listening again after a policy `off` (FR-22). */
export const pageReprobe = { first: 15 * 60_000, cap: 4 * 60 * 60_000 } as const;
/** Where the count of entries a page dropped at unload waits for the next page load (AR-W16-07). */
export const heldAtUnloadKey = 'tau-telemetry-held-at-unload';
/** The per-browser policy cache key prefix; one entry per API origin (AR-W17-02). */
export const policyCacheKeyPrefix = 'tau-telemetry-policy:';

const forwardedNames: ReadonlySet<string> = new Set(['runtime.operation', 'runtime.late']);

/**
 * Whether a value is a cached policy answer.
 *
 * @param value - The parsed value.
 * @returns Whether it is one.
 */
const isCachedPolicy = (value: unknown): value is CachedTelemetryPolicy =>
  typeof value === 'object' &&
  value !== null &&
  'policy' in value &&
  (value.policy === 'on' || value.policy === 'off') &&
  'expiresAt' in value &&
  typeof value.expiresAt === 'number';

/**
 * Compose the page's runtime telemetry.
 *
 * @param deps - The page's environment.
 * @returns The page composition.
 */
// oxlint-disable-next-line max-lines-per-function -- one composition: the reporter, its hold, its lifecycle.
export const createPageTelemetry = (deps: PageTelemetryDependencies): PageTelemetry => {
  let identity: BrowserIdentity = { kind: 'unresolved' };
  /** Set when an unresolved page drained as signed-out; cleared by a real resolution. */
  let assumedSignedOut = false;
  let serverPreference: boolean | undefined;
  let analytics: AnalyticsDecision = 'unknown';
  let reporter: IngestReporter | undefined;
  let policy: 'on' | 'off' | 'unknown' = 'unknown';
  let listening = true;
  let reprobeWait: number = pageReprobe.first;
  let reprobeTimer: ReturnType<typeof setTimeout> | undefined;
  let drainTimer: ReturnType<typeof setTimeout> | undefined;
  const held: RuntimeIngestEntry[] = [];
  let heldDropped = 0;
  let lastConsent: ReportingConsent | undefined;
  let lastServer: boolean | undefined;
  let lastUpdatePending = false;
  type Observed = { client: ObservedRuntimeClient; caller: PageCaller; detach: (() => void) | undefined };
  /* Held weakly: a client the page dropped without unsubscribing (a finished conversion) is not kept alive here. */
  const observedReferences = new Set<WeakRef<ObservedRuntimeClient>>();
  const observedEntries = new WeakMap<ObservedRuntimeClient, Observed>();
  const observed = (): Observed[] => {
    const alive: Observed[] = [];
    for (const ref of observedReferences) {
      const client = ref.deref();
      const entry = client === undefined ? undefined : observedEntries.get(client);
      if (entry === undefined) {
        observedReferences.delete(ref);
      } else {
        alive.push(entry);
      }
    }
    return alive;
  };

  const effectiveIdentity = (): BrowserIdentity =>
    identity.kind === 'unresolved' && assumedSignedOut ? { kind: 'signed-out' } : identity;
  const accountId = (): string | undefined => {
    const current = effectiveIdentity();
    return current.kind === 'signed-in' ? current.accountId : undefined;
  };

  const context = (): PageTelemetryContext => ({
    route: deps.isDesktop ? 'desktop' : 'browser',
    release: deps.release(),
    device: deps.device(),
    platform: deps.isDesktop ? 'electron' : deps.platform(),
    os: deps.os(),
  });

  /** The one rule, with the page's inputs. Signed out, `server` is `'none'`, so the result is never `unknown`. */
  const consent = (): ReportingConsent => {
    const { kind } = effectiveIdentity();
    return resolveTelemetryConsent({
      globalPrivacyControl: deps.globalPrivacyControl(),
      analytics,
      device: deps.readDevicePreference(),
      server: kind === 'signed-in' ? serverPreference : kind === 'signed-out' ? 'none' : undefined,
    });
  };

  const deployment = (): HostDeployment => ({
    cloudBuild: deps.cloudBuild,
    selfHostServing: false,
    signedIn: effectiveIdentity().kind === 'signed-in',
    ci: false,
    explicitOptIn: false,
  });

  const policyStore = (origin: string): TelemetryPolicyStore => {
    const key = `${policyCacheKeyPrefix}${origin}`;
    return {
      read: () => {
        try {
          const raw = deps.storage()?.getItem(key);
          const value: unknown = raw === null || raw === undefined ? undefined : JSON.parse(raw);
          return isCachedPolicy(value) ? { policy: value.policy, expiresAt: value.expiresAt } : undefined;
        } catch {
          return undefined;
        }
      },
      write: (value) => {
        try {
          deps.storage()?.setItem(key, JSON.stringify(value));
        } catch {
          /* Best effort: a blocked store re-probes on the next page load. */
        }
      },
    };
  };

  const takeHeldAtUnload = (): number => {
    try {
      const store = deps.storage();
      const count = Number(store?.getItem(heldAtUnloadKey) ?? 0);
      store?.removeItem(heldAtUnloadKey);
      return Number.isFinite(count) ? count : 0;
    } catch {
      return 0;
    }
  };

  const attach = (entry: Observed): void => {
    if (entry.detach !== undefined) {
      return;
    }
    const scoped: RuntimeEntryContext = { ...context(), caller: entry.caller };
    const offOperation = entry.client.on('operation', (observation) => {
      if (wantsEntries()) {
        record(toRuntimeEntry(observation, scoped));
      }
    });
    const offLate = entry.client.on('operation-late', (late) => {
      if (wantsEntries()) {
        record(toLateEntry(late, scoped));
      }
    });
    entry.detach = () => {
      offOperation();
      offLate();
    };
  };
  const detach = (entry: Observed): void => {
    entry.detach?.();
    entry.detach = undefined;
  };

  /**
   * `on`: ask every client for worker facts. `off`: tell them `off`, stop listening (the settle sites build nothing)
   * and listen again once the cached answer has expired, so a page re-probes on its next settle (FR-22).
   */
  const applyPolicy = (next: 'on' | 'off'): void => {
    policy = next;
    if (reprobeTimer !== undefined) {
      clearTimeout(reprobeTimer);
      reprobeTimer = undefined;
    }
    for (const entry of observed()) {
      entry.client.observe?.(next === 'on' ? 'facts' : 'off');
    }
    if (next === 'on') {
      reprobeWait = pageReprobe.first;
      listening = true;
      for (const entry of observed()) {
        attach(entry);
      }
      return;
    }
    listening = false;
    for (const entry of observed()) {
      detach(entry);
    }
    const origin = deps.apiUrl();
    const cached = origin === undefined ? undefined : policyStore(origin).read();
    const wait = Math.max(reprobeWait, (cached?.expiresAt ?? 0) - Date.now());
    reprobeWait = Math.min(reprobeWait * 2, pageReprobe.cap);
    reprobeTimer = setTimeout(() => {
      reprobeTimer = undefined;
      policy = 'unknown';
      listening = true;
      for (const entry of observed()) {
        attach(entry);
      }
    }, wait);
  };

  /** Composed when the predicate holds; re-evaluated on sign-in. Never torn down on sign-out. */
  const ensureReporter = (): IngestReporter | undefined => {
    const origin = deps.apiUrl();
    if (reporter !== undefined || origin === undefined || !isCloudHost(deployment())) {
      return reporter;
    }
    reporter = createIngestReporter({
      endpoint: `${origin}/v1/telemetry/ingest`,
      policyEndpoint: `${origin}/v1/telemetry/policy`,
      route: context().route,
      identity: accountId,
      consent,
      merge: 'default',
      policyStore: policyStore(origin),
      ...(deps.fetch === undefined ? {} : { fetch: deps.fetch }),
    });
    reporter.noteDropped('held-at-unload', takeHeldAtUnload());
    reporter.onPolicy(applyPolicy);
    return reporter;
  };

  /** Whether a settle should build an entry at all: held while unresolved, else only for a composed reporter. */
  const wantsEntries = (): boolean =>
    listening && (effectiveIdentity().kind === 'unresolved' || ensureReporter() !== undefined);

  const drainHeld = (target: IngestReporter): void => {
    for (const pending of held.splice(0)) {
      target.record(pending);
    }
    if (heldDropped > 0) {
      target.noteHeldDropped(heldDropped);
      heldDropped = 0;
    }
  };

  const clearDrainTimer = (): void => {
    if (drainTimer !== undefined) {
      clearTimeout(drainTimer);
      drainTimer = undefined;
    }
  };

  /** Every producer on the page records through this. */
  const record = (entry: RuntimeIngestEntry): void => {
    if (effectiveIdentity().kind === 'unresolved') {
      if (held.length >= pageHoldBound) {
        held.shift();
        heldDropped += 1;
      }
      held.push(entry);
      drainTimer ??= setTimeout(() => {
        drainTimer = undefined;
        assumedSignedOut = true;
        settle();
      }, pageHoldDrainAfter);
      return;
    }
    const target = ensureReporter();
    if (target === undefined) {
      held.length = 0; // Not a reporting host: nothing is sent, nothing is kept.
      heldDropped = 0;
      return;
    }
    drainHeld(target);
    target.record(entry);
    /* After a re-probe that answered `off` again the reporter announces nothing new, so read its cache. */
    const origin = deps.apiUrl();
    const cached = policy === 'unknown' && origin !== undefined ? policyStore(origin).read() : undefined;
    if (cached?.policy === 'off' && cached.expiresAt > Date.now()) {
      applyPolicy('off');
    }
  };

  /** The identity settled (or was assumed signed-out): drain the hold through the same path. */
  const settle = (): void => {
    if (effectiveIdentity().kind === 'unresolved') {
      return;
    }
    clearDrainTimer();
    const target = ensureReporter();
    if (target === undefined) {
      held.length = 0;
      heldDropped = 0;
      return;
    }
    drainHeld(target);
  };

  const setIdentity = (next: BrowserIdentity): void => {
    const changed =
      next.kind !== identity.kind ||
      (next.kind === 'signed-in' && identity.kind === 'signed-in' && next.accountId !== identity.accountId);
    identity = next;
    if (next.kind !== 'unresolved') {
      assumedSignedOut = false;
    }
    if (changed) {
      settle();
    }
  };

  /**
   * A consent input changed (sign-in, the switch, GPC, the cookie banner, a server value). Mirrors a server `false`
   * into the sticky device store on the TRANSITION, never in render and never while the user's own update is pending
   * (AR-W5-02); re-checks the host predicate; tells desktop main on every resolved change (AR-W4-03c).
   *
   * @param input - Whether a preference update is in flight.
   */
  const onConsentInputsChanged = (input: Readonly<{ updatePending: boolean }>): void => {
    lastUpdatePending = input.updatePending;
    const server = effectiveIdentity().kind === 'signed-in' ? serverPreference : undefined;
    if (server === false && lastServer !== false && !input.updatePending) {
      deps.writeDevicePreference('off');
    }
    lastServer = server;
    settle();
    ensureReporter();
    const next = consent();
    if (next !== lastConsent) {
      lastConsent = next;
      deps.notifyDesktopMain(next);
    }
  };

  /**
   * Report every attempt a runtime client settles, under `caller`. Attach before `connect()` so `initialize` is seen.
   *
   * @param client - The client.
   * @param caller - Who issues its attempts.
   * @returns The unsubscribe.
   */
  const observeRuntimeClient = (client: ObservedRuntimeClient, caller: PageCaller): (() => void) => {
    const entry: Observed = { client, caller, detach: undefined };
    const ref = new WeakRef(client);
    observedReferences.add(ref);
    observedEntries.set(client, entry);
    if (listening) {
      attach(entry);
    }
    if (policy === 'on') {
      client.observe?.('facts');
    }
    return () => {
      observedReferences.delete(ref);
      observedEntries.delete(client);
      detach(entry);
    };
  };

  /**
   * FR-17: one closed viewer event; nothing about the scene leaves.
   *
   * @param input - The event.
   */
  const recordViewerEvent = (input: ViewerEventInput): void => {
    if (wantsEntries()) {
      record(toViewerEntry(input, { ...context(), caller: 'viewer' }));
    }
  };

  /**
   * An entry a page worker mapped from its own client (agent host, GeoSpec runner). Fire-and-forget; anything that is
   * not an operation or late entry is ignored, and the ingest validates the rest.
   *
   * @param entry - The forwarded entry.
   */
  const recordForwarded = (entry: unknown): void => {
    if (
      typeof entry === 'object' &&
      entry !== null &&
      'name' in entry &&
      typeof entry.name === 'string' &&
      forwardedNames.has(entry.name) &&
      'detail' in entry &&
      typeof entry.detail === 'object' &&
      entry.detail !== null &&
      wantsEntries()
    ) {
      record(entry as RuntimeIngestEntry);
    }
  };

  /**
   * The context a page worker stamps on its entries, or `undefined` when nothing would be recorded, so a worker on a
   * page that is not a Cloud host maps nothing.
   *
   * @returns The context.
   */
  const workerContext = (): PageTelemetryContext | undefined => (wantsEntries() ? context() : undefined);

  /**
   * Page exit (R15, AR-W1-03): settle in-flight attempts first so they are observed as `abandoned`, then flush with
   * one keepalive request. Entries still held for an unresolved identity are dropped and counted for the next page.
   *
   * @param persisted - Whether the page entered the back/forward cache (its clients stay alive).
   */
  const pageHide = (persisted: boolean): void => {
    if (!persisted) {
      for (const entry of observed()) {
        entry.client.terminate();
      }
    }
    if (held.length > 0) {
      try {
        const store = deps.storage();
        const previous = Number(store?.getItem(heldAtUnloadKey) ?? 0);
        store?.setItem(heldAtUnloadKey, String((Number.isFinite(previous) ? previous : 0) + held.length + heldDropped));
      } catch {
        /* Best effort: the count is lost with the page. */
      }
      held.length = 0;
      heldDropped = 0;
    }
    void reporter?.flush({ reason: 'pagehide' });
  };

  return {
    consent,
    context,
    ensureReporter,
    record,
    recordForwarded,
    recordViewerEvent,
    observeRuntimeClient,
    onConsentInputsChanged,
    pageHide,
    workerContext,
    setIdentity,
    setServerPreference: (value: boolean | undefined): void => {
      serverPreference = value;
    },
    /** The cookie banner decided; re-resolves at once, keeping the last known update-pending state. */
    setAnalyticsDecision: (value: AnalyticsDecision): void => {
      if (value !== analytics) {
        analytics = value;
        onConsentInputsChanged({ updatePending: lastUpdatePending });
      }
    },
    /** `visibilitychange: hidden` and `freeze`: send what is ready, without keepalive. */
    flush: async (): Promise<void> => {
      await reporter?.flush({ reason: 'interval' });
    },
    /** The current hold, for tests and diagnostics. */
    heldCount: (): number => held.length,
  };
};
