import { expect, test } from 'vitest';
import { page as selectors } from 'vitest/browser';
import type { Locator } from 'vitest/browser';
import * as target from '#support/external-target.js';

const seedRoute = '/__e2e/project-file-tree';
const seedProjectName = 'sgenoud/models file-tree e2e';
const mainPath = 'public/models/honeycomb.js';
const secondaryPath = 'public/models/box-corner.js';

const treeItem = (path: string): Locator =>
  selectors.getByCss(`[data-testid="file-tree-item"][data-file-tree-path="${path}"]`);

const disclosure = (path: string): Locator => selectors.getByRole('button', { name: path, exact: true });

const openCommand = async (name: string): Promise<void> => {
  await target.click(selectors.getByRole('button', { name: 'Search', exact: true }));
  const commandSearch = selectors.getByPlaceholder('Search projects, chats, and actions…');
  await target.fill(commandSearch, name);
  await target.click(selectors.getByText(name, { exact: true }));
};

const openSeededProject = async (): Promise<void> => {
  await target.navigate(seedRoute);
  try {
    await target.expectUrl(/\/w\/[^/]+\/[^/]+/u, 60_000);
  } catch {
    const project = selectors.getByRole('link', { name: seedProjectName }).first();
    await target.expectVisible(project, 60_000);
    await target.click(project);
    await target.expectUrl(/\/w\/[^/]+\/[^/]+/u, 60_000);
  }

  await target.expectVisible(selectors.getByTestId('cad-viewer-canvas-region').getByCss('canvas').first(), 60_000);
  await target.click(selectors.getByRole('button', { name: /^decline$/iu }), { timeout: 5000 }).catch(() => undefined);
};

const openSecondGeometryUnit = async (path = secondaryPath): Promise<void> => {
  const fileName = path.split('/').at(-1) ?? path;
  await openCommand('Open files');

  for (const folderPath of ['public', 'public/models']) {
    const folder = treeItem(folderPath);
    // oxlint-disable-next-line no-await-in-loop -- Each nested directory exists only after its parent expands.
    await target.expectVisible(folder, 15_000);
    // oxlint-disable-next-line no-await-in-loop -- Folder expansion is intentionally sequential.
    if ((await target.getAttribute(folder, 'aria-expanded')) !== 'true') {
      // oxlint-disable-next-line no-await-in-loop -- Folder expansion is intentionally sequential.
      await target.click(folder, { position: { x: 8, y: 14 } });
    }
  }

  await target.hover(treeItem(path));
  await target.click(selectors.getByRole('button', { name: `More actions for ${fileName}`, exact: true }));
  await target.click(selectors.getByRole('menuitem', { name: 'Open in Viewer' }));
  await target.expectVisible(selectors.getByCss('.dv-tab').filter({ hasText: fileName }), 60_000);
};

type ModelSurfaceState = {
  readonly bodyBackground: string;
  readonly bodyBottomPadding: number;
  readonly bodyToPaneBottomGap: number;
  readonly bottomRadius: number;
  readonly filterBackground: string;
  readonly filterHeight: number;
  readonly filterToHeaderGap: number;
  readonly headerBottomBorderWidth: number;
  readonly headerBottomRadius: number;
  readonly horizontalEdgeDelta: number;
  readonly panelBackground: string;
  readonly rowRadius: number;
  readonly seamDelta: number;
  readonly scrollFadeEnd: string;
  readonly scrollFadeSize: string;
  readonly toolbarBorderWidth: number;
};

const readModelSurfaceState = async (header: Locator): Promise<ModelSurfaceState> =>
  target.evaluateLocator(header, (element) => {
    const headerRoot = element.closest<HTMLElement>('[data-slot="paneview-header"]');
    const pane = element.closest<HTMLElement>('.dv-pane');
    const body = pane?.querySelector<HTMLElement>('[data-slot="model-unit-surface"]');
    const scroller = body?.querySelector<HTMLElement>('[data-slot="model-unit-scroller"]');
    const paneBody = body?.closest<HTMLElement>('.dv-pane-body');
    const panel = document.querySelector<HTMLElement>('[data-slot="model-panel-body"]');
    const toolbar = document.querySelector<HTMLElement>('[data-slot="model-filter"]');
    const filter = document.querySelector<HTMLInputElement>('[aria-label="Filter parts"]');
    const row = body?.querySelector<HTMLElement>('[data-model-component-row]');
    if (!headerRoot || !body || !scroller || !paneBody || !panel || !toolbar || !filter || !row) {
      throw new Error('Model attached surface was incomplete.');
    }

    const headerBounds = headerRoot.getBoundingClientRect();
    const headerStyle = getComputedStyle(headerRoot);
    const bodyBounds = body.getBoundingClientRect();
    const scrollerStyle = getComputedStyle(scroller);
    const filterBounds = filter.getBoundingClientRect();
    return {
      bodyBackground: getComputedStyle(body).backgroundColor,
      bodyBottomPadding: Number.parseFloat(scrollerStyle.paddingBottom),
      bodyToPaneBottomGap: paneBody.getBoundingClientRect().bottom - bodyBounds.bottom,
      bottomRadius: Number.parseFloat(getComputedStyle(body).borderBottomLeftRadius),
      filterBackground: getComputedStyle(filter).backgroundColor,
      filterHeight: filterBounds.height,
      filterToHeaderGap: headerBounds.top - filterBounds.bottom,
      headerBottomBorderWidth: Number.parseFloat(headerStyle.borderBottomWidth),
      headerBottomRadius: Number.parseFloat(headerStyle.borderBottomLeftRadius),
      horizontalEdgeDelta: Math.max(
        Math.abs(headerBounds.left - bodyBounds.left),
        Math.abs(headerBounds.right - bodyBounds.right),
      ),
      panelBackground: getComputedStyle(panel).backgroundColor,
      rowRadius: Number.parseFloat(getComputedStyle(row).borderRadius),
      seamDelta: Math.abs(headerBounds.bottom - bodyBounds.top),
      scrollFadeEnd: scrollerStyle.getPropertyValue('--scroll-fade-end').trim(),
      scrollFadeSize: scrollerStyle.getPropertyValue('--scroll-fade-size').trim(),
      toolbarBorderWidth: Number.parseFloat(getComputedStyle(toolbar).borderBottomWidth),
    };
  });

test('keeps the Model hierarchy filterable, accessible, and reorderable through Paneview', async () => {
  await target.emulateColorScheme('light');
  await target.setViewport({ width: 1440, height: 900 });
  await openSeededProject();
  await openSecondGeometryUnit();
  await openCommand('Open model structure');

  const main = disclosure(mainPath);
  const secondary = disclosure(secondaryPath);
  await target.expectVisible(main, 60_000);
  await target.expectVisible(secondary, 60_000);
  await target.expectAttribute(main, 'aria-expanded', 'true');
  await target.expectAttribute(secondary, 'aria-expanded', 'true');

  const filter = selectors.getByRole('searchbox', { name: 'Filter parts' });
  await target.expectVisible(filter);
  await target.expectAttribute(filter, 'placeholder', 'Filter parts…');
  await target.expectCount(selectors.getByRole('searchbox', { name: 'Filter parts' }), 1);
  await target.expectCount(selectors.getByRole('button', { name: /show search|hide search/iu }), 0);

  const mainList = selectors.getByRole('list', { name: `Model components for ${mainPath}` });
  const secondaryList = selectors.getByRole('list', { name: `Model components for ${secondaryPath}` });
  await target.expectVisible(mainList, 60_000);
  await target.expectVisible(secondaryList, 60_000);

  const mainPart = mainList.getByCss('button[aria-pressed]:not([aria-label^="Isolate "])').first();
  const hideMainPart = mainList.getByCss('button[aria-label^="Hide "]');
  await target.expectVisible(mainPart);
  await target.focus(mainPart);
  await target.expectAttribute(mainPart, 'tabindex', '0');
  await target.expectAttribute(hideMainPart, 'tabindex', '-1');
  await target.keyboardPress('Tab');
  expect(await target.evaluateLocator(hideMainPart, (element) => element === document.activeElement)).toBe(false);
  await target.focus(mainPart);
  await target.keyboardPress('Enter');
  await target.expectVisible(selectors.getByText('Physical facts', { exact: true }));
  await expect
    .poll(async () => target.evaluateLocator(hideMainPart, (element) => getComputedStyle(element).opacity))
    .toBe('1');
  expect(
    await target.evaluateLocator(hideMainPart, (element) => Number.parseFloat(getComputedStyle(element).borderRadius)),
  ).toBeGreaterThan(0);

  const lightSurface = await readModelSurfaceState(main);
  expect(lightSurface.seamDelta).toBeLessThanOrEqual(1);
  expect(lightSurface.horizontalEdgeDelta).toBeLessThanOrEqual(1);
  expect(lightSurface.bodyToPaneBottomGap).toBeCloseTo(8, 0);
  expect(lightSurface.bodyBottomPadding).toBe(8);
  expect(lightSurface.bottomRadius).toBeGreaterThan(0);
  expect(lightSurface.rowRadius).toBeGreaterThan(0);
  expect(lightSurface.filterToHeaderGap).toBeCloseTo(8, 0);
  expect(lightSurface.filterHeight).toBe(28);
  expect(lightSurface.headerBottomBorderWidth).toBe(0);
  expect(lightSurface.headerBottomRadius).toBe(0);
  expect(lightSurface.scrollFadeEnd).toBe('transparent');
  expect(lightSurface.scrollFadeSize).toBe('28px');
  expect(lightSurface.toolbarBorderWidth).toBe(0);
  expect(lightSurface.bodyBackground).not.toBe(lightSurface.panelBackground);
  expect(lightSurface.filterBackground).not.toBe(lightSurface.panelBackground);

  await target.fill(filter, '__no_such_part__');
  await target.expectCount(selectors.getByText('No matching parts', { exact: true }), 2, 15_000);
  await target.click(selectors.getByRole('button', { name: 'Clear search' }));
  await target.expectVisible(mainList);
  await target.expectVisible(secondaryList);

  const secondarySurface = selectors.getByCss('[data-slot="model-unit-surface"]').nth(1);
  await target.drag(main, secondarySurface);
  const secondaryAfter = await target.boundingBox(secondary);
  if (!secondaryAfter) {
    throw new Error('Reordered secondary header did not expose drag geometry.');
  }
  await expect
    .poll(async () => {
      const mainAfter = await target.boundingBox(main);
      return mainAfter?.y;
    })
    .toBeGreaterThan(secondaryAfter.y);

  await target.emulateColorScheme('dark');
  await target.expectClass(selectors.getByCss('html'), /\bdark\b/u);
  const darkSurface = await readModelSurfaceState(main);
  expect(darkSurface.bodyBackground).not.toBe(lightSurface.bodyBackground);
  expect(darkSurface.bodyBackground).not.toBe(darkSurface.panelBackground);
  expect(darkSurface.filterBackground).not.toBe(darkSurface.panelBackground);

  await target.setViewport({ width: 960, height: 760 });
  const overflow = await target.evaluate(() => {
    const paneview = document
      .querySelector<HTMLElement>('[data-slot="paneview-header"]')
      ?.closest<HTMLElement>('.dv-pane-container');
    return paneview ? paneview.scrollWidth - paneview.clientWidth : Number.POSITIVE_INFINITY;
  });
  expect(overflow).toBeLessThanOrEqual(0);
  const rightBounds = await target.evaluate(() => {
    const panel = document.querySelector<HTMLElement>('[data-slot="model-panel-body"]');
    const missing = [...document.querySelectorAll<HTMLButtonElement>('button')].find(
      (button) => button.textContent.trim() === 'Missing',
    );
    return {
      viewport: innerWidth,
      panel: panel?.getBoundingClientRect().right,
      missing: missing?.getBoundingClientRect().right,
    };
  });
  expect(rightBounds.panel).toBeLessThanOrEqual(rightBounds.viewport);
  expect(rightBounds.missing).toBeLessThanOrEqual(rightBounds.viewport);
  await target.screenshot(selectors.getByCss('body'), 'model-pane-dark-narrow.png');

  await target.setViewport({ width: 1440, height: 900 });
  await target.evaluate(() => {
    document.documentElement.style.fontSize = '200%';
  });
  const scaledLayout = await target.evaluate(() => {
    const paneHeaderOverlaps = [
      ...document.querySelectorAll<HTMLElement>('[data-slot="model-panel-body"] .dv-pane'),
    ].map((pane) => {
      const header = pane.querySelector<HTMLElement>('[data-slot="paneview-header"]');
      const body = pane.querySelector<HTMLElement>('.dv-pane-body');
      return header && body ? header.getBoundingClientRect().bottom - body.getBoundingClientRect().top : 0;
    });
    const facts = document.querySelector<HTMLElement>(
      '[data-slot="part-properties"] section[aria-label="Physical facts"] dl',
    );
    const label = facts?.querySelector('dt');
    const value = facts?.querySelector('dd');
    const modelContentBounds = [...document.querySelectorAll<HTMLElement>('[data-slot="model-unit-scroller"]')].map(
      (scroller) => {
        const row = scroller.querySelector<HTMLElement>('[data-model-component-row]');
        const surface = scroller.closest<HTMLElement>('[data-slot="model-unit-surface"]');
        const missing = [...(surface?.querySelectorAll<HTMLButtonElement>('button') ?? [])].find(
          (button) => button.textContent.trim() === 'Missing',
        );
        const scrollBounds = scroller.getBoundingClientRect();
        const rowBounds = row?.getBoundingClientRect();
        const surfaceBounds = surface?.getBoundingClientRect();
        const missingBounds = missing?.getBoundingClientRect();
        return {
          missingInside: Boolean(missingBounds && surfaceBounds && missingBounds.bottom <= surfaceBounds.bottom + 1),
          rowInside: Boolean(
            rowBounds && rowBounds.top >= scrollBounds.top - 1 && rowBounds.bottom <= scrollBounds.bottom + 1,
          ),
        };
      },
    );
    return {
      firstValueWidth: value?.getBoundingClientRect().width,
      labelToValueGap:
        label && value ? value.getBoundingClientRect().top - label.getBoundingClientRect().bottom : undefined,
      modelContentBounds,
      paneHeaderOverlaps,
    };
  });
  expect(Math.max(...scaledLayout.paneHeaderOverlaps)).toBeLessThanOrEqual(1);
  expect(scaledLayout.firstValueWidth).toBeGreaterThan(120);
  expect(scaledLayout.labelToValueGap).toBeGreaterThanOrEqual(0);
  expect(scaledLayout.modelContentBounds).toHaveLength(2);
  expect(scaledLayout.modelContentBounds.every(({ rowInside, missingInside }) => rowInside && missingInside)).toBe(
    true,
  );
  const details = selectors.getByRole('button', { name: 'Details', exact: true });
  await target.scrollIntoView(details);
  await target.focus(details);
  const detailsState = await target.evaluateLocator(details, (element) => {
    const wrapper = element.closest<HTMLElement>('[data-slot="part-properties"]')?.parentElement;
    const bounds = element.getBoundingClientRect();
    return {
      bottom: bounds.bottom,
      focused: element === document.activeElement,
      overflowY: wrapper ? getComputedStyle(wrapper).overflowY : undefined,
      top: bounds.top,
      viewportHeight: innerHeight,
    };
  });
  expect(detailsState.focused).toBe(true);
  expect(detailsState.overflowY).toBe('auto');
  expect(detailsState.top).toBeGreaterThanOrEqual(0);
  expect(detailsState.bottom).toBeLessThanOrEqual(detailsState.viewportHeight);
  await target.keyboardPress('Enter');
  await target.expectVisible(selectors.getByText('Volume method', { exact: true }));
  await target.scrollIntoView(selectors.getByText('Density source', { exact: true }));
  await target.screenshot(selectors.getByCss('body'), 'model-pane-200pct-details.png');
});

test('shows decoded part previews in the real Model rows and selected Properties', async () => {
  await target.addInitScript(() => {
    const names: string[] = [];
    (globalThis as typeof globalThis & { __TAU_PART_PREVIEW_WORKERS__?: string[] }).__TAU_PART_PREVIEW_WORKERS__ =
      names;
    const nativeWorker = globalThis.Worker;
    globalThis.Worker = class extends nativeWorker {
      public constructor(scriptURL: string | URL, options?: WorkerOptions) {
        super(scriptURL, options);
        names.push(options?.name ?? '');
      }
    };
  });
  await target.setViewport({ width: 1440, height: 900 });
  await openSeededProject();
  await target.evaluate(() => {
    const state = {
      startedAt: performance.now(),
      frameGaps: [] as number[],
      timerDrifts: [] as number[],
      active: true,
      timer: undefined as ReturnType<typeof setInterval> | undefined,
    };
    (globalThis as typeof globalThis & { __TAU_PART_PREVIEW_PROBE__?: typeof state }).__TAU_PART_PREVIEW_PROBE__ =
      state;
    let lastFrame = performance.now();
    const frame = (now: number) => {
      if (!state.active) {
        return;
      }
      state.frameGaps.push(now - lastFrame);
      lastFrame = now;
      requestAnimationFrame(frame);
    };
    requestAnimationFrame(frame);
    let nextTimer = performance.now() + 16;
    state.timer = globalThis.setInterval(() => {
      const now = performance.now();
      state.timerDrifts.push(Math.max(0, now - nextTimer));
      nextTimer = now + 16;
    }, 16);
  });
  await openCommand('Open model structure');

  const list = selectors.getByRole('list', { name: `Model components for ${mainPath}` });
  await target.expectVisible(list, 60_000);
  /** Milliseconds. */
  let automaticDeferDuration: number | undefined;
  if (target.currentWebGpuProfile() === 'software') {
    await target.click(list.getByRole('button', { name: /^Actions for /u }).first());
    await target.expectVisible(selectors.getByRole('alert', { name: 'Preview status' }));
    await target.expectVisible(selectors.getByRole('menuitem', { name: 'Retry preview' }));
    automaticDeferDuration = await target.evaluate(() => {
      const state = (globalThis as typeof globalThis & { __TAU_PART_PREVIEW_PROBE__?: { startedAt: number } })
        .__TAU_PART_PREVIEW_PROBE__;
      if (!state) {
        throw new Error('Part preview probe is missing');
      }
      return performance.now() - state.startedAt;
    });
    expect(await target.evaluate(() => document.querySelectorAll('[data-model-component-row] img').length)).toBe(0);
    const automaticWorkerNames = await target.evaluate(
      () =>
        (globalThis as typeof globalThis & { __TAU_PART_PREVIEW_WORKERS__?: string[] }).__TAU_PART_PREVIEW_WORKERS__ ??
        [],
    );
    expect(automaticWorkerNames).not.toContain('tau-headless-image-transcoder-worker');
    await target.click(selectors.getByRole('menuitem', { name: 'Retry preview' }));
  }
  const rowImage = list.getByCss('img[src^="blob:"]').first();
  try {
    await target.expectVisible(rowImage, 15_000);
  } catch (error) {
    const state = await target.evaluate(() => ({
      rows: [...document.querySelectorAll<HTMLElement>('[data-model-component-row]')].slice(0, 8).map((row) => ({
        id: row.dataset['modelComponentId'],
        text: row.textContent,
        imageCount: row.querySelectorAll('img').length,
      })),
      properties: document.querySelector<HTMLElement>('[data-slot="part-properties"]')?.textContent,
    }));
    throw new Error(`No row preview after 15 s: ${JSON.stringify(state)}`, { cause: error });
  }
  const rowImageState = await target.evaluateLocator(rowImage, (image) => {
    const element = image as HTMLImageElement;
    return {
      width: element.getBoundingClientRect().width,
      height: element.getBoundingClientRect().height,
      decoded: element.naturalWidth > 0,
    };
  });
  expect(rowImageState).toEqual({ width: 20, height: 20, decoded: true });
  const cold = await target.evaluate(() => {
    const state = (
      globalThis as typeof globalThis & {
        __TAU_PART_PREVIEW_PROBE__?: {
          startedAt: number;
          frameGaps: number[];
          timerDrifts: number[];
          active: boolean;
          timer: ReturnType<typeof setInterval> | undefined;
        };
      }
    ).__TAU_PART_PREVIEW_PROBE__;
    if (!state) {
      throw new Error('Part preview probe is missing');
    }
    state.active = false;
    clearInterval(state.timer);
    return {
      visibleDuration: performance.now() - state.startedAt,
      frameGaps: state.frameGaps,
      timerDrifts: state.timerDrifts,
    };
  });
  const summarize = (samples: readonly number[]) => {
    const sorted = [...samples].sort((left, right) => left - right);
    return { count: sorted.length, p95: sorted[Math.ceil(sorted.length * 0.95) - 1] ?? 0, max: sorted.at(-1) ?? 0 };
  };
  const coldMetrics = {
    units: 'milliseconds',
    profile: target.currentWebGpuProfile(),
    visible: cold.visibleDuration,
    automaticDeferDuration,
    frameGap: summarize(cold.frameGaps),
    timerDrift: summarize(cold.timerDrifts),
    workerNames: await target.evaluate(
      () =>
        (globalThis as typeof globalThis & { __TAU_PART_PREVIEW_WORKERS__?: string[] }).__TAU_PART_PREVIEW_WORKERS__ ??
        [],
    ),
  };

  const part = list.getByCss('button[aria-pressed]:not([aria-label^="Isolate "])').first();
  await target.click(part);
  const propertiesImage = selectors.getByCss('[data-slot="part-properties"] img[src^="blob:"]').first();
  await target.expectVisible(propertiesImage, 15_000);
  const propertiesImageState = await target.evaluateLocator(propertiesImage, (image) => {
    const element = image as HTMLImageElement;
    return {
      width: element.getBoundingClientRect().width,
      height: element.getBoundingClientRect().height,
      decoded: element.naturalWidth > 0,
    };
  });
  expect(propertiesImageState).toEqual({ width: 40, height: 40, decoded: true });
  expect(await target.evaluateLocator(propertiesImage, (image) => (image as HTMLImageElement).alt)).toMatch(
    /^Rendered /u,
  );

  await target.hover(part);
  const action = list.getByRole('button', { name: /^Actions for /u }).first();
  await target.click(action);
  await target.expectVisible(selectors.getByRole('menuitem', { name: /add to chat/iu }));
  const menuPreview = selectors.getByRole('menu').getByCss('img[src^="blob:"]').first();
  await target.expectVisible(menuPreview);
  expect(
    await target.evaluateLocator(menuPreview, (image) => (image as HTMLImageElement).getBoundingClientRect().width),
  ).toBe(24);
  await target.writeArtifact(`c2-part-preview-${coldMetrics.profile}.json`, JSON.stringify(coldMetrics, undefined, 2));
  await target.screenshot(selectors.getByCss('body'), 'model-pane-part-previews.png');
  const adapter = await target.qualifyWebGpu(coldMetrics.profile);
  expect(adapter.adapterClass).toBe(coldMetrics.profile);
  await target.writeArtifact(
    `c2-part-preview-adapter-${coldMetrics.profile}.json`,
    JSON.stringify(adapter, undefined, 2),
  );
});

test('defers a cold part preview worker and resumes automatic previews after explicit rendering', async () => {
  const profile = target.currentWebGpuProfile();
  await target.addInitScript(() => {
    const names: string[] = [];
    (globalThis as typeof globalThis & { __TAU_PART_PREVIEW_WORKERS__?: string[] }).__TAU_PART_PREVIEW_WORKERS__ =
      names;
    const nativeWorker = globalThis.Worker;
    globalThis.Worker = class extends nativeWorker {
      public constructor(scriptURL: string | URL, options?: WorkerOptions) {
        super(scriptURL, options);
        names.push(options?.name ?? '');
      }
    };
  });
  await target.setViewport({ width: 1440, height: 900 });
  await target.navigate(`${seedRoute}?main=preview-secondary`);
  await target.expectUrl(/\/w\/[^/]+\/[^/]+/u, 60_000);
  await target.click(selectors.getByRole('button', { name: /^decline$/iu }), { timeout: 5000 }).catch(() => undefined);
  await openSecondGeometryUnit('public/models/preview-mixed.js');
  await target.expectVisible(selectors.getByTestId('cad-viewer-canvas-region').getByCss('canvas').first(), 60_000);
  await target.waitFor(() =>
    Boolean((globalThis as typeof globalThis & { __TAU_SECTION_VIEW_TEST__?: unknown }).__TAU_SECTION_VIEW_TEST__),
  );
  const beginProbe = async () =>
    target.evaluate(() => {
      const bridge = (
        globalThis as typeof globalThis & {
          __TAU_SECTION_VIEW_TEST__?: {
            getRendererIdentity(): { frame: number };
            getViewportCanvas(): HTMLCanvasElement;
            getCamera(): unknown;
          };
        }
      ).__TAU_SECTION_VIEW_TEST__;
      if (!bridge) {
        throw new Error('Viewport render bridge is missing');
      }
      const canvas = bridge.getViewportCanvas();
      const abort = new AbortController();
      const state = {
        active: true,
        abort,
        startedAt: performance.now(),
        wallStartedAt: Date.now(),
        renderTimes: [] as number[],
        inputTimes: [] as number[],
        imageLoadTimes: [] as number[],
        inputToRender: [] as number[],
        pendingInputs: [] as number[],
        cameraBefore: JSON.stringify(bridge.getCamera()),
      };
      (globalThis as typeof globalThis & { __TAU_MIXED_PREVIEW_PROBE__?: typeof state }).__TAU_MIXED_PREVIEW_PROBE__ =
        state;
      document.addEventListener(
        'pointermove',
        (event) => {
          const bounds = canvas.getBoundingClientRect();
          if (
            state.active &&
            event.buttons !== 0 &&
            event.clientX >= bounds.left &&
            event.clientX <= bounds.right &&
            event.clientY >= bounds.top &&
            event.clientY <= bounds.bottom
          ) {
            state.pendingInputs.push(event.timeStamp);
            state.inputTimes.push(event.timeStamp);
          }
        },
        { signal: abort.signal },
      );
      document.addEventListener(
        'load',
        (event) => {
          const image = event.target;
          if (state.active && image instanceof HTMLImageElement && image.closest('[data-model-component-row]')) {
            state.imageLoadTimes.push(performance.now());
          }
        },
        { capture: true, signal: abort.signal },
      );
      let lastFrame = bridge.getRendererIdentity().frame;
      const tick = (now: number) => {
        if (!state.active) {
          return;
        }
        const { frame } = bridge.getRendererIdentity();
        if (frame !== lastFrame) {
          state.renderTimes.push(now);
          state.inputToRender.push(...state.pendingInputs.map((at) => now - at));
          state.pendingInputs.length = 0;
          lastFrame = frame;
        }
        requestAnimationFrame(tick);
      };
      requestAnimationFrame(tick);
    });
  const finishProbe = async () =>
    target.evaluate(() => {
      const state = (
        globalThis as typeof globalThis & {
          __TAU_MIXED_PREVIEW_PROBE__?: {
            active: boolean;
            abort: AbortController;
            startedAt: number;
            wallStartedAt: number;
            renderTimes: number[];
            inputTimes: number[];
            imageLoadTimes: number[];
            inputToRender: number[];
            pendingInputs: number[];
            cameraBefore: string;
          };
          __TAU_SECTION_VIEW_TEST__?: { getRendererIdentity(): { api: string; name: string }; getCamera(): unknown };
        }
      ).__TAU_MIXED_PREVIEW_PROBE__;
      const bridge = (
        globalThis as typeof globalThis & {
          __TAU_SECTION_VIEW_TEST__?: { getRendererIdentity(): { api: string; name: string }; getCamera(): unknown };
        }
      ).__TAU_SECTION_VIEW_TEST__;
      if (!state || !bridge) {
        throw new Error('Viewport render probe is missing');
      }
      state.active = false;
      state.abort.abort();
      const { memory } = performance as Performance & { memory?: { usedJSHeapSize: number } };
      return {
        duration: performance.now() - state.startedAt,
        wallStartedAt: state.wallStartedAt,
        wallFinishedAt: Date.now(),
        renderTimes: state.renderTimes,
        inputTimes: state.inputTimes,
        imageLoadTimes: state.imageLoadTimes,
        inputToRender: state.inputToRender,
        cameraMoved: state.cameraBefore !== JSON.stringify(bridge.getCamera()),
        renderer: bridge.getRendererIdentity(),
        usedJsHeapBytes: memory?.usedJSHeapSize,
      };
    });
  const dragViewport = async () => {
    const bounds = await target.evaluate(() => {
      const canvas = document.querySelector<HTMLCanvasElement>('[data-testid="cad-viewer-canvas-region"] canvas');
      if (!canvas) {
        throw new Error('Viewport canvas is missing');
      }
      const rect = canvas.getBoundingClientRect();
      return { x: rect.x + rect.width / 2, y: rect.y + rect.height / 2 };
    });
    await target.mouseMove(bounds.x, bounds.y);
    await target.mouseDown();
    await target.mouseMove(bounds.x + 80, bounds.y + 45, { steps: 24 });
    await target.mouseUp();
  };
  const imageCount = async () =>
    target.evaluate(
      () =>
        [...document.querySelectorAll<HTMLImageElement>('[data-model-component-row] img[src^="blob:"]')].filter(
          (image) => image.complete && image.naturalWidth > 0,
        ).length,
    );
  const summarize = (samples: readonly number[]) => {
    const sorted = [...samples].sort((left, right) => left - right);
    return { count: sorted.length, p95: sorted[Math.ceil(sorted.length * 0.95) - 1] ?? 0, max: sorted.at(-1) ?? 0 };
  };
  const sample = (value: Awaited<ReturnType<typeof finishProbe>>) => ({
    visibleDuration: value.duration,
    wallStartedAt: value.wallStartedAt,
    wallFinishedAt: value.wallFinishedAt,
    renderedFrameGap: summarize(value.renderTimes.slice(1).map((at, index) => at - value.renderTimes[index]!)),
    inputToRender: summarize(value.inputToRender),
    rawTimeline: {
      renderTimes: value.renderTimes,
      inputTimes: value.inputTimes,
      imageLoadTimes: value.imageLoadTimes,
    },
    cameraMoved: value.cameraMoved,
    renderer: value.renderer,
    usedJsHeapBytes: value.usedJsHeapBytes,
  });

  await target.waitFor(
    () => {
      const bridge = (
        globalThis as typeof globalThis & {
          __TAU_SECTION_VIEW_TEST__?: {
            getModelComponents(): readonly unknown[];
            getRendererIdentity(): { frame: number };
            isGeometryFramed(): boolean;
          };
        }
      ).__TAU_SECTION_VIEW_TEST__;
      return Boolean(
        bridge?.isGeometryFramed() &&
        bridge.getModelComponents().length >= 12 &&
        bridge.getRendererIdentity().frame > 1,
      );
    },
    undefined,
    { timeout: 60_000 },
  );
  // Present and shade the source material scene before measuring cold part-preview demand.
  await dragViewport();
  await beginProbe();
  for (let motion = 0; motion < 4; motion++) {
    // oxlint-disable-next-line no-await-in-loop -- The paired viewport baseline uses the same motion as the cold-worker interval.
    await dragViewport();
  }
  const viewportBaseline = sample(await finishProbe());
  const workerNamesBefore = await target.evaluate(
    () =>
      (globalThis as typeof globalThis & { __TAU_PART_PREVIEW_WORKERS__?: string[] }).__TAU_PART_PREVIEW_WORKERS__ ??
      [],
  );
  expect(workerNamesBefore).not.toContain('tau-headless-image-transcoder-worker');
  await beginProbe();
  await target.click(selectors.getByRole('button', { name: 'Search', exact: true }));
  await target.fill(selectors.getByPlaceholder('Search projects, chats, and actions…'), 'Open model structure');
  await target.keyboardPress('Enter');
  const list = selectors.getByRole('list', { name: 'Model components for public/models/preview-mixed.js' });
  for (let motion = 0; motion < 4; motion++) {
    // oxlint-disable-next-line no-await-in-loop -- Continuous viewport motion must overlap cold preview work.
    await dragViewport();
  }
  await target.expectVisible(list, 60_000);
  const deferred = sample(await finishProbe());
  const workerNamesDeferred = await target.evaluate(
    () =>
      (globalThis as typeof globalThis & { __TAU_PART_PREVIEW_WORKERS__?: string[] }).__TAU_PART_PREVIEW_WORKERS__ ??
      [],
  );
  expect(workerNamesDeferred).not.toContain('tau-headless-image-transcoder-worker');
  expect(await imageCount()).toBe(0);
  expect(deferred.rawTimeline.imageLoadTimes).toHaveLength(0);
  expect(deferred.cameraMoved && deferred.inputToRender.count > 5).toBe(true);
  const adapter = await target.qualifyWebGpu(profile);
  expect(adapter.adapterClass).toBe(profile);
  await target.writeArtifact(
    `c2-mixed-part-viewport-deferred-${profile}.json`,
    JSON.stringify(
      {
        source: 'public/models/preview-mixed.js',
        parts: 12,
        materialFamilies: ['brushed metallic', 'transmissive glass', 'embedded 64x64 PNG texture', 'matte polymer'],
        viewport: [1440, 900],
        profile,
        adapter,
        workerNamesBefore,
        workerNamesDeferred,
        units: 'milliseconds',
        viewportBaseline,
        deferred,
      },
      undefined,
      2,
    ),
  );
  await target.click(list.getByRole('button', { name: /^Actions for /u }).first());
  await target.expectVisible(selectors.getByRole('alert', { name: 'Preview status' }));
  await target.keyboardPress('Escape');
  await dragViewport();
  await beginProbe();
  for (let motion = 0; motion < 4; motion++) {
    // oxlint-disable-next-line no-await-in-loop -- The mounted Model pane retains a cold image worker during interaction.
    await dragViewport();
  }
  const coldInteraction = sample(await finishProbe());
  const workerNamesColdInteraction = await target.evaluate(
    () =>
      (globalThis as typeof globalThis & { __TAU_PART_PREVIEW_WORKERS__?: string[] }).__TAU_PART_PREVIEW_WORKERS__ ??
      [],
  );
  expect(workerNamesColdInteraction).not.toContain('tau-headless-image-transcoder-worker');
  expect(coldInteraction.rawTimeline.imageLoadTimes).toHaveLength(0);
  await target.writeArtifact(
    `c2-cold-mounted-interaction-${profile}.json`,
    JSON.stringify({ profile, coldInteraction, workerNamesColdInteraction }, undefined, 2),
  );
  expect(coldInteraction.inputToRender.p95, JSON.stringify(coldInteraction)).toBeLessThanOrEqual(50);

  // Limit explicit startup to one part, then measure new automatic demand on a warm worker.
  const filter = selectors.getByRole('searchbox', { name: 'Filter parts' });
  await target.fill(filter, 'Preview part 7');
  await target.click(list.getByRole('button', { name: /^Actions for /u }).first());
  await target.expectVisible(selectors.getByRole('alert', { name: 'Preview status' }));
  await target.click(selectors.getByRole('menuitem', { name: 'Retry preview' }));
  await target.waitFor(
    () =>
      [...document.querySelectorAll<HTMLImageElement>('[data-model-component-row] img[src^="blob:"]')].some(
        (image) => image.complete && image.naturalWidth > 0,
      ),
    undefined,
    { timeout: 30_000 },
  );
  const workerNamesExplicit = await target.evaluate(
    () =>
      (globalThis as typeof globalThis & { __TAU_PART_PREVIEW_WORKERS__?: string[] }).__TAU_PART_PREVIEW_WORKERS__ ??
      [],
  );
  expect(workerNamesExplicit).toContain('tau-headless-image-transcoder-worker');
  if (profile === 'software') {
    await target.writeArtifact(
      'c2-mixed-explicit-software.json',
      JSON.stringify({ profile, workerNamesExplicit, decoded: await imageCount() }, undefined, 2),
    );
    return;
  }
  await beginProbe();
  await target.fill(filter, '');
  for (let motion = 0; motion < 4; motion++) {
    // oxlint-disable-next-line no-await-in-loop -- Continuous viewport motion overlaps warm automatic preview demand.
    await dragViewport();
  }
  try {
    await target.waitFor(
      () =>
        [...document.querySelectorAll<HTMLElement>('[data-model-component-row]')].slice(0, 4).every((row) => {
          const image = row.querySelector<HTMLImageElement>('img[src^="blob:"]');
          return image?.complete && image.naturalWidth > 0;
        }),
      undefined,
      { timeout: 30_000 },
    );
  } catch (error) {
    const admission = await target.evaluate(() => ({
      workers:
        (globalThis as typeof globalThis & { __TAU_PART_PREVIEW_WORKERS__?: string[] }).__TAU_PART_PREVIEW_WORKERS__ ??
        [],
      rows: [...document.querySelectorAll<HTMLElement>('[data-model-component-row]')].map((row) => ({
        text: row.textContent.trim(),
        image: row.querySelector<HTMLImageElement>('img')?.src,
        busy: row.getAttribute('aria-busy'),
      })),
      alerts: [...document.querySelectorAll<HTMLElement>('[role="alert"]')].map((alert) => alert.textContent.trim()),
    }));
    await target.writeArtifact('c2-true-cold-admission.json', JSON.stringify(admission, undefined, 2));
    throw error;
  }
  const warm = sample(await finishProbe());
  await target.writeArtifact('c2-warm-automatic-interaction.json', JSON.stringify({ profile, warm }, undefined, 2));
  expect(warm.cameraMoved).toBe(true);
  expect(warm.renderedFrameGap.count).toBeGreaterThan(5);
  expect(warm.inputToRender.count, JSON.stringify(warm)).toBeGreaterThan(5);
  expect(
    warm.rawTimeline.imageLoadTimes.some(
      (at) => at >= Math.min(...warm.rawTimeline.inputTimes) && at <= Math.max(...warm.rawTimeline.inputTimes),
    ),
  ).toBe(true);
  expect(warm.inputToRender.p95, JSON.stringify(warm)).toBeLessThanOrEqual(50);
  const initiallyDecoded = await imageCount();
  expect(initiallyDecoded).toBeGreaterThanOrEqual(4);
  // A secondary unit exposes only its visible page to the preview queue; scrolling admits the remaining materials.
  await target.scrollIntoView(list.getByCss('[data-model-component-row]').last());
  await target.waitFor(
    () =>
      [...document.querySelectorAll<HTMLElement>('[data-model-component-row]')].slice(-4).every((row) => {
        const image = row.querySelector<HTMLImageElement>('img[src^="blob:"]');
        return image?.complete && image.naturalWidth > 0;
      }),
    undefined,
    { timeout: 30_000 },
  );
  const scrolledDecoded = await imageCount();
  expect(scrolledDecoded).toBeGreaterThanOrEqual(4);
  const workerNamesAfter = await target.evaluate(
    () =>
      (globalThis as typeof globalThis & { __TAU_PART_PREVIEW_WORKERS__?: string[] }).__TAU_PART_PREVIEW_WORKERS__ ??
      [],
  );
  expect(workerNamesAfter).toContain('tau-headless-image-transcoder-worker');
  await target.writeArtifact(
    'c2-mixed-part-viewport.json',
    JSON.stringify(
      {
        source: 'public/models/preview-mixed.js',
        parts: 12,
        materialFamilies: ['brushed metallic', 'transmissive glass', 'embedded 64x64 PNG texture', 'matte polymer'],
        viewport: [1440, 900],
        profile,
        adapter,
        workerNamesBefore,
        workerNamesAfter,
        units: 'milliseconds',
        viewportBaseline,
        deferred,
        coldInteraction,
        warm,
        initiallyDecoded,
        scrolledDecoded,
      },
      undefined,
      2,
    ),
  );
  await target.screenshot(selectors.getByCss('body'), 'model-pane-mixed-previews.png');
});

test('admits previews for newly mounted virtual Model rows after scrolling', async () => {
  await target.setViewport({ width: 1440, height: 900 });
  await target.navigate(`${seedRoute}?main=preview-secondary`);
  await target.expectUrl(/\/w\/[^/]+\/[^/]+/u, 60_000);
  await target.click(selectors.getByRole('button', { name: /^decline$/iu }), { timeout: 5000 }).catch(() => undefined);
  await openSecondGeometryUnit('public/models/preview-virtual.js');
  await openCommand('Open model structure');
  const list = selectors.getByRole('list', { name: 'Model components for public/models/preview-virtual.js' });
  await target.expectVisible(list, 60_000);
  const mountedBefore = await target.evaluateLocator(
    list,
    (element) => element.querySelectorAll('[data-model-component-row]').length,
  );
  expect(mountedBefore).toBeLessThan(48);
  expect(
    await target.evaluateLocator(list, (element) => Boolean(element.querySelector('[data-virtuoso-scroller]'))),
  ).toBe(true);
  const filter = selectors.getByRole('textbox', { name: 'Filter parts' });
  await target.fill(filter, 'Preview part 1');
  const first = list.getByRole('button', { name: 'Preview part 1', exact: true });
  await target.expectVisible(first);
  await target.click(first);
  await target.hover(first);
  await target.click(list.getByRole('button', { name: 'Actions for Preview part 1', exact: true }));
  await target.click(selectors.getByRole('menuitem', { name: /Retry preview/iu }));
  await target.keyboardPress('Escape');
  await target.expectVisible(first.getByCss('img[src^="blob:"]'), 60_000);
  await target.fill(filter, '');
  await target.expectVisible(list.getByCss('[data-virtuoso-scroller]'));
  await target.evaluateLocator(list, (element) => {
    const scroller = element.querySelector<HTMLElement>('[data-virtuoso-scroller]');
    if (!scroller) {
      throw new Error('Virtual Model scroller was missing');
    }
    scroller.scrollTop = scroller.scrollHeight;
  });
  const last = list.getByRole('button', { name: 'Preview part 48', exact: true });
  await target.expectVisible(last, 60_000);
  const lastImage = last.getByCss('img[src^="blob:"]');
  await target.expectVisible(lastImage, 60_000);
  await target.click(last);
  const propertiesImage = selectors.getByCss('[data-slot="part-properties"] img[src^="blob:"]').first();
  await target.expectVisible(propertiesImage, 60_000);
  expect(
    await target.evaluateLocator(propertiesImage, (image) => (image as HTMLImageElement).getBoundingClientRect().width),
  ).toBe(40);
  await target.hover(last);
  await target.click(list.getByRole('button', { name: 'Actions for Preview part 48', exact: true }));
  const menuImage = selectors.getByRole('menu').getByCss('img[src^="blob:"]').first();
  await target.expectVisible(menuImage);
  expect(await target.evaluateLocator(menuImage, (image) => image.getBoundingClientRect().width)).toBe(24);
  await target.writeArtifact(
    'c2-virtual-model-preview-smoke.json',
    JSON.stringify(
      {
        source: 'public/models/preview-virtual.js',
        parts: 48,
        mountedBefore,
        row: await target.evaluateLocator(lastImage, (image) => ({
          width: image.getBoundingClientRect().width,
          decoded: image instanceof HTMLImageElement && image.complete && image.naturalWidth > 0,
        })),
        mountedAfter: await target.evaluateLocator(
          list,
          (element) => element.querySelectorAll('[data-model-component-row]').length,
        ),
        adapter: await target.qualifyWebGpu(target.currentWebGpuProfile()),
      },
      undefined,
      2,
    ),
  );
  await target.screenshot(selectors.getByCss('body'), 'c2-virtual-model-preview-smoke.png');
});
