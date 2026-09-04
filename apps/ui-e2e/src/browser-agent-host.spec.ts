import { describe, expect, test } from 'vitest';
import { page as selectors, server } from 'vitest/browser';
import * as target from '#support/external-target.js';
import { readOpfsTree, readProjectStorageState, readProjectTree } from '#support/project-storage-state.js';

type TestBackend = 'indexeddb' | 'opfs' | 'webaccess';
/**
 * `'home'` = whichever Home backend this browser session actually pinned.
 *
 * OPFS is a *session* capability, not a browser API: WebKit exposes
 * `navigator.storage.getDirectory` everywhere but rejects it with `UnknownError`
 * in an ephemeral (private-browsing) session — and `browser.newContext()`, which
 * this harness opens per test, is exactly that. Home then pins to IndexedDB, so
 * a vertical that is not *about* OPFS must follow the pin instead of naming a
 * backend that will never exist on that browser.
 */
type ActiveBackend = TestBackend | 'home';

/** OPFS subdirectory that stands in for a picked local folder (headless has no picker). */
const workspaceFixture = 'browser-host-workspace';
const seedRoute = '/__e2e/project-file-tree';
const composer = '[aria-label="Ask Tau to build anything..."]';
const partialText = 'Browser host started the workspace change.';
const finalText = 'Browser host completed the workspace change.';
/** The Anthropic-wire model the retry menu switches to (search term: `haiku`). */
const retryModel = 'anthropic-claude-haiku-4.5';

const ensureChatOpen = async (): Promise<void> => {
  // Give hydration a moment to restore a persisted-open chat lane first —
  // toggling too early flips an open (but not-yet-rendered) lane closed.
  try {
    await target.expectVisible(selectors.getByCss(composer), 10_000);
    return;
  } catch {
    // Lane genuinely closed (e.g. the seed's chatOpen: false) — open it.
  }
  await target.expectVisible(selectors.getByCss('[aria-label="Toggle Chat lane"]'), 60_000);
  await target.click(selectors.getByCss('[aria-label="Toggle Chat lane"]'));
  await target.expectVisible(selectors.getByCss(composer), 60_000);
};

const openSeededProject = async (backend: ActiveBackend): Promise<void> => {
  await target.navigate(backend === 'webaccess' ? `${seedRoute}?workspace=${workspaceFixture}` : seedRoute);
  await target.expectUrl(/\/w\/[^/]+\/[^/]+/u, 60_000);
  // The project-file-tree seed opens with the chat lane closed (chatOpen: false).
  await ensureChatOpen();
  await target.click(selectors.getByRole('button', { name: /^decline$/iu }), { timeout: 5000 }).catch(() => undefined);
};

/**
 * Why this session has no origin-private filesystem, or `undefined` when it has one.
 *
 * A presence check is not enough: `getDirectory` is a function in every WebKit
 * session and only the call itself distinguishes a persistent profile (full OPFS,
 * worker `createSyncAccessHandle` included) from Playwright's ephemeral context.
 * Must run on the app's own origin — `about:blank` is opaque and carries no
 * `navigator.storage` in any engine, which would read as "no OPFS" everywhere.
 */
const opfsSessionFailure = async (): Promise<string | undefined> =>
  target.evaluate(async () => {
    try {
      await navigator.storage.getDirectory();
      return undefined;
    } catch (error) {
      return error instanceof Error ? `${error.name}: ${error.message}` : String(error);
    }
  });

/** Skip an OPFS-specific vertical on a session that has no OPFS at all, with the platform's own reason. */
const requireOpfsSession = async (
  skip: (condition: boolean, note: string) => void,
  backend: ActiveBackend,
): Promise<void> => {
  if (backend !== 'opfs') {
    return;
  }
  const failure = await opfsSessionFailure();
  skip(failure !== undefined, `This browser session has no origin-private filesystem (${failure}).`);
};

const prepareBrowserHost = async (backend: ActiveBackend): Promise<void> => {
  await target.addInitScript((selectedBackend) => {
    if (selectedBackend === 'indexeddb') {
      Object.defineProperty(navigator.storage, 'getDirectory', { configurable: true, value: undefined });
    }
  }, backend);
  await target.installAgentHostGatewayFixture();
  await target.setViewport({ width: 1440, height: 900 });
  await openSeededProject(backend);
  // No flag and no placement pick: the browser host IS the Tau placement.
  // Asserting the single "Tau" target is what proves the API placement is gone
  // — a surviving "Tau (Browser)" row would mean the split still exists.
  await target.expectVisible(selectors.getByRole('button', { name: 'Select agent: Tau' }));
  expect(await target.isVisible(selectors.getByText('Tau (Browser)', { exact: true }))).toBe(false);
};

const submitAndWaitForPartial = async (): Promise<void> => {
  await target.type(composer, 'Create the browser-host proof file.');
  await target.click(selectors.getByCss('button:has(svg.lucide-arrow-up)').last());
  await target.expectVisible(selectors.getByText(partialText, { exact: true }), 120_000);
  await expect.poll(readGatewayRequestCount, { timeout: 30_000 }).toBe(1);
  expect(await target.isVisible(selectors.getByText(finalText, { exact: true }))).toBe(false);
};

const readGatewayRequestCount = async (): Promise<number> => {
  const requests = await target.readAgentHostGatewayRequests();
  return requests.length;
};

const readGatewayRequestModels = async (): Promise<readonly string[]> => {
  const requests = (await target.readAgentHostGatewayRequests()) as ReadonlyArray<{ readonly model?: unknown }>;
  return requests.map((request) => String(request.model));
};

const readActiveProjectTree = async (backend: ActiveBackend): Promise<Readonly<Record<string, string>>> => {
  const state = await readProjectStorageState();
  const project = state.configs.find((config) =>
    backend === 'home' ? config.backend !== 'webaccess' : config.backend === backend,
  );
  if (!project) {
    return {};
  }
  return backend === 'webaccess'
    ? readOpfsTree(`${workspaceFixture}/${project.providerBasePath}`)
    : readProjectTree(project);
};

/** Materialized run trees under `.tau/workspaces/run_<id>/tree` exist only in branch mode. */
const runTreePaths = (tree: Readonly<Record<string, string>>): readonly string[] =>
  Object.keys(tree).filter((path) => /^\/\.tau\/workspaces\/run_[^/]+\/tree\//u.test(path));

const waitForPublishedTree = async (
  backend: ActiveBackend,
  minimumPublications = 1,
): Promise<Readonly<Record<string, string>>> => {
  let tree: Readonly<Record<string, string>> = {};
  await expect
    .poll(
      async () => {
        tree = await readActiveProjectTree(backend);
        return (
          tree['/browser-host-proof.txt'] === 'created by the browser agent host\n' &&
          Object.keys(tree).filter((path) => path.startsWith('/.tau/workspaces/publications/')).length >=
            minimumPublications
        );
      },
      { timeout: 60_000 },
    )
    .toBe(true);
  return tree;
};

/** A default ("Locally") turn publishes without ever materializing a run tree. */
const waitForLocalPublishedTree = async (
  backend: ActiveBackend,
  minimumPublications = 1,
): Promise<Readonly<Record<string, string>>> => {
  const tree = await waitForPublishedTree(backend, minimumPublications);
  expect(runTreePaths(tree)).toEqual([]);
  return tree;
};

type LogEvent = {
  readonly type: string;
  readonly state?: string;
  readonly storageDurability?: string;
  readonly detail?: { readonly message?: string; readonly code?: string; readonly status?: number };
};

const eventLog = (tree: Readonly<Record<string, string>>): readonly LogEvent[] => {
  const logPath = Object.keys(tree).find((path) => /^\/\.tau\/chats\/[^/]+\/events\.jsonl$/u.test(path));
  expect(logPath).toBeDefined();
  return tree[logPath!]!.trim()
    .split('\n')
    .map((line) => JSON.parse(line) as LogEvent);
};

/** The reason the chat's durable log ends on, when it ends on a failed run. */
const durableFailureReason = async (): Promise<string | undefined> => {
  const events = eventLog(await readActiveProjectTree('home'));
  const last = events.findLast((event) => event.type === 'run.lifecycle');
  return last?.state === 'failed' ? last.detail?.message : undefined;
};

/**
 * Settlement's own failure line — nothing else in the app logs it.
 *
 * It fired six times in one second on the operator's first live turn: the
 * preview pipeline wrote `thumbnail.webp` into the live root between the
 * merge and its whole-tree verification, so the settlement failed on bytes it
 * never wrote and exhausted its five-attempt budget. This fixture's project
 * has no geometry pipeline to race, so the honest gate for that race is the
 * unit test in `chat-workspace-authority-provider.test.ts`; this is the cheap
 * net that catches any settlement failure the verticals do provoke.
 */
const expectNoSettlementFailures = async (): Promise<void> => {
  const { consoleMessages } = await target.events();
  expect(consoleMessages.filter(({ text }) => text.includes('exact run settlement failed'))).toEqual([]);
};

const assertPublication = (tree: Readonly<Record<string, string>>): void => {
  const publicationPath = Object.keys(tree).find((path) => path.startsWith('/.tau/workspaces/publications/'));
  expect(publicationPath).toBeDefined();
  const publication = JSON.parse(tree[publicationPath!]!) as {
    readonly changedPaths: readonly string[];
    readonly revisionId: string;
    readonly publication: { readonly status: string; readonly headRevisionId?: string };
  };
  expect(publication.changedPaths).toContain('browser-host-proof.txt');
  expect(publication.publication.status).toBe('updated');
  expect(publication.publication.headRevisionId).toBe(publication.revisionId);
};

describe.each([
  { backend: 'opfs', durability: 'exclusive-append' },
  { backend: 'indexeddb', durability: 'transactional-rewrite' },
  { backend: 'webaccess', durability: 'stream-append' },
] as const)('$backend browser agent host', ({ backend, durability }) => {
  // The webaccess fixture needs a structured-cloneable OPFS handle accepted as a
  // workspace; only Chromium ships the full File System Access surface.
  const runs = backend === 'webaccess' && server.browser !== 'chromium' ? test.skip : test;

  runs('streams incrementally, publishes an authoritative revision, and reloads the transcript', async ({ skip }) => {
    await prepareBrowserHost(backend);
    await requireOpfsSession(skip, backend);
    await submitAndWaitForPartial();
    await target.releaseAgentHostGatewayFixture();
    await target.expectVisible(selectors.getByText(finalText, { exact: true }), 120_000);

    const tree = await waitForLocalPublishedTree(backend);
    const events = eventLog(tree);
    expect(events.map(({ type }) => type)).toContain('turn.history-projection-committed');
    expect(events.map(({ type }) => type)).toContain('message.appended');
    expect(events.filter(({ type }) => type === 'run.lifecycle').map(({ state }) => state)).toEqual([
      'admitted',
      'running',
      'completed',
    ]);
    expect(
      events.find((event) => event.type === 'run.lifecycle' && event.state === 'admitted')?.storageDurability,
    ).toBe(durability);
    assertPublication(tree);
    await expectNoSettlementFailures();

    await target.reload();
    await ensureChatOpen();
    await target.expectVisible(selectors.getByText(partialText, { exact: true }), 60_000);
    await target.expectVisible(selectors.getByText(finalText, { exact: true }), 60_000);
  });

  runs('rebuilds the transcript and publication from the durable terminal log after reload', async ({ skip }) => {
    await prepareBrowserHost(backend);
    await requireOpfsSession(skip, backend);
    await submitAndWaitForPartial();
    await target.releaseAgentHostGatewayFixture();

    await expect
      .poll(
        async () =>
          eventLog(await readActiveProjectTree(backend)).some(
            (event) => event.type === 'run.lifecycle' && event.state === 'completed',
          ),
        { timeout: 120_000 },
      )
      .toBe(true);
    await target.reload();
    await ensureChatOpen();

    await target.expectVisible(selectors.getByText(finalText, { exact: true }), 120_000);
    assertPublication(await waitForLocalPublishedTree(backend));
  });

  runs('retries through a durable history rewind and publishes the fresh workspace', async ({ skip }) => {
    await prepareBrowserHost(backend);
    await requireOpfsSession(skip, backend);
    await submitAndWaitForPartial();
    await target.releaseAgentHostGatewayFixture();
    await target.expectVisible(selectors.getByText(finalText, { exact: true }), 120_000);
    await waitForLocalPublishedTree(backend);

    await target.click(selectors.getByCss('button:has(svg.lucide-refresh-cw)').last());
    await target.click(selectors.getByCss('button:has(svg.lucide-chevron-right)').last());
    // Filter to one row instead of trusting catalogue order: the last entry is
    // whichever provider the catalogue happens to end on (xAI today), and the
    // gateway fixture speaks only the Anthropic wire — an off-wire pick made
    // the retry vanish into a rejected request and a silent 120s poll timeout.
    await target.type(selectors.getByCss('[data-slot="command-input"]').last(), 'haiku');
    await target.click(selectors.getByCss('[data-slot="command-item"]').last());
    await expect.poll(readGatewayRequestCount, { timeout: 120_000 }).toBe(3);
    // The picked model must override the retried turn on the wire.
    const retryModels = await readGatewayRequestModels();
    expect(retryModels[2]).toBe(retryModel);
    expect(retryModels[2]).not.toBe(retryModels[0]);
    await target.releaseAgentHostGatewayFixture();
    await expect.poll(readGatewayRequestCount, { timeout: 120_000 }).toBe(4);
    const settledModels = await readGatewayRequestModels();
    expect(settledModels[3]).toBe(retryModel);

    const tree = await waitForLocalPublishedTree(backend, 2);
    const events = eventLog(tree);
    expect(events.map(({ type }) => type)).toContain('history.rewound');
    expect(events.filter((event) => event.type === 'run.lifecycle' && event.state === 'completed')).toHaveLength(2);
  });
});

/**
 * The storage ladder, asserted on the rung this browser session actually reaches.
 *
 * A session with an origin-private filesystem pins Home to OPFS and admits with
 * `exclusive-append`; a session without one degrades to the IndexedDB provider
 * log and admits with `transactional-rewrite` — and must still run the browser
 * host end to end. Without this, the three OPFS verticals polled an empty tree
 * for 60-120 s each on WebKit, which read as "the durable host is broken on
 * Safari" rather than "this Playwright session has no OPFS".
 */
describe('storage ladder', () => {
  test('runs the durable host on the storage class this browser session can provide', async ({ annotate }) => {
    await prepareBrowserHost('home');
    const failure = await opfsSessionFailure();
    // The one line that says which rung this run is proving, and why.
    await annotate(`navigator.storage.getDirectory(): ${failure ?? 'resolved'}`);
    const expected =
      failure === undefined
        ? { pin: 'opfs', durability: 'exclusive-append' }
        : { pin: 'indexeddb', durability: 'transactional-rewrite' };
    const state = await readProjectStorageState();
    expect(state.pin).toBe(expected.pin);

    await submitAndWaitForPartial();
    await target.releaseAgentHostGatewayFixture();
    await target.expectVisible(selectors.getByText(finalText, { exact: true }), 120_000);

    const events = eventLog(await waitForLocalPublishedTree('home'));
    expect(
      events.find((event) => event.type === 'run.lifecycle' && event.state === 'admitted')?.storageDurability,
    ).toBe(expected.durability);
  });
});

/** The one claim the seeded chat holds, parsed from the live project tree. */
const seededClaim = async (): Promise<
  { readonly admitted: boolean; readonly runId?: string; readonly mode?: string } | undefined
> => {
  const tree = await readActiveProjectTree('home');
  const claim = Object.entries(tree).find(([path]) => path.startsWith('/.tau/workspaces/claims/'));
  return claim === undefined
    ? undefined
    : (JSON.parse(claim[1]) as { readonly admitted: boolean; readonly runId?: string; readonly mode?: string });
};

describe('seeded first turn', () => {
  test('admits the claim of a first turn that was seeded with the project', async () => {
    // "New project → first prompt" is the operator's primary flow and the only
    // dispatch that never runs `withWorkspace`: hydration replays the chat's
    // one-shot `startupRequest` through the chat-session store's
    // latest-agent-body fallback, so nothing marks the claim admitted except the
    // run id. Every other vertical here submits explicitly, and a claim left
    // `{ admitted: false, runId }` never settles — the agent's work never
    // reaches the live tree and the next submit is blocked behind the admission
    // wait. The seed route creates the project exactly the way the home composer
    // does (pending first message + `startupRequest`). The turn dispatches
    // before the capability probe answers, so it must WAIT for it: `pending` is
    // not `unsupported`, and with the API placement gone there is nothing to
    // downgrade to.
    await target.installAgentHostGatewayFixture();
    await target.setViewport({ width: 1440, height: 900 });
    await target.navigate(`${seedRoute}?prompt=${encodeURIComponent('Create the browser-host proof file.')}`);
    await target.expectUrl(/\/w\/[^/]+\/[^/]+/u, 60_000);
    await ensureChatOpen();

    // No submit: the seeded turn dispatches itself.
    // Admission is the contract under test: a seeded turn used to leave its
    // claim `{ admitted: false }` forever, so settlement never published and the
    // next submit hit the admission wait.
    await expect.poll(seededClaim, { timeout: 60_000, interval: 250 }).toMatchObject({
      mode: 'local',
      admitted: true,
    });
    // The full chain, not just the claim: the seeded turn used to admit as a
    // `regenerate` against an empty durable log, which `packages/agent-host`
    // refuses with HISTORY_PREFIX_INVALID — so it never reached the gateway,
    // never bound a run, and "New project → first prompt" produced nothing.
    // A claim alone proves nothing: an API-placed dispatch admits one too.
    await expect.poll(readGatewayRequestCount, { timeout: 60_000 }).toBe(1);
    await expect.poll(seededClaim, { timeout: 60_000, interval: 250 }).toMatchObject({
      runId: expect.stringMatching(/^req_/u) as unknown,
    });
    await target.expectVisible(selectors.getByText(partialText, { exact: true }), 120_000);
    await target.releaseAgentHostGatewayFixture();
    await target.expectVisible(selectors.getByText(finalText, { exact: true }), 120_000);

    const tree = await waitForLocalPublishedTree('home');
    expect(tree['/browser-host-proof.txt']).toBe('created by the browser agent host\n');
    assertPublication(tree);
    expect(
      eventLog(tree)
        .filter(({ type }) => type === 'run.lifecycle')
        .map(({ state }) => state),
    ).toEqual(['admitted', 'running', 'completed']);
    // Settlement releases the claim it admitted; a retained one blocks the next turn.
    await expect.poll(seededClaim, { timeout: 60_000, interval: 250 }).toBeUndefined();
    // A released claim proves settlement finished, not that it finished first
    // time: the retry budget is per effect instance, so a failing settlement
    // still publishes once the effect re-runs. The console is the only place
    // those failed attempts are visible.
    await expectNoSettlementFailures();
  });
});

/**
 * A browser-placed chat's runs live in its own durable log, never in the API.
 * A reload drops this tab's in-memory run binding, and the resume that follows
 * used to ask the API for a run it never held (503) or answer `null` and leave
 * the chat wedged "reattaching" — so a completed run stayed unpublished, a
 * failed one showed no reason, and the next submit vanished. The log is the
 * authority: these two verticals reload a live run out from under itself and
 * assert the reattach settles it from the log alone.
 */
describe('durable log reattach after a reload', () => {
  const assertNoApiRunCalls = async (): Promise<void> => {
    const apiRequests = await target.readAgentHostApiRequests();
    // `/v1/chat/projects/<id>/runs/active` is the project-wide active-run poll
    // and is not a resume; what must never appear is this chat's own run being
    // read or streamed from the API.
    expect(apiRequests.filter((path) => /^\/v1\/chat\/(?!projects\/)[^/]+\/runs\//u.test(path))).toEqual([]);
  };

  test('resumes a reloaded run from its durable log and publishes it', async () => {
    await prepareBrowserHost('home');
    // The run is durably admitted and parked at the gateway gate; reloading here
    // kills its worker mid-run, leaving a non-terminal log behind.
    await submitAndWaitForPartial();
    await target.reload();
    await ensureChatOpen();

    // The reattach takes the log over, resumes the run, and settles it: the
    // publication and the released claim are the whole point of reattaching.
    await expect
      .poll(
        async () =>
          eventLog(await readActiveProjectTree('home')).some(
            (event) => event.type === 'run.lifecycle' && event.state === 'completed',
          ),
        { timeout: 120_000 },
      )
      .toBe(true);
    await expect
      .poll(
        async () =>
          Object.keys(await readActiveProjectTree('home')).filter((path) =>
            path.startsWith('/.tau/workspaces/publications/'),
          ).length,
        { timeout: 120_000 },
      )
      .toBeGreaterThan(0);
    await expect.poll(seededClaim, { timeout: 60_000, interval: 250 }).toBeUndefined();
    await assertNoApiRunCalls();
  });

  test('renders a reloaded run that failed durably, and stays ready for the next turn', async () => {
    await prepareBrowserHost('home');
    await submitAndWaitForPartial();
    // The resumed run meets a coded gateway refusal, so the log this reattach
    // takes over ends terminal-failed with a typed `RunFailureDetail`.
    await target.setAgentHostGatewayFailure({
      status: 500,
      message: 'The e2e gateway refused this browser-host run.',
    });
    await target.reload();
    await ensureChatOpen();

    let reason: string | undefined;
    await expect
      .poll(
        async () => {
          reason = await durableFailureReason();
          return reason;
        },
        { timeout: 120_000 },
      )
      .toBeTruthy();
    // The durable reason, not the projection's generic fallback.
    await target.expectVisible(selectors.getByText(reason!, { exact: false }), 60_000);
    expect(await target.isVisible(selectors.getByText('Browser agent host failed.', { exact: false }))).toBe(false);
    await assertNoApiRunCalls();

    // A settled failure leaves the chat submittable again — the wedge this
    // vertical exists for was a chat that accepted no further turn.
    await target.setAgentHostGatewayFailure();
    const priorRequests = await readGatewayRequestCount();
    await target.type(composer, 'Create the browser-host proof file.');
    await target.click(selectors.getByCss('button:has(svg.lucide-arrow-up)').last());
    await expect.poll(readGatewayRequestCount, { timeout: 120_000 }).toBeGreaterThan(priorRequests);
    await expect.poll(seededClaim, { timeout: 60_000, interval: 250 }).toMatchObject({ admitted: true });
  });
});

describe('branch revision mode', () => {
  test('materializes an isolated run tree when the composer selects New branch', async () => {
    await prepareBrowserHost('home');
    await target.click(selectors.getByCss('[data-slot="chat-revision-selector"]'));
    await target.click(selectors.getByText('New branch', { exact: true }));
    await submitAndWaitForPartial();

    await expect
      .poll(async () => runTreePaths(await readActiveProjectTree('home')).length, { timeout: 60_000 })
      .toBeGreaterThan(0);

    await target.releaseAgentHostGatewayFixture();
    await target.expectVisible(selectors.getByText(finalText, { exact: true }), 120_000);
    assertPublication(await waitForPublishedTree('home'));
  });
});
