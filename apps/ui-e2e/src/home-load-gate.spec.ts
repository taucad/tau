/* oxlint-disable no-await-in-loop -- The returning visitor's projects are created through the UI one after another, as a visitor would. */
import { base64ToUint8Array } from 'uint8array-extras';
import { expect, test } from 'vitest';
import { page as selectors } from 'vitest/browser';
import * as target from '#support/external-target.js';
import type {
  EarlyInput,
  HomeInspection,
  HomeLoadRecord,
  ProjectLoadRecord,
  ProjectLoadRegionEntry,
  WorkerReadDelay,
} from '#support/home-load-recorder.js';
import {
  armWorkerReadDelay,
  homeLoadProbe,
  inspectServerHtml,
  openBeforeHydration,
  installHomeLoadRecorder,
  installProjectLoadRecorder,
  installWorkerReadDelay,
  knownDefectRows,
  precondition,
  projectRowMoves,
  readDelayedRequests,
  readHomeLoad,
  readProjectLoad,
  firstDelayedRead,
  readWorkerDeliveries,
  readWorkerReads,
} from '#support/home-load-recorder.js';
import type { CloudLoadRecord, CloudStandInDelays } from '#support/cloud-stand-ins.js';
import {
  cloudDefectRow,
  cloudLoadProbe,
  cloudStandInCommands,
  cloudStandInOwner,
  readCloudLoadRecord,
  recordCloudLoad,
} from '#support/cloud-stand-ins.js';

/**
 * R9 (home page loading audit): a load of Home is steady from its first frame. The target frame sequence's
 * acceptance, held at 1x and 4x CPU on a wide and a phone viewport, for a fresh visitor and for a returning one with
 * projects and a stored model:
 *
 * - no `layout-shift` entry from navigation start, other than one an input caused (CLS 0, not "good");
 * - no frame with the skills notice or its retry control, since nothing failed;
 * - no frame where the composer's model trigger prints a catalog id or nothing — in the server HTML and after
 *   hydration; a fixed-width placeholder is allowed until the catalog names the model;
 * - no frame with a loading spinner inside the application shell;
 * - no frame where the composer's box, border, outline or shadow differs from the settled page.
 *
 * A recorder installed before any page script samples every animation frame, so a state that is painted once
 * is caught; the server HTML is fetched and inspected on its own, before any script could have corrected it.
 * As in production, the UI server has the model catalog: a stand-in API on the API origin serves it the API's real
 * rows, and nothing else (no other API runs in this tier). The page's own catalog request is answered with the same
 * rows a second late, as a slow API would, so a label the page draws before the catalog arrives is seen.
 */

/** The returning visitor's library, as the audit seeded it. */
const seededProjects = Array.from({ length: 7 }, (_, index) => `Audit gearbox ${index + 1}`);
/** The returning visitor's stored model, under its storage name. */
const storedModel = { key: 'tau-chat-model', id: 'anthropic-claude-haiku-5.5' } as const;
const richComposer = selectors.getByCss('[aria-label="Ask Tau to build anything..."]');
/** How long a settled page is watched for a late change, at 1x CPU. Milliseconds. */
const settleWindow = 2000;
/** How long the page's model catalog takes to answer, as a slow API would, so a label drawn before it is seen. */
const catalogLatency = 1000;

type Profile = 'fresh' | 'returning';

/** Wide is the audit's desktop; phone is where a layout decided after hydration (`isMobile`) used to move the page. */
const viewports = {
  wide: { width: 1440, height: 900 },
  phone: { width: 390, height: 844 },
} as const;
type ViewportName = keyof typeof viewports;

/** The server's HTML for Home shows the final composer: a named or placeholder model, no notice, no spinner. */
const expectSteadyServerHtml = (label: string, inspection: HomeInspection): void => {
  expect.soft(inspection.skillsNotice, `${label}: server HTML has the skills notice`).toBe(false);
  expect.soft(inspection.shellSpinner, `${label}: server HTML has a shell spinner`).toBe(false);
  expect
    .soft(inspection.modelLabel.kind, `${label}: server HTML model trigger is ${JSON.stringify(inspection.modelLabel)}`)
    .toMatch(/^(?:name|placeholder)$/u);
};

/** One load, from its first frame to the settled page, never showed an intermediate state. */
const expectSteadyLoad = (label: string, record: HomeLoadRecord): void => {
  expect(record.frames, `${label}: the recorder sampled no frame`).toBeGreaterThan(0);
  const shifts = record.shifts.filter((shift) => !shift.hadRecentInput);
  const cls = shifts.reduce((sum, shift) => sum + shift.value, 0);
  expect.soft(shifts, `${label}: layout shifted (CLS ${cls.toFixed(4)})`).toEqual([]);
  for (const kind of ['skills-notice', 'model-label', 'shell-spinner'] as const) {
    expect
      .soft(
        record.violations.filter((violation) => violation.kind === kind),
        `${label}: ${kind}`,
      )
      .toEqual([]);
  }
  const settled = record.composer.at(-1);
  expect(settled, `${label}: the composer was never on screen`).toBeDefined();
  const changed = record.composer.filter((entry) => JSON.stringify(entry.face) !== JSON.stringify(settled?.face));
  expect.soft(changed, `${label}: composer differs from settled ${JSON.stringify(settled?.face)}`).toEqual([]);
};

/** Home has nothing left to arrive: the rich composer, the model's name and, for a returning visitor, the library. */
const waitForSettledHome = async (projects: readonly string[], rate: number): Promise<void> => {
  await target.expectVisible(richComposer, 60_000 * rate);
  await target.waitFor(
    (names) => {
      const { __TAU_HOME_LOAD__: recorder } = globalThis as typeof globalThis & {
        __TAU_HOME_LOAD__: { inspect(root: Document): HomeInspection };
      };
      const text = document.querySelector('main')?.textContent ?? '';
      return recorder.inspect(document).modelLabel.kind === 'name' && names.every((name) => text.includes(name));
    },
    projects,
    { timeout: 60_000 * rate },
  );
  await target.delay(settleWindow * rate);
};

/** Measure one load of Home, from navigation start to settled, and keep its record as evidence. */
const measure = async (
  load: () => Promise<unknown>,
  options: { readonly label: string; readonly projects: readonly string[]; readonly rate: number },
): Promise<HomeLoadRecord> => {
  await load();
  await waitForSettledHome(options.projects, options.rate);
  const record = await readHomeLoad();
  await target.writeArtifact(`home-load-gate/${options.label}.json`, `${JSON.stringify(record, null, 2)}\n`);
  return record;
};

/** The audit's returning visitor: projects created through `/projects/new`, and a stored model preference. */
const seedReturningVisitor = async (): Promise<void> => {
  for (const name of seededProjects) {
    await target.navigate('/projects/new');
    await target.fill(selectors.getByCss('input#project-name'), name);
    await target.click(selectors.getByRole('button', { name: /Create Project/u }));
    await target.expectUrl(/\/w\/[^/]+\/[^/?]+/u, 60_000);
    await target.expectVisible(selectors.getByCss('[data-project-workspace]'), 60_000);
  }
  await target.evaluate(({ key, id }) => {
    localStorage.setItem(key, JSON.stringify(id));
  }, storedModel);
};

test.each(
  (['wide', 'phone'] as const).flatMap((viewport) =>
    (['fresh', 'returning'] as const).flatMap((profile) => [1, 4].map((rate) => ({ viewport, profile, rate }))),
  ) satisfies ReadonlyArray<{ readonly viewport: ViewportName; readonly profile: Profile; readonly rate: number }>,
)(
  'should load Home in its final shape on a $viewport viewport for a $profile visitor at $rate x CPU',
  async ({ viewport, profile, rate }) => {
    /* Projects are seeded through the wide workbench; the measured loads use the row's own viewport. */
    await target.setViewport(viewports.wide);
    await target.installModelCatalogFixture(catalogLatency);
    const { serverHasCatalog } = await target.startModelCatalogApi();
    expect.soft(serverHasCatalog, 'the UI server never rendered Home with the model catalog').toBe(true);
    await installHomeLoadRecorder();
    const projects = profile === 'returning' ? seededProjects : [];
    const label = viewport === 'wide' ? `${profile}-cpu${rate}x` : `${viewport}-${profile}-cpu${rate}x`;

    if (profile === 'fresh') {
      /* The first visit itself: no cookies, no storage, nothing remembered. */
      await target.setViewport(viewports[viewport]);
      await target.emulateCpuThrottling(rate);
      expectSteadyLoad(
        `${label} first visit`,
        await measure(async () => target.navigate('/'), { label: `${label}-first-visit`, projects, rate }),
      );
    } else {
      await seedReturningVisitor();
      await target.setViewport(viewports[viewport]);
      /* A warm visit lets the page remember what it will be asked to render next time. */
      await target.navigate('/');
      await waitForSettledHome(projects, 1);
      await target.emulateCpuThrottling(rate);
    }

    expectSteadyServerHtml(label, await inspectServerHtml('/'));
    expectSteadyLoad(
      `${label} reload`,
      await measure(async () => target.reload(), { label: `${label}-reload`, projects, rate }),
    );
  },
);

/*
 * A0.10 (app state orchestration charter, D25): Home's loading defects for a returning visitor, frame by frame. Each
 * row forces its defect by delivering a file-manager worker reply late, so its defect shows on every run. The title
 * names the defect; the defect assertion names the frame and the node. Each is a plain test that stands as an
 * expected failure until the fixing lane sets `expectedFailure: false`. A row measures first and asserts after: an
 * error while measuring, in setup or teardown, or the defect assertion passing fails the row (`knownDefectRows`).
 */

/** How late a delayed worker read answers. Milliseconds. */
const readDelay = 3000;
/** The project listing Home's library and sidebar wait for. */
const projectListingRead: WorkerReadDelay = { method: 'listProjectManifests', path: '', milliseconds: readDelay };
/** Every project's chat listing. */
const chatListingRead: WorkerReadDelay = {
  method: 'readdir',
  path: String.raw`^\.tau/chats$`,
  milliseconds: readDelay,
};

const knownDefect = knownDefectRows('home-load-gate');
/** The measure budget of a row: seven projects created through the UI, then two loads of Home. Milliseconds. */
const homeBudget = 600_000;

/** The returning visitor, then one reload of Home with `delays` armed, watched until the late reads answered. */
const measureReturningReload = async ({
  viewport,
  delays,
  label,
  prepare,
  regions,
}: {
  readonly viewport: ViewportName;
  readonly delays: readonly WorkerReadDelay[];
  readonly label: string;
  /** What the visitor did on Home before the measured reload. */
  readonly prepare?: () => Promise<void>;
  /** Regions the recorder watches in every frame (A15 frame rows). */
  readonly regions?: Readonly<Record<string, string>>;
}): Promise<{ readonly record: ProjectLoadRecord; readonly since: number }> => {
  await target.setViewport(viewports.wide);
  await target.installModelCatalogFixture(catalogLatency);
  await target.startModelCatalogApi();
  await installHomeLoadRecorder();
  await installProjectLoadRecorder({ regions });
  await installWorkerReadDelay();
  await seedReturningVisitor();
  await target.setViewport(viewports[viewport]);
  await target.navigate('/');
  await waitForSettledHome(seededProjects, 1);
  await prepare?.();
  await armWorkerReadDelay(delays);
  await target.reload();
  await target.expectVisible(richComposer, 60_000);
  await target.delay(readDelay + settleWindow);
  await waitForSettledHome(seededProjects, 1);
  const record = await readProjectLoad();
  const reads = await readWorkerReads();
  const deliveries = await readWorkerDeliveries();
  await target.writeArtifact(
    `home-load-gate/${label}.json`,
    `${JSON.stringify({ record, workerReads: reads, workerDeliveries: deliveries }, null, 2)}\n`,
  );
  const held = delays.map((rule) => firstDelayedRead(deliveries, rule));
  for (const [index, rule] of delays.entries()) {
    precondition(
      held[index] !== undefined,
      `${label}: no ${rule.method} reply matching /${rule.path}/ was delivered late`,
    );
  }
  return { record, since: Math.min(...held.map((t) => t!)) };
};

for (const viewport of ['wide', 'phone'] as const) {
  knownDefect(
    `H1: Home shows no skeleton after hydration for a returning visitor on a ${viewport} viewport, with the project listing 3 s late`,
    {
      artifact: `h1-${viewport}`,
      expectedFailure: true,
      budget: homeBudget,
      measure: async () => {
        const { record } = await measureReturningReload({
          viewport,
          delays: [projectListingRead],
          label: `h1-${viewport}`,
        });
        precondition(record.hydratedFirstFrame !== undefined, 'H1: the rich composer never mounted');
        precondition(
          record.dropped['skeletonFrames'] === undefined,
          'H1: the record dropped skeleton frames past its frame limit',
        );
        return record;
      },
      assert: (record) => {
        const hydrated = record.hydratedFirstFrame!;
        const after = record.skeletonFrames.filter((frame) => frame.frame >= hydrated.frame);
        expect(
          after.map((frame) => `frame ${frame.frame} (${frame.t} ms): ${frame.count}`).slice(0, 5),
          `H1: hydrated by frame ${hydrated.frame} (${hydrated.t} ms), then [data-slot=skeleton] blocks in ${after.length} frames`,
        ).toEqual([]);
      },
    },
  );
}

knownDefect(
  'H5: no sidebar project row moves on a returning reload of Home with a project expanded and the chat listing 3 s late',
  {
    artifact: 'h5-wide',
    expectedFailure: true,
    budget: homeBudget,
    measure: async () => {
      /* The visitor left the newest project expanded: Home's sidebar then lists its chats, as the audit's did. */
      const expanded = seededProjects.at(-1)!;
      const measured = await measureReturningReload({
        viewport: 'wide',
        delays: [chatListingRead],
        label: 'h5-wide',
        prepare: async () => {
          const disclosure = selectors.getByRole('button', { name: `Expand ${expanded}`, exact: true });
          await target.click(disclosure);
          await target.expectAttribute(
            selectors.getByRole('button', { name: `Collapse ${expanded}`, exact: true }),
            'aria-expanded',
            'true',
          );
          /* The disclosure is persisted before the measured load. */
          await target.delay(settleWindow);
        },
      });
      precondition(measured.record.projectRows.length > 0, 'H5: no sidebar project row was on screen');
      return measured;
    },
    assert: ({ record, since }) => {
      /* Only what the late listing can move: a move before it was requested is not this defect's. */
      const moved = projectRowMoves(record, since);
      expect(
        moved,
        `H5: after the chat listing was requested at ${since} ms, a sidebar project row moved between frames: ${moved.join(' | ')}`,
      ).toEqual([]);
    },
  },
);

/*
 * N1 and H7 (lane A0.11), in the cloud-build tier only (`ui-e2e:test:e2e:cloud-load`): the self-host build has no
 * billing fence, so these cases cannot show the defect there. The stand-ins sign the owner in with no API
 * (`#support/cloud-stand-ins.js`). Side lane N1 fixed both defects and set each `cloudDefectRow`'s
 * `expectedFailure` to `false`, so each now passes as a guard and any fault, its defect assertion among them, fails it.
 */
const cloud = cloudStandInCommands(target.commands);
const cloudLoadTier = await cloud.uiIsCloudLoadTier();
const cloudRow = test.runIf(cloudLoadTier);
/** How long `get-session` is held for the wrapper case, so the shell is on screen before the session resolves. */
const sessionHeld = 2000;

/** Open Home as the signed-in stand-in owner with the cloud recorder; `release` runs before the session is awaited. */
const loadSignedInHome = async (
  label: string,
  delays: CloudStandInDelays,
  release?: () => Promise<void>,
): Promise<CloudLoadRecord> => {
  await target.setViewport(viewports.wide);
  await cloud.uiInstallCloudStandIns(delays);
  await target.addInitScript(recordCloudLoad, cloudLoadProbe);
  await target.navigate('/');
  await release?.();
  await target.waitFor((name) => document.body.textContent.includes(name), cloudStandInOwner.name, {
    timeout: 60_000,
  });
  await target.expectVisible(richComposer, 60_000);
  await target.delay(settleWindow);
  const record = await target.evaluate(readCloudLoadRecord);
  await target.writeArtifact(`home-load-gate/cloud-${label}.json`, `${JSON.stringify(record, null, 2)}\n`);
  return record;
};

cloudDefectRow(
  { api: cloudRow, expectedFailure: false, title: 'N1: removes no child of body on a signed-in load of Home' },
  async (defect) => {
    const record = await loadSignedInHome('n1-body', {});
    await defect(() => {
      expect(record.bodyChildRemovals, 'N1: these children of body were removed').toEqual([]);
    });
  },
);

cloudDefectRow(
  {
    api: cloudRow,
    expectedFailure: false,
    title: `N1: keeps the sidebar wrapper on Home while get-session is held ${String(sessionHeld)} ms`,
  },
  async (defect) => {
    const record = await loadSignedInHome('n1-wrapper', { session: sessionHeld });
    await defect(() => {
      expect(
        record.wrapperRemovals,
        `N1: the sidebar wrapper was removed at these times (ms); get-session was answered at ${JSON.stringify(record.sessionAnsweredAt)} ms`,
      ).toEqual([]);
    });
  },
);

/* H7 is forced by holding the session until the rich composer has upgraded, not by a fixed delay: the session's
   answer then always reaches a page whose composer is already rich. */
cloudDefectRow(
  {
    api: cloudRow,
    expectedFailure: false,
    title:
      'H7: never puts the plain textarea back after the rich composer upgraded, get-session held until the upgrade',
  },
  async (defect) => {
    const record = await loadSignedInHome('h7-composer', { session: 'held' }, async () => {
      await target.expectVisible(richComposer, 60_000);
      await cloud.uiReleaseCloudStandIn('session');
    });
    expect(record.composerUpgradedAt, 'the rich composer never upgraded').toBeDefined();
    expect(
      record.sessionAnsweredAt.every((answered) => answered > (record.composerUpgradedAt ?? Infinity)),
      `get-session was answered (${JSON.stringify(record.sessionAnsweredAt)} ms) before the upgrade`,
    ).toBe(true);
    await defect(() => {
      expect(
        record.composerReplacements,
        `H7: the plain textarea replaced the rich composer (upgraded at ${String(record.composerUpgradedAt)} ms) at these times (ms)`,
      ).toEqual([]);
    });
  },
);

/*
 * A15a frame rows for Home (loading states UX blueprint, § Red-first tests, Home), on A0.10's recorder: added after
 * A0.10 so later lanes only flip. H-a is S-flags' (#2180). A guard that holds on `main` (H-f's cancel, H-g) asserts as
 * a plain passing row; every other row stands as an expected failure, and its title names the lane that flips it.
 */

/** A row's defect assertion, with what was measured in its message, so a failure names every frame it counted. */
const expectMeasured = <Value>(actual: Value, message: string, expected: Value): void => {
  expect(actual, `${message}: ${JSON.stringify(actual)}`).toEqual(expected);
};

/** A region's entries in one record. */
const regionsOf = (record: ProjectLoadRecord, name: string): readonly ProjectLoadRegionEntry[] =>
  record.regions[name] ?? [];
const describeEntry = (entry: ProjectLoadRegionEntry): string =>
  entry.present
    ? `frame ${entry.frame} (${entry.t} ms): node ${entry.node} at ${entry.x},${entry.y} ${entry.width}x${entry.height}${entry.skeletons > 0 ? `, ${entry.skeletons} skeletons` : ''}${entry.text === '' ? '' : ` "${entry.text.slice(0, 40)}"`}`
    : `frame ${entry.frame} (${entry.t} ms): absent`;
/** The region's state in a frame: its last change at or before that frame. */
const regionAt = (entries: readonly ProjectLoadRegionEntry[], frame: number): ProjectLoadRegionEntry | undefined =>
  entries.findLast((entry) => entry.frame <= frame);

/** Home's project grid: the list, or its loading stand-in. */
const projectGrid = 'ul[aria-label="Projects"], [role="status"][aria-label="Loading projects"]';
const homeRegions = {
  firstCard: 'ul[aria-label="Projects"] [data-slot="card"]',
  grid: projectGrid,
  recentsIndicator: '[data-slot="sidebar"] [data-slot="wait-indicator-body"]',
} as const;

knownDefect(
  'H-b (A13, A15g): a returning reload of Home with the project listing 3 s late shows the seeded rows and cards from the first frame after hydration, with no skeleton in any frame',
  {
    artifact: 'h-b-wide',
    expectedFailure: true,
    budget: homeBudget,
    measure: async () => {
      const { record } = await measureReturningReload({
        viewport: 'wide',
        delays: [projectListingRead],
        label: 'h-b-wide',
        regions: homeRegions,
      });
      precondition(record.hydratedFirstFrame !== undefined, 'H-b: the rich composer never mounted');
      precondition(
        record.dropped['skeletonFrames'] === undefined,
        'H-b: the record dropped skeleton frames past its frame limit',
      );
      return record;
    },
    assert: (record) => {
      const hydrated = record.hydratedFirstFrame!;
      const rows = new Set(
        record.projectRows.filter((entry) => entry.frame <= hydrated.frame).map((entry) => entry.row),
      );
      const card = regionAt(regionsOf(record, 'firstCard'), hydrated.frame);
      expectMeasured(
        {
          missingRows: seededProjects.filter((name) => !rows.has(name)),
          firstCardNamed: card?.present === true && seededProjects.some((name) => card.text.includes(name)),
          skeletonFrames: record.skeletonFrames
            .slice(0, 3)
            .map((entry) => `frame ${entry.frame} (${entry.t} ms): ${entry.count}`),
        },
        `H-b: hydrated by frame ${hydrated.frame} (${hydrated.t} ms); the first card then: ${card === undefined ? 'absent' : describeEntry(card)}; ${record.skeletonFrames.length} frames had skeleton blocks`,
        { missingRows: [], firstCardNamed: true, skeletonFrames: [] },
      );
    },
  },
);

knownDefect(
  'H-c (A13, A15g): with nothing remembered and the project listing 3 s late, Home draws no skeleton, its Recents indicator shows from 1,000 ms, and the grid is busy',
  {
    artifact: 'h-c-wide',
    expectedFailure: true,
    budget: homeBudget,
    measure: async () => {
      const { record } = await measureReturningReload({
        viewport: 'wide',
        delays: [projectListingRead],
        label: 'h-c-wide',
        regions: homeRegions,
        /* Nothing remembered: the page's local storage is emptied, so no listing it kept can paint first. */
        prepare: async () => {
          await target.evaluate(() => {
            localStorage.clear();
          });
        },
      });
      return record;
    },
    assert: (record) => {
      const firstShown = regionsOf(record, 'recentsIndicator').find(
        (entry) => entry.present && entry.visible && entry.text !== '',
      );
      expectMeasured(
        {
          skeletonFrames: record.skeletonFrames.length,
          indicatorShown: firstShown !== undefined,
          indicatorEarly: firstShown !== undefined && firstShown.t < 1000,
          gridBusy: regionsOf(record, 'grid').some((entry) => entry.present && entry.busy),
        },
        `H-c: ${record.skeletonFrames.length} frames had skeleton blocks; the Recents indicator first showed ${firstShown === undefined ? 'never' : `at ${firstShown.t} ms`}`,
        { skeletonFrames: 0, indicatorShown: true, indicatorEarly: false, gridBusy: true },
      );
    },
  },
);

/** Every card's thumbnail read, answered 2 s late. */
const thumbnailRead: WorkerReadDelay = { method: 'readFile', path: String.raw`thumbnail\.webp$`, milliseconds: 2000 };
const thumbnailRegions = {
  boxIcon: 'ul[aria-label="Projects"] svg[aria-label="No saved preview"]',
  media: 'ul[aria-label="Projects"] [data-slot="card"] :has(> svg[aria-label="No saved preview"], > img)',
} as const;

knownDefect(
  'H-d (A15g): with the thumbnail read 2 s late, no card draws the no-preview icon before the read settles, and the media box keeps its box',
  {
    artifact: 'h-d-wide',
    expectedFailure: true,
    budget: homeBudget,
    measure: async () =>
      measureReturningReload({
        viewport: 'wide',
        delays: [thumbnailRead],
        label: 'h-d-wide',
        regions: thumbnailRegions,
      }),
    assert: ({ record, since }) => {
      const settledAt = since + thumbnailRead.milliseconds;
      const early = regionsOf(record, 'boxIcon').filter((entry) => entry.present && entry.t < settledAt);
      const media = regionsOf(record, 'media').filter((entry) => entry.present);
      const settled = media.at(-1);
      const moved = media.filter(
        (entry) =>
          settled !== undefined &&
          (Math.abs(entry.x - settled.x) > 1 ||
            Math.abs(entry.y - settled.y) > 1 ||
            Math.abs(entry.width - settled.width) > 1 ||
            Math.abs(entry.height - settled.height) > 1),
      );
      expectMeasured(
        {
          earlyIcon: early.slice(0, 3).map((entry) => describeEntry(entry)),
          mediaMoves: moved.slice(0, 3).map((entry) => describeEntry(entry)),
        },
        `H-d: the thumbnail read was sent at ${since} ms and answered from ${settledAt} ms`,
        { earlyIcon: [], mediaMoves: [] },
      );
    },
  },
);

const homeDraft = 'A bracket for the shelf';
const composerRegions = { input: homeLoadProbe.composerEditor } as const;

knownDefect('H-e (A15d): a stored Home draft is the composer value in the first frame it is painted', {
  artifact: 'h-e-wide',
  expectedFailure: true,
  budget: homeBudget,
  measure: async () => {
    await target.setViewport(viewports.wide);
    await target.installModelCatalogFixture(catalogLatency);
    await target.startModelCatalogApi();
    await installProjectLoadRecorder({ regions: composerRegions });
    await target.navigate('/');
    await target.expectVisible(richComposer, 60_000);
    await target.type(richComposer, homeDraft);
    /* The draft is in Home's composer record before the measured load. */
    await target.delay(settleWindow * 2);
    await target.reload();
    await target.expectVisible(richComposer, 60_000);
    await target.waitFor(
      (selector) => document.querySelector(selector)?.textContent.includes('A bracket') === true,
      '[aria-label="Ask Tau to build anything..."]',
      { timeout: 60_000 },
    );
    const record = await readProjectLoad();
    await target.writeArtifact('home-load-gate/h-e-wide.json', `${JSON.stringify({ record }, null, 2)}\n`);
    precondition(
      regionsOf(record, 'input').some((entry) => entry.present && entry.text === homeDraft),
      'H-e: the draft never came back after the reload',
    );
    return record;
  },
  assert: (record) => {
    const first = regionsOf(record, 'input').find((entry) => entry.present);
    expectMeasured(
      first?.text,
      `H-e: the composer's first painted value, ${first === undefined ? 'absent' : describeEntry(first)}`,
      homeDraft,
    );
  },
});

/** The entry chunk every page loads first: holding it holds hydration. */
const entryChunk = String.raw`/assets/entry\.client-[\w-]+\.js(?:\?|$)`;
const richComposerHydrated = '[aria-label="Ask Tau to build anything..."][contenteditable="true"]';
const firstMessage = 'Make a bracket.';

/** The entry chunk was held, so the acts before hydration had a window to land in. */
const requireEntryChunkHeld = async (label: string): Promise<void> => {
  const held = await readDelayedRequests();
  precondition(
    held.some((url) => new RegExp(entryChunk, 'u').test(url)),
    `${label}: the entry chunk was never delayed`,
  );
};

/** A fresh visitor types on Home before it hydrates, with the entry chunk 2 s late; what happened after adoption. */
const typeBeforeHomeHydrates = async (
  label: string,
  input: { readonly enter: boolean; readonly afterEnter?: string },
): Promise<{
  readonly early: EarlyInput;
  readonly onProject: boolean;
  readonly text: string;
  readonly paragraphs: number;
  readonly projects: number;
}> => {
  await target.setViewport(viewports.wide);
  await target.installModelCatalogFixture(catalogLatency);
  await target.startModelCatalogApi();
  await target.installAgentHostGatewayFixture([
    { text: 'Started on the bracket.', usage: { inputTokens: 1, outputTokens: 1 } },
  ]);
  await target.navigate('/');
  await target.expectVisible(richComposer, 60_000);
  await target.commands.uiDelayTargetRequests(entryChunk, 2000);
  const early = await openBeforeHydration({
    path: '/',
    input: homeLoadProbe.composerEditor,
    hydrated: richComposerHydrated,
    text: firstMessage,
    enter: input.enter,
    afterEnter: input.afterEnter,
    wait: 1500,
    settle: 0,
  });
  await target.expectVisible(richComposer, 60_000);
  /* A send creates a project and opens it; time for it to happen, or not. */
  await target.delay(settleWindow * 4);
  const state = await target.evaluate(() => ({
    onProject: /^\/w\/[^/]+\/[^/]+/u.test(location.pathname),
    text: document.querySelector('[aria-label="Ask Tau to build anything..."]')?.textContent ?? '',
    /* Enter taken as a line break leaves two paragraphs; taken as a send, one. */
    paragraphs: document.querySelectorAll('[aria-label="Ask Tau to build anything..."] p').length,
    projects: document.querySelectorAll('[data-slot="project-trigger"]').length,
  }));
  await target.writeArtifact(`home-load-gate/${label}.json`, `${JSON.stringify({ early, state }, null, 2)}\n`);
  precondition(early.found, `${label}: the served composer was not on screen before hydration`);
  precondition(!early.hydratedBeforeAct, `${label}: the page had hydrated before the typing`);
  await requireEntryChunkHeld(label);
  return { early, ...state };
};

knownDefect(
  'H-f (A15d): Enter pressed before Home hydrates, with the entry chunk 2 s late, sends exactly once after adoption',
  {
    artifact: 'h-f-send-wide',
    expectedFailure: true,
    budget: homeBudget,
    measure: async () => typeBeforeHomeHydrates('h-f-send-wide', { enter: true }),
    assert: ({ onProject, projects, text }) => {
      expectMeasured(
        { onProject, projects },
        `H-f: after adoption the page is ${onProject ? 'a project' : 'still Home'}, with ${projects} projects; the composer holds ${JSON.stringify(text)}`,
        { onProject: true, projects: 1 },
      );
    },
  },
);

knownDefect('H-f (A15d): an edit after Enter before Home hydrates cancels the queued send and keeps the text', {
  artifact: 'h-f-cancel-wide',
  expectedFailure: true,
  budget: homeBudget,
  measure: async () => typeBeforeHomeHydrates('h-f-cancel-wide', { enter: true, afterEnter: ' Twice' }),
  assert: ({ onProject, projects, text, paragraphs }) => {
    /* One paragraph: Enter was taken as a send (then cancelled), not as a line break. */
    expectMeasured(
      { onProject, projects, kept: text.includes(firstMessage) && text.includes('Twice'), paragraphs },
      `H-f: after adoption the composer holds ${JSON.stringify(text)} in ${paragraphs} paragraphs`,
      { onProject: false, projects: 0, kept: true, paragraphs: 1 },
    );
  },
});

/**
 * Two PNG screenshots (base64) of one box, compared in this runner's page: the count of pixels whose colour differs.
 *
 * @returns The differing pixels, or the sizes when they do not match.
 */
const differingPixels = async (before: string, after: string): Promise<number | string> => {
  const decode = async (base64: string): Promise<ImageData> => {
    const bytes = base64ToUint8Array(base64);
    const bitmap = await createImageBitmap(new Blob([bytes], { type: 'image/png' }));
    const canvas = new OffscreenCanvas(bitmap.width, bitmap.height);
    const context = canvas.getContext('2d')!;
    context.drawImage(bitmap, 0, 0);
    return context.getImageData(0, 0, bitmap.width, bitmap.height);
  };
  const [left, right] = await Promise.all([decode(before), decode(after)]);
  if (left.width !== right.width || left.height !== right.height) {
    return `${left.width}x${left.height} against ${right.width}x${right.height}`;
  }
  let differing = 0;
  for (let index = 0; index < left.data.length; index += 4) {
    if (
      left.data[index] !== right.data[index] ||
      left.data[index + 1] !== right.data[index + 1] ||
      left.data[index + 2] !== right.data[index + 2] ||
      left.data[index + 3] !== right.data[index + 3]
    ) {
      differing += 1;
    }
  }
  return differing;
};

knownDefect(
  'H-g (A15d, guard): the Home composer region is pixel-identical before and after adoption, the caret hidden, with the entry chunk 2 s late',
  {
    artifact: 'h-g-wide',
    expectedFailure: false,
    budget: homeBudget,
    measure: async () => {
      await target.setViewport(viewports.wide);
      await target.installModelCatalogFixture(catalogLatency);
      await target.startModelCatalogApi();
      await target.navigate('/');
      await target.expectVisible(richComposer, 60_000);
      await target.commands.uiDelayTargetRequests(entryChunk, 2000);
      const early = await openBeforeHydration({
        path: '/',
        input: homeLoadProbe.composerEditor,
        hydrated: richComposerHydrated,
        /* The composer's box: its input and its bar. */
        region: ':has(> [data-slot="composer-bar"])',
        screenshots: true,
        wait: 1500,
        settle: settleWindow,
      });
      precondition(early.found, 'H-g: the served composer was not on screen before hydration');
      precondition(!early.hydratedBeforeAct, 'H-g: the page had hydrated before the first screenshot');
      await requireEntryChunkHeld('H-g');
      precondition(early.before !== undefined && early.after !== undefined, 'H-g: a screenshot is missing');
      const differing = await differingPixels(early.before!, early.after!);
      await target.writeArtifact(
        'home-load-gate/h-g-wide.json',
        `${JSON.stringify({ box: early.box, differing }, null, 2)}\n`,
      );
      return differing;
    },
    assert: (differing) => {
      expect(differing, 'H-g: pixels of the composer differ across adoption').toBe(0);
    },
  },
);
