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
  projectRowMoves,
  readHomeLoad,
  readProjectLoad,
  readWorkerReads,
} from '#support/home-load-recorder.js';

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
 * row forces its defect by answering a file-manager worker read late, so it is red on every run, and is written
 * `test.fails` so `main` stays green. The title names the defect; the failure names the frame and the node. The
 * fixing lane flips the row to `test`. On each failure the row writes its message as an artifact.
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

/**
 * A row that pins a known defect: an expected failure until its fix flips it, its failure message kept as evidence.
 */
const knownDefect = (title: string, artifact: string, body: () => Promise<void>): void => {
  test.fails(title, async () => {
    try {
      await body();
    } catch (error) {
      const message = error instanceof Error ? `${error.name}: ${error.message}` : String(error);
      await target.writeArtifact(`home-load-gate/${artifact}/failure-${Date.now()}.txt`, `${message}\n`);
      throw error;
    }
  });
};

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
}): Promise<ProjectLoadRecord> => {
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
  await target.writeArtifact(
    `home-load-gate/${label}.json`,
    `${JSON.stringify({ record, workerReads: reads }, null, 2)}\n`,
  );
  expect(
    reads.some((read) => read.delayed),
    `${label}: no worker read was delayed`,
  ).toBe(true);
  return record;
};

for (const viewport of ['wide', 'phone'] as const) {
  knownDefect(
    `H1: Home shows no skeleton after hydration for a returning visitor on a ${viewport} viewport, with the project listing 3 s late`,
    `h1-${viewport}`,
    async () => {
      const record = await measureReturningReload({
        viewport,
        delays: [projectListingRead],
        label: `h1-${viewport}`,
      });
      const hydrated = record.hydratedFirstFrame;
      expect(hydrated, 'H1: the rich composer never mounted').toBeDefined();
      const after = record.skeletonFrames.filter((frame) => frame.frame >= (hydrated?.frame ?? 0));
      expect(
        after.map((frame) => `frame ${frame.frame} (${frame.t} ms): ${frame.count}`).slice(0, 5),
        `H1: hydrated by frame ${hydrated?.frame ?? 0} (${hydrated?.t ?? 0} ms), then [data-slot=skeleton] blocks in ${after.length} frames`,
      ).toEqual([]);
    },
  );
}

knownDefect(
  'H5: no sidebar project row moves on a returning reload of Home with a project expanded and the chat listing 3 s late',
  'h5-wide',
  async () => {
    /* The visitor left the newest project expanded: Home's sidebar then lists its chats, as the audit's sidebar did. */
    const expanded = seededProjects.at(-1)!;
    const record = await measureReturningReload({
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
    expect(record.projectRows.length, 'H5: no sidebar project row was on screen').toBeGreaterThan(0);
    const moved = projectRowMoves(record);
    expect(moved, `H5: a sidebar project row moved between frames: ${moved.join(' | ')}`).toEqual([]);
  },
);
