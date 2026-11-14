/* oxlint-disable no-await-in-loop -- The returning visitor's projects are created through the UI one after another, as a visitor would. */
import { expect, test } from 'vitest';
import { page as selectors } from 'vitest/browser';
import * as target from '#support/external-target.js';
import type {
  HomeInspection,
  HomeLoadRecord,
  ProjectLoadRecord,
  WorkerReadDelay,
} from '#support/home-load-recorder.js';
import {
  armWorkerReadDelay,
  inspectServerHtml,
  installHomeLoadRecorder,
  installProjectLoadRecorder,
  installWorkerReadDelay,
  knownDefectRows,
  precondition,
  projectRowMoves,
  readHomeLoad,
  readProjectLoad,
  firstDelayedRead,
  readWorkerDeliveries,
  readWorkerReads,
} from '#support/home-load-recorder.js';
import type { CloudLoadRecord, CloudStandInDelays } from '#support/cloud-stand-ins.js';
import { useFlagState } from '#support/flag-state-test.js';
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
}: {
  readonly viewport: ViewportName;
  readonly delays: readonly WorkerReadDelay[];
  readonly label: string;
  /** What the visitor did on Home before the measured reload. */
  readonly prepare?: () => Promise<void>;
}): Promise<{ readonly record: ProjectLoadRecord; readonly since: number }> => {
  await target.setViewport(viewports.wide);
  await target.installModelCatalogFixture(catalogLatency);
  await target.startModelCatalogApi();
  await installHomeLoadRecorder();
  await installProjectLoadRecorder();
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
      expectedFailure: false,
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
    expectedFailure: false,
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
 * H-c and H-d (A15g, P-d and P-g): what Home shows while it does not know yet. A per-frame recorder of its own,
 * self-contained because it runs in the page: when the sidebar's "Loading projects" words were first visible,
 * whether the sidebar's list and the project grid were busy, when the "No saved preview" icon was first on screen,
 * and the first card's media box, each time it changed.
 */
type WaitSlotRecord = {
  recentsShownAt?: number;
  sidebarBusyAt?: number;
  gridStates: Array<{ t: number; busy: boolean }>;
  noPreviewIconAt?: number;
  mediaRects: Array<{ t: number; rect: string }>;
};
const recordWaitSlots = (): void => {
  const record: WaitSlotRecord = { gridStates: [], mediaRects: [] };
  Object.defineProperty(globalThis, '__TAU_WAIT_SLOTS__', { value: record });
  const now = (): number => Math.round(performance.now());
  const sample = (): void => {
    /* The app sidebar's own slot: other surfaces also mark themselves `data-sidebar="sidebar"`. */
    const sidebar = document.querySelector('[data-slot="sidebar"]');
    if (
      record.recentsShownAt === undefined &&
      [...(sidebar?.querySelectorAll('[data-slot="wait-indicator"]') ?? [])].some(
        // oxlint-disable-next-line unicorn/prefer-dom-node-text-content -- the visible words only: the indicator lays its words out hidden.
        (slot) => slot instanceof HTMLElement && slot.innerText.includes('Loading projects'),
      )
    ) {
      record.recentsShownAt = now();
    }
    if (record.sidebarBusyAt === undefined && sidebar?.querySelector('ul[aria-busy="true"]')) {
      record.sidebarBusyAt = now();
    }
    const grid = document.querySelector('main ul[aria-label="Projects"]');
    const busy = grid?.getAttribute('aria-busy') === 'true';
    if (grid && record.gridStates.at(-1)?.busy !== busy) {
      record.gridStates.push({ t: now(), busy });
    }
    if (record.noPreviewIconAt === undefined && document.querySelector('main [aria-label="No saved preview"]')) {
      record.noPreviewIconAt = now();
    }
    const media = grid?.querySelector('li [class*="aspect-4/3"]');
    if (media) {
      const box = media.getBoundingClientRect();
      const rect = `${Math.round(box.width)}x${Math.round(box.height)}`;
      if (record.mediaRects.at(-1)?.rect !== rect) {
        record.mediaRects.push({ t: now(), rect });
      }
    }
    requestAnimationFrame(sample);
  };
  requestAnimationFrame(sample);
};
const readWaitSlots = async (): Promise<WaitSlotRecord> =>
  target.evaluate(() => (globalThis as typeof globalThis & { __TAU_WAIT_SLOTS__: WaitSlotRecord }).__TAU_WAIT_SLOTS__);

/** The indicator delay of the timing ladder (UI Policy § 6). Milliseconds. */
const indicatorDelay = 1000;
/** Every project's saved thumbnail, read from its working copy (the worker sees the path inside the project). */
const thumbnailRead: WorkerReadDelay = {
  method: 'readFile',
  path: String.raw`^thumbnail\.webp$`,
  milliseconds: 2000,
};

/* A guard: main meets it since A15g (#2214), measured 5 of 5 on its base. */
knownDefect(
  `H-c: Home with nothing stored draws no skeleton, says "Loading projects" in Recents from ${String(indicatorDelay)} ms and keeps the waiting lists busy, with the project listing 3 s late`,
  {
    artifact: 'h-c-wide',
    expectedFailure: false,
    budget: homeBudget,
    measure: async () => {
      await target.setViewport(viewports.wide);
      await target.installModelCatalogFixture(catalogLatency);
      await target.startModelCatalogApi();
      await installProjectLoadRecorder();
      await installWorkerReadDelay();
      await target.addInitScript(recordWaitSlots);
      await target.navigate('/');
      await target.expectVisible(richComposer, 60_000);
      /* Nothing stored: no listing snapshot, no remembered count and no layout hint survive into the measured load. */
      await target.evaluate(async () => {
        localStorage.clear();
        const cookies = await cookieStore.getAll();
        await Promise.all(cookies.map(async (cookie) => cookieStore.delete(cookie.name ?? '')));
      });
      await armWorkerReadDelay([projectListingRead]);
      await target.reload();
      await target.expectVisible(richComposer, 60_000);
      await target.delay(readDelay + settleWindow);
      const record = await readProjectLoad();
      const slots = await readWaitSlots();
      const deliveries = await readWorkerDeliveries();
      await target.writeArtifact(
        'home-load-gate/h-c-wide.json',
        `${JSON.stringify({ record, slots, workerDeliveries: deliveries }, null, 2)}\n`,
      );
      const listedAt = firstDelayedRead(deliveries, projectListingRead);
      precondition(listedAt !== undefined, 'H-c: the project listing was not answered late');
      precondition(
        record.dropped['skeletonFrames'] === undefined,
        'H-c: the record dropped skeleton frames past its frame limit',
      );
      return { record, slots };
    },
    assert: ({ record, slots }) => {
      expect(
        {
          skeletonFrames: record.skeletonFrames.length,
          recentsShownFromDelay: slots.recentsShownAt !== undefined && slots.recentsShownAt >= indicatorDelay,
          sidebarBusy: slots.sidebarBusyAt !== undefined,
          gridIdleWhileWaiting: slots.gridStates.some(
            (state) => !state.busy && slots.recentsShownAt !== undefined && state.t < slots.recentsShownAt,
          ),
        },
        `H-c: skeleton frames ${JSON.stringify(record.skeletonFrames.slice(0, 3))}, slots ${JSON.stringify(slots)}`,
      ).toEqual({ skeletonFrames: 0, recentsShownFromDelay: true, sidebarBusy: true, gridIdleWhileWaiting: false });
    },
  },
);

/* A guard: main meets it since A15g (#2214), measured 5 of 5 on its base. */
knownDefect(
  'H-d: a returning visitor\'s Home card draws no "No saved preview" icon before its thumbnail read settles, its media box still, with the read 2 s late',
  {
    artifact: 'h-d-wide',
    expectedFailure: false,
    budget: homeBudget,
    measure: async () => {
      await target.addInitScript(recordWaitSlots);
      const { record } = await measureReturningReload({
        viewport: 'wide',
        delays: [thumbnailRead],
        label: 'h-d-wide',
      });
      const slots = await readWaitSlots();
      const deliveries = await readWorkerDeliveries();
      const settledAt = Math.min(
        ...deliveries
          .filter(
            (entry) =>
              entry.method === thumbnailRead.method && new RegExp(thumbnailRead.path, 'u').test(entry.path ?? ''),
          )
          .map((entry) => entry.t),
      );
      precondition(Number.isFinite(settledAt), 'H-d: no thumbnail read was answered late');
      precondition(slots.mediaRects.length > 0, 'H-d: no card media box was on screen');
      await target.writeArtifact('home-load-gate/h-d-slots.json', `${JSON.stringify({ slots, settledAt }, null, 2)}\n`);
      return { record, slots, settledAt };
    },
    assert: ({ slots, settledAt }) => {
      expect(
        {
          iconBeforeRead: slots.noPreviewIconAt !== undefined && slots.noPreviewIconAt < settledAt,
          mediaResized: slots.mediaRects.length > 1,
        },
        `H-d: the thumbnail read answered at ${settledAt} ms; slots ${JSON.stringify(slots)}`,
      ).toEqual({ iconBeforeRead: false, mediaResized: false });
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
 * H-a (loading-states blueprint, H2; lane S-flags): with `onboarding` on, Home's suggestions row is decided or held by
 * the server, so nothing under the composer moves when the flag resolves. Measured on a first visit (no
 * `layout-flags` cookie: the row's box is held and filled in place) and on the reload that follows (the cookie says
 * on: the server renders the box). The setup invite, which `onboarding` also shows, is dismissed on this device so
 * the row is the only flagged surface on Home. A self-host row, so `cloudDefectRow` runs under plain `test`.
 */
type SuggestionsRowRecord = {
  readonly shifts: ReadonlyArray<{ readonly t: number; readonly value: number; readonly sources: readonly string[] }>;
  /** Every distinct top of each element under the composer, from the first frame it was on screen. */
  readonly tops: Readonly<Record<string, ReadonlyArray<{ readonly t: number; readonly y: number }>>>;
  /** Every distinct height of the row's list, from the first frame it was on screen. */
  readonly rowHeights: ReadonlyArray<{ readonly t: number; readonly height: number }>;
};

/** The elements under the composer whose tops H-a follows, by name. */
const underComposer = {
  buildFromCode: 'main a[href="/projects/new"]',
  suggestionsBox: '[data-slot="home-suggestions"]',
} as const;

/** Installed before any page script: layout shifts, and the tops of the elements under the composer every frame. */
const recordSuggestionsRow = (watched: Readonly<Record<string, string>>): void => {
  const record: {
    shifts: Array<{ t: number; value: number; sources: string[] }>;
    tops: Record<string, Array<{ t: number; y: number }>>;
    rowHeights: Array<{ t: number; height: number }>;
  } = { shifts: [], tops: {}, rowHeights: [] };
  Object.defineProperty(globalThis, '__TAU_SUGGESTIONS_ROW__', { value: record });
  new PerformanceObserver((list) => {
    for (const entry of list.getEntries() as Array<
      PerformanceEntry & {
        value: number;
        hadRecentInput: boolean;
        sources?: Array<{ node?: Node; previousRect: DOMRectReadOnly; currentRect: DOMRectReadOnly }>;
      }
    >) {
      if (entry.hadRecentInput) {
        continue;
      }
      record.shifts.push({
        t: Math.round(entry.startTime),
        value: entry.value,
        sources: (entry.sources ?? []).map(
          (source) =>
            `${source.node instanceof HTMLElement ? source.node.outerHTML.slice(0, 80) : (source.node?.nodeName ?? 'unknown')} y ${Math.round(source.previousRect.y)} -> ${Math.round(source.currentRect.y)}`,
        ),
      });
    }
  }).observe({ type: 'layout-shift', buffered: true });
  const sample = (): void => {
    const t = Math.round(performance.now());
    for (const [name, selector] of Object.entries(watched)) {
      const element = document.querySelector(selector);
      if (element) {
        const y = Math.round(element.getBoundingClientRect().y);
        record.tops[name] ??= [];
        const seen = record.tops[name];
        if (seen.at(-1)?.y !== y) {
          seen.push({ t, y });
        }
      }
    }
    const row = document.querySelector('[aria-label="Suggestions"]');
    if (row) {
      const height = Math.round(row.getBoundingClientRect().height);
      if (record.rowHeights.at(-1)?.height !== height) {
        record.rowHeights.push({ t, height });
      }
    }
    requestAnimationFrame(sample);
  };
  requestAnimationFrame(sample);
};

/** Load Home, wait until the row holds its suggestions and the page has settled, and keep the record as evidence. */
const measureSuggestionsRow = async (load: () => Promise<unknown>, label: string): Promise<SuggestionsRowRecord> => {
  await load();
  await target.expectVisible(richComposer, 60_000);
  await target.expectVisible(selectors.getByRole('list', { name: 'Suggestions' }).getByRole('button').first(), 60_000);
  await target.delay(settleWindow);
  const record = await target.evaluate(
    () => (globalThis as typeof globalThis & { __TAU_SUGGESTIONS_ROW__: SuggestionsRowRecord }).__TAU_SUGGESTIONS_ROW__,
  );
  await target.writeArtifact(`home-load-gate/${label}.json`, `${JSON.stringify(record, null, 2)}\n`);
  return record;
};

/** The setup invite stays dismissed on this device, so `onboarding` adds only the suggestions row to Home. */
const dismissSetupInvite = (key: string): void => {
  globalThis.localStorage.setItem(key, JSON.stringify({ value: { version: 1, inviteDismissed: true } }));
};

/** No shift above 0.001, and every element under the composer kept the first top it was painted at. */
const expectRowInPlace = (label: string, record: SuggestionsRowRecord): void => {
  const shifts = record.shifts.filter((shift) => shift.value > 0.001);
  expect(shifts, `H2 (${label}): the page shifted when the suggestions row resolved`).toEqual([]);
  const moved = Object.fromEntries(Object.entries(record.tops).filter(([, tops]) => tops.length > 1));
  expect(moved, `H2 (${label}): these elements under the composer moved (top, ms)`).toEqual({});
};

/** H-a's loads: the two audit viewports, a tablet whose hero is narrowed by the open sidebar, and stored goals. */
const suggestionsRowCases = [
  { name: 'wide', viewport: viewports.wide, title: 'on a wide viewport' },
  { name: 'phone', viewport: viewports.phone, title: 'on a phone viewport' },
  {
    name: 'tablet-sidebar',
    viewport: { width: 820, height: 1180 },
    title: 'at 820 x 1180 with the sidebar open',
  },
  {
    name: 'phone-goals',
    viewport: viewports.phone,
    goals: ['mechanical'],
    title: 'on a phone viewport with the goal mechanical stored',
  },
] as const satisfies ReadonlyArray<{
  readonly name: string;
  readonly viewport: { readonly width: number; readonly height: number };
  readonly goals?: readonly string[];
  readonly title: string;
}>;

/** Store the person's goals on this device, as setup does. */
const storeGoals = (goals: readonly string[]): void => {
  globalThis.localStorage.setItem(
    'tau-person-profile',
    JSON.stringify({ value: { version: 1, goals, languages: [] } }),
  );
};

/** The sidebar is open on a wide layout: the remembered state, and the shell's default. */
const isSidebarOpen = async (): Promise<boolean> =>
  target.evaluate(
    () => document.querySelector<HTMLElement>('[data-slot="application-shell"]')?.dataset['sidebarOpen'] === 'true',
  );

for (const row of suggestionsRowCases) {
  cloudDefectRow(
    {
      api: test,
      expectedFailure: false,
      title: `H-a: keeps everything under the composer in place with onboarding on, ${row.title}, on a first visit and its reload`,
    },
    async (defect) => {
      await useFlagState('viewer-controls-onboarding');
      await target.addInitScript(dismissSetupInvite, 'tau-device');
      if ('goals' in row) {
        await target.addInitScript(storeGoals, row.goals);
      }
      await target.setViewport(row.viewport);
      await target.installModelCatalogFixture(catalogLatency);
      await target.startModelCatalogApi();
      await target.addInitScript(recordSuggestionsRow, underComposer);
      const firstVisit = await measureSuggestionsRow(async () => target.navigate('/'), `h-a-${row.name}-first-visit`);
      if (row.name === 'tablet-sidebar') {
        expect(await isSidebarOpen(), 'the sidebar is open beside the hero').toBe(true);
      }
      const reload = await measureSuggestionsRow(async () => target.reload(), `h-a-${row.name}-reload`);
      await defect(() => {
        expectRowInPlace(`${row.name} first visit`, firstVisit);
        expectRowInPlace(`${row.name} reload`, reload);
      });
    },
  );
}

/** What the server's HTML for Home holds of the suggestions row, fetched with the page's cookies. */
const serverSuggestionsRow = async (): Promise<{ box: boolean; list: boolean; buttons: number }> =>
  target.evaluate(
    async ({ box, list }) => {
      const response = await fetch('/', { credentials: 'same-origin' });
      const html = new DOMParser().parseFromString(await response.text(), 'text/html');
      return {
        box: html.querySelector(box) !== null,
        list: html.querySelector(list) !== null,
        buttons: html.querySelectorAll(`${box} button`).length,
      };
    },
    { box: underComposer.suggestionsBox, list: '[aria-label="Suggestions"]' },
  );

/** The layout-flags cookie this browser holds, if any. */
const layoutFlagsCookie = async (): Promise<string | undefined> => {
  const cookies = await target.cookies();
  return cookies.find((cookie) => cookie.name === 'tau-layout-flags')?.value;
};

/*
 * H-a guard: the `layout-flags` cookie decides the row on the server. With no cookie the box is held empty from the
 * first frame and the row fills that same box; once the flag has settled on, the server renders the box and its empty
 * list (the buttons are the client's); with the flag settled off, the server renders no box and neither does the page.
 */
test('H-a guard: the layout-flags cookie decides the suggestions row on the server, and an unknown flag holds its box', async () => {
  await useFlagState('viewer-controls-onboarding');
  await target.addInitScript(dismissSetupInvite, 'tau-device');
  await target.setViewport(viewports.wide);
  await target.addInitScript(recordSuggestionsRow, underComposer);

  const firstVisit = await measureSuggestionsRow(async () => target.navigate('/'), 'h-a-guard-first-visit');
  const boxTops = firstVisit.tops['suggestionsBox'] ?? [];
  expect(boxTops, 'the held box never moved and was there from the first frame').toHaveLength(1);
  expect(boxTops[0]?.t, 'the box was painted with the first frame of the page below the composer').toBe(
    firstVisit.tops['buildFromCode']?.[0]?.t,
  );
  expect(await layoutFlagsCookie(), 'the settled flag rides the next request').toBe('onboarding.1');
  expect(await serverSuggestionsRow(), 'with the cookie on, the server renders the box and its empty list').toEqual({
    box: true,
    list: true,
    buttons: 0,
  });

  await target.evaluate(async () => {
    await cookieStore.delete({ name: 'tau-layout-flags', path: '/' });
  });
  expect(await serverSuggestionsRow(), 'with no cookie, the server holds the box empty').toEqual({
    box: true,
    list: false,
    buttons: 0,
  });

  await useFlagState('all-off');
  await target.reload();
  await target.expectVisible(richComposer, 60_000);
  await target.waitFor(
    async () => {
      const cookie = await cookieStore.get('tau-layout-flags');
      return cookie?.value === 'onboarding.0';
    },
    undefined,
    { timeout: 60_000 },
  );
  expect(await serverSuggestionsRow(), 'with the cookie off, the server renders no box').toEqual({
    box: false,
    list: false,
    buttons: 0,
  });
  await target.reload();
  await target.expectVisible(richComposer, 60_000);
  await target.delay(settleWindow);
  expect(
    await target.evaluate((box) => document.querySelector(box) === null, underComposer.suggestionsBox),
    'with the flag off and the cookie off, the page renders no box',
  ).toBe(true);
});
