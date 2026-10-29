import { expect, test } from 'vitest';
import { page as selectors } from 'vitest/browser';
import type { Locator } from 'vitest/browser';
import * as target from '#support/external-target.js';
import { prepareComposerPage } from '#support/chat-attachments.js';
import { measureProjectCardForeground } from '#support/project-card-framing.js';
import {
  allSheet,
  followSidebarLink,
  navButton,
  navigation,
  openFromAll,
  projectTitle,
  surface,
  tapDestination,
} from '#support/phone-shell.js';
import { installResourceProbe, liveResourceNames, readResources } from '#support/resource-probe.js';
import type { ResourceCounts } from '#support/resource-probe.js';
import { waitForStageReady } from '#support/viewer-stage.js';

/**
 * T7 on the production phone route: the shell stays whole and gives back what it takes over many cycles in one
 * document. Each circuit warms once, takes a same-browser baseline of live workers, WebGL and WebGPU contexts, GPU
 * devices, object URLs and window/document listeners after a garbage collection, then runs ten more cycles and, after
 * the last one's cleanup, fails on any count that stays above that baseline. Every cycle also fails on an uncaught page
 * error, a failed script or stylesheet load, a failed same-origin request, a chunk-load or React diagnostic in the
 * console, a replaced document (a reload), or a blank model or editor.
 *
 * - The workbench circuit, at 390×844: All → every surface it lists (and Chat and Parameters) → Model; one theme per
 *   cycle, with the production CodeMirror editor read in it, so Black and High Contrast reach the editor as their own
 *   themes, and showing the open project's own source and never the other's; then a switch to the other project through
 *   the sidebar, whose model renders. Projects alternate, so cycle 10 ends on Project Navigation A in the theme cycle 0
 *   ended in.
 * - The preview circuit, at 390×844: on Projects, a card's live model preview mounts and draws the model; it unmounts
 *   by its own toggle before the card opens its project, or, every other cycle, by the sidebar leaving Projects with it
 *   still live; the project's model renders, and the sidebar returns to Projects, where no preview is left.
 *
 * Not covered here, and why: the canvas HMR identity check needs a development server's hot update, which a production
 * build cannot produce. React's binary-prop warnings are development-only, so against the production build the console
 * check can only catch what production React logs; it catches the warnings themselves only when the spec runs against
 * the development server (`TAU_E2E_SERVER_MODE=development`). JS heap is not budgeted: it is not a resource count and
 * varies with the collector. A worker's own contexts, URLs and listeners are outside the page probe; its liveness is
 * counted. Each circuit runs at 390×844 only: the workbench circuit alone takes about ten minutes at one width.
 */

const seedRoute = '/__e2e/project-navigation';
const projects = { a: 'Project Navigation A', b: 'Project Navigation B' } as const;
/** Each seeded project's source, so the Editor proves it shows this project's file and not the other's. */
const sources = { a: 'makeBaseBox(18, 12, 6)', b: 'makeBaseBox(28, 12, 6)' } as const;
/** Each seeded project's entry file, as its Editor tab names it. */
const entryFiles = { a: 'alpha.ts', b: 'beta.ts' } as const;
const themes = ['Light', 'Dark', 'Black', 'High Contrast'] as const;
type ThemeName = (typeof themes)[number];
const cycles = 10;

/**
 * How far a live count may sit above its baseline after the final cleanup. Zero for every owned resource. Listeners
 * get two: window and document listeners belong to whatever happens to be mounted when the count is read (a tooltip,
 * a sheet's dismiss handler mid-exit), and a fixed leak of one per cycle would still exceed two by the tenth cycle.
 */
const tolerance: Readonly<Record<(typeof liveResourceNames)[number], number>> = {
  liveWorkers: 0,
  webglContexts: 0,
  webgpuContexts: 0,
  gpuDevices: 0,
  objectUrls: 0,
  listeners: 2,
};

/** Console errors that mean a module failed to load or React reported a fault, whatever the build. */
const faultingConsole = [
  /dynamically imported module/iu,
  /Importing a module script failed/iu,
  /Failed to load module script/iu,
  /Loading (?:CSS )?chunk/iu,
  /for a non-boolean attribute/u,
  /Invalid value for prop/u,
  /Minified React error/u,
  /The above error occurred/u,
  /Warning: React does not recognize/u,
];

const viewerControls = (): Locator => selectors.getByRole('group', { name: 'Viewer controls' }).first();
const mobileSurfaces = (): Locator => selectors.getByCss('[data-slot="mobile-surface"]');
const editorLines = (): Locator => surface('Editor').getByCss('.cm-editor .cm-content');

/** Wait for every running animation with an end to finish, so a read is not of a sheet mid-slide. */
const motionSettled = async (): Promise<void> =>
  target.evaluate(async () => {
    await new Promise<void>((resolve) => {
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          resolve();
        });
      });
    });
    const finite = document
      .getAnimations()
      .filter((animation) => Number.isFinite(Number(animation.effect?.getComputedTiming().endTime ?? 0)));
    await Promise.all(finite.map(async (animation) => animation.finished.catch(() => undefined)));
  });

/** Not blank: the stage has drawn its first frame and the model has geometry, so Section view is enabled. */
const waitForModelReady = async (): Promise<void> => {
  await waitForStageReady();
  await expect
    .poll(
      async () =>
        target.getAttribute(
          viewerControls().getByRole('button', { name: 'Section view', exact: true }),
          'aria-disabled',
        ),
      { timeout: 60_000 },
    )
    .toBe('false');
};

/**
 * Open the Editor, bring the project's entry file forward by its tab, and wait for its source in CodeMirror; the other
 * project's source never shows.
 *
 * @param project - The project open now.
 */
const expectEditorSource = async (project: keyof typeof sources): Promise<void> => {
  await openFromAll('Editor');
  await target.click(surface('Editor').getByCss(`.dv-tab:has-text("${entryFiles[project]}")`), { touch: true });
  await expect
    .poll(async () => (await target.textContent(editorLines())) ?? '', { timeout: 60_000 })
    .toContain(sources[project]);
  expect(await target.textContent(editorLines())).not.toContain(sources[project === 'a' ? 'b' : 'a']);
};

/** How many dialogs are on screen, counted in the page so a dialog leaving mid-count is simply not counted. */
const openDialogs = async (): Promise<number> =>
  target.evaluate(
    () => [...document.querySelectorAll('[role="dialog"]')].filter((dialog) => dialog.checkVisibility()).length,
  );

/**
 * Choose a theme in Settings › General, as a person does on a phone, and close Settings.
 *
 * @param theme - The theme's name.
 */
const chooseTheme = async (theme: ThemeName): Promise<void> => {
  await target.click(selectors.getByRole('button', { name: 'Open sidebar', exact: true }), { touch: true });
  const sidebar = selectors.getByRole('dialog', { name: 'Sidebar' });
  await target.expectVisible(sidebar);
  await target.click(sidebar.getByRole('button', { name: 'Account', exact: true }), { touch: true });
  await target.click(selectors.getByRole('menuitem', { name: 'Settings', exact: true }), { touch: true });
  const settings = selectors.getByRole('dialog', { name: /^settings$/iu });
  await target.expectVisible(settings, 60_000);
  const themeButton = selectors.getByRole('button', { name: /^(?:light|dark|black|high contrast|system)$/iu });
  if (!(await target.isVisible(themeButton))) {
    await target.click(settings.getByRole('button', { name: /^General/u }).first(), { touch: true });
  }
  await target.click(themeButton, { touch: true });
  await target.click(selectors.getByRole('option', { name: new RegExp(`^${theme}`, 'iu') }), { touch: true });
  await target.expectClass(
    selectors.getByCss('html'),
    new RegExp(`\\b${theme.toLowerCase().replaceAll(' ', '-')}\\b`, 'u'),
  );
  await target.expectCount(selectors.getByRole('listbox'), 0, 30_000);
  // On a phone Settings is a list and a detail: Escape steps back from General to the list, then closes it.
  // oxlint-disable-next-line no-await-in-loop -- whether a dialog is left decides the next step.
  for (let step = 0; step < 3 && (await openDialogs()) > 0; step++) {
    // oxlint-disable-next-line no-await-in-loop -- one step back at a time.
    await target.keyboardPress('Escape');
    // oxlint-disable-next-line no-await-in-loop -- the dialog's exit animation runs between steps.
    await motionSettled();
  }
  await target.expectCount(selectors.getByRole('dialog'), 0, 30_000);
  await target.expectVisible(navigation(), 60_000);
};

type EditorTheme = Readonly<{
  /** The theme classes on the document element. */
  classes: readonly string[];
  /** The editor's background against the theme's own `--background`, resolved in the same place. */
  background: string;
  themeBackground: string;
  /** The editor's keyword hue, which the theme's own syntax palette sets. */
  keyword: string;
}>;

/** Read the production CodeMirror editor's theme in the open Editor. */
const readEditorTheme = async (): Promise<EditorTheme> =>
  target.evaluateLocator(surface('Editor').getByCss('.editor-container .cm-editor').first(), (editor) => {
    const swatch = document.createElement('div');
    swatch.style.backgroundColor = 'var(--background)';
    editor.append(swatch);
    const themeBackground = getComputedStyle(swatch).backgroundColor;
    swatch.remove();
    const style = getComputedStyle(editor);
    return {
      classes: [...document.documentElement.classList].filter((name) =>
        ['light', 'dark', 'black', 'high-contrast'].includes(name),
      ),
      background: style.backgroundColor,
      themeBackground,
      keyword: style.getPropertyValue('--cm-keyword').trim(),
    };
  });

/** The theme classes each theme puts on the document element. */
const themeClasses = new Map<ThemeName, readonly string[]>([
  ['Light', ['light']],
  ['Dark', ['dark']],
  ['Black', ['dark', 'black']],
  ['High Contrast', ['dark', 'high-contrast']],
]);

/** The editor's theme as each was last read, for the cross-theme checks after the circuit. */
const editorThemes = new Map<ThemeName, EditorTheme>();

type Fault = Readonly<{ kind: string; detail: string }>;

/**
 * The faults the target has recorded since `from`: uncaught page errors, failed script and stylesheet loads, failed
 * same-origin requests, and console errors that mean a failed module load or a React fault. The local API is not
 * running in this environment, so its refused requests (another origin) are expected and not faults.
 *
 * @param from - How many of each kind were already judged.
 * @returns The new faults and the new high-water marks.
 */
const readFaults = async (
  from: Readonly<{ console: number; page: number; requests: number }>,
): Promise<{
  faults: Fault[];
  consoleErrors: string[];
  next: { console: number; page: number; requests: number };
}> => {
  const events = await target.events();
  const { origin } = new URL(await target.currentUrl());
  const faults: Fault[] = [
    ...events.pageErrors.slice(from.page).map((detail) => ({ kind: 'page error', detail })),
    ...events.requestFailures
      .slice(from.requests)
      .filter(
        ({ url, resourceType }) =>
          new URL(url).origin === origin || ['script', 'stylesheet', 'document'].includes(resourceType),
      )
      .map(({ url, resourceType, failure }) => ({ kind: 'request', detail: `${resourceType} ${url} ${failure}` })),
    ...events.consoleMessages
      .slice(from.console)
      .filter(({ type, text }) => type === 'error' && faultingConsole.some((pattern) => pattern.test(text)))
      .map(({ text }) => ({ kind: 'console', detail: text })),
  ];
  return {
    faults,
    consoleErrors: events.consoleMessages
      .slice(from.console)
      .filter(({ type }) => type === 'error')
      .map(({ text }) => text),
    next: {
      console: events.consoleMessages.length,
      page: events.pageErrors.length,
      requests: events.requestFailures.length,
    },
  };
};

type Live = Pick<ResourceCounts, (typeof liveResourceNames)[number]>;

const liveOf = (counts: ResourceCounts): Live =>
  Object.fromEntries(liveResourceNames.map((name) => [name, counts[name]])) as Live;

/**
 * The counts that sit above the baseline by more than their tolerance, by name.
 *
 * @param baseline - The warmed baseline.
 * @param now - The counts now.
 * @returns What grew, empty when nothing did.
 */
const growthOver = (baseline: Live, now: Live): string[] =>
  liveResourceNames
    .filter((name) => now[name] - baseline[name] > tolerance[name])
    .map((name) => `${name} ${String(baseline[name])} → ${String(now[name])}`);

/**
 * One circuit's evidence: the document token, the baseline, every cycle's counts and faults, the final counts, and the
 * console errors it judged.
 */
type Ledger = {
  document: string;
  baseline?: ResourceCounts;
  cycles: Array<Readonly<{ cycle: number; milliseconds: number; counts: ResourceCounts; faults: Fault[] }>>;
  final?: ResourceCounts;
  /** Every console error the circuit logged, faulting or not, by text, with how often it came. */
  consoleErrors: Record<string, number>;
};

/**
 * Run one circuit: open the phone on the seed, warm with cycle 0, take the baseline, run the ten cycles checking each,
 * and fail on retained growth after the last. Cycle 0 and cycle 10 must end in the same state, so the baseline and the
 * final counts are read with the same things mounted.
 *
 * @param circuit - The circuit.
 * @param circuit.name - The artifact name.
 * @param circuit.viewport - The phone's size.
 * @param circuit.cycle - One cycle, by its index (0 warms).
 * @param circuit.settle - Wait for the page to come to rest where the cycle ended.
 */
const runCircuit = async ({
  name,
  viewport,
  cycle,
  settle,
}: Readonly<{
  name: string;
  viewport: Readonly<{ width: number; height: number }>;
  cycle: (index: number) => Promise<void>;
  settle: () => Promise<void>;
}>): Promise<void> => {
  await target.commands.uiOpenTarget({ hasTouch: true, isMobile: true });
  await installResourceProbe();
  await prepareComposerPage();
  await target.setViewport(viewport);
  await target.navigate(seedRoute);
  await target.expectUrl(/\/w\/[^/]+\/[^/?]+/u, 60_000);
  await target.expectVisible(navigation(), 60_000);
  await target.expectVisible(projectTitle(projects.a), 60_000);
  await waitForModelReady();

  const opened = await readResources();
  const ledger: Ledger = { document: opened.document, cycles: [], consoleErrors: {} };
  let marks = { console: 0, page: 0, requests: 0 };
  try {
    for (let index = 0; index <= cycles; index++) {
      const started = performance.now();
      // oxlint-disable-next-line no-await-in-loop -- the cycles run one after another in one document.
      await cycle(index);
      // oxlint-disable-next-line no-await-in-loop -- one cycle at a time.
      await settle();
      // oxlint-disable-next-line no-await-in-loop -- one cycle at a time.
      const counts = await readResources();
      // oxlint-disable-next-line no-await-in-loop -- one cycle at a time.
      const read = await readFaults(marks);
      marks = read.next;
      for (const text of read.consoleErrors) {
        ledger.consoleErrors[text] = (ledger.consoleErrors[text] ?? 0) + 1;
      }
      const faults = [...read.faults, ...counts.loadErrors.map((detail) => ({ kind: 'load', detail }))];
      ledger.cycles.push({ cycle: index, milliseconds: Math.round(performance.now() - started), counts, faults });
      // Saved as each cycle ends, so a run that times out still leaves the cycles it finished.
      // oxlint-disable-next-line no-await-in-loop -- one cycle at a time.
      await target.writeArtifact(`mobile-stability/${name}.json`, `${JSON.stringify(ledger, null, 2)}\n`);
      expect(counts.document, `cycle ${String(index)} replaced the document`).toBe(ledger.document);
      expect(faults, `cycle ${String(index)} faults`).toEqual([]);
      if (index === 0) {
        ledger.baseline = counts;
      }
    }

    const baseline = liveOf(ledger.baseline!);
    // Cleanup may finish after the page looks settled: poll, bounded, for the counts to come back.
    await expect
      .poll(
        async () => {
          ledger.final = await readResources();
          return growthOver(baseline, liveOf(ledger.final));
        },
        { timeout: 30_000, interval: 1000 },
      )
      .toEqual([]);
  } finally {
    await target.writeArtifact(`mobile-stability/${name}.json`, `${JSON.stringify(ledger, null, 2)}\n`);
  }
};

test(
  'keeps the workbench whole and returns to its resource baseline over ten surface, project and theme cycles at 390×844',
  {
    timeout: 900_000,
  },
  async () => {
    let listed: readonly string[] = [];
    let current: keyof typeof projects = 'a';
    /** The warm cycle visits every theme, ending on the one the last cycle chooses, so both counts are read in it. */
    const lastTheme = themes[cycles % themes.length]!;
    const warmThemes = [...themes.filter((theme) => theme !== lastTheme), lastTheme];
    await runCircuit({
      name: 'workbench-390',
      viewport: { width: 390, height: 844 },
      cycle: async (index) => {
        if (index === 0) {
          await target.click(navButton('All'), { touch: true });
          await target.expectVisible(allSheet());
          listed = await target.evaluateLocator(allSheet(), (sheet) =>
            [...sheet.querySelectorAll('section[aria-labelledby^="all-surfaces-"] button')].map((button) =>
              button.textContent.trim(),
            ),
          );
          await target.keyboardPress('Escape');
          await target.expectCount(allSheet(), 0, 30_000);
          expect(listed).toContain('Editor');
        }
        // A theme per cycle; the warm cycle visits all four.
        const cycleThemes = index === 0 ? warmThemes : [themes[index % themes.length]!];
        for (const theme of cycleThemes) {
          // oxlint-disable-next-line no-await-in-loop -- one theme at a time.
          await chooseTheme(theme);
        }
        const theme = cycleThemes.at(-1)!;

        // Every surface: Chat and Parameters from the nav, the rest from All, each back to the Model. The Editor shows
        // this project's own source, in this cycle's theme.
        for (const title of ['Chat', 'Parameters', ...listed]) {
          if (title === 'Chat' || title === 'Parameters') {
            // oxlint-disable-next-line no-await-in-loop -- one surface at a time, as a person taps.
            await tapDestination(title);
            // oxlint-disable-next-line no-await-in-loop -- one surface at a time.
            await target.expectVisible(surface(title), 60_000);
          } else if (title === 'Editor') {
            // oxlint-disable-next-line no-await-in-loop -- one surface at a time.
            await expectEditorSource(current);
            // oxlint-disable-next-line no-await-in-loop -- one surface at a time.
            const editor = await readEditorTheme();
            expect(editor.classes.toSorted(), `${theme} classes`).toEqual(
              [...(themeClasses.get(theme) ?? [])].toSorted(),
            );
            expect(editor.background, `${theme} editor background`).toBe(editor.themeBackground);
            expect(editor.keyword, `${theme} keyword hue`).not.toBe('');
            editorThemes.set(theme, editor);
          } else {
            // oxlint-disable-next-line no-await-in-loop -- one surface at a time.
            await openFromAll(title);
          }
          // oxlint-disable-next-line no-await-in-loop -- one surface at a time.
          await tapDestination('Model');
          // oxlint-disable-next-line no-await-in-loop -- one surface at a time.
          await target.expectCount(mobileSurfaces(), 0, 30_000);
        }
        await waitForModelReady();

        // The other project through the sidebar, with its own model; the next cycle's Editor reads its source. The
        // warm cycle goes there and back.
        for (const _ of index === 0 ? [0, 1] : [0]) {
          current = current === 'a' ? 'b' : 'a';
          // oxlint-disable-next-line no-await-in-loop -- one project at a time.
          await followSidebarLink(projects[current]);
          // oxlint-disable-next-line no-await-in-loop -- one project at a time.
          await target.expectVisible(projectTitle(projects[current]), 60_000);
          // oxlint-disable-next-line no-await-in-loop -- one project at a time.
          await waitForModelReady();
        }
      },
      settle: async () => {
        await target.expectVisible(projectTitle(projects[current]), 60_000);
        await waitForModelReady();
        await motionSettled();
      },
    });

    // Black and High Contrast reach the editor as their own themes: Black's background is true black, and High
    // Contrast's syntax palette is its own, not Dark's.
    expect(editorThemes.get('Black')?.themeBackground).toMatch(/^(?:oklch|lab|rgb)\(0,? 0,? 0\)$/u);
    expect(editorThemes.get('High Contrast')?.keyword).not.toBe(editorThemes.get('Dark')?.keyword);
    expect(editorThemes.get('Light')?.keyword).not.toBe(editorThemes.get('Dark')?.keyword);
  },
);

test(
  'mounts and releases a project card model preview ten times, between Projects and its project, at 390×844',
  {
    timeout: 600_000,
  },
  async () => {
    const card = `[data-slot="card"]:has(a:has-text("Open ${projects.a}"))`;
    const toggle = `${card} button[aria-label="Preview model"]`;
    const activeMedia = `${card} div:has(> button[aria-label="Preview model"][aria-pressed="true"])`;
    const projectsPage = async (): Promise<void> => {
      await followSidebarLink('Projects');
      await target.expectUrl(/\/projects$/u, 60_000);
      await target.expectVisible(toggle, 60_000);
    };

    await runCircuit({
      name: 'preview-390',
      viewport: { width: 390, height: 844 },
      cycle: async (index) => {
        if (index === 0) {
          await projectsPage();
        }
        await target.click(toggle, { touch: true });
        await target.expectAttribute(toggle, 'aria-pressed', 'true');
        await target.expectVisible(`${activeMedia} canvas`, 60_000);
        // A drawn model, not an empty canvas: the model's silhouette covers real pixels.
        await expect
          .poll(
            async () => {
              const foreground = await measureProjectCardForeground(activeMedia);
              return foreground?.pixels ?? 0;
            },
            { timeout: 60_000 },
          )
          .toBeGreaterThan(100);
        // The preview unmounts both ways a person ends it: by its own toggle, then the card opens the project; or,
        // every other cycle, by leaving Projects with the preview still live.
        if (index % 2 === 0) {
          await target.click(toggle, { touch: true });
          await target.expectAttribute(toggle, 'aria-pressed', 'false');
          await target.expectCount(`${card} canvas`, 0, 30_000);
          await target.click(`${card} a:has-text("Open ${projects.a}")`, { touch: true });
        } else {
          await followSidebarLink(projects.a);
        }
        await target.expectVisible(projectTitle(projects.a), 60_000);
        await waitForModelReady();
        await projectsPage();
      },
      settle: async () => {
        await target.expectAttribute(toggle, 'aria-pressed', 'false');
        await target.expectCount(`${card} canvas`, 0, 30_000);
        await motionSettled();
      },
    });
  },
);
