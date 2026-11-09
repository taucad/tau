import { expect, test } from 'vitest';
import { page as selectors } from 'vitest/browser';
import type { Locator } from 'vitest/browser';
import * as target from '#support/external-target.js';
import { measureProjectCardForeground } from '#support/project-card-framing.js';
import {
  allSheet,
  chooseTheme,
  followSidebarLink,
  motionSettled,
  navButton,
  openFromAll,
  openPhone,
  phoneViewports,
  projectTitle,
  surface,
  tapDestination,
  themeNames,
} from '#support/phone-shell.js';
import type { PhoneViewport, ThemeName } from '#support/phone-shell.js';
import { installResourceProbe, liveResourceNames, readResources } from '#support/resource-probe.js';
import type { ResourceCounts } from '#support/resource-probe.js';
import { waitForModelReady } from '#support/viewer-stage.js';

/**
 * T7 on the production phone route: the shell stays whole and gives back what it takes over many cycles in one
 * document. Each circuit warms once, takes a same-browser baseline of live dedicated workers, WebGL and WebGPU contexts,
 * GPU devices, object URLs, window/document listeners and shared-worker constructions after a garbage collection, then
 * runs ten more cycles and, after the last one's cleanup, fails on any count above that baseline. Every cycle also fails
 * on an uncaught page error, a failed request not named in {@link benignRequests}, any console error not named in
 * {@link benignConsole} (React's root error hooks log render faults to the console and do not
 * rethrow them, so this is where a render fault shows), a serialized binary value or object in a DOM attribute, a
 * replaced document (a reload), or a blank model or editor.
 *
 * - The workbench circuit, at 390×844: All → every surface it lists (and Chat and Parameters) → Model; one theme per
 *   cycle, with the production CodeMirror editor read in it, so Black and High Contrast reach the editor as their own
 *   themes (a rendered keyword token's colour, not only the custom property), and showing the open project's own
 *   source and never the other's; then a switch to the other project through the sidebar, whose model renders.
 *   Projects alternate, so cycle 10 ends on Project Navigation A in the theme cycle 0 ended in.
 * - The preview circuit, at 390×844: on Projects, a card's live model preview mounts and draws the model; it unmounts
 *   by its own toggle before the card opens its project, or, every other cycle, by the sidebar leaving Projects with it
 *   still live; the project's model renders, and the sidebar returns to Projects, where no preview is left.
 *
 * What the budgets do not prove on this route and profile: no object URL is created in either circuit (the totals stay
 * at zero), so that budget is unexercised; on the software WebGPU profile the one GPU device and WebGPU context are made
 * at startup and lost before the baseline (the stage then draws with WebGL), so no WebGPU context or device is live in
 * a measured cycle; the app constructs no shared worker, so that budget only catches a new one. JS heap is not
 * budgeted: it is not a resource count and varies with the collector. A worker's own contexts, URLs and listeners are
 * outside the page probe; its liveness is counted.
 *
 * Not covered here, and why:
 * - T7's React binary-prop diagnostics. That failure is React 19's development performance track walking every byte
 *   of a typed array in a changed prop (the GLB `artifact` the preview hands `ModelViewer` when it goes from absent to
 *   loaded): a transient allocation and stall in development builds of react-dom only, with no console message and no
 *   DOM trace, so a production-route spec cannot see it. The serialized-attribute check here is a different, extra
 *   guard: bytes or an object rendered into the DOM as text.
 * - The canvas HMR identity check needs a development server's hot update, which a production build cannot produce.
 * - Each circuit runs at 390×844 only: the workbench circuit alone takes about ten minutes at one width.
 */

const seedRoute = '/__e2e/project-navigation';
const projects = { a: 'Project Navigation A', b: 'Project Navigation B' } as const;
/** Each seeded project's source, so the Editor proves it shows this project's file and not the other's. */
const sources = { a: 'makeBaseBox(18, 12, 6)', b: 'makeBaseBox(28, 12, 6)' } as const;
/** Each seeded project's entry file, as its Editor tab names it. */
const entryFiles = { a: 'alpha.ts', b: 'beta.ts' } as const;
const cycles = 10;
const phone = phoneViewports[1];

/** The CDN the editor's type acquisition reads declarations from. */
const esmShOrigin = 'https://esm.sh';

type ConsoleMessage = Readonly<{ text: string; type: string; url?: string }>;

/**
 * The console errors that are not faults, each named and as narrow as the evidence allows. Every other console error
 * is a fault, whatever its text: React's root error hooks (`react-root-errors.ts`) log caught, uncaught and
 * recoverable render errors with `console.error(error, componentStack)` and do not rethrow them to `window`.
 */
const benignConsole: ReadonlyArray<
  Readonly<{
    name: string;
    /** Tolerated only until the baseline is taken (the opening and the warm cycle); a fault in a measured cycle. */
    beforeBaselineOnly?: true;
    matches: (message: ConsoleMessage, apiOrigin: string) => boolean;
  }>
> = [
  {
    // The local API is not running in this environment, so the browser logs each refused request to it.
    name: 'refused request to the local API',
    matches: ({ text, url }, apiOrigin) =>
      text === 'Failed to load resource: net::ERR_CONNECTION_REFUSED' &&
      url !== undefined &&
      new URL(url).origin === apiOrigin,
  },
  {
    // The browser's own log line for a type-acquisition fetch that failed in the network (see benignRequests).
    name: 'type-acquisition fetch to esm.sh cut off in the network',
    matches: ({ text, url }) =>
      /^Failed to load resource: net::ERR_[A-Z_]+$/u.test(text) &&
      url !== undefined &&
      new URL(url).origin === esmShOrigin,
  },
  {
    // The served Content-Security-Policy-Report-Only header names a directive that only an enforced policy can carry.
    name: 'report-only CSP notice',
    matches: ({ text }) =>
      text ===
      "The Content Security Policy directive 'upgrade-insecure-requests' is ignored when delivered in a report-only policy.",
  },
  {
    /* On the software WebGPU profile the stage's startup GPU device is lost ("no valid external Instance") and the
     * stage draws with WebGL. Observed in most runs, always before the baseline: the probe shows the one device made
     * at startup, none live at the baseline, and none made afterwards. Pinned to that exact message and to the opening
     * and warm cycle: a device lost in a measured cycle is a fault. */
    name: 'startup WebGPU device lost on the software profile',
    beforeBaselineOnly: true,
    matches: ({ text }) =>
      /^THREE\.THREE\.WebGPURenderer: WebGPU Device Lost:\s+Message: A valid external Instance reference no longer exists\.\s+Reason: unknown$/u.test(
        text,
      ),
  },
];

type RequestFailure = Readonly<{ url: string; resourceType: string; failure: string }>;

/**
 * The failed requests that are not faults, each named and as narrow as the evidence allows. Every other failed
 * request, of any origin, is a fault.
 */
const benignRequests: ReadonlyArray<
  Readonly<{ name: string; matches: (request: RequestFailure, apiOrigin: string) => boolean }>
> = [
  {
    // The local API is not running in this environment, so the browser refuses its requests.
    name: 'refused request to the local API',
    matches: ({ url, failure }, apiOrigin) =>
      new URL(url).origin === apiOrigin && failure === 'net::ERR_CONNECTION_REFUSED',
  },
  {
    /* The editor's type acquisition (`type-acquisition.ts`) fetches declarations from the esm.sh CDN, through this
     * environment's proxy, aborts them when it is disposed (the Editor closes or the project changes) and retries a
     * failed one later. Seen in the recorded runs: `net::ERR_ABORTED` (cycle 7 of one run) and
     * `net::ERR_TUNNEL_CONNECTION_FAILED` from the proxy (cycle 9 of another). Only a fetch to esm.sh that failed in the
     * network: an HTTP error from esm.sh, or a script or any other origin's failure, is a fault. */
    name: 'editor type-acquisition fetch to esm.sh cut off in the network',
    matches: ({ url, resourceType, failure }) =>
      new URL(url).origin === esmShOrigin && resourceType === 'fetch' && /^net::ERR_[A-Z_]+$/u.test(failure),
  },
];

const mobileSurfaces = (): Locator => selectors.getByCss('[data-slot="mobile-surface"]');
const editorLines = (): Locator => surface('Editor').getByCss('.cm-editor .cm-content');

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

type EditorTheme = Readonly<{
  /** The theme classes on the document element. */
  classes: readonly string[];
  /** The editor's background against the theme's own `--background`, resolved in the same place. */
  background: string;
  themeBackground: string;
  /** The computed colour of a rendered keyword token (`return`) in the source, which the theme's syntax palette sets. */
  keyword: string;
}>;

/**
 * Read the production CodeMirror editor's theme in the open Editor, once.
 *
 * @returns The theme, with an empty keyword while the source has no highlighted `return` token yet.
 */
const readEditorThemeOnce = async (): Promise<EditorTheme> =>
  target.evaluateLocator(surface('Editor').getByCss('.editor-container .cm-editor').first(), (editor) => {
    const swatch = document.createElement('div');
    swatch.style.backgroundColor = 'var(--background)';
    editor.append(swatch);
    const themeBackground = getComputedStyle(swatch).backgroundColor;
    swatch.remove();
    // The highlighter wraps a keyword in its own span; a bare text node means the source is not highlighted yet.
    const keywordToken = [...editor.querySelectorAll('.cm-content .cm-line span')].find(
      (span) => span.childElementCount === 0 && span.textContent === 'return',
    );
    return {
      classes: [...document.documentElement.classList].filter((name) =>
        ['light', 'dark', 'black', 'high-contrast'].includes(name),
      ),
      background: getComputedStyle(editor).backgroundColor,
      themeBackground,
      keyword: keywordToken ? getComputedStyle(keywordToken).color : '',
    };
  });

/**
 * Read the production CodeMirror editor's theme in the open Editor once its source is highlighted.
 *
 * @returns The theme.
 */
const readEditorTheme = async (): Promise<EditorTheme> => {
  let theme: EditorTheme | undefined;
  await expect
    .poll(
      async () => {
        theme = await readEditorThemeOnce();
        return theme.keyword;
      },
      { timeout: 30_000 },
    )
    .not.toBe('');
  return theme!;
};

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
 * Attributes that hold a binary value or an object serialized as text: what a production build renders when a typed
 * array, an `ArrayBuffer`, a `Blob` or a model artifact reaches a DOM element as a prop: a run of sixteen or more
 * comma-separated bytes, or an `[object …]` string. This is not React's binary-prop diagnostics (see the file's doc).
 *
 * @returns Each offending attribute as `tag[name]` with the start of its value.
 */
const readSerializedAttributes = async (): Promise<string[]> =>
  target.evaluate(() => {
    const serializedBytes = /^(?:\d{1,3},){15,}\d{1,3}$/u;
    const serializedObject = /\[object [A-Za-z]+\]/u;
    const found: string[] = [];
    for (const element of document.querySelectorAll('*')) {
      for (const { name, value } of element.attributes) {
        if (serializedBytes.test(value) || serializedObject.test(value)) {
          found.push(`${element.tagName.toLowerCase()}[${name}] ${value.slice(0, 48)}`);
        }
      }
    }
    return found;
  });

/** How many of each kind of event were already judged. */
type Marks = Readonly<{ console: number; page: number; requests: number; loads: number }>;

/**
 * The faults the target has recorded since `from`: uncaught page errors, every failed request that
 * {@link benignRequests} does not name, and every console error that {@link benignConsole} does not name. The named
 * failed requests are returned so the ledger keeps them. A same-origin request a navigation aborts (`net::ERR_ABORTED`)
 * is a fault: none was seen in the recorded runs.
 *
 * @param from - How many of each kind were already judged.
 * @param context - What the judgement depends on.
 * @param context.apiOrigin - The local API's origin, as the page was told it.
 * @param context.beforeBaseline - Whether the baseline is still to be taken.
 * @returns The new faults, the console errors and ignored requests seen, and the new high-water marks.
 */
const readFaults = async (
  from: Omit<Marks, 'loads'>,
  { apiOrigin, beforeBaseline }: Readonly<{ apiOrigin: string; beforeBaseline: boolean }>,
): Promise<{
  faults: Fault[];
  consoleErrors: string[];
  ignoredRequests: string[];
  next: Omit<Marks, 'loads'>;
}> => {
  const events = await target.events();
  const requests = events.requestFailures.slice(from.requests);
  const isFault = (request: RequestFailure): boolean =>
    !benignRequests.some(({ matches }) => matches(request, apiOrigin));
  const consoleErrors = events.consoleMessages.slice(from.console).filter(({ type }) => type === 'error');
  const describe = ({ text, url }: ConsoleMessage): string => (url ? `${text} @ ${new URL(url).origin}` : text);
  const benign = (message: ConsoleMessage): boolean =>
    benignConsole.some(
      ({ matches, beforeBaselineOnly }) => (beforeBaseline || !beforeBaselineOnly) && matches(message, apiOrigin),
    );
  return {
    faults: [
      ...events.pageErrors.slice(from.page).map((detail) => ({ kind: 'page error', detail })),
      ...requests
        .filter((request) => isFault(request))
        .map(({ url, resourceType, failure }) => ({ kind: 'request', detail: `${resourceType} ${url} ${failure}` })),
      ...consoleErrors
        .filter((message) => !benign(message))
        .map((message) => ({ kind: 'console', detail: describe(message) })),
    ],
    consoleErrors: consoleErrors.map((message) => describe(message)),
    ignoredRequests: requests
      .filter((request) => !isFault(request))
      .map(({ url, resourceType, failure }) => `${resourceType} ${new URL(url).origin} ${failure}`),
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
 * The counts that sit above the baseline, by name. No count has a tolerance: in every recorded run each one, the
 * window/document listeners included, read exactly its baseline after every cycle, so one above it is retained growth.
 *
 * @param baseline - The warmed baseline.
 * @param now - The counts now.
 * @returns What grew, empty when nothing did.
 */
const growthOver = (baseline: Live, now: Live): string[] =>
  liveResourceNames
    .filter((name) => now[name] > baseline[name])
    .map((name) => `${name} ${String(baseline[name])} → ${String(now[name])}`);

/** Add each text to a tally. */
const tally = (into: Record<string, number>, texts: readonly string[]): void => {
  for (const text of texts) {
    into[text] = (into[text] ?? 0) + 1;
  }
};

/**
 * One circuit's evidence: the document token, the baseline, every cycle's counts, faults and console errors, the final
 * counts, and every console error and ignored request it saw.
 */
type Ledger = {
  document: string;
  apiOrigin: string;
  baseline?: ResourceCounts;
  cycles: Array<
    Readonly<{
      cycle: number;
      /** Evidence only: how long the cycle took on this machine. Not a budget. */
      milliseconds: number;
      counts: ResourceCounts;
      faults: Fault[];
      consoleErrors: string[];
    }>
  >;
  final?: ResourceCounts;
  /** Every console error the circuit logged, faulting or not, by text and source origin, with how often it came. */
  consoleErrors: Record<string, number>;
  /** Every failed request that was not judged a fault, by type, origin and failure, with how often it came. */
  ignoredRequests: Record<string, number>;
};

/**
 * Run one circuit: open the phone on the seed with the probe installed, warm with cycle 0, take the baseline, run the
 * ten cycles checking each, and fail on retained growth after the last. Cycle 0 and cycle 10 must end in the same
 * state, so the baseline and the final counts are read with the same things mounted.
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
  viewport: PhoneViewport;
  cycle: (index: number) => Promise<void>;
  settle: () => Promise<void>;
}>): Promise<void> => {
  await openPhone(viewport, seedRoute, { beforeNavigate: installResourceProbe });
  await target.expectVisible(projectTitle(projects.a), 60_000);
  await waitForModelReady();

  const apiUrl = await target.evaluate(
    () => (globalThis as typeof globalThis & { ENV?: { TAU_API_URL?: string } }).ENV?.TAU_API_URL,
  );
  if (!apiUrl) {
    throw new Error('The page did not publish TAU_API_URL.');
  }
  const opened = await readResources();
  const ledger: Ledger = {
    document: opened.document,
    apiOrigin: new URL(apiUrl).origin,
    cycles: [],
    consoleErrors: {},
    ignoredRequests: {},
  };
  let marks: Marks = { console: 0, page: 0, requests: 0, loads: 0 };
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
      const read = await readFaults(marks, { apiOrigin: ledger.apiOrigin, beforeBaseline: index === 0 });
      // The probe's load errors are cumulative: only those past the last read are new.
      const loadErrors = counts.loadErrors.slice(marks.loads);
      marks = { ...read.next, loads: counts.loadErrors.length };
      tally(ledger.consoleErrors, read.consoleErrors);
      tally(ledger.ignoredRequests, read.ignoredRequests);
      // oxlint-disable-next-line no-await-in-loop -- one cycle at a time.
      const serializedAttributes = await readSerializedAttributes();
      const faults = [
        ...read.faults,
        ...loadErrors.map((detail) => ({ kind: 'load', detail })),
        ...serializedAttributes.map((detail) => ({ kind: 'serialized attribute', detail })),
      ];
      ledger.cycles.push({
        cycle: index,
        milliseconds: Math.round(performance.now() - started),
        counts,
        faults,
        consoleErrors: read.consoleErrors,
      });
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
    const lastTheme = themeNames[cycles % themeNames.length]!;
    const warmThemes = [...themeNames.filter((theme) => theme !== lastTheme), lastTheme];
    await runCircuit({
      name: 'workbench-390',
      viewport: phone,
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
        const cycleThemes = index === 0 ? warmThemes : [themeNames[index % themeNames.length]!];
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
      viewport: phone,
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
        // The live preview holds the model's bytes; none of them reach the DOM as an attribute.
        expect(await readSerializedAttributes(), 'attributes with the preview live').toEqual([]);
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
