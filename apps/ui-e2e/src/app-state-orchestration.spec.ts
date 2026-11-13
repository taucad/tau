/**
 * The app state orchestration programme's e2e witness rows (charter D14, D25, package A0.1).
 *
 * Every later wiring lane runs this file and attaches the run. Each row asserts concrete state (a
 * node, an open pane, file bytes, a journal row, a revision entry), never a bare timeout. Three kinds:
 *
 * - characterisation rows, green on `main`;
 * - expected-failure rows (`test.fails`, W0): today's defect, red on its own assertion; the owning
 *   lane flips the row to `test` and never deletes it;
 * - one report-only row, which records how often an unforced defect shows and never fails on it.
 */
import { expect, test } from 'vitest';
import { page as selectors } from 'vitest/browser';
import type { Locator } from 'vitest/browser';
import * as target from '#support/external-target.js';
import {
  readProjectLibraryEvidence,
  readProjectStorageState,
  readProjectTree,
  writePendingPermanentDelete,
} from '#support/project-storage-state.js';
import type { StoredProjectConfig } from '#support/project-storage-state.js';
import { awaitSaved, historyRow, revisionChip, visibleRevisionsPanel } from '#support/revision-session.js';
import { filesPane, treeItem } from '#support/file-tree.js';

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

/** Each project's durable config, by its manifest name. */
const configsByName = async (): Promise<Readonly<Record<string, StoredProjectConfig>>> => {
  const { configs } = await readProjectStorageState();
  const entries = await Promise.all(
    configs.map(async (config) => {
      const tree = await readProjectTree(config);
      const manifest = tree['/tau.json'];
      return manifest === undefined ? undefined : ([(JSON.parse(manifest) as { name: string }).name, config] as const);
    }),
  );
  return Object.fromEntries(entries.filter((entry) => entry !== undefined));
};

const readLayout = async (config: StoredProjectConfig): Promise<{ lanes?: { workbench?: boolean } } | undefined> => {
  const tree = await readProjectTree(config);
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
  /** From B's route settling with its chat to the click on A; `undefined` when the trip did not wait for it. */
  dwell?: number;
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
      const settledOnB = await new Promise<number | undefined>((resolve) => {
        const check = (): void => {
          const onB = location.pathname === toB;
          if (onB && (!settle || new URLSearchParams(location.search).has('chat'))) {
            resolve(performance.now());
            return;
          }
          /* Bounded, so a route that never settles fails the row's reading instead of hanging. */
          if (performance.now() - startedAt > 30_000) {
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
        ...(settle ? { dwell: settledOnB === undefined ? Number.POSITIVE_INFINITY : clickedAt - settledOnB } : {}),
      };
    },
    { names: { a: projectNames.a, b: projectNames.b }, settle: settleOnB },
  );

test('A0.1 row 1 (I10): project A keeps its arrangement across a round trip with under one second on B', async () => {
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

  /* The round trip, with under one second on B: from B's route settling with its own chat to the
   * person's click back to A. Going back before that correction lands is the I2 report-only row's
   * subject: B's late replace can take the route back to B, which is not this row's claim. */
  const trip = await roundTripThroughB(true);
  expect(trip.dwell).toBeLessThan(1000);

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
 * Expected failure, owned by A8b (I11, `LayoutApply` `IntentAccounted`). On a cold load the intent is
 * consumed but the pane never opens: before the layout record's first read, `openPanel` defers it through
 * `layoutController.personWorkbenchChanged`, whose callback drops it when the route key moved
 * (`project-workspace-context.tsx`), and the intent's own parameter cleanup and the `?chat=` correction
 * both move it. A8b flips this row to `test`.
 */
test.fails('A0.1 row 2 (I11, expected failure, A8b): the Print pane intent of a cold project link is lost before the workbench is ready', async () => {
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

  /* The defect's own assertion: the pane the link asked for is open. */
  const print = await readWithin(
    async () => target.read(dockTab('Print')),
    (state) => state.visible,
    15_000,
  );
  expect(print.visible, 'I11: the Print pane is open once the workbench is ready').toBe(true);
  expect(print.className).toMatch(/\bdv-active-tab\b/u);
});

test('A0.1 row 3 (I8): a reload during a pending library operation recovers or reports it, and the project opens', async ({
  annotate,
}) => {
  await openSeed();
  const configs = await configsByName();
  const configB = configs[projectNames.b]!;

  /* The person moves B to the Trash, which a permanent delete requires. A project with chats is
   * trashed only from a live session that has read them (`use-projects.ts` `requireQuiescentProject`),
   * so B is opened first and left retained. */
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
  await annotate(`journal row ${outcome ?? 'unsettled'}`);
  if (outcome === 'recovered') {
    /* Recovered: the delete ran to its end, so B's route config, library row and directory are gone. */
    const { configs } = await readProjectStorageState();
    expect(configs.map((config) => config.projectId)).not.toContain(configB.projectId);
    const settled = await readProjectLibraryEvidence(configB.projectId);
    expect(settled.hasLibraryState).toBe(false);
    expect(await readProjectTree(configB)).toEqual({});
    await target.expectCount(report, 0, 30_000);
  } else {
    /* Reported: the library names the row it could not finish. */
    await target.expectContainingText(report, directory, 30_000);
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
  await target.expectUrl(await routeOf(renamed), 30_000);
  await target.expectVisible(dockTab(entryPaths.a), 30_000);
  await target.expectCount(selectors.getByText(/doesn't exist|may have been deleted|project not found/iu), 0);
});

type SectionCut = Readonly<{ kind: 'plane'; plane: 'xy' | 'xz' | 'yz'; offset: number; isFlipped: boolean }>;
type SectionBridge = Readonly<{
  setSectionCuts(cuts: readonly SectionCut[]): string[];
  getSectionState(): Readonly<{ isActive: boolean; cuts: ReadonlyArray<SectionCut & Readonly<{ id: string }>> }>;
}>;

/** The live section's values; cut ids are made anew at every seed, so they are left out. */
const readSection = async (): Promise<Readonly<{ isActive: boolean; cuts: readonly SectionCut[] }> | undefined> =>
  target.evaluate(() => {
    const bridge = (globalThis as typeof globalThis & { __TAU_SECTION_VIEW_TEST__?: SectionBridge })
      .__TAU_SECTION_VIEW_TEST__;
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

type EditedAndReloaded = Readonly<{ marker: string; cut: SectionCut }>;

/**
 * Edit A's entry file, a view setting and the arrangement, then reload at once: nothing waits for a save,
 * and the file edit comes last so no blur saves it first.
 */
const editViewArrangeAndReload = async (): Promise<EditedAndReloaded> => {
  await openSeed();
  const marker = `// close-cut witness ${Math.random().toString(36).slice(2, 10)}`;
  await target.expectVisible(revisionChip(), 60_000);
  await awaitSaved();

  /* The file, open in the editor the way a person opens it. */
  const source = await openSource();
  await target.expectContainingText(source, 'makeBaseBox(18', 30_000);

  /* The arrangement: the person closes the Chat lane. */
  const chatToggle = selectors.getByRole('button', { name: 'Toggle Chat lane' }).first();
  await target.expectAttribute(chatToggle, 'aria-pressed', 'true');
  await target.click(chatToggle);
  await target.expectAttribute(chatToggle, 'aria-pressed', 'false');

  /* The view setting: a section cut on A's view. */
  await target.waitFor(() =>
    Boolean((globalThis as typeof globalThis & { __TAU_SECTION_VIEW_TEST__?: unknown }).__TAU_SECTION_VIEW_TEST__),
  );
  const cut: SectionCut = { kind: 'plane', plane: 'xz', offset: 0.017, isFlipped: true };
  await target.evaluate((nextCut) => {
    const bridge = (globalThis as typeof globalThis & { __TAU_SECTION_VIEW_TEST__?: SectionBridge })
      .__TAU_SECTION_VIEW_TEST__;
    bridge?.setSectionCuts([nextCut]);
  }, cut);
  await expect.poll(readSection).toEqual({ isActive: true, cuts: [cut] });

  /* The edit, last, and the reload at once. */
  await target.click(source);
  await target.keyboardPress('ControlOrMeta+End');
  await target.type(source, marker);
  await target.keyboardPress('Escape');
  await target.expectContainingText(source, marker);
  await target.reload();
  await target.expectUrl(projectRoute, 60_000);
  await target.expectVisible(dockTab(entryPaths.a), 60_000);
  return { marker, cut };
};

test('A0.1 row 5a (S26, D26): an edit, a view setting and an arrangement survive an immediate reload locally', async () => {
  const { marker, cut } = await editViewArrangeAndReload();
  await target.expectAttribute(
    selectors.getByRole('button', { name: 'Toggle Chat lane' }).first(),
    'aria-pressed',
    'false',
    60_000,
  );
  await target.expectContainingText(await openSource(), marker, 60_000);
  await expect.poll(readSection, { timeout: 60_000 }).toEqual({ isActive: true, cuts: [cut] });
});

/*
 * Expected failure, owned by A7c, which depends on A5b's unload sequencer (I6, S26, D26). Today a reload
 * cuts no close revision at all: History holds only V1 Start (`Tau-Trigger: create`) and the strip says
 * *Unsaved changes*, even when the edit has settled before the reload. The fix is a close cut, taken as
 * the registry's session stage after every producer settles, on the unload a reload is. A7c flips this
 * row to `test`.
 */
test.fails('A0.1 row 5b (I6 / S26 / D26, expected failure, A7c): no close revision holding the edit is cut on an immediate reload', async () => {
  await editViewArrangeAndReload();
  await target.click(revisionChip());
  const newest = historyRow(0);
  await target.expectVisible(newest, 60_000);
  if ((await target.getAttribute(newest, 'aria-expanded')) !== 'true') {
    await target.click(newest);
  }
  const panel = selectors.getByCss(visibleRevisionsPanel);
  const changedFiles = panel.getByRole('list', { name: 'Changed files' });
  const trailer = panel.getByRole('definition').filter({ hasText: 'Tau-Trigger:' });
  await target.expectVisible(changedFiles, 30_000);
  await target.expectVisible(trailer, 30_000);

  /* The defect's own assertion: History's newest entry was cut at close, and it changed the file. */
  expect(await target.textContent(trailer), 'I6: the newest History entry is the close cut').toMatch(
    /Tau-Trigger: close\b/u,
  );
  expect(await target.textContent(changedFiles)).toContain(entryPaths.a);
});

/*
 * Report-only (I2, `ProjectFocus` `FocusFollowsLatestRequest`; owner A5c). Going back to A as soon as B's
 * path commits sometimes ends on B: B's late `?chat=` correction (`project-route.tsx`
 * `handleFocusedChatResolved`, a `navigate(replace)`) lands after the person's click to A. It cannot be
 * forced from here: the correction waits on the chat-session store's local read, which no network route
 * can hold. So the row records k of n and never fails on it; every attempt counts.
 */
test('A0.1 I2 report-only (A5c): a fast round trip through B and the late B correction that overrides it', async ({
  annotate,
}) => {
  await openSeed();
  const routeA = await routeOf(projectNames.a);
  const routeB = await routeOf(projectNames.b);
  const attempts = 10;
  const outcomes: Array<Readonly<{ attempt: number; elapsed: number; ended: 'A' | 'B' | 'unsettled' }>> = [];
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    // oxlint-disable-next-line no-await-in-loop -- Each attempt starts from A at rest.
    const trip = await roundTripThroughB(false);
    // oxlint-disable-next-line no-await-in-loop -- Each attempt is read before the next starts.
    const ended = await readWithin(
      async (): Promise<'A' | 'B' | 'unsettled'> => {
        const url = await target.currentUrl();
        if (routeB.test(url)) {
          return 'B';
        }
        const isOnReadyA = routeA.test(url) && (await target.isVisible(dockTab(entryPaths.a)));
        return isOnReadyA ? 'A' : 'unsettled';
      },
      (where) => where !== 'unsettled',
      30_000,
    );
    outcomes.push({ attempt, elapsed: Math.round(trip.elapsed), ended });
    if (ended !== 'A') {
      // oxlint-disable-next-line no-await-in-loop -- The next attempt starts from A at rest.
      await target.click(projectLink(projectNames.a));
    }
    // oxlint-disable-next-line no-await-in-loop -- The next attempt starts from A at rest.
    await target.expectUrl(routeA, 30_000);
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
});
