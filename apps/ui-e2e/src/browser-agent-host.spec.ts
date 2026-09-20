import { describe, expect, test } from 'vitest';
import { page as selectors, server } from 'vitest/browser';
import * as target from '#support/external-target.js';
import {
  checkoutTreeBasePath,
  readOpfsTree,
  readProjectCheckoutTree,
  readProjectStorageState,
  readProjectTree,
} from '#support/project-storage-state.js';
import type { StoredProjectConfig } from '#support/project-storage-state.js';
import { settlementTypes } from '#support/chat-admission-log.js';
import { continueAction } from '#support/chat-admission.js';
import type { GatewayScriptTurn } from '#support/agent-host-gateway-script.js';

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
/** The one prompt this spec sends, and the accessible name of its user bubble. */
const seedPrompt = 'Create the browser-host proof file.';

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

const prepareBrowserHost = async (backend: ActiveBackend, script?: readonly GatewayScriptTurn[]): Promise<void> => {
  await target.addInitScript((selectedBackend) => {
    if (selectedBackend === 'indexeddb') {
      Object.defineProperty(navigator.storage, 'getDirectory', { configurable: true, value: undefined });
    }
  }, backend);
  await target.installAgentHostGatewayFixture(script);
  await target.setViewport({ width: 1440, height: 900 });
  await openSeededProject(backend);
  // No flag and no placement pick: the browser host IS the Tau placement.
  // One agent is not a choice (Q12.6), so the trigger is not rendered at all;
  // its absence together with the absent "Tau (Browser)" row is what proves the
  // API placement is gone — a surviving row would mean the split still exists.
  // (`ensureChatOpen` already waited on the composer, so the row is rendered.)
  expect(await target.isVisible(selectors.getByRole('button', { name: 'Select agent: Tau' }))).toBe(false);
  expect(await target.isVisible(selectors.getByText('Tau (Browser)', { exact: true }))).toBe(false);
};

const submitAndWaitForPartial = async (): Promise<void> => {
  await target.type(composer, seedPrompt);
  await target.click(selectors.getByCss('button:has(svg.lucide-arrow-up)').last());
  await target.expectVisible(selectors.getByText(partialText, { exact: true }), 120_000);
  await expect.poll(readGatewayRequestCount, { timeout: 30_000 }).toBe(1);
  expect(await target.isVisible(selectors.getByText(finalText, { exact: true }))).toBe(false);
};

const readGatewayRequestCount = async (): Promise<number> => {
  const requests = await target.readAgentHostGatewayRequests();
  return requests.length;
};

const activeProjectConfig = async (backend: ActiveBackend): Promise<StoredProjectConfig | undefined> => {
  const state = await readProjectStorageState();
  return state.configs.find((config) =>
    backend === 'home' ? config.backend !== 'webaccess' : config.backend === backend,
  );
};

const readActiveProjectTree = async (backend: ActiveBackend): Promise<Readonly<Record<string, string>>> => {
  const project = await activeProjectConfig(backend);
  if (!project) {
    return {};
  }
  return backend === 'webaccess'
    ? readOpfsTree(`${workspaceFixture}/${project.providerBasePath}`)
    : readProjectTree(project);
};

/**
 * This project's materialized linked checkouts, read where they actually live.
 *
 * Beside the project on its own storage root, at `.tau/checkouts/<projectId>/<checkoutId>`
 * — never inside the project tree and with no `tree/` segment. The reader this
 * replaced filtered `readProjectTree`'s keys for `/.tau/checkouts/<id>/tree/`,
 * which a project's flat base path can never contain, so it answered `[]`
 * whatever the product did (T1 row 12).
 */
const readActiveCheckoutTree = async (backend: ActiveBackend): Promise<Readonly<Record<string, string>>> => {
  const project = await activeProjectConfig(backend);
  if (!project) {
    return {};
  }
  return backend === 'webaccess'
    ? readOpfsTree(checkoutTreeBasePath(project, workspaceFixture))
    : readProjectCheckoutTree(project);
};

/**
 * Settled turns, as the chat's own durable log records them.
 *
 * There is no publication file. A settlement is a `turn.finalized` record in
 * `.tau/chats/<id>/events.jsonl` carrying the revision it recorded and the
 * paths it changed (`agent-host-event-projection.ts:288`), which is the same
 * fact the retired `.tau/workspaces/publications/<id>.json` used to hold.
 */
const settledTurns = (tree: Readonly<Record<string, string>>): readonly LogEvent[] =>
  eventLog(tree).filter((event) => event.type === 'turn.finalized');

/**
 * Every settlement the chat's log holds, oldest first — attempts included.
 *
 * A run can settle more than once now: an attempt settles, and a later attempt
 * of the same run settles again (I1). `settledTurns` only counts the finalised
 * ones, which cannot tell a run that was recorded as abandoned and then resumed
 * from one that simply completed.
 */
const settlementTypesOf = (tree: Readonly<Record<string, string>>): readonly string[] =>
  eventLog(tree)
    .map(({ type }) => type)
    .filter((type) => settlementTypes.has(type));

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
          settledTurns(tree).length >= minimumPublications
        );
      },
      { timeout: 60_000 },
    )
    .toBe(true);
  return tree;
};

/** A default ("Locally") turn publishes without ever materializing a checkout tree. */
const waitForLocalPublishedTree = async (
  backend: ActiveBackend,
  minimumPublications = 1,
): Promise<Readonly<Record<string, string>>> => {
  const tree = await waitForPublishedTree(backend, minimumPublications);
  expect(await readActiveCheckoutTree(backend)).toEqual({});
  return tree;
};

type LogEvent = {
  readonly type: string;
  readonly runId?: string;
  readonly state?: string;
  readonly storageDurability?: string;
  /** `turn.finalized` only: the revision the settlement recorded, and its paths. */
  readonly revisionId?: string;
  readonly changedPaths?: readonly string[];
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

/**
 * The turn was recorded authoritatively — S7's layout, not the retired one.
 *
 * The old assertion read `.tau/workspaces/publications/<id>.json` and checked
 * its `publication.status === 'updated'` against `headRevisionId`; that file
 * has no writer. What carries the same guarantee now is the settlement record
 * in the chat's durable log: a revision id (the cut was recorded and the branch
 * head moved to it) and the paths that turn changed.
 */
const assertPublication = (tree: Readonly<Record<string, string>>): void => {
  const settled = settledTurns(tree).at(-1);
  expect(settled).toBeDefined();
  expect(settled?.revisionId).toBeDefined();
  expect(settled?.changedPaths).toContain('browser-host-proof.txt');
};

const streamingFadeScript: readonly GatewayScriptTurn[] = [
  {
    reasoningChunks: ['Inspecting', ' the model.'],
    textChunks: ['The response', ' is smooth', ' and ready.'],
    gateChunks: true,
    usage: { inputTokens: 10, outputTokens: 8 },
  },
];

const readFadeStyle = async (text: string) =>
  target.evaluate((expected) => {
    const element = [...document.querySelectorAll<HTMLElement>('[data-chat-streaming-fade]')].find(
      (candidate) => candidate.textContent === expected,
    );
    if (!element) {
      return undefined;
    }
    const style = getComputedStyle(element);
    return {
      animationDelay: style.animationDelay,
      animationDuration: style.animationDuration,
      animationName: style.animationName,
      display: style.display,
      transform: style.transform,
    };
  }, text);

const sampleFade = async (text: string) =>
  target.evaluate((expected) => {
    const element = [...document.querySelectorAll<HTMLElement>('[data-chat-streaming-fade]')].find(
      (candidate) => candidate.textContent === expected,
    );
    const animation = element?.getAnimations()[0];
    if (!element || !animation) {
      return undefined;
    }
    animation.pause();
    const sampleAt = (milliseconds: number) => {
      animation.currentTime = milliseconds;
      const bounds = element.getBoundingClientRect();
      return {
        height: bounds.height,
        opacity: Number.parseFloat(getComputedStyle(element).opacity),
        width: bounds.width,
        x: bounds.x,
        y: bounds.y,
      };
    };
    const result = {
      end: sampleAt(150),
      middle: sampleAt(75),
      start: sampleAt(0),
      wrapperCount: document.querySelectorAll('[data-chat-streaming-fade]').length,
    };
    animation.currentTime = 75;
    element.style.opacity = String(result.middle.opacity);
    animation.cancel();
    return result;
  }, text);

// Playwright WebKit buffers the intercepted open SSE response until it closes,
// so the first gated delta never reaches Tau. Chromium and Firefox exercise the
// real open-stream path; WebKit remains covered by the shared renderer/CSS.
const streamingFadeTest = server.browser === 'webkit' ? test.skip : test;

const activityUxScript: readonly GatewayScriptTurn[] = [
  {
    reasoningBlocks: [
      '**Confirming test completion and readiness**',
      'The source is intact, so I will verify the current model before reporting the result.',
    ],
    gateChunks: true,
    toolCalls: [{ name: 'read_file', args: { targetFile: 'public/models/honeycomb.js' } }],
    usage: { inputTokens: 12, outputTokens: 18 },
  },
  {
    text: 'The model is ready.',
    usage: { inputTokens: 18, outputTokens: 6 },
  },
];

/*
 * The reasoning disclosure, as the product renders it today: one trigger
 * `Button` named by the thought and one `role='region'` body named
 * `<label> details` (`chat-message-reasoning.tsx:78-101`). The label is
 * `Thinking…` while the last block is still streaming and `Thought briefly` /
 * `Thought for N seconds` once it has ended (`:68-69`), so both locators admit
 * either spelling.
 */
const reasoningTrigger = selectors.getByRole('button', {
  name: /^(?:Thinking…|Thought (?:briefly|for \d+ seconds?))$/u,
});
const reasoningBody = selectors.getByRole('region', {
  name: /^(?:Thinking…|Thought (?:briefly|for \d+ seconds?)) details$/u,
});

streamingFadeTest('presents sequential reasoning and semantic activity through completion and reload', async () => {
  await prepareBrowserHost('indexeddb', activityUxScript);
  await target.type(composer, 'Inspect the current model.');
  await target.click(selectors.getByCss('button:has(svg.lucide-arrow-up)').last());

  const firstReasoning = selectors.getByText('Confirming test completion and readiness', { exact: true });
  await target.expectVisible(firstReasoning, 120_000);
  expect(
    await target.evaluateLocator(firstReasoning, (element) => {
      const style = getComputedStyle(element);
      return { fontStyle: style.fontStyle, fontWeight: style.fontWeight };
    }),
  ).toEqual({ fontStyle: 'italic', fontWeight: '400' });
  /* Both reasoning blocks share one disclosure: one trigger `Button` named by
   * the thought, one `region` body named `<label> details`. The retired
   * `role='group'` named `Collapse thought` went with the second toggle
   * (`df777801e`); `chat-message-reasoning.tsx:78-101` is the whole surface. */
  await target.expectCount(reasoningBody, 1);

  await target.releaseAgentHostGatewayFixture();
  await target.expectVisible(
    selectors.getByText('The source is intact, so I will verify the current model before reporting the result.', {
      exact: true,
    }),
    30_000,
  );
  await target.expectCount(reasoningBody, 1);

  await target.click(reasoningTrigger);
  await target.expectCount(reasoningBody, 0);
  await target.expectFocused(reasoningTrigger, 30_000);

  await target.releaseAgentHostGatewayFixture();
  await target.expectVisible(selectors.getByText('The model is ready.', { exact: true }), 120_000);
  await target.expectVisible(selectors.getByRole('button', { name: 'Read files' }), 60_000);
  /* A settled thought behind a message that has content stays collapsed. */
  await target.expectCount(reasoningBody, 0);

  const thoughtTrigger = selectors.getByRole('button', { name: /^Thought (?:briefly|for \d+ seconds?)$/u });
  await target.expectVisible(thoughtTrigger, 30_000);
  await target.click(thoughtTrigger);
  await target.expectVisible(reasoningBody, 30_000);
  await target.press(thoughtTrigger, 'Enter');
  await target.expectCount(reasoningBody, 0);
  await target.press(thoughtTrigger, 'Space');
  await target.expectVisible(reasoningBody, 30_000);

  await target.setViewport({ width: 430, height: 820 });
  const activityTrigger = selectors.getByRole('button', { name: 'Read files' });
  const alignment = await target.evaluateLocator(activityTrigger, (element) => {
    const icon = element.querySelector('svg');
    const label = element.querySelector('span');
    if (!icon || !label) {
      return undefined;
    }
    const iconBounds = icon.getBoundingClientRect();
    const labelBounds = label.getBoundingClientRect();
    return {
      centerDelta: Math.abs(iconBounds.y + iconBounds.height / 2 - (labelBounds.y + labelBounds.height / 2)),
      usesExactToken: icon.classList.contains('size-3'),
    };
  });
  expect(alignment?.usesExactToken).toBe(true);
  expect(alignment?.centerDelta).toBeLessThanOrEqual(1);

  await target.click(activityTrigger);
  await target.expectVisible(selectors.getByText(/Read public\/models\/honeycomb\.js/u), 30_000);
  if (!(await target.isVisible(reasoningBody))) {
    await target.click(thoughtTrigger);
    await target.expectVisible(reasoningBody, 30_000);
  }
  await target.screenshot(selectors.getByCss('body'), 'agent-activity-exact-light-narrow.png');
  await target.emulateColorScheme('dark');
  await target.screenshot(selectors.getByCss('body'), 'agent-activity-exact-dark-narrow.png');

  await target.reload();
  await ensureChatOpen();
  await target.expectVisible(selectors.getByText('The model is ready.', { exact: true }), 60_000);
  await target.expectVisible(
    selectors.getByRole('button', { name: /^Thought (?:briefly|for \d+ seconds?)$/u }),
    60_000,
  );
  await target.expectVisible(selectors.getByRole('button', { name: 'Read files' }), 60_000);
});

streamingFadeTest('fades live reasoning and prose chunks without retaining wrappers', async () => {
  await prepareBrowserHost('indexeddb', streamingFadeScript);
  await target.type(composer, 'Show the streaming fade.');
  await target.click(selectors.getByCss('button:has(svg.lucide-arrow-up)').last());

  await target.expectVisible(selectors.getByText('Inspecting', { exact: true }), 120_000);
  expect(await readFadeStyle('Inspecting')).toBeUndefined();

  await target.releaseAgentHostGatewayFixture();
  await expect
    .poll(async () => readFadeStyle(' the model.'), { timeout: 30_000 })
    .toMatchObject({
      animationDelay: '0s',
      animationDuration: '0.15s',
      animationName: 'chat-streaming-fade',
      display: 'inline',
      transform: 'none',
    });
  const fadeSample = await sampleFade(' the model.');
  expect(fadeSample?.start.opacity).toBe(0);
  expect(fadeSample?.middle.opacity).toBeGreaterThan(0);
  expect(fadeSample?.middle.opacity).toBeLessThan(1);
  expect(fadeSample?.end.opacity).toBe(1);
  expect(fadeSample?.start).toMatchObject({
    height: fadeSample?.middle.height,
    width: fadeSample?.middle.width,
    x: fadeSample?.middle.x,
    y: fadeSample?.middle.y,
  });
  expect(fadeSample?.end).toMatchObject({
    height: fadeSample?.middle.height,
    width: fadeSample?.middle.width,
    x: fadeSample?.middle.x,
    y: fadeSample?.middle.y,
  });
  expect(fadeSample?.wrapperCount).toBe(1);
  await target.screenshot(selectors.getByCss('body'), 'chat-streaming-fade-reasoning-midpoint.png');

  await target.releaseAgentHostGatewayFixture();
  await target.expectVisible(selectors.getByText('The response', { exact: true }), 30_000);
  expect(await readFadeStyle('The response')).toBeUndefined();

  await target.releaseAgentHostGatewayFixture();
  await expect
    .poll(async () => readFadeStyle(' is smooth'), { timeout: 30_000 })
    .toMatchObject({
      animationDelay: '0s',
      animationDuration: '0.15s',
      animationName: 'chat-streaming-fade',
      display: 'inline',
      transform: 'none',
    });
  const proseFadeSample = await sampleFade(' is smooth');
  expect(proseFadeSample?.start.opacity).toBe(0);
  expect(proseFadeSample?.middle.opacity).toBeGreaterThan(0);
  expect(proseFadeSample?.middle.opacity).toBeLessThan(1);
  expect(proseFadeSample?.end.opacity).toBe(1);
  expect(proseFadeSample?.wrapperCount).toBe(1);
  await target.screenshot(selectors.getByCss('body'), 'chat-streaming-fade-prose-midpoint.png');

  await target.emulateReducedMotion('reduce');
  await target.releaseAgentHostGatewayFixture();
  await expect
    .poll(async () => readFadeStyle(' and ready.'), { timeout: 30_000 })
    .toMatchObject({
      animationDelay: '0s',
      animationName: 'chat-streaming-fade',
      display: 'inline',
      transform: 'none',
    });
  const reducedMotionStyle = await readFadeStyle(' and ready.');
  expect(Number.parseFloat(reducedMotionStyle?.animationDuration ?? '1')).toBeLessThanOrEqual(0.00001);

  await target.releaseAgentHostGatewayFixture();
  await target.expectVisible(selectors.getByText('The response is smooth and ready.', { exact: true }), 30_000);
  await expect
    .poll(async () => target.evaluate(() => document.querySelectorAll('[data-chat-streaming-fade]').length), {
      timeout: 30_000,
    })
    .toBe(0);
});

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

  /*
   * Ruling E3: a run that completed while its document died is finalised on
   * return, not written off.
   *
   * The reload has to land *inside* the settlement window, and polling the log
   * for `completed` cannot promise that — the settlement is the next thing that
   * happens. The page's own debug hold parks it (`chat-host-binding.ts`
   * `chatTurnSettlement` awaits the hold before `settle`), so the reload
   * reliably discards a completed, unsettled run. On return the settlement
   * re-leases that turn and finalises it (`project-chat-run-settlement.tsx`:
   * `adopted && outcome === 'completed'` → `prepare` then `finalize`), which is
   * what attributes the agent's writes to its own turn rather than sweeping
   * them into the next person's save.
   */
  runs('finalises a run whose document died inside the settlement window', async ({ skip }) => {
    await prepareBrowserHost(backend);
    await requireOpfsSession(skip, backend);
    await target.holdChatTurn('settlement');
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
    /* The settlement is parked, so nothing has been written yet. */
    expect(settledTurns(await readActiveProjectTree(backend))).toEqual([]);
    await target.reload();
    await ensureChatOpen();

    await target.expectVisible(selectors.getByText(finalText, { exact: true }), 120_000);
    const tree = await waitForLocalPublishedTree(backend);
    /* One settlement for the turn, not one per document that saw it. */
    expect(settlementTypesOf(tree)).toEqual(['turn.finalized']);
    /* Not `assertPublication`, and the difference is the ruling's own mechanism
     * rather than a weaker assertion. E3 finalises through a *re-lease*, so the
     * minting happens at `prepare`: the root refuses to lease a dirty tree and
     * pre-mints it as a `turn` revision carrying this turn's id
     * (`packages/revisions/src/turn.machine.ts` `basing`), after which the cut
     * finds nothing left and finalizes `nothingToSave`. The settlement this
     * row's own run produced reads
     * `{type:'turn.finalized', trigger:'turn', checkoutId:'live', changedPaths:[]}`
     * with **no** `revisionId` — measured, not assumed (D2 `d2-e3-diag2.log`).
     * What E3 guarantees is therefore: the agent's writes are on disk and the
     * turn is settled exactly once, both asserted above and in
     * `waitForLocalPublishedTree`. That the record does not *name* the revision
     * its own re-lease minted is the revision root's gap, not this page's — R1
     * traced it ("Plausible A") and ruled `packages/revisions` unchanged, so it
     * is recorded here for the operator rather than asserted away. */
    const settled = settledTurns(tree).at(-1);
    expect(settled).toMatchObject({ trigger: 'turn', turnId: expect.any(String) as unknown });
  });

  /*
   * The rewind, through the affordance that still exists.
   *
   * This row used to click `button:has(svg.lucide-refresh-cw)` and then pick a
   * model from the retry menu. Both went with the per-message retry verb
   * (`be3d0eb6e`, ruled deliberate), so the model-switch-on-retry contract has
   * no owner and is dropped with them (ruling E4). What survives is the edit:
   * `chat-message.tsx:828-831` makes a user bubble a `role='button'` named by
   * its own text, clicking it swaps in an edit composer (`:795-816`), and its
   * submit calls `cadChat.edit`, which is a rewinding trigger — so the host
   * appends `history.rewound` (`tau-agent-host.ts:2149-2162`) and runs the turn
   * again.
   */
  runs('rewinds a durable history through an edit and publishes the fresh workspace', async ({ skip }) => {
    await prepareBrowserHost(backend);
    await requireOpfsSession(skip, backend);
    await submitAndWaitForPartial();
    await target.releaseAgentHostGatewayFixture();
    await target.expectVisible(selectors.getByText(finalText, { exact: true }), 120_000);
    await waitForLocalPublishedTree(backend);

    await target.click(selectors.getByRole('button', { name: /Create the browser-host proof file/u }).first());
    const editComposer = selectors.getByCss(`article ${composer}`).first();
    await target.expectVisible(editComposer, 30_000);
    await target.type(editComposer, ' Again.');
    await target.press(editComposer, 'Enter');

    /* The edited text is a turn the script walk has not seen, so it replays the
     * default script from its start: the gated tool turn, then the closing one
     * (`agent-host-gateway-script.ts` `createGatewayScriptWalk`). */
    await expect.poll(readGatewayRequestCount, { timeout: 120_000 }).toBe(3);
    await target.releaseAgentHostGatewayFixture();
    await expect.poll(readGatewayRequestCount, { timeout: 120_000 }).toBe(4);

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

/**
 * The lease the seeded chat's turn holds while it runs (S7).
 *
 * The retired `.tau/workspaces/claims/<id>.json` is written by nothing. Its
 * successor is the turn's lease at `.tau/runs/<runId>.json` — taken before the
 * turn is allowed to run and retired once it settles — so polling this to
 * `undefined` asserts what the claim assertion asserted: the seeded turn
 * finished and left nothing held.
 *
 * The record is a `TurnLease` (`packages/revisions/src/revision-effects.ts:201-212`,
 * written at `:2242-2251`). It has no `mode` and no `admitted`: those were the
 * retired claim's fields, and a lease exists only because the turn *was*
 * admitted, so its presence is the admission.
 */
type SeededLease = Readonly<{
  runId?: string;
  turnId?: string;
  chatId?: string;
  checkoutId?: string;
  authorityEpoch?: string;
  startedAt?: number;
}>;

const seededLease = async (): Promise<SeededLease | undefined> => {
  const tree = await readActiveProjectTree('home');
  const lease = Object.entries(tree).find(([path]) => /^\/\.tau\/runs\/[^/]+\.json$/u.test(path));
  return lease === undefined ? undefined : (JSON.parse(lease[1]) as SeededLease);
};

describe('seeded first turn', () => {
  test('admits the claim of a first turn that was seeded with the project', async () => {
    // "New project → first prompt" is the operator's primary flow and the only
    // dispatch that never runs `withWorkspace`: hydration replays the chat's
    // one-shot `startupRequest` through the chat-session store's
    // latest-agent-body fallback, so nothing marks the turn placed except its
    // lease. Every other vertical here submits explicitly, and a turn whose
    // lease is never written never settles — the agent's work never reaches the
    // live tree and the next submit is blocked behind the admission wait. The
    // seed route creates the project exactly the way the home composer does
    // (pending first message + `startupRequest`). The turn dispatches before the
    // capability probe answers, so it must WAIT for it: `pending` is not
    // `unsupported`, and with the API placement gone there is nothing to
    // downgrade to.
    await target.installAgentHostGatewayFixture();
    await target.setViewport({ width: 1440, height: 900 });
    await target.navigate(`${seedRoute}?prompt=${encodeURIComponent(seedPrompt)}`);
    await target.expectUrl(/\/w\/[^/]+\/[^/]+/u, 60_000);
    await ensureChatOpen();

    // No submit: the seeded turn dispatches itself.
    // The lease is the contract under test: a seeded turn used to sit in the
    // admission window forever, so settlement never published and the next
    // submit hit the admission wait. `writeLease` runs after `prepare` placed
    // the turn, so the record existing *is* the admission.
    await expect.poll(seededLease, { timeout: 60_000, interval: 250 }).toMatchObject({
      chatId: expect.any(String) as unknown,
      checkoutId: expect.any(String) as unknown,
      turnId: expect.any(String) as unknown,
    });
    // The full chain, not just the lease: the seeded turn used to admit as a
    // `regenerate` against an empty durable log, which `packages/agent-host`
    // refuses with HISTORY_PREFIX_INVALID — so it never reached the gateway,
    // never bound a run, and "New project → first prompt" produced nothing.
    // A lease alone proves nothing: any placed turn writes one.
    await expect.poll(readGatewayRequestCount, { timeout: 60_000 }).toBe(1);
    // Run ids are `run_`-prefixed (`generatePrefixedId(idPrefix.run)`,
    // `libs/types/src/constants/id.constants.ts:52`); `req_` was the retired
    // claim's request id.
    await expect.poll(seededLease, { timeout: 60_000, interval: 250 }).toMatchObject({
      runId: expect.stringMatching(/^run_/u) as unknown,
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
    // Settlement retires the lease it took; a retained one blocks the next turn.
    await expect.poll(seededLease, { timeout: 60_000, interval: 250 }).toBeUndefined();
    // A released lease proves the settlement happened; whether it *failed* on
    // the way is only visible in the console. The turn's owner attempts one
    // settlement per turn (C3) — the five-attempt retry timer this row used to
    // wait out is gone with the effect that owned it.
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
 * assert the page recovers from the log alone.
 *
 * Ruling E1 and invariant I4: the reattach *records* what it found and never
 * drives it. The host is a dedicated worker that dies with the document, and a
 * page refresh must never spend the credit the person has just topped up
 * without being asked — so the takeover writes one
 * `run.lifecycle: failed { code: 'RUN_ABANDONED' }`
 * (`packages/agent-host/src/host/tau-agent-host.ts` `markAbandoned`), the page
 * settles it once, and the continuation is the person's own gesture.
 */
describe('durable log reattach after a reload', () => {
  const assertNoApiRunCalls = async (): Promise<void> => {
    const apiRequests = await target.readAgentHostApiRequests();
    // `/v1/chat/projects/<id>/runs/active` is the project-wide active-run poll
    // and is not a resume; what must never appear is this chat's own run being
    // read or streamed from the API.
    expect(apiRequests.filter((path) => /^\/v1\/chat\/(?!projects\/)[^/]+\/runs\//u.test(path))).toEqual([]);
  };

  test('records a reloaded run as abandoned and finalises it when the person continues', async () => {
    await prepareBrowserHost('home');
    // The run is durably admitted and parked at the gateway gate; reloading here
    // kills its worker mid-run, leaving a non-terminal log behind.
    await submitAndWaitForPartial();
    await target.reload();
    await ensureChatOpen();

    // The takeover records the orphan — one settlement, and no second provider
    // call for a turn nobody asked to continue.
    await expect
      .poll(async () => settlementTypesOf(await readActiveProjectTree('home')), { timeout: 120_000 })
      .toEqual(['turn.failed']);
    expect(await readGatewayRequestCount()).toBe(1);
    await assertNoApiRunCalls();

    /* The person's gesture is what spends. It continues the same run: no rewind
     * and no new run id (`chat-turn-host.tsx`). `RUN_ABANDONED` is a paused-turn
     * code, so the card is the saved-turn one and its action reads *Resume*. */
    await target.expectVisible(continueAction, 60_000);
    await target.click(continueAction);
    /* The document that died left *its* request parked at the stream gate, and
     * the fixture outlives the page. Waiting for a gate answered that stale one
     * the instant it was asked, and the release below then took it (newest
     * first) instead of the continuation's, which parked forever. The
     * continuation is this turn's second ask, so wait for the ask before
     * waiting for its gate. */
    await expect.poll(readGatewayRequestCount, { timeout: 120_000 }).toBe(2);
    await target.waitForAgentHostGatewayGate({ kind: 'stream' });
    await target.releaseAgentHostGatewayFixture();
    await target.expectVisible(selectors.getByText(finalText, { exact: true }), 120_000);

    const tree = await waitForLocalPublishedTree('home');
    assertPublication(tree);
    expect(settlementTypesOf(tree)).toEqual(['turn.failed', 'turn.finalized']);
    expect(new Set(eventLog(tree).map((event) => event.runId)).size).toBe(1);
    await expect.poll(seededLease, { timeout: 60_000, interval: 250 }).toBeUndefined();
    await assertNoApiRunCalls();
  });

  test('renders a reloaded run that failed durably, and stays ready for the next turn', async () => {
    await prepareBrowserHost('home');
    await submitAndWaitForPartial();
    await target.reload();
    await ensureChatOpen();

    // The durable reason the takeover wrote, not the projection's generic
    // fallback — and the sentence the host itself chose for it.
    await expect
      .poll(durableFailureReason, { timeout: 120_000 })
      .toBe('The host executing this run is gone. Resume the turn to continue it.');
    await target.expectVisible(selectors.getByText('The host executing this run is gone', { exact: false }), 60_000);
    expect(await target.isVisible(selectors.getByText('Browser agent host failed.', { exact: false }))).toBe(false);
    await assertNoApiRunCalls();

    // A settled failure leaves the chat submittable again — the wedge this
    // vertical exists for was a chat that accepted no further turn. A fresh
    // send, not the card's continuation: this half is about the *next* turn.
    const priorRequests = await readGatewayRequestCount();
    await target.type(composer, `${seedPrompt} Again.`);
    await target.click(selectors.getByCss('button:has(svg.lucide-arrow-up)').last());
    await expect.poll(readGatewayRequestCount, { timeout: 120_000 }).toBeGreaterThan(priorRequests);
    // The lease the new turn holds is a `TurnLease` keyed by a `run_` id; the
    // retired claim's `{ mode, admitted }` is written by nothing.
    await expect.poll(seededLease, { timeout: 60_000, interval: 250 }).toMatchObject({
      runId: expect.stringMatching(/^run_/u) as unknown,
      chatId: expect.any(String) as unknown,
      checkoutId: expect.any(String) as unknown,
    });
  });
});

describe('branch revision mode', () => {
  test('materializes an isolated run tree when the composer selects New branch', async () => {
    await prepareBrowserHost('home');
    /* The composer picker replaced the deleted revision-mode selector (W7): a
       branch is made by name, not chosen as a mode. */
    await target.click(selectors.getByCss('[data-slot="chat-branch-picker"]'));
    await target.click(selectors.getByText('New branch', { exact: true }));
    await target.fill(selectors.getByLabelText('Name for the new branch'), 'isolated-run');
    await target.click(selectors.getByRole('button', { name: 'Create' }));
    await submitAndWaitForPartial();

    await expect
      .poll(async () => Object.keys(await readActiveCheckoutTree('home')).length, { timeout: 60_000 })
      .toBeGreaterThan(0);

    await target.releaseAgentHostGatewayFixture();
    await target.expectVisible(selectors.getByText(finalText, { exact: true }), 120_000);
    assertPublication(await waitForPublishedTree('home'));
  });
});
