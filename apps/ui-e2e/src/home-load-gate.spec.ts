/* oxlint-disable no-await-in-loop -- The returning visitor's projects are created through the UI one after another, as a visitor would. */
import { expect, test } from 'vitest';
import { page as selectors } from 'vitest/browser';
import * as target from '#support/external-target.js';
import type { HomeInspection, HomeLoadRecord } from '#support/home-load-recorder.js';
import { inspectServerHtml, installHomeLoadRecorder, readHomeLoad } from '#support/home-load-recorder.js';
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
 * N1 and H7 (lane A0.11), in the cloud-build tier only (`ui-e2e:test:e2e:cloud-load`): the self-host build has no
 * billing fence, so these cases cannot show the defect there. The stand-ins sign the owner in with no API
 * (`#support/cloud-stand-ins.js`). Each is an expected failure until side lane N1 flips it, by setting its
 * `cloudDefectRow` `expectedFailure` to `false`. Each is a plain test: only its defect assertion's failure is
 * recorded as the standing defect, and any other fault, or that assertion passing, fails the row.
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

for (const viewport of ['wide', 'phone'] as const) {
  cloudDefectRow(
    {
      api: test,
      expectedFailure: false,
      title: `H-a: keeps everything under the composer in place with onboarding on, on a ${viewport} viewport, on a first visit and its reload`,
    },
    async (defect) => {
      await useFlagState('viewer-controls-onboarding');
      await target.addInitScript(dismissSetupInvite, 'tau-device');
      await target.setViewport(viewports[viewport]);
      await target.installModelCatalogFixture(catalogLatency);
      await target.startModelCatalogApi();
      await target.addInitScript(recordSuggestionsRow, underComposer);
      const firstVisit = await measureSuggestionsRow(async () => target.navigate('/'), `h-a-${viewport}-first-visit`);
      const reload = await measureSuggestionsRow(async () => target.reload(), `h-a-${viewport}-reload`);
      await defect(() => {
        expectRowInPlace(`${viewport} first visit`, firstVisit);
        expectRowInPlace(`${viewport} reload`, reload);
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
