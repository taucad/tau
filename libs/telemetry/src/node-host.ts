/**
 * One runtime telemetry composition for every Node host (runtime observability PR-3, `host-node.ts`): desktop main,
 * the CLI, `tau mcp`, and the cloud host container (`tau serve` run as a cloud agent host). A host composes a reporter
 * only when it is a Tau Cloud host (`isCloudHost`): never `tau serve` or its runtime children (`TAU_SERVE_ROLE`), never
 * CI, and an anonymous CLI only after `tau telemetry on`. The reporter sends only to the host's own `TAU_API_URL`.
 *
 * - **Identity** (AR-W9-01, AR-W10-01, AR-W11-02, AR-W12-01): `readIdentity` never rejects; one read starts at host
 *   start (`startIdentityBootstrap`), every entry before the first resolved read is held (256, 15 min, drop-oldest,
 *   counted), and the reporter re-reads identity at every send. The bearer reaches only the ingest POST.
 * - **Consent**: the one rule over the device preference (`TAU_TELEMETRY`, `DO_NOT_TRACK`, `tau telemetry`), the
 *   account's `allowsUsageMetrics` when signed in (held until it answers), and on desktop the renderer's resolved
 *   consent.
 * - **Worker facts**: asked for only once the policy is `on`; told `off` otherwise.
 *
 * Nothing here throws into a host or keeps a process alive.
 *
 * @module
 */

import {
  createIngestReporter,
  isCloudHost,
  nodeOsClass,
  resolveTelemetryConsent,
  toLateEntry,
  toRuntimeEntry,
} from '#client.js';
import type {
  HostDeployment,
  IngestReporter,
  ReportingConsent,
  RuntimeEntryContext,
  RuntimeIngestEntry,
  RuntimeLateInput,
  RuntimeObservationInput,
  TauIdentity,
} from '#client.js';
import { nodeTelemetryPreference } from '#node.js';
import type { ResolvedTelemetryPreference, TelemetryPreference } from '#node.js';

/** A Node host's route. @public */
export type NodeHostRoute = 'desktop' | 'cli' | 'mcp' | 'daemon' | 'cloud';

/** The observable part of a runtime client on a Node host. @public */
export type NodeObservedClient = {
  observe?: (mode: 'facts' | 'off') => void;
  on(event: 'operation', handler: (observation: RuntimeObservationInput) => void): () => void;
  on(event: 'operation-late', handler: (late: RuntimeLateInput) => void): () => void;
};

/** What a Node host composition reads from its process. @public */
export type NodeHostTelemetryInput = Readonly<{
  route: NodeHostRoute;
  /** The host's own release: the desktop app version, the CLI's installed version. */
  release: string;
  /** The host's configured API origin; the only place a reporter sends. */
  apiOrigin: string;
  /** The CLI config directory, where `tau telemetry on|off` writes. */
  configDir: string;
  env: Readonly<Record<string, string | undefined>>;
  /** Desktop main's compile-time `tauTelemetryHostCloud`; a literal `false` on every other Node host (AR-W11-01). */
  cloudBuild: boolean;
  /** Never rejects (AR-W12-01): signed-in with its bearer, signed-out, or a typed `unresolved`. */
  readIdentity: () => Promise<TauIdentity>;
  /** Desktop main: the renderer's resolved consent as last received; `undefined` before any renderer reported. */
  rendererConsent?: () => ReportingConsent | undefined;
  /** Written once per installation before the first batch, naming `tau telemetry off` (AR-W4-18). */
  firstRunNotice?: () => void;
  /** `process.platform`. */
  platform: string;
  fetch?: typeof globalThis.fetch;
  now?: () => number;
}>;

/** The pre-resolution hold's bounds (AR-W11-02, AR-W12-01). @public */
export const nodeHoldBounds = { entries: 256, maxAge: 15 * 60_000, backoffFirst: 1000, backoffCap: 60_000 } as const;

/** Milliseconds a shutdown flush may take before the process exits anyway. @public */
export const nodeShutdownWait = 2000;

/** What `tau telemetry status` prints. @public */
export type NodeTelemetryStatus = Readonly<{
  preference: ResolvedTelemetryPreference['preference'];
  source: ResolvedTelemetryPreference['source'];
  cloudHost: boolean;
  consent: ReportingConsent;
}>;

/** A Node host's runtime telemetry. @public */
export type NodeHostTelemetry = Readonly<{
  /** Start the one identity read; idempotent, never awaited, never rejects. */
  startIdentityBootstrap: () => void;
  /** Every producer on the host records through this. */
  record: (entry: RuntimeIngestEntry) => void;
  /** Report every attempt `client` settles under `caller`; returns the unsubscribe. */
  observe: (client: NodeObservedClient, caller: string) => () => void;
  /** The host's context for a builder, under `caller`. */
  context: (caller: string) => RuntimeEntryContext;
  /** The reporter, once the host qualifies. */
  ensureReporter: () => IngestReporter | undefined;
  /** `tau telemetry status`. */
  status: () => NodeTelemetryStatus;
  /** `tau telemetry on|off`. */
  setPreference: (preference: TelemetryPreference) => Promise<void>;
  /** Flush once, bounded by {@link nodeShutdownWait}. */
  shutdown: () => Promise<void>;
  /** Entries the pre-resolution hold dropped, for the CLI ledger. */
  droppedBeforeIdentity: () => number;
}>;

/** Where a Node host's bearer comes from: `TAU_AUTH_TOKEN`, the OS keyring, or desktop main's in-memory session. @public */
export type TauTokenRead = () => Promise<
  Readonly<{ kind: 'token'; token: string }> | Readonly<{ kind: 'none' }> | Readonly<{ kind: 'unavailable' }>
>;

/**
 * `readTauIdentity` over a token source (AR-W9-01, AR-W12-01): the principal through `get-session` once per token,
 * cached as one (token, principal) pair compared by value and replaced on change. Never rejects: no credential, or a
 * 401/403 for the one there is, is `signed-out`; a keyring fault is `keyring-error`; an unreachable API is `offline`;
 * any other answer that is not a session is `session-failed`.
 *
 * @param input - The API origin, the token source and the fetch.
 * @returns The provider.
 * @public
 */
export const createTauIdentityReader = (
  input: Readonly<{ apiOrigin: string; readToken: TauTokenRead; fetch?: typeof globalThis.fetch }>,
): (() => Promise<TauIdentity>) => {
  const send = input.fetch ?? globalThis.fetch.bind(globalThis);
  const { origin } = new URL(input.apiOrigin);
  let cached: Readonly<{ token: string; principal: string | undefined }> | undefined;
  return async () => {
    let read: Awaited<ReturnType<TauTokenRead>>;
    try {
      read = await input.readToken();
    } catch {
      return { kind: 'unresolved', reason: 'keyring-error' };
    }
    if (read.kind === 'unavailable') {
      return { kind: 'unresolved', reason: 'keyring-error' };
    }
    if (read.kind === 'none') {
      return { kind: 'signed-out' };
    }
    const authorization = `Bearer ${read.token}`;
    if (cached?.token === read.token) {
      return cached.principal === undefined
        ? { kind: 'signed-out' }
        : { kind: 'signed-in', authorization, principalId: cached.principal };
    }
    let response: Response;
    try {
      response = await send(`${origin}/v1/auth/get-session`, {
        method: 'GET',
        headers: { authorization },
        redirect: 'error',
        signal: AbortSignal.timeout(15_000),
      });
    } catch {
      return { kind: 'unresolved', reason: 'offline' };
    }
    if (response.status === 401 || response.status === 403) {
      cached = { token: read.token, principal: undefined };
      return { kind: 'signed-out' };
    }
    let body: unknown;
    try {
      body = response.ok ? await response.json() : undefined;
    } catch {
      body = undefined;
    }
    if (response.ok && body === null) {
      cached = { token: read.token, principal: undefined };
      return { kind: 'signed-out' };
    }
    const principal =
      typeof body === 'object' &&
      body !== null &&
      'user' in body &&
      typeof body.user === 'object' &&
      body.user !== null &&
      'id' in body.user &&
      typeof body.user.id === 'string' &&
      body.user.id !== ''
        ? body.user.id
        : undefined;
    if (principal === undefined) {
      return { kind: 'unresolved', reason: 'session-failed' };
    }
    cached = { token: read.token, principal };
    return { kind: 'signed-in', authorization, principalId: principal };
  };
};

const privacySchemaGuard = (value: unknown): boolean | undefined =>
  typeof value === 'object' &&
  value !== null &&
  'allowsUsageMetrics' in value &&
  typeof value.allowsUsageMetrics === 'boolean'
    ? value.allowsUsageMetrics
    : undefined;

/**
 * Compose a Node host's runtime telemetry. Lazy: nothing is composed until a producer records or the bootstrap
 * resolves, so a host imports this before its preference, its auth or its renderer is known.
 *
 * @param input - The host's process inputs.
 * @returns The composition.
 * @public
 */
// oxlint-disable-next-line max-lines-per-function -- one composition: identity, hold, consent, reporter, lifecycle.
export const createNodeHostTelemetry = (input: NodeHostTelemetryInput): NodeHostTelemetry => {
  const now = input.now ?? Date.now;
  const send = input.fetch ?? globalThis.fetch.bind(globalThis);
  const preference = nodeTelemetryPreference({
    env: input.env,
    configDir: input.configDir,
    apiOrigin: input.apiOrigin,
  });
  const cloudHostMarker = input.env['TAU_CLOUD_HOST'] === '1';
  const { origin } = new URL(input.apiOrigin);

  let lastPrincipal: string | undefined;
  let lastAuthorization: string | undefined;
  let resolvedOnce = false;
  let serverPreference: boolean | undefined;
  let serverPreferenceFor: string | undefined;
  let reporter: IngestReporter | undefined;
  let bootstrapStarted = false;
  const held: Array<Readonly<{ heldAt: number; entry: RuntimeIngestEntry }>> = [];
  let heldDropped = 0;

  const signedInAsLastSeen = (): boolean =>
    resolvedOnce ? lastPrincipal !== undefined : Boolean(input.env['TAU_AUTH_TOKEN']);

  /** `GET /v1/privacy` with the bearer, once per principal; `undefined` until it answers (held as `unknown`). */
  const loadServerPreference = async (principal: string, authorization: string): Promise<void> => {
    if (serverPreferenceFor === principal) {
      return;
    }
    serverPreferenceFor = principal;
    serverPreference = undefined;
    try {
      const response = await send(`${origin}/v1/privacy`, {
        method: 'GET',
        headers: { authorization, accept: 'application/json' },
        redirect: 'error',
        signal: AbortSignal.timeout(15_000),
      });
      const value = response.ok ? privacySchemaGuard(await response.json()) : undefined;
      if (serverPreferenceFor === principal) {
        /* An older API omits the field; its column default is on. */
        serverPreference = response.ok ? (value ?? true) : undefined;
        if (!response.ok) {
          serverPreferenceFor = undefined;
        }
      }
    } catch {
      if (serverPreferenceFor === principal) {
        serverPreferenceFor = undefined;
      }
    }
  };

  /** The one identity read; only a resolved answer updates the last-known principal. */
  const identityAtSend = async (): Promise<TauIdentity> => {
    let identity: TauIdentity;
    try {
      identity = await input.readIdentity();
    } catch {
      identity = { kind: 'unresolved', reason: 'provider-threw' };
    }
    if (identity.kind === 'unresolved') {
      return identity;
    }
    resolvedOnce = true;
    if (identity.kind === 'signed-in') {
      lastPrincipal = identity.principalId;
      lastAuthorization = identity.authorization;
      void loadServerPreference(identity.principalId, identity.authorization);
    } else {
      lastPrincipal = undefined;
      lastAuthorization = undefined;
    }
    return identity;
  };

  const deployment = (): HostDeployment => ({
    cloudBuild: input.cloudBuild,
    selfHostServing: input.env['TAU_SERVE_ROLE'] !== undefined && !cloudHostMarker,
    signedIn: signedInAsLastSeen(),
    ci: input.env['CI'] !== undefined && input.env['CI'] !== '' && input.env['CI'] !== 'false',
    explicitOptIn: preference.current().explicitOptIn || cloudHostMarker,
  });

  const consent = (): ReportingConsent =>
    resolveTelemetryConsent({
      globalPrivacyControl: false,
      analytics: 'unknown',
      device: preference.current().preference,
      server: signedInAsLastSeen() ? serverPreference : 'none',
      ...(input.rendererConsent === undefined ? {} : { renderer: input.rendererConsent() }),
    });

  /** The bearer rides the ingest POST only; the policy probe stays credential-free. */
  const fetchWithBearer: typeof globalThis.fetch = async (url, init) =>
    send(url, {
      ...init,
      ...(init?.method === 'POST' && lastAuthorization !== undefined
        ? { headers: { ...(init.headers as Record<string, string> | undefined), authorization: lastAuthorization } }
        : {}),
      credentials: 'omit',
    });

  const ensureReporter = (): IngestReporter | undefined => {
    if (reporter !== undefined) {
      return reporter;
    }
    if (!isCloudHost(deployment()) || consent() === 'denied') {
      return undefined;
    }
    try {
      input.firstRunNotice?.();
    } catch {
      /* A notice that cannot be written never stops telemetry or the host. */
    }
    reporter = createIngestReporter({
      endpoint: `${origin}/v1/telemetry/ingest`,
      policyEndpoint: `${origin}/v1/telemetry/policy`,
      route: input.route,
      identity: () => lastPrincipal,
      identityAtSend,
      consent,
      heldDropped: () => heldDropped,
      fetch: fetchWithBearer,
      ...(input.now === undefined ? {} : { now: input.now }),
    });
    return reporter;
  };

  const expireHeld = (at: number): void => {
    while (held[0] !== undefined && at - held[0].heldAt > nodeHoldBounds.maxAge) {
      held.shift();
      heldDropped += 1;
    }
  };

  const drain = (): void => {
    const target = ensureReporter();
    for (const { entry } of held.splice(0)) {
      target?.record(entry);
    }
    if (target === undefined) {
      heldDropped = 0;
    }
  };

  const startIdentityBootstrap = (): void => {
    if (bootstrapStarted) {
      return;
    }
    bootstrapStarted = true;
    const attempt = async (retryDelay: number): Promise<void> => {
      try {
        const result = await identityAtSend();
        expireHeld(now());
        if (result.kind === 'unresolved') {
          setTimeout(() => {
            void attempt(Math.min(retryDelay * 2, nodeHoldBounds.backoffCap));
          }, retryDelay).unref();
          return;
        }
        drain();
      } catch {
        /* Telemetry never throws into a host. */
      }
    };
    void attempt(nodeHoldBounds.backoffFirst);
  };

  const record = (entry: RuntimeIngestEntry): void => {
    try {
      if (!resolvedOnce) {
        const at = now();
        expireHeld(at);
        if (held.length >= nodeHoldBounds.entries) {
          held.shift();
          heldDropped += 1;
        }
        held.push({ heldAt: at, entry });
        startIdentityBootstrap();
        return;
      }
      ensureReporter()?.record(entry);
    } catch {
      /* Telemetry never throws into a host. */
    }
  };

  const context = (caller: string): RuntimeEntryContext => ({
    route: input.route,
    caller,
    release: input.release,
    platform: input.route === 'desktop' ? 'electron' : 'node',
    os: nodeOsClass(input.platform),
  });

  const subscribe = (client: NodeObservedClient, caller: string): (() => void) => {
    const scoped = context(caller);
    const offOperation = client.on('operation', (observation) => {
      if (preference.current().preference !== 'off') {
        record(toRuntimeEntry(observation, scoped));
      }
    });
    const offLate = client.on('operation-late', (late) => {
      if (preference.current().preference !== 'off') {
        record(toLateEntry(late, scoped));
      }
    });
    /* Worker facts only once this host's API is known to record; a self-host API answers `off` once. */
    let offPolicy: (() => void) | undefined;
    const listenPolicy = (): void => {
      offPolicy ??= ensureReporter()?.onPolicy((policy) => {
        client.observe?.(policy === 'on' ? 'facts' : 'off');
      });
    };
    listenPolicy();
    const offFirst = client.on('operation', () => {
      listenPolicy();
    });
    return () => {
      client.observe?.('off');
      offPolicy?.();
      offFirst();
      offOperation();
      offLate();
    };
  };

  /** A client that cannot be subscribed to is left unobserved; telemetry never throws into a host. */
  const observe = (client: NodeObservedClient, caller: string): (() => void) => {
    try {
      return subscribe(client, caller);
    } catch {
      return () => undefined;
    }
  };

  return {
    startIdentityBootstrap,
    record,
    observe,
    context,
    ensureReporter,
    status: () => {
      const current = preference.current();
      return {
        preference: current.preference,
        source: current.source,
        cloudHost: isCloudHost(deployment()),
        consent: consent(),
      };
    },
    setPreference: async (next) => preference.write(next),
    shutdown: async () => {
      if (reporter === undefined) {
        return;
      }
      let timer: ReturnType<typeof setTimeout> | undefined;
      await Promise.race([
        reporter.flush({ reason: 'shutdown' }).catch(() => undefined),
        new Promise<void>((resolve) => {
          timer = setTimeout(resolve, nodeShutdownWait);
          timer.unref();
        }),
      ]);
      clearTimeout(timer);
    },
    droppedBeforeIdentity: () => heldDropped,
  };
};
