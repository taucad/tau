/**
 * The app state orchestration programme's e2e witness rows (charter D14, D25, package A0.1).
 *
 * Every later wiring lane runs this file and attaches the run. Each row asserts concrete state (a
 * node, an open pane, file bytes, a journal row, a revision entry), never a bare timeout. Three kinds:
 *
 * - characterisation rows, green on `main`;
 * - expected-failure rows (`test.fails`, W0): today's defect, red on its own assertion; the owning
 *   lane flips the row to `test` and never deletes it;
 * - report-only rows, which record how often a defect that cannot be forced shows, and never fail on it.
 */
import { expect, test } from 'vitest';
import { page as selectors } from 'vitest/browser';
import type { Locator } from 'vitest/browser';
import * as target from '#support/external-target.js';
import {
  readPendingOperation,
  readProjectLibraryEvidence,
  readProjectStorageState,
  readProjectTree,
  writePendingPermanentDelete,
} from '#support/project-storage-state.js';
import type { StoredProjectConfig } from '#support/project-storage-state.js';
import { awaitSaved, historyRow, revisionChip, visibleRevisionsPanel } from '#support/revision-session.js';
import { filesPane, treeItem } from '#support/file-tree.js';
import type { SectionViewTestCutValues } from '@taucad/app/test-bridges/section-view';

const projectNames = { a: 'Project Navigation A', b: 'Project Navigation B' } as const;
const entryPaths = { a: 'alpha.ts', b: 'beta.ts' } as const;
const projectRoute = /\/w\/[^/]+\/[^/]+$/u;
const layoutPath = '/.tau/workbench/layout.json';

const workbenchToggle = () => selectors.getByRole('button', { name: 'Toggle Workbench lane' }).first();
const projectLink = (name: string) => selectors.getByRole('link', { name, exact: true }).first();
const dockTab = (label: string) => selectors.getByCss(`.dv-tab[aria-label="${label}"]`);

/** The project is on screen and ready: its library row, its viewer tab, a frame and the composer. */
const expectProjectReady = async (key: keyof typeof projectNames): Promise<void> => {
  await target.expectVisible(projectLink(projectNames[key]), 60_000);
  await target.expectVisible(dockTab(entryPaths[key]), 60_000);
  await target.expectVisible(selectors.getByTestId('cad-viewer-canvas-region').getByCss('canvas').first(), 60_000);
  await target.expectVisible(selectors.getByCss('.tiptap[contenteditable="true"]').first(), 60_000);
  await target.expectCount(selectors.getByText(/doesn't exist|may have been deleted|project not found/iu), 0);
};

/** Seed projects A and B through the debug route, which opens A. */
const openSeed = async (): Promise<void> => {
  await target.setViewport({ width: 1440, height: 900 });
  await target.navigate('/__e2e/project-navigation');
  await target.expectUrl(projectRoute, 60_000);
  await expectProjectReady('a');
};

/** The route path a library link opens, as an absolute URL pattern. */
const routeOf = async (name: string): Promise<RegExp> => {
  const href = await target.getAttribute(projectLink(name), 'href');
  if (!href) {
    throw new Error(`The library link for ${name} has no route.`);
  }
  const path = new URL(href, 'http://origin.invalid').pathname;
  return new RegExp(`${path.replaceAll(/[.*+?^${}()|[\]\\]/gu, String.raw`\$&`)}(?:\\?.*)?$`, 'u');
};

/**
 * A project's tree, read again when a file goes or is replaced between the listing and its read. The app writes a file
 * through a sibling it moves into place (a save, or A7e's replay on the next open), so a walk can find a listed sibling
 * gone (`NotFoundError`) or a file replaced after its handle was taken (`NotReadableError`): that is a read of a tree
 * mid-write, never an answer about the tree.
 */
const midWrite = /NotFoundError|NotReadableError/u;

const readSettledTree = async (config: StoredProjectConfig): Promise<Readonly<Record<string, string>>> => {
  for (let attempt = 1; ; attempt += 1) {
    try {
      // oxlint-disable-next-line no-await-in-loop -- each attempt reads after the last one failed.
      return await readProjectTree(config);
    } catch (error) {
      if (attempt >= 8 || !midWrite.test(String(error))) {
        throw error;
      }
    }
    // oxlint-disable-next-line no-await-in-loop -- each attempt reads after the last one failed.
    await target.delay(100);
  }
};

/** Each project's durable config, by its manifest name. */
const configsByName = async (): Promise<Readonly<Record<string, StoredProjectConfig>>> => {
  const { configs } = await readProjectStorageState();
  const entries = await Promise.all(
    configs.map(async (config) => {
      const tree = await readSettledTree(config);
      const manifest = tree['/tau.json'];
      return manifest === undefined ? undefined : ([(JSON.parse(manifest) as { name: string }).name, config] as const);
    }),
  );
  return Object.fromEntries(entries.filter((entry) => entry !== undefined));
};

const readLayout = async (config: StoredProjectConfig): Promise<{ lanes?: { workbench?: boolean } } | undefined> => {
  const tree = await readSettledTree(config);
  const text = tree[layoutPath];
  return text === undefined ? undefined : (JSON.parse(text) as { lanes?: { workbench?: boolean } });
};

/**
 * Read `read` until `isDone` holds or `boundMilliseconds` pass, and hand back the last reading either way, so the
 * row's own assertion on it is what fails, not the wait.
 */
const readWithin = async <Value>(
  read: () => Promise<Value>,
  isDone: (value: Value) => boolean,
  boundMilliseconds: number,
): Promise<Value> => {
  const deadline = performance.now() + boundMilliseconds;
  let value = await read();
  while (!isDone(value) && performance.now() < deadline) {
    // oxlint-disable-next-line no-await-in-loop -- A bounded poll reads in order.
    await target.delay(250);
    // oxlint-disable-next-line no-await-in-loop -- A bounded poll reads in order.
    value = await read();
  }
  return value;
};

type RoundTrip = Readonly<{
  /** From the click on B to the click on A. */
  elapsed: number;
  /** From B's path committing to the click on A: the time on B. */
  dwell: number;
  /** From B's path committing to B's own `?chat=` correction; `undefined` when the trip did not wait for it. */
  chatWait?: number;
}>;

/**
 * A's link, B's link and back, driven in the page so the harness's own latency stays out of the reading.
 *
 * @param settleOnB - Wait for B's own `?chat=` correction (the open's `navigate(replace)`) before going
 *   back; otherwise go back as soon as B's path commits.
 */
const roundTripThroughB = async (settleOnB: boolean): Promise<RoundTrip> =>
  target.evaluate(
    async ({ names, settle }) => {
      const link = (name: string): HTMLAnchorElement => {
        const found = [...document.querySelectorAll<HTMLAnchorElement>('a')].find(
          (anchor) => anchor.textContent.trim() === name,
        );
        if (!found) {
          throw new Error(`No library link for ${name}`);
        }
        return found;
      };
      const startedAt = performance.now();
      const toB = new URL(link(names.b).href).pathname;
      link(names.b).click();
      let pathAt: number | undefined;
      const readyAt = await new Promise<number | undefined>((resolve) => {
        const check = (): void => {
          const now = performance.now();
          if (location.pathname === toB) {
            pathAt ??= now;
            if (!settle || new URLSearchParams(location.search).has('chat')) {
              resolve(now);
              return;
            }
          }
          /* Bounded, so a route that never settles fails the row's reading instead of hanging. */
          if (now - startedAt > 30_000) {
            resolve(undefined);
            return;
          }
          requestAnimationFrame(check);
        };
        check();
      });
      const clickedAt = performance.now();
      link(names.a).click();
      return {
        elapsed: clickedAt - startedAt,
        dwell: pathAt === undefined || readyAt === undefined ? Number.POSITIVE_INFINITY : clickedAt - pathAt,
        ...(settle && pathAt !== undefined && readyAt !== undefined ? { chatWait: readyAt - pathAt } : {}),
      };
    },
    { names: { a: projectNames.a, b: projectNames.b }, settle: settleOnB },
  );

type Settled = 'A' | 'B' | 'unsettled';

/**
 * How long the pathname must stay unchanged before a trip counts as at rest. B's `?chat=` correction can land more
 * than a second after B's path commits, so a 1 s window could count as A a trip that a later correction then moves
 * to B. The A0.1 handoff asks for a window past 2.1 s before the I2 row is asserted; 3 s is that window (A5c).
 */
const settledQuietMilliseconds = 3000;

/**
 * Where a trip came to rest, read the same way for both projects: the pathname unchanged for
 * `settledQuietMilliseconds` and that project's entry tab on screen. A navigation still in the route gate's pending
 * state (`project-route.tsx` `pending`: the resolved project is not yet the requested one) is not yet either.
 */
const readSettledProject = async (routes: Readonly<{ a: RegExp; b: RegExp }>): Promise<Settled> => {
  const deadline = performance.now() + 30_000;
  let path = '';
  let since = performance.now();
  while (performance.now() < deadline) {
    // oxlint-disable-next-line no-await-in-loop -- A bounded poll reads in order.
    const url = await target.currentUrl();
    const nextPath = new URL(url).pathname;
    if (nextPath !== path) {
      path = nextPath;
      since = performance.now();
    }
    const key = routes.a.test(url) ? 'a' : routes.b.test(url) ? 'b' : undefined;
    /* A tab detached between the read's count and its attribute read times the read out: that is not on screen. */
    if (
      key &&
      performance.now() - since >= settledQuietMilliseconds &&
      // oxlint-disable-next-line no-await-in-loop -- A bounded poll reads in order.
      (await target.isVisible(dockTab(entryPaths[key])).catch(() => false))
    ) {
      return key === 'a' ? 'A' : 'B';
    }
    // oxlint-disable-next-line no-await-in-loop -- A bounded poll reads in order.
    await target.delay(200);
  }
  return 'unsettled';
};

test('A0.1 row 1 (I10): project A keeps its arrangement across a round trip that leaves B right after B’s chat correction', async ({
  annotate,
}) => {
  await openSeed();
  const configs = await configsByName();
  const configA = configs[projectNames.a]!;
  const toggle = workbenchToggle();
  await target.expectAttribute(toggle, 'aria-pressed', 'true', 60_000);

  /* The arrangement: the person closes A's Workbench lane. */
  await target.click(toggle);
  await target.expectAttribute(toggle, 'aria-pressed', 'false');
  const routeA = await routeOf(projectNames.a);
  const routeB = await routeOf(projectNames.b);

  /* The round trip leaves B as soon as B's own `?chat=` correction lands. The time on B, from B's path
   * committing to the click back to A, is that correction's wait and is recorded, not bounded: it measured
   * 198–885 ms over 20 runs at `279a3a30` (median 332 ms, 16 under 0.5 s) and 248–2122 ms over 20 runs at
   * `4ff549a9` (one above 2 s), so a one-second bound would not hold every run. Going back before the
   * correction is the I2 report-only row's subject, which is not this row's claim. */
  const trip = await roundTripThroughB(true);
  await annotate(
    `dwell on B ${String(Math.round(trip.dwell))} ms (chat correction ${String(Math.round(trip.chatWait ?? -1))} ms)`,
  );
  await target.writeArtifact(
    `a01-row1-report-${String(Date.now())}.json`,
    JSON.stringify({ dwell: Math.round(trip.dwell), chatWait: Math.round(trip.chatWait ?? -1) }),
  );
  expect(trip.dwell).toBeLessThan(Number.POSITIVE_INFINITY);

  await target.expectUrl(routeA, 10_000);
  await expectProjectReady('a');
  await target.expectAttribute(workbenchToggle(), 'aria-pressed', 'false');
  await expect
    .poll(
      async () => {
        const layout = await readLayout(configA);
        return layout?.lanes?.workbench;
      },
      { timeout: 30_000 },
    )
    .toBe(false);

  /* The lane is A's own: B, which the round trip passed through, still has its Workbench open. */
  await target.click(projectLink(projectNames.b));
  await target.expectUrl(routeB, 10_000);
  await expectProjectReady('b');
  await target.expectAttribute(workbenchToggle(), 'aria-pressed', 'true');
});

/*
 * I11 (`LayoutApply` `IntentAccounted`; flipped by A8b). On a cold load the pane a project link asks for opens
 * once the workbench is ready. Until A8b this row was report-only: before the layout record's first read,
 * `openPanel` deferred the intent through a callback that dropped it when the route key moved, and the intent's
 * own parameter cleanup and the `?chat=` correction both move it, so Print opened in only 2 of 20 runs at
 * `279a3a30` (3 of 20 at `4ff549a9`). The runtime's layout now queues the intent until the first read and an
 * attached workbench, and a replace navigation keeps the route key it is queued under, so the row asserts.
 */
test('A0.1 row 2 (I11, A8b): the Print pane intent of a cold project link opens once the workbench is ready', async ({
  annotate,
}) => {
  /* The intent is read only where machines are enabled; the page's own environment opts in before
   * any app module evaluates (`client-env-script.ts` keeps a value that is already present). */
  await target.addInitScript(() => {
    const host = globalThis as typeof globalThis & { ENV?: Record<string, unknown> };
    // eslint-disable-next-line @typescript-eslint/naming-convention -- client environment wire name
    host.ENV = { ...host.ENV, TAU_MACHINES_ENABLED: true };
  });
  await openSeed();
  const projectUrl = new URL(await target.currentUrl());

  /* A cold load: a new document on the project link, the way a source-job link arrives. */
  await target.navigate(`${projectUrl.pathname}?workbench=print`);
  await expectProjectReady('a');
  /* The workbench is ready: its lane is open, its saved arrangement is applied and the intent is consumed. */
  await target.expectAttribute(workbenchToggle(), 'aria-pressed', 'true', 30_000);
  await target.expectVisible(dockTab('Parameters'), 60_000);
  await expect.poll(async () => new URL(await target.currentUrl()).searchParams.has('workbench')).toBe(false);

  /* The reading: is the pane the link asked for open and active, within a bound. */
  const startedAt = performance.now();
  const print = await readWithin(
    async () => target.read(dockTab('Print')),
    (state) => state.visible,
    15_000,
  );
  const isOpened = print.visible && /\bdv-active-tab\b/u.test(print.className);
  const reading = { opened: isOpened, visible: print.visible, waited: Math.round(performance.now() - startedAt) };
  await annotate(`I11 Print opened: ${String(isOpened)} (waited ${String(reading.waited)} ms)`);
  await target.writeArtifact(`a01-i11-report-${String(Date.now())}.json`, JSON.stringify(reading));
  expect(reading).toMatchObject({ opened: true, visible: true });
});

test('A0.1 row 3 (I8): a reload during a pending library operation recovers or reports it, and the project opens', async ({
  annotate,
}) => {
  await openSeed();
  const configs = await configsByName();
  const configB = configs[projectNames.b]!;

  /* The person moves B to the Trash, which a permanent delete requires. B is opened first and left
   * retained, so its trash is verified through the live session that has read its chats; a closed
   * project's chats are verified from their logs instead (`leaseQuiescentProject`, W30). */
  await target.click(projectLink(projectNames.b));
  await expectProjectReady('b');
  await target.click(projectLink(projectNames.a));
  await expectProjectReady('a');
  await target.click(projectLink(projectNames.b), { button: 'right' });
  await target.click(selectors.getByRole('menuitem', { name: 'Move to Trash' }));
  await expect
    .poll(
      async () => {
        const evidence = await readProjectLibraryEvidence(configB.projectId);
        return evidence.deletedAt;
      },
      { timeout: 30_000 },
    )
    .toBeTypeOf('number');

  /* Forced: the permanent delete's journal row is durable and nothing has committed it yet, which is
   * the state a reload in the middle of `permanentlyDeleteProject` leaves. */
  const operationId = await writePendingPermanentDelete({
    projectId: configB.projectId,
    storage: { backend: configB.backend as 'indexeddb' | 'opfs', providerBasePath: configB.providerBasePath },
  });
  const journaled = await readProjectLibraryEvidence(configB.projectId);
  expect(journaled.pendingOperationIds).toContain(operationId);
  /* Well formed: exactly the row `beginPermanentDeleteProject` writes, so a report is a recovery failure. */
  const wellFormedRow = {
    operationId,
    kind: 'permanent-delete',
    projectId: configB.projectId,
    storage: { backend: configB.backend, providerBasePath: configB.providerBasePath },
  };
  expect(await readPendingOperation(operationId)).toStrictEqual(wellFormedRow);
  await target.reload();

  /* The project opens. */
  await target.expectUrl(projectRoute, 60_000);
  await expectProjectReady('a');

  /* The row is accounted for, on the library page that reports a row it could not finish (DF11). */
  await target.click(selectors.getByRole('link', { name: 'Projects', exact: true }).first());
  await target.expectUrl(/\/projects$/u, 30_000);
  const report = selectors.getByRole('group', { name: 'Project recovery' });
  const directory = configB.providerBasePath.split('/').findLast(Boolean)!;
  let outcome: 'recovered' | 'reported' | undefined;
  await expect
    .poll(
      async () => {
        const evidence = await readProjectLibraryEvidence(configB.projectId);
        if (evidence.pendingOperationIds.includes(operationId)) {
          const isReported = await target.isVisible(report.getByRole('button', { name: 'Discard' }));
          outcome = isReported ? 'reported' : undefined;
        } else {
          outcome = 'recovered';
        }
        return outcome;
      },
      { timeout: 60_000 },
    )
    .toBeDefined();
  const reportText = outcome === 'reported' ? ((await target.textContent(report)) ?? '') : undefined;
  const reasons = {
    'workspace-unavailable': 'Reconnect its workspace folder so Tau can finish recovery.',
    'identity-conflict': 'The project directory belongs to different or unidentifiable content.',
    'local-state-error': 'The project files committed, but local project state could not be restored.',
    'filesystem-error': 'Tau could not finish writing the project files.',
  } as const;
  const reason = reportText
    ? (Object.entries(reasons).find(([, text]) => reportText.includes(text))?.[0] ?? 'unrecognised')
    : undefined;
  await annotate(`journal row ${outcome ?? 'unsettled'}${reason ? ` (${reason})` : ''}`);
  await target.writeArtifact(
    `a01-row3-report-${String(Date.now())}.json`,
    JSON.stringify({ outcome: outcome ?? 'unsettled', ...(reason ? { reason } : {}) }),
  );
  if (outcome === 'recovered') {
    /* Recovered: the delete ran to its end, so B's route config, library row and directory are gone. */
    const { configs } = await readProjectStorageState();
    expect(configs.map((config) => config.projectId)).not.toContain(configB.projectId);
    const settled = await readProjectLibraryEvidence(configB.projectId);
    expect(settled.hasLibraryState).toBe(false);
    expect(await readProjectTree(configB)).toEqual({});
    await target.expectCount(report, 0, 30_000);
  } else {
    /* Reported: the library names the row it could not finish, with a recovery failure's own reason, and the
     * row it reports is still the well-formed one written above, not a malformed row it could not parse. */
    await target.expectContainingText(report, directory, 30_000);
    expect(Object.keys(reasons)).toContain(reason);
    expect(await readPendingOperation(operationId)).toStrictEqual(wellFormedRow);
  }
});

test('A0.1 row 4 (S34): a rename in a second tab reaches the first tab’s library and its open route', async () => {
  await openSeed();
  const projectUrl = await target.currentUrl();
  const renamed = 'Project Navigation A renamed';
  await target.openSecondary(projectUrl);
  try {
    const secondaryRow = projectLink(projectNames.a);
    await target.expectVisible(secondaryRow, 60_000, 'secondary');
    await target.click(secondaryRow, { button: 'right' }, 'secondary');
    await target.click(selectors.getByRole('menuitem', { name: 'Rename' }), undefined, 'secondary');
    const editor = selectors.getByCss('[data-slot="project-trigger"]').getByRole('textbox');
    await target.expectVisible(editor, 10_000, 'secondary');
    await target.fill(editor, renamed, 'secondary');
    await target.press(editor, 'Enter', 'secondary');
    await target.expectVisible(projectLink(renamed), 30_000, 'secondary');
  } finally {
    await target.closeSecondary();
  }

  /* The first tab's library follows, and so does the route it has open for that project. */
  await target.expectVisible(projectLink(renamed), 60_000);
  await target.expectCount(projectLink(projectNames.a), 0, 30_000);
  /* A rename keeps the slug (it is the project directory's name), so the route proves it followed by
   * what the open project shows: the same path, the entry file, and the project's new name as the title
   * the open route's project session sets. */
  await target.expectUrl(await routeOf(renamed), 30_000);
  expect(new URL(await target.currentUrl()).pathname).toBe(new URL(projectUrl).pathname);
  await target.expectVisible(dockTab(entryPaths.a), 30_000);
  await expect.poll(async () => target.evaluate(() => document.title), { timeout: 30_000 }).toBe(renamed);
  await target.expectCount(selectors.getByText(/doesn't exist|may have been deleted|project not found/iu), 0);
});

type SectionCut = SectionViewTestCutValues;

/** The live section's values; cut ids are made anew at every seed, so they are left out. */
const readSection = async (): Promise<Readonly<{ isActive: boolean; cuts: readonly SectionCut[] }> | undefined> =>
  target.evaluate(() => {
    const bridge = globalThis.__TAU_SECTION_VIEW_TEST__;
    if (!bridge) {
      return undefined;
    }
    const { isActive, cuts } = bridge.getSectionState();
    return { isActive, cuts: cuts.map(({ id: _id, ...values }) => values) };
  });

/** The entry file in the source editor, opened from the Files pane the way a person opens it. */
const openSource = async (): Promise<Locator> => {
  const source = selectors.getByCss('.cm-editor .cm-content[contenteditable="true"]').last();
  if (await target.isVisible(source)) {
    return source;
  }
  if (!(await target.isVisible(filesPane()))) {
    await target.click(selectors.getByRole('button', { name: /Search/u }));
    const search = selectors.getByPlaceholder('Search projects, chats, and actions…');
    await target.expectVisible(search, 15_000);
    await target.fill(search, 'Open files');
    await target.click(selectors.getByText('Open files', { exact: true }));
  }
  await target.expectVisible(filesPane(), 60_000);
  await target.click(treeItem(entryPaths.a));
  await target.expectVisible(source, 60_000);
  return source;
};

type ReloadTimings = Readonly<{
  /** Epoch milliseconds of the arrangement change, the view setting and the edit, in the page's clock. */
  toggledAt: number;
  cutAt: number;
  insertedAt: number;
  /** Epoch milliseconds at which `location.reload()` was called. */
  reloadAt: number;
  /** Whether the editor's own document held the edit when the reload was called, and after how many frames. */
  editInState: boolean;
  frames: number;
  /** Whether the Chat lane showed closed when the reload was called. */
  isLaneClosed: boolean;
}>;
type EditedAndReloaded = Readonly<{ marker: string; cut: SectionCut; timings?: ReloadTimings }>;

const reloadAtKey = 'a01-s26-reload';

/** The marker goes in as one input transaction at the end of the focused document, the way a paste or an IME
 * commit lands: typed key by key it sometimes lost its tail to a focus move before the reload. */
const insertMarker = (element: Element, text: string): void => {
  if (!(element instanceof HTMLElement)) {
    return;
  }
  element.focus();
  // oxlint-disable-next-line @typescript-eslint/no-deprecated -- the one atomic input path a contenteditable takes
  document.execCommand('insertText', false, text);
};

/**
 * Edit A's entry file, a view setting and the arrangement, then reload: nothing waits for a save, and the
 * file edit comes last so no blur saves it first.
 *
 * @param isAtOnce - Make all three changes and call `location.reload()` in one page task, so no debounce
 *   (the layout record's 500 ms, the editor's save) can land any of them first; otherwise the arrangement
 *   and the view setting go first, the way a person makes them, and the harness reloads after the edit.
 */
const editViewArrangeAndReload = async (isAtOnce: boolean): Promise<EditedAndReloaded> => {
  await openSeed();
  const marker = `// close-cut witness ${Math.random().toString(36).slice(2, 10)}`;
  await target.expectVisible(revisionChip(), 60_000);
  await awaitSaved();

  /* The file, open in the editor the way a person opens it. */
  const source = await openSource();
  await target.expectContainingText(source, 'makeBaseBox(18', 30_000);
  const chatToggle = selectors.getByRole('button', { name: 'Toggle Chat lane' }).first();
  await target.expectAttribute(chatToggle, 'aria-pressed', 'true');
  await target.waitFor(() => Boolean(globalThis.__TAU_SECTION_VIEW_TEST__));
  const cut: SectionCut = { kind: 'plane', plane: 'xz', offset: 0.017, isFlipped: true };

  if (isAtOnce) {
    /* The lane toggle the page turn clicks is the one this locator resolves: the lane's own mount. */
    await target.evaluateLocator(chatToggle, (element) => {
      if (element instanceof HTMLElement) {
        element.dataset['a01ChatToggle'] = '';
      }
    });
    await target.click(source);
    await target.keyboardPress('ControlOrMeta+End');
    /* One page turn: the lane change (a programmatic click, which leaves focus in the editor), the section
     * cut, the edit, then the reload. Each time is written where the reloaded page can read it back. */
    await target
      .evaluateLocator(
        source,
        (element, input) => {
          const clock = (): number => performance.timeOrigin + performance.now();
          document.querySelector<HTMLButtonElement>('[data-a01-chat-toggle]')?.click();
          const toggledAt = clock();
          globalThis.__TAU_SECTION_VIEW_TEST__?.setSectionCuts([input.cut]);
          const cutAt = clock();
          if (element instanceof HTMLElement) {
            element.focus();
            // oxlint-disable-next-line @typescript-eslint/no-deprecated -- the one atomic input path a contenteditable takes
            document.execCommand('insertText', false, input.text);
          }
          const insertedAt = clock();
          /* The editor reads the input back from the DOM on a later frame, and the lane shows closed on a
           * later render: reload on the first frame where both are in place, so the loss measured is the
           * app's, not a change the app never saw. */
          type EditorDom = Element & {
            cmTile?: { root?: { view?: { state: { doc: { toString(): string } } } } };
          };
          const isInState = (): boolean =>
            (element as EditorDom).cmTile?.root?.view?.state.doc.toString().includes(input.text.trim()) ?? false;
          const finish = (frames: number): void => {
            const isLaneClosed = [...document.querySelectorAll('button[aria-label="Toggle Chat lane"]')].some(
              (button) => button.getAttribute('aria-pressed') === 'false',
            );
            if ((!isInState() || !isLaneClosed) && frames < 30) {
              requestAnimationFrame(() => {
                finish(frames + 1);
              });
              return;
            }
            const reloadAt = clock();
            sessionStorage.setItem(
              input.key,
              JSON.stringify({
                toggledAt,
                cutAt,
                insertedAt,
                reloadAt,
                editInState: isInState(),
                frames,
                isLaneClosed,
              }),
            );
            location.reload();
          };
          finish(0);
        },
        { cut, text: `\n${marker}`, key: reloadAtKey },
      )
      .catch(() => undefined);
    /* The new document: its clock started after the reload was called. */
    await expect
      .poll(
        async () =>
          target
            .evaluate((key) => {
              const stored = sessionStorage.getItem(key);
              return stored !== null && performance.timeOrigin > (JSON.parse(stored) as ReloadTimings).reloadAt;
            }, reloadAtKey)
            .catch(() => false),
        { timeout: 60_000 },
      )
      .toBe(true);
    const timings = await target.evaluate(
      (key) => JSON.parse(sessionStorage.getItem(key) ?? 'null') as ReloadTimings,
      reloadAtKey,
    );
    await target.expectUrl(projectRoute, 60_000);
    await target.expectVisible(dockTab(entryPaths.a), 60_000);
    return { marker, cut, timings };
  }

  /* The arrangement: the person closes the Chat lane. */
  await target.click(chatToggle);
  await target.expectAttribute(chatToggle, 'aria-pressed', 'false');
  /* The view setting: a section cut on A's view. */
  await target.evaluate((nextCut) => {
    const bridge = globalThis.__TAU_SECTION_VIEW_TEST__;
    bridge?.setSectionCuts([nextCut]);
  }, cut);
  await expect.poll(readSection).toEqual({ isActive: true, cuts: [cut] });
  /* The edit, last, and the reload at once. */
  await target.click(source);
  await target.keyboardPress('ControlOrMeta+End');
  await target.evaluateLocator(source, insertMarker, `\n${marker}`);
  await target.keyboardPress('Escape');
  await target.expectContainingText(source, marker);
  await target.reload();
  await target.expectUrl(projectRoute, 60_000);
  await target.expectVisible(dockTab(entryPaths.a), 60_000);
  return { marker, cut };
};

/*
 * Row 5a makes the three changes and reloads within one page turn: the lane change, the section cut and
 * the edit, then `location.reload()` on the first frame on which the editor's own document holds the edit
 * and the lane shows closed, under 200 ms after the lane change. The layout record's 500 ms debounce
 * cannot have written the lane by then, so only the unload can. Before A7c each was lost in some runs and
 * kept in others (over 20 runs at `4ff549a9` the edit was lost in 7, the view setting in 12 and the
 * arrangement in 8; at `279a3a30`, in 7, 9 and 8). A7c registers each live session once at the unload
 * sequencer's producer stage, which writes the layout record, the view records and both stores before the
 * close cut (D26, S26). A reload fires `pagehide` and `hidden` only as the document goes, and a record write
 * first issued there landed in about 7 runs of 10, so while a record write is owed `beforeunload` runs the
 * producer stage as the reload starts (D26 as amended by A7c). The row asserts all three survive.
 */
test('A0.1 row 5a (S26, D26, A7c): an arrangement, a view setting and an edit made just before a reload survive it', async ({
  annotate,
}) => {
  const { marker, cut, timings } = await editViewArrangeAndReload(true);

  /* The readings: the reloaded editor has loaded A's entry file; do it, A's view and A's lanes hold the changes. */
  const source = await openSource();
  await target.expectContainingText(source, 'makeBaseBox(18', 60_000);
  const text = await readWithin(
    async () => (await target.textContent(source)) ?? '',
    (current) => current.includes(marker),
    15_000,
  );
  const section = await readWithin(readSection, (current) => (current?.cuts.length ?? 0) > 0, 15_000);
  const [restored] = section?.cuts ?? [];
  const chatPressed = await readWithin(
    async () =>
      target.getAttribute(selectors.getByRole('button', { name: 'Toggle Chat lane' }).first(), 'aria-pressed'),
    (pressed) => pressed === 'false',
    15_000,
  );
  /* What storage holds, not only what the reloaded page shows: the entry file's bytes and the layout record. */
  const configs = await configsByName();
  const configA = configs[projectNames.a];
  const storedText = await readWithin(
    async () => {
      if (configA === undefined) {
        return '';
      }
      const tree = await readSettledTree(configA);
      return tree[`/${entryPaths.a}`] ?? '';
    },
    (current) => current.includes(marker),
    15_000,
  );
  const storedLayout = configA === undefined ? undefined : await readLayout(configA);
  const reading = {
    editStored: storedText.includes(marker),
    arrangementStored: (storedLayout as { lanes?: { chat?: boolean } } | undefined)?.lanes?.chat === false,
    arrangementKept: chatPressed === 'false',
    viewKept:
      section?.isActive === true &&
      section.cuts.length === 1 &&
      restored?.kind === 'plane' &&
      cut.kind === 'plane' &&
      restored.plane === cut.plane &&
      restored.offset === cut.offset &&
      restored.isFlipped === cut.isFlipped,
    editKept: text.includes(marker),
    ...(timings
      ? {
          toggleToReload: Math.round(timings.reloadAt - timings.toggledAt),
          editToReload: Math.round(timings.reloadAt - timings.insertedAt),
          editInState: timings.editInState,
          frames: timings.frames,
          isLaneClosed: timings.isLaneClosed,
        }
      : {}),
  };
  await annotate(`S26 local survival after reload: ${JSON.stringify(reading)}`);
  await target.writeArtifact(`a01-s26local-report-${String(Date.now())}.json`, JSON.stringify(reading));
  /* Every change was in place when the reload was called, the lane change under the 500 ms debounce. */
  expect(timings?.isLaneClosed).toBe(true);
  expect(timings?.editInState).toBe(true);
  expect(reading.toggleToReload).toBeLessThan(500);
  /* S26: the unload's producer stage wrote all three before the document went (A7c). */
  expect(reading, 'S26: the arrangement, the view setting and the edit survive the reload').toMatchObject({
    editStored: true,
    arrangementStored: true,
    arrangementKept: true,
    viewKept: true,
    editKept: true,
  });
});

/*
 * I6, S26, D26 (A7d). A7c registers each live session at the unload sequencer's producer stage, which writes what the
 * session owes, and the session stage then takes the close cut. On a reload that cut cannot land: it is asynchronous
 * through the revision worker, which goes with the document. So the session stage records the cut as owed, and the
 * reloaded document's `revisions` child takes it as its first revision act. The row reads the edit's bytes from
 * storage first, then History, with reads that tolerate a row History re-renders.
 */
test('A0.1 row 5b (I6 / S26 / D26, A7d): the close revision holding the edit is cut after an immediate reload', async ({
  annotate,
}) => {
  /* The at-once reload 5a measures: the edit is in the editor's state and owed, so the unload's producer stage writes
   * it before the document goes, and the close cut has the edit's bytes to take. Row 5d is the path where the edit's
   * save is still in flight at the reload, which A7e's replay keeps. */
  const { marker } = await editViewArrangeAndReload(true);
  /* The edit's bytes are on disk: the producer stage wrote the editor's document before the cut. */
  const configs = await configsByName();
  const configA = configs[projectNames.a];
  const stored = await readWithin(
    async () => {
      if (configA === undefined) {
        return '';
      }
      const tree = await readSettledTree(configA);
      return tree[`/${entryPaths.a}`] ?? '';
    },
    (text) => text.includes(marker),
    15_000,
  );
  /* The cut has the edit's bytes to take: the producer stage wrote them before the document went (row 5a). */
  await annotate(`S26 stored edit before History: ${String(stored.includes(marker))}`);
  expect(stored, 'S26: the edit is on disk before History is read').toContain(marker);
  await target.click(revisionChip());
  const panel = selectors.getByCss(visibleRevisionsPanel);
  const trailerOf = () => panel.getByRole('definition').filter({ hasText: 'Tau-Trigger:' });
  await target.expectVisible(historyRow(0), 60_000);

  /* History is re-read, its newest entry expanded each time, until a close cut shows or the bound passes:
   * a cut that lands late, after the reload, still counts. */
  const newestTrailer = async (): Promise<string> => {
    const newest = historyRow(0);
    if (!(await target.isVisible(newest))) {
      return '';
    }
    /* History re-renders as entries land, so a read of a row that has just gone is a miss, not a failure. */
    const expanded = await target.getAttribute(newest, 'aria-expanded').catch(() => undefined);
    if (expanded === undefined) {
      return '';
    }
    if (expanded !== 'true') {
      await target.click(newest).catch(() => undefined);
    }
    return (await target.isVisible(trailerOf())) ? ((await target.textContent(trailerOf()).catch(() => '')) ?? '') : '';
  };
  const trailer = await readWithin(newestTrailer, (text) => /Tau-Trigger: close\b/u.test(text), 30_000);
  /* The trailer is kept, so the run shows the row failing on its own assertion, not on a wait. */
  await annotate(`I6 newest History trailer: ${trailer || '(none)'}`);
  await target.writeArtifact(`a01-row5b-report-${String(Date.now())}.json`, JSON.stringify({ trailer }));

  /* The defect's own assertion: History's newest entry was cut at close, and it changed the file. */
  expect(trailer, 'I6: the newest History entry is the close cut').toMatch(/Tau-Trigger: close\b/u);
  await target.expectContainingText(panel.getByRole('list', { name: 'Changed files' }), entryPaths.a, 30_000);
});

/*
 * S26, D17 (A7d; programme control, 2026-11-15T20:26Z). An edit, Escape and a reload at once, as a person types and
 * reloads: nothing else is owed, so only the editor document session's own debounced save holds the edit. The row
 * asserts the edit is on disk and shown after the reload. The reload's own timing is read back from the page's clock.
 */
test('A0.1 row 5c (S26 / D17, A7d): an edit made just before an immediate reload is kept on disk and in the editor', async ({
  annotate,
}) => {
  await openSeed();
  const marker = `// immediate-reload witness ${Math.random().toString(36).slice(2, 10)}`;
  await target.expectVisible(revisionChip(), 60_000);
  await awaitSaved();
  const source = await openSource();
  await target.expectContainingText(source, 'makeBaseBox(18', 30_000);
  await target.click(source);
  await target.keyboardPress('ControlOrMeta+End');
  /* The edit and the reload in one page task, once the editor's own document holds the edit: the reload comes inside
   * the editor's 250 ms save window, with nothing else owed. */
  const reloadKey = 'a01-row5c-reload';
  await target
    .evaluateLocator(
      source,
      (element, input) => {
        const clock = (): number => performance.timeOrigin + performance.now();
        if (element instanceof HTMLElement) {
          element.focus();
          // oxlint-disable-next-line @typescript-eslint/no-deprecated -- the one atomic input path a contenteditable takes
          document.execCommand('insertText', false, input.text);
        }
        const insertedAt = clock();
        type EditorDom = Element & { cmTile?: { root?: { view?: { state: { doc: { toString(): string } } } } } };
        const isInState = (): boolean =>
          (element as EditorDom).cmTile?.root?.view?.state.doc.toString().includes(input.text.trim()) ?? false;
        const finish = (frames: number): void => {
          if (!isInState() && frames < 30) {
            requestAnimationFrame(() => {
              finish(frames + 1);
            });
            return;
          }
          sessionStorage.setItem(
            input.key,
            JSON.stringify({ insertedAt, reloadAt: clock(), editInState: isInState(), frames }),
          );
          location.reload();
        };
        finish(0);
      },
      { text: `\n${marker}`, key: reloadKey },
    )
    .catch(() => undefined);
  await expect
    .poll(
      async () =>
        target
          .evaluate((key) => {
            const stored = sessionStorage.getItem(key);
            return stored !== null && performance.timeOrigin > (JSON.parse(stored) as { reloadAt: number }).reloadAt;
          }, reloadKey)
          .catch(() => false),
      { timeout: 60_000 },
    )
    .toBe(true);
  const timings = await target.evaluate(
    (key) =>
      JSON.parse(sessionStorage.getItem(key) ?? 'null') as {
        insertedAt: number;
        reloadAt: number;
        editInState: boolean;
        frames: number;
      },
    reloadKey,
  );
  await target.expectUrl(projectRoute, 60_000);
  await target.expectVisible(dockTab(entryPaths.a), 60_000);

  /* What storage holds, then what the reloaded editor shows. */
  const configs = await configsByName();
  const configA = configs[projectNames.a];
  const storedText = await readWithin(
    async () => {
      if (configA === undefined) {
        return '';
      }
      const tree = await readSettledTree(configA);
      return tree[`/${entryPaths.a}`] ?? '';
    },
    (current) => current.includes(marker),
    15_000,
  );
  const reopened = await openSource();
  await target.expectContainingText(reopened, 'makeBaseBox(18', 60_000);
  const shownText = await readWithin(
    async () => (await target.textContent(reopened)) ?? '',
    (current) => current.includes(marker),
    15_000,
  );
  const reading = {
    editStored: storedText.includes(marker),
    editKept: shownText.includes(marker),
    editToReload: Math.round(timings.reloadAt - timings.insertedAt),
    editInState: timings.editInState,
    frames: timings.frames,
  };
  await annotate(`S26 edit then immediate reload: ${JSON.stringify(reading)}`);
  await target.writeArtifact(`a01-row5c-report-${String(Date.now())}.json`, JSON.stringify(reading));
  /* The edit was in the editor's state when the reload was called, inside the 250 ms window. */
  expect(timings.editInState).toBe(true);
  expect(reading.editToReload).toBeLessThan(250);
  expect(reading, 'S26: the edit is on disk and in the editor after the reload').toMatchObject({
    editStored: true,
    editKept: true,
  });
});

/*
 * S26, D17, I6 (A7e; programme control, 2026-11-15T21:08Z). The arrangement and the view setting go first, then the
 * edit, Escape and a reload by the harness: the lane record still owes its write, so `beforeunload` runs the producer
 * stage, which starts the editor's save beside the record writes, and the document goes before that save answers. The
 * edit used to be lost from disk and from the editor (7 of 10 runs on f9a1bd11, 10 of 10 on 648a28ce). Now `pagehide`
 * records the unconfirmed text, the next open replays it through the checked save against its base, and the owed close
 * cut waits for the replay, so History's newest close revision holds the edit.
 */
test('A0.1 row 5d (S26 / D17 / I6, A7e): an edit whose save is in flight when the document goes is kept', async ({
  annotate,
}) => {
  const { marker } = await editViewArrangeAndReload(false);
  const configs = await configsByName();
  const configA = configs[projectNames.a];
  const storedText = await readWithin(
    async () => {
      if (configA === undefined) {
        return '';
      }
      const tree = await readSettledTree(configA);
      return tree[`/${entryPaths.a}`] ?? '';
    },
    (current) => current.includes(marker),
    15_000,
  );
  const source = await openSource();
  await target.expectContainingText(source, 'makeBaseBox(18', 60_000);
  const shownText = await readWithin(
    async () => (await target.textContent(source)) ?? '',
    (current) => current.includes(marker),
    15_000,
  );
  const reading = { editStored: storedText.includes(marker), editKept: shownText.includes(marker) };
  await annotate(`S26 edit with a save in flight at reload: ${JSON.stringify(reading)}`);
  await target.writeArtifact(`a01-row5d-report-${String(Date.now())}.json`, JSON.stringify(reading));
  expect(reading, 'S26: the edit is on disk and in the editor after the reload').toMatchObject({
    editStored: true,
    editKept: true,
  });

  /* I6: the owed close cut waited for the replay, so the newest close revision changed the edited file. */
  await target.click(revisionChip());
  const panel = selectors.getByCss(visibleRevisionsPanel);
  const trailerOf = () => panel.getByRole('definition').filter({ hasText: 'Tau-Trigger:' });
  await target.expectVisible(historyRow(0), 60_000);
  const newestTrailer = async (): Promise<string> => {
    const newest = historyRow(0);
    if (!(await target.isVisible(newest))) {
      return '';
    }
    const expanded = await target.getAttribute(newest, 'aria-expanded').catch(() => undefined);
    if (expanded === undefined) {
      return '';
    }
    if (expanded !== 'true') {
      await target.click(newest).catch(() => undefined);
    }
    return (await target.isVisible(trailerOf())) ? ((await target.textContent(trailerOf()).catch(() => '')) ?? '') : '';
  };
  const trailer = await readWithin(newestTrailer, (text) => /Tau-Trigger: close\b/u.test(text), 30_000);
  await annotate(`I6 newest History trailer: ${trailer || '(none)'}`);
  expect(trailer, 'I6: the newest History entry is the close cut').toMatch(/Tau-Trigger: close\b/u);
  await target.expectContainingText(panel.getByRole('list', { name: 'Changed files' }), entryPaths.a, 30_000);
});

/*
 * I2 (`ProjectFocus` `FocusFollowsLatestRequest`; fixed by A5b). Going back to A as soon as B's path commits used to
 * settle on B sometimes (6 of 10 trips in A5c's run): B's `?chat=` correction was the route's own
 * `navigate(replace)`, fired once B's editor reached `ready.operation.idle` (`use-project.tsx`), and could land after
 * the person's click to A. Focus now owns the correction: the editor reports `focusedChatResolved`, focus answers it
 * with `chatShown` only for the project it is on, and the route sink drops a command about a project the route has
 * left (MC-R18). Each trip is read only once it has settled (`readSettledProject`), so a navigation still in the route
 * gate's pending state is not counted as B. The race cannot be forced, so every attempt counts and none may end on B.
 */
test('A0.1 I2 (A5b): a fast round trip through B ends on A, never on a late B correction', async ({ annotate }) => {
  await openSeed();
  const routes = { a: await routeOf(projectNames.a), b: await routeOf(projectNames.b) };
  const attempts = 10;
  const outcomes: Array<Readonly<{ attempt: number; elapsed: number; ended: Settled }>> = [];
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    // oxlint-disable-next-line no-await-in-loop -- Each attempt starts from A at rest.
    const trip = await roundTripThroughB(false);
    // oxlint-disable-next-line no-await-in-loop -- Each attempt is read once it has settled.
    const ended = await readSettledProject(routes);
    outcomes.push({ attempt, elapsed: Math.round(trip.elapsed), ended });
    if (ended !== 'A') {
      // oxlint-disable-next-line no-await-in-loop -- The next attempt starts from A at rest.
      await target.click(projectLink(projectNames.a));
    }
    // oxlint-disable-next-line no-await-in-loop -- The next attempt starts from A at rest.
    await target.expectUrl(routes.a, 30_000);
    // oxlint-disable-next-line no-await-in-loop -- The next attempt starts from A at rest.
    await expectProjectReady('a');
    // oxlint-disable-next-line no-await-in-loop -- A at rest has its own chat on the route.
    await expect
      .poll(async () => new URL(await target.currentUrl()).searchParams.has('chat'), { timeout: 30_000 })
      .toBe(true);
  }
  const overridden = outcomes.filter((outcome) => outcome.ended === 'B').length;
  const unsettled = outcomes.filter((outcome) => outcome.ended === 'unsettled').length;
  await annotate(`I2 override: ${String(overridden)} of ${String(attempts)} (unsettled ${String(unsettled)})`);
  await annotate(`I2 attempts: ${JSON.stringify(outcomes)}`);
  /* Annotations stay in the reporter; the reading is also kept as a run artifact for the PR's evidence. */
  await target.writeArtifact(
    `a01-i2-report-${String(Date.now())}.json`,
    JSON.stringify({ overridden, unsettled, attempts, outcomes }),
  );
  expect(outcomes).toHaveLength(attempts);
  expect(overridden, 'I2: a late B correction took the route back to B').toBe(0);
});
