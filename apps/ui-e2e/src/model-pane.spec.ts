import { base64ToUint8Array, uint8ArrayToBase64 } from 'uint8array-extras';
import { expect, test } from 'vitest';
import { page as selectors } from 'vitest/browser';
import type { Locator } from 'vitest/browser';
import type { AdmittedAssembly, PublishedPartAsset } from '@taucad/runtime/types';
import { expandPath, treeItem as rootedTreeItem } from '#support/file-tree.js';
import * as target from '#support/external-target.js';
import { readProjectStorageState } from '#support/project-storage-state.js';

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
  const filter = selectors.getByRole('searchbox', { name: 'Filter parts' });
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

type PreviewRecoveryCapture = Readonly<{
  diagnostics: Readonly<{ projectId: string | undefined; sourceEntryPath: string | undefined }>;
  assemblyDisplay?: Readonly<{ root: PublishedPartAsset; admitted: AdmittedAssembly }>;
  isCurrent(): boolean;
  readRawBytes(path: string): Promise<Uint8Array<ArrayBuffer>>;
}>;
type PreviewRecoveryBridge = Readonly<{
  getCommittedAssembly(): PreviewRecoveryCapture;
  getModelComponents(): Array<{ id: string; name: string; kind: string | undefined; primitiveReferenceCount: number }>;
  getModelHoverState(): Readonly<{ activeUnitId: string | undefined; selectedComponentIds?: readonly string[] }>;
  getCommittedDrawInventory():
    | Readonly<{
        key: string;
        unitId: string;
        canonicalComponents: ReadonlyArray<
          Readonly<{
            ancestry: readonly string[];
            component: Readonly<{ id: string; name: string }>;
          }>
        >;
        surfaces: ReadonlyArray<Readonly<{ componentId: string }>>;
      }>
    | undefined;
  isGeometryFramed(): boolean;
}>;
type PreviewRecoveryRecord = Readonly<{
  name: string;
  startTime: number;
  duration: number;
  detail: Readonly<Record<string, unknown>>;
}>;
type PreviewRecoveryDocument = typeof globalThis & {
  __TAU_SECTION_VIEW_TEST__?: PreviewRecoveryBridge;
  __TAU_HEADLESS_IMAGE_DEBUG__?: { records: PreviewRecoveryRecord[] };
};

/** Read real immutable closure identities under the currently presented, host-admitted pin. */
const readPreviewRecoveryPin = async () =>
  target.evaluate(async () => {
    const state: PreviewRecoveryDocument = globalThis;
    const bridge = state.__TAU_SECTION_VIEW_TEST__;
    const capture = bridge?.getCommittedAssembly();
    const display = capture?.assemblyDisplay;
    if (!bridge || !capture || !display || !capture.isCurrent()) {
      throw new Error('Presented preview publication is unavailable.');
    }
    const hash = async (bytes: Uint8Array<ArrayBuffer>): Promise<string> =>
      `sha256:${[...new Uint8Array(await crypto.subtle.digest('SHA-256', bytes))].map((byte) => byte.toString(16).padStart(2, '0')).join('')}`;
    const parent = display.root.path.slice(0, display.root.path.lastIndexOf('/') + 1);
    if (!/^\.tau\/artifacts\/reusable-parts\/[0-9a-f]{64}\/$/u.test(parent)) {
      throw new Error('Preview pin is outside its canonical managed parent.');
    }
    const files = new Map<string, { path: string; digest: string; byteLength: number }>();
    const retain = async (asset: { path: string; digest: string; byteLength?: number }) => {
      if (!capture.isCurrent() || !asset.path.startsWith(parent) || asset.path.split('/').includes('..')) {
        throw new Error('Preview publication or its managed path changed.');
      }
      const bytes = await capture.readRawBytes(asset.path);
      const lengthMismatch = asset.byteLength !== undefined && bytes.byteLength !== asset.byteLength;
      const actualDigest = lengthMismatch ? null : await hash(bytes);
      const digestMatches = actualDigest === null ? null : actualDigest === asset.digest;
      const postAwaitCurrent = !lengthMismatch && digestMatches === true ? capture.isCurrent() : null;
      if (lengthMismatch || digestMatches !== true || postAwaitCurrent !== true) {
        throw new Error(
          `Preview immutable bytes changed: ${asset.path}; ${JSON.stringify({
            expectedByteLength: asset.byteLength ?? null,
            actualByteLength: bytes.byteLength,
            byteLengthMatches: asset.byteLength === undefined ? null : !lengthMismatch,
            expectedDigest: asset.digest,
            actualDigest,
            digestMatches,
            postAwaitCurrent,
          })}`,
        );
      }
      const previous = files.get(asset.path);
      if (previous && (previous.digest !== asset.digest || previous.byteLength !== bytes.byteLength)) {
        throw new Error('Preview closure has conflicting immutable identities.');
      }
      files.set(asset.path, { path: asset.path, digest: asset.digest, byteLength: bytes.byteLength });
      return bytes;
    };
    const rootBytes = await retain(display.root);
    const decodeRoot = (bytes: Uint8Array<ArrayBuffer>): unknown =>
      JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes));
    const pointer = decodeRoot(rootBytes) as {
      schemaVersion: number;
      generation: number;
      manifest: { path: string; digest: string; byteLength: number };
    };
    const storagePath = (digest: string, extension: string): string =>
      `${parent}roots/sha256/${digest.slice('sha256:'.length)}.${extension}`;
    if (
      rootBytes.byteLength > 4096 ||
      pointer.schemaVersion !== 2 ||
      !Number.isSafeInteger(pointer.generation) ||
      pointer.generation < 1 ||
      pointer.manifest.path !== storagePath(pointer.manifest.digest, 'json') ||
      pointer.manifest.byteLength < 1 ||
      pointer.manifest.byteLength > 1_048_576
    ) {
      throw new Error('Preview pointer is not a bounded immutable root.');
    }
    const manifest = decodeRoot(await retain(pointer.manifest)) as {
      schemaVersion: number;
      content: { digest: string; byteLength: number };
      chunks: Array<{ path: string; digest: string; byteLength: number }>;
    };
    if (
      manifest.schemaVersion !== 1 ||
      !Number.isSafeInteger(manifest.content.byteLength) ||
      manifest.content.byteLength < 1 ||
      manifest.content.byteLength > 32 * 1_048_576 ||
      manifest.chunks.length !== Math.ceil(manifest.content.byteLength / 1_048_576)
    ) {
      throw new Error('Preview root manifest is invalid.');
    }
    const content = new Uint8Array(manifest.content.byteLength);
    let offset = 0;
    for (const chunk of manifest.chunks) {
      const length = Math.min(1_048_576, content.byteLength - offset);
      if (chunk.path !== storagePath(chunk.digest, 'chunk') || chunk.byteLength !== length) {
        throw new Error('Preview root chunk order or length changed.');
      }
      // oxlint-disable-next-line no-await-in-loop -- Keep the current captured pin across ordered immutable reads.
      content.set(await retain(chunk), offset);
      offset += length;
    }
    if ((await hash(content)) !== manifest.content.digest || !capture.isCurrent()) {
      throw new Error('Preview logical root digest or subject changed.');
    }
    // This projects references from checked logical bytes; semantic admission remains with the host.
    const root: unknown = decodeRoot(content);
    if (
      typeof root !== 'object' ||
      root === null ||
      !('schemaVersion' in root) ||
      root.schemaVersion !== 1 ||
      !('generation' in root) ||
      root.generation !== pointer.generation
    ) {
      throw new TypeError('Preview logical root generation changed.');
    }
    if (!('parts' in root)) {
      throw new TypeError('Admitted root has no part references.');
    }
    const references = root.parts;
    if (
      typeof references !== 'object' ||
      references === null ||
      Object.keys(references).sort().join(',') !== 'body,face' ||
      Object.keys(display.admitted.publication.parts).sort().join(',') !== 'body,face'
    ) {
      throw new TypeError('Recovery subject must contain exactly the body and face definitions.');
    }
    const retainedReferences = await Promise.all(
      Object.keys(references).map(async (part) => {
        const reference: unknown = Reflect.get(references, part);
        if (
          typeof reference !== 'object' ||
          reference === null ||
          !('path' in reference) ||
          !('digest' in reference) ||
          typeof reference.path !== 'string' ||
          typeof reference.digest !== 'string'
        ) {
          throw new TypeError('Admitted part reference is incomplete.');
        }
        await retain({ path: reference.path, digest: reference.digest });
        const record = display.admitted.publication.parts[part];
        if (!record) {
          throw new Error('Referenced reusable definition is absent.');
        }
        await Promise.all(
          Object.values(record.variants).map(async (variant) => {
            const bytes = await retain(variant.glb);
            const admittedBytes = await display.admitted.readAsset(variant.glb.digest);
            if (admittedBytes.byteLength !== bytes.byteLength || (await hash(admittedBytes)) !== variant.glb.digest) {
              throw new Error('Admitted display reader and captured rooted bytes disagree.');
            }
            if (variant.exact) {
              await retain(variant.exact.asset);
            }
          }),
        );
        return { part, path: reference.path, digest: reference.digest };
      }),
    );
    const expectedOccurrences = new Map([
      ['body-left', 'body'],
      ['body-right', 'body'],
      ['face-left', 'face'],
      ['face-right', 'face'],
    ]);
    const occurrences = display.admitted.publication.occurrences.map((occurrence) => {
      if (
        occurrence.children !== undefined ||
        expectedOccurrences.get(occurrence.id) !== occurrence.part ||
        !display.admitted.publication.parts[occurrence.part]?.variants[occurrence.variant]
      ) {
        throw new Error('Recovery subject has an unexpected occurrence or variant.');
      }
      return { id: occurrence.id, part: occurrence.part, variant: occurrence.variant, transform: occurrence.transform };
    });
    if (occurrences.length !== 4 || new Set(occurrences.map(({ id }) => id)).size !== 4) {
      throw new Error('Recovery subject must contain four distinct flat occurrences.');
    }
    const draw = bridge.getCommittedDrawInventory();
    if (!draw || draw.key !== display.root.digest) {
      throw new Error('Recovery has no current canonical draw inventory.');
    }
    const leaves = draw.canonicalComponents.filter(({ component }) =>
      draw.surfaces.some(({ componentId }) => componentId === component.id),
    );
    if (leaves.length !== 6 || new Set(leaves.map(({ component }) => component.id)).size !== 6) {
      throw new Error('Recovery must present six distinct canonical surface leaves.');
    }
    for (const [id, part] of expectedOccurrences) {
      const actual = leaves.filter(({ ancestry }) => ancestry.length === 1 && ancestry[0] === id);
      const names = actual.map(({ component }) => component.name).sort();
      const expected = part === 'body' ? ['Known housing', 'Unknown density'] : ['Open face'];
      if (names.join(',') !== expected.join(',')) {
        throw new Error('Recovery leaf identity differs from its authored occurrence definition.');
      }
    }
    const knownHousingIds = leaves
      .filter(
        ({ ancestry, component }) =>
          component.name === 'Known housing' &&
          ancestry.length === 1 &&
          expectedOccurrences.get(ancestry[0] ?? '') === 'body',
      )
      .map(({ component }) => component.id);
    const model = bridge.getModelComponents();
    if (leaves.some(({ component }) => !model.some(({ id, name }) => id === component.id && name === component.name))) {
      throw new Error('Explorer canonical components disagree with the drawn leaves.');
    }
    const fresh = bridge.getCommittedAssembly();
    if (!capture.isCurrent() || fresh.assemblyDisplay !== display || !fresh.isCurrent()) {
      throw new Error('Preview publication changed during closure collection.');
    }
    return {
      root: display.root,
      unitId: draw.unitId,
      references: retainedReferences,
      occurrences,
      leaves,
      files: [...files.values()].sort((left, right) => left.path.localeCompare(right.path)),
      knownHousingIds,
    };
  });

/** Read the existing bounded job evidence without resetting or inventing absent queue observations. */
const readPreviewRecoveryJobs = async () =>
  target.evaluate(() => {
    const state: PreviewRecoveryDocument = globalThis;
    const debug = state.__TAU_HEADLESS_IMAGE_DEBUG__;
    const environment: unknown = Reflect.get(globalThis, 'ENV');
    if (
      typeof environment !== 'object' ||
      environment === null ||
      !('TAU_DEBUG' in environment) ||
      environment.TAU_DEBUG !== true
    ) {
      throw new Error('Preview admission evidence requires the actual TAU_DEBUG document.');
    }
    if (debug && debug.records.length >= 512) {
      throw new Error('Preview job evidence may have been truncated.');
    }
    // The existing recorder creates its bridge lazily on the first actual record.
    return debug ? [...debug.records] : [];
  });

test('recovers manual source-free pinned previews at distinct reusable occurrences', async () => {
  await target.setViewport({ width: 1440, height: 900 });
  await target.navigate(`${seedRoute}?main=preview-assembly-secondary`);
  await target.expectUrl(/\/w\/[^/]+\/[^/]+/u, 60_000);
  await target.click(selectors.getByRole('button', { name: /^decline$/iu }), { timeout: 5000 }).catch(() => undefined);
  const boundaries: Array<{ name: string; records: PreviewRecoveryRecord[] }> = [];
  const retainBoundary = async (name: string): Promise<void> => {
    const records = await readPreviewRecoveryJobs();
    const previous = boundaries.at(-1)?.records ?? [];
    expect(records.slice(0, previous.length)).toEqual(previous);
    const boundaryRecords = boundaries.length === 0 ? [] : records.slice(previous.length);
    expect(
      boundaryRecords.filter(
        (record) =>
          record.detail['kind'] === 'automatic-thumbnail' &&
          ['queue.admit', 'queue.wait', 'runtime.transcode', 'job.complete'].includes(record.name),
      ),
    ).toHaveLength(0);
    boundaries.push({ name, records });
  };
  await target.expectVisible(
    selectors.getByRole('tab', { name: 'public/models/preview-shell.js', exact: true }),
    60_000,
  );
  const initialViewer = selectors.getByRole('region', { name: 'preview-shell.js', exact: true });
  await target.expectVisible(initialViewer.getByCss('svg #panzoom-root > g[data-slot="geometry"]'), 60_000);
  const currentRoute = await target.evaluate(() => {
    const segments = location.pathname.split('/');
    return { workspace: decodeURIComponent(segments[2] ?? ''), slug: decodeURIComponent(segments[3] ?? '') };
  });
  expect(currentRoute.workspace).toBe('home');
  const storage = await readProjectStorageState();
  const projects = storage.configs.filter(
    ({ workspaceId, providerBasePath }) => workspaceId === undefined && providerBasePath === currentRoute.slug,
  );
  expect(projects).toHaveLength(1);
  const projectId = projects[0]?.projectId;
  if (!projectId) {
    throw new Error('The initial SVG preview has no exact persisted current project.');
  }
  const initialIdentityPrefix = `${projectId}:public/models/preview-shell.js:`;
  await expect
    .poll(async () => {
      const records = await readPreviewRecoveryJobs();
      const initial = records.filter(
        ({ detail }) =>
          detail['kind'] === 'automatic-thumbnail' &&
          typeof detail['identity'] === 'string' &&
          detail['identity'].startsWith(initialIdentityPrefix) &&
          detail['identity'].includes(':1536x1152:'),
      );
      const completed = initial.filter(
        ({ name, detail }) =>
          name === 'job.complete' &&
          detail['success'] === true &&
          detail['outputCount'] === 1 &&
          typeof detail['outputBytes'] === 'number' &&
          detail['outputBytes'] > 0,
      );
      const identity = completed[0]?.detail['identity'];
      return (
        completed.length === 1 &&
        initial.filter(({ name }) => name === 'queue.admit').length === 1 &&
        initial.filter(({ name }) => name === 'queue.wait').length === 1 &&
        initial.every(({ detail }) => detail['identity'] === identity)
      );
    })
    .toBe(true);
  const adapter = await target.qualifyWebGpu(target.currentWebGpuProfile());
  expect(adapter.adapterAvailable).toBe(true);
  expect(adapter.deviceAvailable).toBe(true);
  expect(adapter.adapterClass).toBe(target.currentWebGpuProfile());
  expect(adapter.qualificationErrors).toHaveLength(0);
  const adapterEvidence = {
    profile: adapter.profile,
    adapter: adapter.adapter,
    adapterClass: adapter.adapterClass,
    deviceAvailable: adapter.deviceAvailable,
    secureContext: adapter.secureContext,
    browserVersion: adapter.browserVersion,
    hostPlatform: adapter.hostPlatform,
    launchFingerprint: adapter.launchFingerprint,
    validShaderErrors: adapter.validShaderErrors,
    invalidShaderErrors: adapter.invalidShaderErrors,
    computeReadback: adapter.computeReadback,
    expectedDeviceLossReason: adapter.expectedDeviceLossReason,
  };
  await retainBoundary('before-secondary-admission');
  await openCommand('Open files');
  await expandPath('preview');
  await target.hover(rootedTreeItem('preview/assembly.json'));
  await target.click(selectors.getByRole('button', { name: 'More actions for assembly.json', exact: true }));
  await target.click(selectors.getByRole('menuitem', { name: 'Open in Viewer', exact: true }));
  await target.waitFor(
    () => {
      const state: PreviewRecoveryDocument = globalThis;
      const bridge = state.__TAU_SECTION_VIEW_TEST__;
      const capture = bridge?.getCommittedAssembly();
      return Boolean(bridge?.isGeometryFramed() && capture?.assemblyDisplay && capture.isCurrent());
    },
    undefined,
    { timeout: 120_000 },
  );
  const published = await readPreviewRecoveryPin();
  expect(published.occurrences.map(({ id, part }) => ({ id, part }))).toEqual([
    { id: 'body-left', part: 'body' },
    { id: 'body-right', part: 'body' },
    { id: 'face-left', part: 'face' },
    { id: 'face-right', part: 'face' },
  ]);
  expect(published.occurrences[0]?.variant).toBe(published.occurrences[1]?.variant);
  expect(published.occurrences[2]?.variant).toBe(published.occurrences[3]?.variant);
  await retainBoundary('published');

  // Select and fence the immutable pin before deleting the authored viewer's producer files.
  await openCommand('Open files');
  await expandPath(published.root.path.slice(0, published.root.path.lastIndexOf('/')));
  await target.hover(rootedTreeItem(published.root.path));
  await target.click(selectors.getByRole('button', { name: 'More actions for scene.json', exact: true }));
  await target.click(selectors.getByRole('menuitem', { name: 'Open in Viewer', exact: true }));
  await target.waitFor(
    (subject) => {
      const state: PreviewRecoveryDocument = globalThis;
      const capture = state.__TAU_SECTION_VIEW_TEST__?.getCommittedAssembly();
      return (
        capture?.diagnostics.sourceEntryPath === subject.path &&
        capture.assemblyDisplay?.root.digest === subject.digest &&
        capture.isCurrent()
      );
    },
    { path: published.root.path, digest: published.root.digest },
    { timeout: 120_000 },
  );
  const managed = await readPreviewRecoveryPin();
  const { unitId: authoredUnitId, ...authoredPin } = published;
  const { unitId: managedUnitId, ...managedPin } = managed;
  expect(managedUnitId).not.toBe(authoredUnitId);
  expect(managedPin).toEqual(authoredPin);
  await openCommand('Open files');
  await retainBoundary('managed-reopen');
  for (const path of ['preview/body.js', 'preview/face.js', 'preview/assembly.json']) {
    // oxlint-disable-next-line no-await-in-loop -- The owned Files deletion gestures require the preceding tree/dialog state.
    await expandPath(path.slice(0, path.lastIndexOf('/')));
    // oxlint-disable-next-line no-await-in-loop -- Each selected file opens its own context menu.
    await target.click(rootedTreeItem(path), { button: 'right' });
    // oxlint-disable-next-line no-await-in-loop -- The real menu must open before the delete gesture.
    await target.click(selectors.getByRole('menuitem', { name: 'Delete', exact: true }));
    // oxlint-disable-next-line no-await-in-loop -- Confirm the current file's real deletion before selecting the next file.
    await target.click(selectors.getByRole('alertdialog').getByRole('button', { name: /^Delete/u }));
    // oxlint-disable-next-line no-await-in-loop -- Verify actual source absence before proceeding to the next owned path.
    await target.expectCount(rootedTreeItem(path), 0, 60_000);
    // oxlint-disable-next-line no-await-in-loop -- Retain each real deletion boundary before the next gesture.
    await retainBoundary(`deleted:${path}`);
  }
  // Source deletion must leave that same managed entry committed and selected.
  await target.waitFor(
    (subject) => {
      const state: PreviewRecoveryDocument = globalThis;
      const capture = state.__TAU_SECTION_VIEW_TEST__?.getCommittedAssembly();
      return (
        capture?.diagnostics.sourceEntryPath === subject.path &&
        capture.assemblyDisplay?.root.digest === subject.digest &&
        capture.isCurrent()
      );
    },
    { path: published.root.path, digest: published.root.digest },
    { timeout: 120_000 },
  );
  const sourceFree = await readPreviewRecoveryPin();
  expect(sourceFree).toEqual(managed);
  expect(sourceFree.knownHousingIds).toHaveLength(2);
  expect(new Set(sourceFree.knownHousingIds).size).toBe(2);
  await openCommand('Open model structure');
  await target.fill(selectors.getByRole('searchbox', { name: 'Filter parts' }), 'Known housing');
  const list = selectors.getByRole('list', { name: `Model components for ${sourceFree.root.path}` });
  await target.expectVisible(list, 60_000);
  // The native section owner must allocate room for both real recipients before the manual interval.
  const modelPropertiesSeparator = selectors.getByRole('separator', {
    name: `Resize ${sourceFree.root.path} and preview/assembly.json sections`,
    exact: true,
  });
  await target.expectVisible(modelPropertiesSeparator);
  await target.expectAttribute(modelPropertiesSeparator, 'aria-orientation', 'horizontal');
  await target.expectAttribute(modelPropertiesSeparator, 'aria-disabled', 'false');
  await target.press(modelPropertiesSeparator, 'End');
  await target.scrollIntoView(list.getByCss('[data-model-component-row]').first());
  const firstId = sourceFree.knownHousingIds[0];
  if (!firstId) {
    throw new Error('Actual canonical recovery component is absent.');
  }
  await target.click(list.getByCss(`[data-model-part-button][data-model-component-id=${JSON.stringify(firstId)}]`));
  const properties = selectors.getByCss('[data-slot="part-properties"]');
  await target.expectVisible(properties.getByRole('alert', { name: 'Preview status', exact: true }), 60_000);
  await target.expectVisible(properties.getByText('Preview unavailable', { exact: true }));
  // Mounted membership alone is insufficient: both actual IO and registered service identities must agree.
  try {
    await target.waitFor(
      (input) => {
        const state: PreviewRecoveryDocument = globalThis;
        const bridge = state.__TAU_SECTION_VIEW_TEST__;
        const capture = bridge?.getCommittedAssembly();
        const draw = bridge?.getCommittedDrawInventory();
        const selected = bridge?.getModelHoverState();
        if (
          !capture?.isCurrent() ||
          capture.assemblyDisplay?.root.path !== input.root.path ||
          capture.assemblyDisplay.root.digest !== input.root.digest ||
          capture.assemblyDisplay.root.byteLength !== input.root.byteLength ||
          capture.diagnostics.projectId !== input.projectId ||
          capture.diagnostics.sourceEntryPath !== input.root.path ||
          draw?.key !== input.root.digest ||
          draw.unitId !== input.unitId ||
          selected?.activeUnitId !== input.unitId ||
          selected.selectedComponentIds?.length !== 1 ||
          selected.selectedComponentIds[0] !== input.selectedId
        ) {
          throw new Error('Two-recipient setup lost its exact current source-free subject.');
        }
        const records = state.__TAU_HEADLESS_IMAGE_DEBUG__?.records;
        if (!records || records.length >= 512) {
          return false;
        }
        const caller = records.findLast(({ name }) => name === 'thumbnail.explorer.request')?.detail;
        const service = records.findLast(
          ({ name, detail }) => name === 'thumbnail.service.request' && detail['owner'] === 'explorer',
        )?.detail;
        if (!caller || !service) {
          return false;
        }
        const isRecord = (value: unknown): value is Record<string, unknown> =>
          typeof value === 'object' && value !== null && !Array.isArray(value);
        const { root, intersectingIds: intersecting, requested } = caller;
        if (
          !isRecord(root) ||
          root['path'] !== input.root.path ||
          root['digest'] !== input.root.digest ||
          root['byteLength'] !== input.root.byteLength ||
          caller['projectId'] !== input.projectId ||
          caller['unitId'] !== input.unitId ||
          caller['sourceCurrent'] !== true ||
          caller['sourcePath'] !== input.root.path ||
          service['sourcePath'] !== input.root.path ||
          typeof caller['geometryHash'] !== 'string' ||
          caller['geometryHash'] !== service['geometryHash'] ||
          typeof caller['visualKey'] !== 'string' ||
          caller['visualKey'] !== service['visualKey'] ||
          !Array.isArray(intersecting) ||
          !input.ids.every((id) => intersecting.includes(id))
        ) {
          return false;
        }
        const { requested: serviceRequested, registered: registration } = service;
        if (
          !Array.isArray(requested) ||
          !Array.isArray(serviceRequested) ||
          !Array.isArray(registration) ||
          requested.length !== input.ids.length ||
          serviceRequested.length !== input.ids.length ||
          registration.length !== input.ids.length
        ) {
          return false;
        }
        const callerParts = requested.filter((part: unknown): part is Record<string, unknown> => isRecord(part));
        const serviceParts = serviceRequested.filter((part: unknown): part is Record<string, unknown> =>
          isRecord(part),
        );
        const registered = registration.filter((part: unknown): part is Record<string, unknown> => isRecord(part));
        const commonKey = callerParts[0]?.['visualKey'];
        const commonIdentity = serviceParts[0]?.['identity'];
        return (
          typeof commonKey === 'string' &&
          typeof commonIdentity === 'string' &&
          input.ids.every(
            (id) =>
              callerParts.some((part) => part['id'] === id && part['visualKey'] === commonKey) &&
              serviceParts.some(
                (part) => part['id'] === id && part['visualKey'] === commonKey && part['identity'] === commonIdentity,
              ) &&
              registered.some(
                (part) =>
                  part['id'] === id &&
                  part['registeredIdentity'] === commonIdentity &&
                  part['cachePresent'] === true &&
                  part['status'] === 'failed',
              ),
          )
        );
      },
      {
        root: sourceFree.root,
        unitId: sourceFree.unitId,
        ids: sourceFree.knownHousingIds,
        selectedId: firstId,
        projectId,
      },
      { timeout: 60_000 },
    );
    await retainBoundary('source-free-unavailable');
    const before = await readPreviewRecoveryJobs();
    const recoveryDeadline = Date.now() + 120_000;
    await target.click(properties.getByRole('button', { name: 'Retry preview', exact: true }));
    // Acquire the actual terminal job before asking whether all image consumers decoded its output.
    await target.waitFor(
      (input) => {
        const state: PreviewRecoveryDocument = globalThis;
        const capture = state.__TAU_SECTION_VIEW_TEST__?.getCommittedAssembly();
        if (capture?.assemblyDisplay?.root.digest !== input.digest || !capture.isCurrent()) {
          throw new Error('Recovery terminal acquisition lost the selected source-free pin.');
        }
        const records = state.__TAU_HEADLESS_IMAGE_DEBUG__?.records;
        if (
          !records ||
          records.length >= 512 ||
          JSON.stringify(records.slice(0, input.before.length)) !== JSON.stringify(input.before)
        ) {
          return false;
        }
        return records
          .slice(input.before.length)
          .some((record) => record.name === 'job.complete' && record.detail['kind'] === 'manual-thumbnail');
      },
      { before, digest: sourceFree.root.digest },
      { timeout: Math.max(1, recoveryDeadline - Date.now()) },
    );
    const terminalRecords = await readPreviewRecoveryJobs();
    const terminal = terminalRecords
      .slice(before.length)
      .filter((record) => record.name === 'job.complete' && record.detail['kind'] === 'manual-thumbnail');
    expect(terminal).toHaveLength(1);
    expect(terminal[0]?.detail['success'], JSON.stringify(terminal)).toBe(true);
    await target.waitFor(
      (input) => {
        const state: PreviewRecoveryDocument = globalThis;
        const capture = state.__TAU_SECTION_VIEW_TEST__?.getCommittedAssembly();
        if (capture?.assemblyDisplay?.root.digest !== input.digest || !capture.isCurrent()) {
          throw new Error('Recovery lost the selected source-free pin.');
        }
        return input.ids.every((id) => {
          const lists = [...document.querySelectorAll<HTMLElement>('[role="list"]')].filter(
            (element) => element.getAttribute('aria-label') === `Model components for ${input.path}`,
          );
          if (lists.length !== 1) {
            return false;
          }
          const row = [...lists[0]!.querySelectorAll<HTMLElement>('[data-model-component-row]')].find(
            (element) =>
              element.dataset['modelComponentId'] === id && element.dataset['modelComponentUnitId'] === input.unitId,
          );
          const image = row?.querySelector('img');
          return (
            image instanceof HTMLImageElement &&
            image.complete &&
            image.naturalWidth === 1536 &&
            image.naturalHeight === 1536
          );
        });
      },
      {
        digest: sourceFree.root.digest,
        ids: sourceFree.knownHousingIds,
        path: sourceFree.root.path,
        unitId: sourceFree.unitId,
      },
      { timeout: Math.max(1, recoveryDeadline - Date.now()) },
    );
    const secondId = sourceFree.knownHousingIds[1];
    if (!secondId || secondId === firstId) {
      throw new Error('Second actual reusable occurrence component is absent.');
    }
    const second = list.getByCss(`[data-model-part-button][data-model-component-id=${JSON.stringify(secondId)}]`);
    await target.click(second);
    await target.expectAttribute(second, 'aria-pressed', 'true');
    const image = properties.getByRole('button', { name: 'Preview Known housing', exact: true }).getByCss('img');
    await target.expectVisible(image);
    await target.expectCount(properties.getByRole('alert', { name: 'Preview status', exact: true }), 0);
    const encoded = await target.evaluate(
      async (input) => {
        const state: PreviewRecoveryDocument = globalThis;
        const capture = state.__TAU_SECTION_VIEW_TEST__?.getCommittedAssembly();
        if (capture?.assemblyDisplay?.root.digest !== input.digest || !capture.isCurrent()) {
          throw new Error('Preview image capture has no current source-free subject.');
        }
        const selected = state.__TAU_SECTION_VIEW_TEST__?.getModelHoverState();
        if (
          selected?.activeUnitId !== input.unitId ||
          selected.selectedComponentIds?.length !== 1 ||
          selected.selectedComponentIds[0] !== input.selectedId
        ) {
          throw new Error('Properties preview lost its actual selected canonical component.');
        }
        const lists = [...document.querySelectorAll<HTMLElement>('[role="list"]')].filter(
          (element) => element.getAttribute('aria-label') === `Model components for ${input.path}`,
        );
        if (lists.length !== 1) {
          throw new Error('Exactly one managed component list is required.');
        }
        const images = input.ids.map((id) =>
          [...lists[0]!.querySelectorAll<HTMLElement>('[data-model-component-row]')]
            .find(
              (row) => row.dataset['modelComponentId'] === id && row.dataset['modelComponentUnitId'] === input.unitId,
            )
            ?.querySelector('img'),
        );
        const propertiesImage = document.querySelector(
          '[data-slot="part-properties"] button[aria-label="Preview Known housing"] img',
        );
        images.push(propertiesImage instanceof HTMLImageElement ? propertiesImage : undefined);
        const results = await Promise.all(
          images.map(async (image) => {
            if (
              !(image instanceof HTMLImageElement) ||
              !image.complete ||
              image.naturalWidth !== 1536 ||
              image.naturalHeight !== 1536
            ) {
              throw new Error('A required current row/Properties preview has not decoded.');
            }
            const response = await fetch(image.src);
            const blob = await response.blob();
            if (blob.type !== 'image/webp' || blob.size === 0) {
              throw new Error('Actual preview did not provide nonempty encoded WebP bytes.');
            }
            const bytes = await blob.arrayBuffer();
            const digest = `sha256:${[...new Uint8Array(await crypto.subtle.digest('SHA-256', bytes))].map((byte) => byte.toString(16).padStart(2, '0')).join('')}`;
            return { digest, byteLength: bytes.byteLength, width: image.naturalWidth, height: image.naturalHeight };
          }),
        );
        if (!capture.isCurrent()) {
          throw new Error('Preview subject changed while encoded bytes were being captured.');
        }
        return results;
      },
      {
        digest: sourceFree.root.digest,
        ids: sourceFree.knownHousingIds,
        path: sourceFree.root.path,
        unitId: sourceFree.unitId,
        selectedId: secondId,
      },
    );
    expect(encoded).toHaveLength(3);
    expect(new Set(encoded.map((output) => output.digest)).size).toBe(1);
    await retainBoundary('manual-recovery-decoded');
    const after = await readPreviewRecoveryJobs();
    expect(after.slice(0, before.length)).toEqual(before);
    const manualRecoveryRecords = after.slice(before.length);
    const manualAdmissions = manualRecoveryRecords.filter(
      (record) => record.name === 'queue.admit' && record.detail['kind'] === 'manual-thumbnail',
    );
    const manualWaits = manualRecoveryRecords.filter(
      (record) => record.name === 'queue.wait' && record.detail['kind'] === 'manual-thumbnail',
    );
    const manualTranscodes = manualRecoveryRecords.filter(
      (record) => record.name === 'runtime.transcode' && record.detail['kind'] === 'manual-thumbnail',
    );
    const manualCompletions = manualRecoveryRecords.filter(
      (record) => record.name === 'job.complete' && record.detail['kind'] === 'manual-thumbnail',
    );
    expect(manualAdmissions).toHaveLength(1);
    expect(manualWaits).toHaveLength(1);
    expect(manualTranscodes).toHaveLength(1);
    expect(manualCompletions).toHaveLength(1);
    expect(manualCompletions[0]?.detail['success']).toBe(true);
    const identity = manualCompletions[0]?.detail['identity'];
    expect(typeof identity).toBe('string');
    expect(manualAdmissions[0]?.detail['identity']).toBe(identity);
    expect(manualWaits[0]?.detail['identity']).toBe(identity);
    expect(manualTranscodes[0]?.detail['identity']).toBe(identity);
    expect(manualCompletions[0]?.detail['outputCount']).toBeGreaterThan(0);
    expect(manualCompletions[0]?.detail['outputBytes']).toBeGreaterThan(0);
    // Every retained boundary rejects actual automatic admissions as well as executed automatic jobs.
    expect(
      manualRecoveryRecords.filter(
        (record) => record.name === 'runtime.transcode' && record.detail['kind'] === 'automatic-thumbnail',
      ),
    ).toHaveLength(0);
    expect(await readPreviewRecoveryPin()).toEqual(sourceFree);
    await target.screenshot(selectors.getByRole('main'), 's12-sourcefree-reusable-preview-recovery.png');
    await target.writeArtifact(
      's12-sourcefree-reusable-preview-recovery.json',
      JSON.stringify(
        {
          status: 'actual manual recovery only when this selected test completes',
          sourceFree,
          encoded,
          before,
          boundaries,
          interval: manualRecoveryRecords,
          profile: target.currentWebGpuProfile(),
          adapter: adapterEvidence,
          rendition: { width: 1536, height: 1536, quality: 0.95, lineWidth: 6, version: 2 },
          limitations: [
            'no unobserved prequeue automatic attempt claim',
            'no mechanism/density/material/texture mutation cohort',
            'no per-frame or S16 timing claim',
          ],
        },
        null,
        2,
      ),
    );
    // The manual interval above is closed before the gallery adds its real unfiltered neighbours.
    const galleryBefore = await readPreviewRecoveryJobs();
    expect(galleryBefore).toEqual(after);
    const gallerySubject = await target.evaluate(
      (input) => {
        const state: PreviewRecoveryDocument = globalThis;
        const bridge = state.__TAU_SECTION_VIEW_TEST__;
        const capture = bridge?.getCommittedAssembly();
        const draw = bridge?.getCommittedDrawInventory();
        const selection = bridge?.getModelHoverState();
        if (
          !bridge ||
          !capture?.isCurrent() ||
          capture.assemblyDisplay?.root.digest !== input.root.digest ||
          capture.assemblyDisplay.root.path !== input.root.path ||
          capture.assemblyDisplay.root.byteLength !== input.root.byteLength ||
          capture.diagnostics.sourceEntryPath !== input.root.path ||
          capture.diagnostics.projectId !== input.projectId ||
          draw?.key !== input.root.digest ||
          draw.unitId !== input.unitId ||
          selection?.activeUnitId !== input.unitId ||
          selection.selectedComponentIds?.length !== 1 ||
          selection.selectedComponentIds[0] !== input.selectedId
        ) {
          throw new Error('Gallery continuation lost the exact current selected pin and component.');
        }
        const parts = bridge
          .getModelComponents()
          .filter(({ kind, primitiveReferenceCount }) => kind === 'part' && primitiveReferenceCount > 0);
        const index = parts.findIndex(({ id }) => id === input.selectedId);
        if (
          index === -1 ||
          parts.length !== 6 ||
          new Set(parts.map(({ id }) => id)).size !== parts.length ||
          parts.some(({ id }) => !draw.canonicalComponents.some(({ component }) => component.id === id))
        ) {
          throw new Error('Gallery full previewable manifest disagrees with current canonical draw IDs.');
        }
        const neighbours = [0, 1, -1, 2].map((offset) => {
          const part = parts[(index + offset + parts.length) % parts.length];
          if (!part) {
            throw new Error('Actual gallery neighbour is absent from its full current manifest.');
          }
          return part.id;
        });
        return {
          root: capture.assemblyDisplay.root,
          projectId: input.projectId,
          unitId: draw.unitId,
          selectedId: input.selectedId,
          parts,
          shownIndex: index,
          shownName: parts[index]?.name,
          sourceDerivedNeighbourIds: [...new Set(neighbours)],
        };
      },
      { root: sourceFree.root, projectId, unitId: sourceFree.unitId, selectedId: secondId },
    );
    expect(gallerySubject.parts.map(({ id }) => id).sort()).toEqual(
      sourceFree.leaves.map(({ component }) => component.id).sort(),
    );
    expect(gallerySubject.shownName).toBe('Known housing');
    expect(gallerySubject.sourceDerivedNeighbourIds).toHaveLength(4);
    // Explorer filtering is independent of the gallery's full manifest.
    const originalFilteredRows = await target.evaluate((input) => {
      const owner = [...document.querySelectorAll('[role="list"]')].find(
        (element) => element.getAttribute('aria-label') === `Model components for ${input.root.path}`,
      );
      const filter = document.querySelector<HTMLInputElement>('[aria-label="Filter parts"]');
      if (!owner || filter?.value !== 'Known housing') {
        throw new Error('Original housing filter owner is unavailable.');
      }
      return [...owner.querySelectorAll<HTMLElement>('[data-model-component-row]')]
        .map((row) => {
          const id = row.dataset['modelComponentId'];
          if (!id || row.dataset['modelComponentUnitId'] !== input.unitId) {
            throw new Error('Original filtered row lost its current unit identity.');
          }
          return id;
        })
        .sort((left, right) => left.localeCompare(right));
    }, gallerySubject);
    expect(originalFilteredRows.filter((id) => gallerySubject.parts.some((part) => part.id === id))).toEqual(
      [...sourceFree.knownHousingIds].sort((left, right) => left.localeCompare(right)),
    );
    const rowVisibilityBefore = await readPreviewRecoveryJobs();
    await target.fill(selectors.getByRole('searchbox', { name: 'Filter parts' }), '');
    await target.waitFor(
      (ids) =>
        ids.every((id) =>
          document.querySelector(`[data-model-component-row][data-model-component-id=${JSON.stringify(id)}]`),
        ),
      gallerySubject.sourceDerivedNeighbourIds,
      { timeout: Math.max(1, recoveryDeadline - Date.now()) },
    );
    const rowVisibilityAfter = await readPreviewRecoveryJobs();
    await target.writeArtifact(
      's12-sourcefree-gallery-row-visibility.json',
      JSON.stringify(
        {
          sourceFree,
          originalIds: gallerySubject.sourceDerivedNeighbourIds,
          originalFilteredRows,
          beforeCount: rowVisibilityBefore.length,
          afterCount: rowVisibilityAfter.length,
          interval: rowVisibilityAfter.slice(rowVisibilityBefore.length),
        },
        undefined,
        2,
      ),
    );
    const selectedRow = list.getByCss(
      `[data-model-component-row][data-model-component-id=${JSON.stringify(secondId)}]`,
    );
    await target.hover(selectedRow);
    await target.click(selectedRow.getByRole('button', { name: 'Actions for Known housing', exact: true }));
    await target.click(selectors.getByRole('menuitem', { name: 'Open preview', exact: true }));
    const dialog = selectors.getByRole('dialog', { name: 'Image preview carousel', exact: true });
    await target.expectVisible(dialog);
    await target.waitFor(
      (input) => {
        const state: PreviewRecoveryDocument = globalThis;
        const bridge = state.__TAU_SECTION_VIEW_TEST__;
        const capture = bridge?.getCommittedAssembly();
        const draw = bridge?.getCommittedDrawInventory();
        const selection = bridge?.getModelHoverState();
        const image = document.querySelector('[role="dialog"] img[alt="Rendered Known housing"]');
        const shown = document.querySelector('[role="status"][aria-label="Shown part"]');
        if (
          !capture?.isCurrent() ||
          capture.assemblyDisplay?.root.path !== input.root.path ||
          capture.assemblyDisplay.root.digest !== input.root.digest ||
          capture.assemblyDisplay.root.byteLength !== input.root.byteLength ||
          capture.diagnostics.sourceEntryPath !== input.root.path ||
          capture.diagnostics.projectId !== input.projectId ||
          draw?.key !== input.root.digest ||
          draw.unitId !== input.unitId ||
          selection?.activeUnitId !== input.unitId ||
          selection.selectedComponentIds?.length !== 1 ||
          selection.selectedComponentIds[0] !== input.selectedId
        ) {
          throw new Error('Gallery image has no exact current selected canonical owner.');
        }
        const records = state.__TAU_HEADLESS_IMAGE_DEBUG__?.records;
        if (!records || records.length >= 512) {
          return false;
        }
        const demand = records
          .slice(input.beforeCount)
          .findLast(
            ({ name, detail }) =>
              name === 'thumbnail.service.request' &&
              detail['owner'] === 'gallery' &&
              detail['sourcePath'] === input.root.path,
          );
        if (!demand) {
          return false;
        }
        const isRecord = (value: unknown): value is Record<string, unknown> =>
          typeof value === 'object' && value !== null && !Array.isArray(value);
        const { requested, current, demands, geometryHash, visualKey } = demand.detail;
        if (
          typeof geometryHash !== 'string' ||
          geometryHash.length === 0 ||
          typeof visualKey !== 'string' ||
          visualKey.length === 0 ||
          !Array.isArray(requested) ||
          requested.length !== input.sourceDerivedNeighbourIds.length ||
          !requested.every(
            (part: unknown) =>
              isRecord(part) &&
              typeof part['id'] === 'string' &&
              input.sourceDerivedNeighbourIds.includes(part['id']) &&
              typeof part['visualKey'] === 'string' &&
              part['visualKey'].length > 0 &&
              part['identity'] === `${part['visualKey']}:part-webp-1536-q0.95-v2`,
          ) ||
          !Array.isArray(current) ||
          !Array.isArray(demands)
        ) {
          return false;
        }
        const requestedParts = requested.filter((part: unknown): part is Record<string, unknown> => isRecord(part));
        if (
          new Set(requestedParts.map((part) => part['id'])).size !== input.sourceDerivedNeighbourIds.length ||
          !requestedParts.every((part) =>
            current.some(
              (row: unknown) =>
                isRecord(row) &&
                row['id'] === part['id'] &&
                row['registeredIdentity'] === part['identity'] &&
                row['cachePresent'] === true,
            ),
          )
        ) {
          return false;
        }
        const ownerDemand: unknown = demands.find((value: unknown) => isRecord(value) && value['owner'] === 'gallery');
        if (
          !isRecord(ownerDemand) ||
          ownerDemand['sourcePath'] !== input.root.path ||
          ownerDemand['geometryHash'] !== geometryHash ||
          ownerDemand['visualKey'] !== visualKey ||
          !Array.isArray(ownerDemand['ids']) ||
          ownerDemand['ids'].length !== input.sourceDerivedNeighbourIds.length ||
          new Set(ownerDemand['ids']).size !== input.sourceDerivedNeighbourIds.length ||
          !ownerDemand['ids'].every(
            (id: unknown) => typeof id === 'string' && input.sourceDerivedNeighbourIds.includes(id),
          )
        ) {
          return false;
        }
        return (
          image instanceof HTMLImageElement &&
          image.complete &&
          image.naturalWidth === 1536 &&
          image.naturalHeight === 1536 &&
          shown?.textContent.replaceAll(/\s+/gu, ' ').trim() ===
            `Known housing, ${input.shownIndex + 1} / ${input.partCount}`
        );
      },
      { ...gallerySubject, partCount: gallerySubject.parts.length, beforeCount: galleryBefore.length },
      { timeout: Math.max(1, recoveryDeadline - Date.now()) },
    );
    const galleryEncoded = await target.evaluateLocator(
      dialog.getByRole('img', { name: 'Rendered Known housing', exact: true }),
      async (element) => {
        if (
          !(element instanceof HTMLImageElement) ||
          !element.complete ||
          element.naturalWidth !== 1536 ||
          element.naturalHeight !== 1536
        ) {
          throw new Error('Current gallery preview has not decoded its actual rendition.');
        }
        const response = await fetch(element.src);
        const blob = await response.blob();
        if (blob.type !== 'image/webp' || blob.size === 0) {
          throw new Error('Gallery did not provide nonempty encoded WebP bytes.');
        }
        const bytes = await blob.arrayBuffer();
        const digest = `sha256:${[...new Uint8Array(await crypto.subtle.digest('SHA-256', bytes))].map((byte) => byte.toString(16).padStart(2, '0')).join('')}`;
        return { digest, byteLength: bytes.byteLength, width: element.naturalWidth, height: element.naturalHeight };
      },
    );
    expect(galleryEncoded.digest).toBe(encoded[0]?.digest);
    expect(await readPreviewRecoveryPin()).toEqual(sourceFree);
    if (target.currentWebGpuProfile() === 'software') {
      const gestureBefore = await readPreviewRecoveryJobs();
      expect(
        gestureBefore
          .slice(galleryBefore.length)
          .filter(
            ({ name, detail }) =>
              detail['kind'] === 'automatic-thumbnail' &&
              ['queue.admit', 'queue.wait', 'runtime.transcode', 'job.complete'].includes(name),
          ),
      ).toHaveLength(0);
      let softwareShownIndex = gallerySubject.shownIndex;
      const showPart = async (destination: number): Promise<void> => {
        while (softwareShownIndex !== destination) {
          const forward =
            (destination - softwareShownIndex + gallerySubject.parts.length) % gallerySubject.parts.length;
          const direction = forward <= gallerySubject.parts.length / 2 ? 1 : -1;
          // eslint-disable-next-line no-await-in-loop -- Real carousel navigation is serial and changes shown selection.
          await target.click(
            selectors.getByRole('button', { name: direction === 1 ? 'Next part' : 'Previous part', exact: true }),
          );
          softwareShownIndex =
            (softwareShownIndex + direction + gallerySubject.parts.length) % gallerySubject.parts.length;
          const shown = gallerySubject.parts[softwareShownIndex];
          if (!shown) {
            throw new Error('Shown software part left the frozen gallery.');
          }
          // eslint-disable-next-line no-await-in-loop -- Observe genuine shown identity before another gesture.
          await target.waitFor(
            (input) =>
              document
                .querySelector('[role="status"][aria-label="Shown part"]')
                ?.textContent.replaceAll(/\s+/gu, ' ')
                .trim() === `${input.name}, ${input.index + 1} / ${input.count}`,
            { name: shown.name, index: softwareShownIndex, count: gallerySubject.parts.length },
            { timeout: Math.max(1, recoveryDeadline - Date.now()) },
          );
        }
      };
      for (const id of gallerySubject.sourceDerivedNeighbourIds) {
        const destination = gallerySubject.parts.findIndex((part) => part.id === id);
        const part = gallerySubject.parts[destination];
        if (!part) {
          throw new Error('Original software recipient left the frozen gallery.');
        }
        // eslint-disable-next-line no-await-in-loop -- Each actual shown recipient owns its manual gesture.
        await showPart(destination);
        // eslint-disable-next-line no-await-in-loop -- Existing getter fences the actual shown owner and image identity.
        const ready = await target.evaluate(
          (input) => {
            const bridge = (globalThis as PreviewRecoveryDocument).__TAU_SECTION_VIEW_TEST__;
            const capture = bridge?.getCommittedAssembly();
            const draw = bridge?.getCommittedDrawInventory();
            const selection = bridge?.getModelHoverState();
            if (
              !capture?.isCurrent() ||
              capture.assemblyDisplay?.root.digest !== input.root.digest ||
              capture.assemblyDisplay.root.path !== input.root.path ||
              capture.assemblyDisplay.root.byteLength !== input.root.byteLength ||
              capture.diagnostics.projectId !== input.projectId ||
              capture.diagnostics.sourceEntryPath !== input.root.path ||
              draw?.unitId !== input.unitId ||
              draw.key !== input.root.digest ||
              selection?.activeUnitId !== input.unitId ||
              selection.selectedComponentIds?.length !== 1 ||
              selection.selectedComponentIds[0] !== input.id
            ) {
              throw new Error('Software recovery lost the actual shown selected pin.');
            }
            const image = document.querySelector('[role="dialog"] img');
            return (
              image instanceof HTMLImageElement &&
              image.alt === `Rendered ${input.name}` &&
              image.complete &&
              image.naturalWidth === 1536 &&
              image.naturalHeight === 1536
            );
          },
          { ...gallerySubject, id, name: part.name },
        );
        if (!ready) {
          // Gallery Retry is exposed only for an actual failed preview, not a pending or ready shared-key recipient.
          // eslint-disable-next-line no-await-in-loop -- Genuine failed-preview recovery remains within the original deadline.
          await target.expectVisible(
            selectors
              .getByCss('[data-image-carousel-overlay-control]')
              .getByRole('button', { name: 'Retry', exact: true }),
            Math.max(1, recoveryDeadline - Date.now()),
          );
          // eslint-disable-next-line no-await-in-loop -- Do not bypass the gallery consumer or enable automatic software work.
          await target.click(
            selectors
              .getByCss('[data-image-carousel-overlay-control]')
              .getByRole('button', { name: 'Retry', exact: true }),
          );
          // eslint-disable-next-line no-await-in-loop -- A previous image cannot satisfy actual shown recipient decoding.
          await target.waitFor(
            (input) => {
              const selection = (globalThis as PreviewRecoveryDocument).__TAU_SECTION_VIEW_TEST__?.getModelHoverState();
              const image = document.querySelector('[role="dialog"] img');
              return (
                selection?.activeUnitId === input.unitId &&
                selection.selectedComponentIds?.length === 1 &&
                selection.selectedComponentIds[0] === input.id &&
                image instanceof HTMLImageElement &&
                image.alt === `Rendered ${input.name}` &&
                image.complete &&
                image.naturalWidth === 1536 &&
                image.naturalHeight === 1536
              );
            },
            { id, name: part.name, unitId: gallerySubject.unitId },
            { timeout: Math.max(1, recoveryDeadline - Date.now()) },
          );
          // eslint-disable-next-line no-await-in-loop -- Pin continuity follows the actual manual completion.
          expect(await readPreviewRecoveryPin()).toEqual(sourceFree);
        }
      }
      await showPart(gallerySubject.shownIndex);
      expect(await readPreviewRecoveryPin()).toEqual(sourceFree);
      const gestureAfter = await readPreviewRecoveryJobs();
      await target.writeArtifact(
        's12-sourcefree-gallery-software-gestures.json',
        JSON.stringify(
          {
            sourceFree,
            originalIds: gallerySubject.sourceDerivedNeighbourIds,
            beforeCount: gestureBefore.length,
            afterCount: gestureAfter.length,
            interval: gestureAfter.slice(gestureBefore.length),
            qualification:
              'Explicit software Retry and navigation interval; not original automatic jobs or a fixed manual-job denominator.',
          },
          undefined,
          2,
        ),
      );
    }
    // Close the original four-recipient frontier before navigation creates any further neighbour demand.
    const [frontierResult] = await Promise.allSettled([
      target.waitFor(
        (input) => {
          const records = (globalThis as PreviewRecoveryDocument).__TAU_HEADLESS_IMAGE_DEBUG__?.records;
          if (!records || records.length >= 512) {
            return false;
          }
          const isRecord = (value: unknown): value is Record<string, unknown> =>
            typeof value === 'object' && value !== null && !Array.isArray(value);
          const request = records
            .slice(input.beforeCount)
            .find(
              ({ name, detail }) =>
                name === 'thumbnail.service.request' &&
                detail['owner'] === 'gallery' &&
                detail['sourcePath'] === input.root.path,
            );
          if (!request || !Array.isArray(request.detail['requested']) || !Array.isArray(request.detail['current'])) {
            return false;
          }
          const requested = request.detail['requested'].filter((value: unknown): value is Record<string, unknown> =>
            isRecord(value),
          );
          return input.ids.every((id) => {
            const part = requested.find((value) => value['id'] === id);
            if (!part || typeof part['identity'] !== 'string') {
              return false;
            }
            const cached: unknown = (request.detail['current'] as unknown[]).find(
              (value: unknown) => isRecord(value) && value['id'] === id,
            );
            if (
              input.cachedIds.includes(id) &&
              isRecord(cached) &&
              cached['status'] === 'ready' &&
              cached['registeredIdentity'] === part['identity'] &&
              cached['byteLength'] === input.cachedBytes
            ) {
              return true;
            }
            return records.slice(input.beforeCount).some(({ name, detail }) => {
              if (
                name !== 'thumbnail.service.accept' ||
                detail['sourcePath'] !== input.root.path ||
                !Array.isArray(detail['outputs'])
              ) {
                return false;
              }
              const terminal = records
                .slice(input.beforeCount)
                .find(
                  (record) =>
                    record.name === 'job.complete' &&
                    record.detail['identity'] === detail['jobIdentity'] &&
                    record.detail['success'] === true,
                );
              if (!terminal) {
                return false;
              }
              for (const value of detail['outputs']) {
                if (
                  isRecord(value) &&
                  value['identity'] === part['identity'] &&
                  value['outputAccepted'] === true &&
                  Array.isArray(value['recipientStates']) &&
                  value['recipientStates'].some(
                    (recipient: unknown) =>
                      isRecord(recipient) &&
                      recipient['id'] === id &&
                      recipient['registeredIdentity'] === part['identity'] &&
                      recipient['status'] === 'ready' &&
                      typeof recipient['byteLength'] === 'number' &&
                      recipient['byteLength'] > 0,
                  )
                ) {
                  return true;
                }
              }
              return false;
            });
          });
        },
        {
          beforeCount: galleryBefore.length,
          root: sourceFree.root,
          ids: gallerySubject.sourceDerivedNeighbourIds,
          cachedIds: sourceFree.knownHousingIds,
          cachedBytes: galleryEncoded.byteLength,
        },
        { timeout: Math.max(1, recoveryDeadline - Date.now()) },
      ),
    ]);
    const frontierRecords = await readPreviewRecoveryJobs();
    // Retention errors cannot replace the actual frontier failure.
    await Promise.allSettled([
      (async () => {
        await target.writeArtifact(
          's12-sourcefree-gallery-frontier.json',
          JSON.stringify(
            {
              phase: 'original-four-terminal-frontier',
              status: frontierResult.status,
              sourceFree,
              gallerySubject,
              interval: frontierRecords.slice(galleryBefore.length),
              cachedManual: galleryEncoded,
              cancellation: null,
              nativePhysical: null,
              gpuResidency: null,
              rss: null,
              workerClosedFrontier: null,
            },
            undefined,
            2,
          ),
        );
      })(),
    ]);
    if (frontierResult.status === 'rejected') {
      const error: unknown = frontierResult.reason;
      throw error;
    }
    expect(await readPreviewRecoveryPin()).toEqual(sourceFree);
    const decodedNeighbours: Array<{
      id: string;
      digest: string;
      rowDigest: string;
      byteLength: number;
      rowByteLength: number;
      width: number;
      height: number;
    }> = [];
    let { shownIndex } = gallerySubject;
    for (const id of gallerySubject.sourceDerivedNeighbourIds) {
      const destination = gallerySubject.parts.findIndex((part) => part.id === id);
      if (destination === -1) {
        throw new Error('Frozen gallery recipient left the current manifest.');
      }
      while (shownIndex !== destination) {
        const forward = (destination - shownIndex + gallerySubject.parts.length) % gallerySubject.parts.length;
        const direction = forward <= gallerySubject.parts.length / 2 ? 1 : -1;
        // eslint-disable-next-line no-await-in-loop -- Actual carousel steps retain a separately observed demand interval.
        await target.click(
          selectors.getByRole('button', { name: direction === 1 ? 'Next part' : 'Previous part', exact: true }),
        );
        shownIndex = (shownIndex + direction + gallerySubject.parts.length) % gallerySubject.parts.length;
        const shownPart = gallerySubject.parts[shownIndex];
        if (!shownPart) {
          throw new Error('Actual carousel shown part is unavailable.');
        }
        // eslint-disable-next-line no-await-in-loop -- Observe each real UI step before the next click.
        await target.waitFor(
          (input) =>
            document
              .querySelector('[role="status"][aria-label="Shown part"]')
              ?.textContent.replaceAll(/\s+/gu, ' ')
              .trim() === `${input.name}, ${input.index + 1} / ${input.count}`,
          { name: shownPart.name, index: shownIndex, count: gallerySubject.parts.length },
          { timeout: Math.max(1, recoveryDeadline - Date.now()) },
        );
      }
      const part = gallerySubject.parts[destination];
      if (!part) {
        throw new Error('Original gallery neighbour is unavailable.');
      }
      // eslint-disable-next-line no-await-in-loop -- Decode each original recipient through its real shown image.
      await target.waitFor(
        (input) => {
          const image = document.querySelector('[role="dialog"] img');
          const rowImage = document
            .querySelector(`[data-model-component-row][data-model-component-id=${JSON.stringify(input.id)}]`)
            ?.querySelector('img');
          return (
            image instanceof HTMLImageElement &&
            image.alt === `Rendered ${input.name}` &&
            image.complete &&
            image.naturalWidth === 1536 &&
            image.naturalHeight === 1536 &&
            rowImage instanceof HTMLImageElement &&
            rowImage.complete &&
            rowImage.naturalWidth === 1536 &&
            rowImage.naturalHeight === 1536
          );
        },
        { id, name: part.name },
        { timeout: Math.max(1, recoveryDeadline - Date.now()) },
      );
      // eslint-disable-next-line no-await-in-loop -- Capture exact current gallery and sibling encoded byte identities.
      const decoded = await target.evaluate(
        async (input) => {
          const bridge = (globalThis as PreviewRecoveryDocument).__TAU_SECTION_VIEW_TEST__;
          const capture = bridge?.getCommittedAssembly();
          const draw = bridge?.getCommittedDrawInventory();
          const selection = bridge?.getModelHoverState();
          if (
            !capture?.isCurrent() ||
            capture.assemblyDisplay?.root.digest !== input.root.digest ||
            capture.assemblyDisplay.root.path !== input.root.path ||
            capture.diagnostics.projectId !== input.projectId ||
            capture.diagnostics.sourceEntryPath !== input.root.path ||
            draw?.unitId !== input.unitId ||
            capture.assemblyDisplay.root.byteLength !== input.root.byteLength ||
            draw.key !== input.root.digest ||
            selection?.activeUnitId !== input.unitId ||
            selection.selectedComponentIds?.length !== 1 ||
            selection.selectedComponentIds[0] !== input.id
          ) {
            throw new Error('Neighbour decode lost the exact selected source-free pin.');
          }
          const galleryImage = document.querySelector('[role="dialog"] img');
          const row = [...document.querySelectorAll<HTMLElement>('[data-model-component-row]')].find(
            (element) =>
              element.dataset['modelComponentId'] === input.id &&
              element.dataset['modelComponentUnitId'] === input.unitId,
          );
          const rowImage = row?.querySelector('img');
          const outputs = await Promise.all(
            [galleryImage, rowImage].map(async (image) => {
              if (
                !(image instanceof HTMLImageElement) ||
                !image.complete ||
                image.naturalWidth !== 1536 ||
                image.naturalHeight !== 1536
              ) {
                throw new Error('Original neighbour has no decoded current gallery/row image.');
              }
              const response = await fetch(image.src);
              const blob = await response.blob();
              if (blob.type !== 'image/webp' || blob.size === 0) {
                throw new Error('Neighbour encoded WebP is unavailable.');
              }
              const bytes = await blob.arrayBuffer();
              return {
                byteLength: bytes.byteLength,
                digest: `sha256:${[...new Uint8Array(await crypto.subtle.digest('SHA-256', bytes))].map((byte) => byte.toString(16).padStart(2, '0')).join('')}`,
              };
            }),
          );
          const [galleryOutput, rowOutput] = outputs;
          if (!galleryOutput || !rowOutput || !capture.isCurrent()) {
            throw new Error('Neighbour byte read lost its owner.');
          }
          return {
            id: input.id,
            digest: galleryOutput.digest,
            rowDigest: rowOutput.digest,
            byteLength: galleryOutput.byteLength,
            rowByteLength: rowOutput.byteLength,
            width: 1536,
            height: 1536,
          };
        },
        { ...gallerySubject, id },
      );
      decodedNeighbours.push(decoded);
      const acceptedBytes = sourceFree.knownHousingIds.includes(id)
        ? galleryEncoded.byteLength
        : frontierRecords
            .slice(galleryBefore.length)
            .filter(({ name }) => name === 'thumbnail.service.accept')
            .flatMap(({ detail }): unknown[] => (Array.isArray(detail['outputs']) ? detail['outputs'] : []))
            .find(
              (value: unknown) =>
                typeof value === 'object' &&
                value !== null &&
                'recipients' in value &&
                Array.isArray(value.recipients) &&
                value.recipients.includes(id),
            );
      const expectedBytes: unknown =
        typeof acceptedBytes === 'number'
          ? acceptedBytes
          : typeof acceptedBytes === 'object' && acceptedBytes !== null && 'outputBytes' in acceptedBytes
            ? acceptedBytes.outputBytes
            : undefined;
      // eslint-disable-next-line no-await-in-loop -- Retain reached real decodes before their equality assertions.
      await target.writeArtifact(
        's12-sourcefree-gallery-neighbour-decodes.json',
        JSON.stringify(
          {
            sourceFree,
            decodedNeighbours,
            expectedBytes,
            originalIds: gallerySubject.sourceDerivedNeighbourIds,
            navigationIntervalStartsAt: frontierRecords.length,
          },
          undefined,
          2,
        ),
      );
      expect(decoded.byteLength).toBe(expectedBytes);
      expect(decoded.digest).toBe(decoded.rowDigest);
      expect(decoded.byteLength).toBe(decoded.rowByteLength);
    }
    expect(decodedNeighbours).toHaveLength(4);
    // Return through the real carousel before restoring the original selected sibling.
    while (shownIndex !== gallerySubject.shownIndex) {
      const forward =
        (gallerySubject.shownIndex - shownIndex + gallerySubject.parts.length) % gallerySubject.parts.length;
      const direction = forward <= gallerySubject.parts.length / 2 ? 1 : -1;
      // eslint-disable-next-line no-await-in-loop -- Restore the original part through actual carousel controls.
      await target.click(
        selectors.getByRole('button', { name: direction === 1 ? 'Next part' : 'Previous part', exact: true }),
      );
      shownIndex = (shownIndex + direction + gallerySubject.parts.length) % gallerySubject.parts.length;
      const shownPart = gallerySubject.parts[shownIndex];
      if (!shownPart) {
        throw new Error('Original carousel return part is unavailable.');
      }
      // eslint-disable-next-line no-await-in-loop -- Observe each real return step before the next click.
      await target.waitFor(
        (input) =>
          document
            .querySelector('[role="status"][aria-label="Shown part"]')
            ?.textContent.replaceAll(/\s+/gu, ' ')
            .trim() === `${input.name}, ${input.index + 1} / ${input.count}`,
        { name: shownPart.name, index: shownIndex, count: gallerySubject.parts.length },
        { timeout: Math.max(1, recoveryDeadline - Date.now()) },
      );
    }
    await target.waitFor(
      (input) => {
        const bridge = (globalThis as PreviewRecoveryDocument).__TAU_SECTION_VIEW_TEST__;
        const selection = bridge?.getModelHoverState();
        const image = document.querySelector('[role="dialog"] img');
        return (
          selection?.activeUnitId === input.unitId &&
          selection.selectedComponentIds?.length === 1 &&
          selection.selectedComponentIds[0] === input.selectedId &&
          image instanceof HTMLImageElement &&
          image.alt === `Rendered ${input.shownName}` &&
          image.complete &&
          image.naturalWidth === 1536 &&
          image.naturalHeight === 1536
        );
      },
      gallerySubject,
      { timeout: Math.max(1, recoveryDeadline - Date.now()) },
    );
    expect(await readPreviewRecoveryPin()).toEqual(sourceFree);
    await target.fill(selectors.getByRole('searchbox', { name: 'Filter parts' }), 'Known housing');
    await target.waitFor(
      (input) => {
        const owner = [...document.querySelectorAll('[role="list"]')].find(
          (element) => element.getAttribute('aria-label') === `Model components for ${input.root.path}`,
        );
        const filter = document.querySelector<HTMLInputElement>('[aria-label="Filter parts"]');
        if (!owner || filter?.value !== 'Known housing') {
          return false;
        }
        const rows = [...owner.querySelectorAll<HTMLElement>('[data-model-component-row]')];
        if (rows.some((row) => row.dataset['modelComponentUnitId'] !== input.unitId)) {
          return false;
        }
        const ids = rows
          .map((row) => row.dataset['modelComponentId'])
          .sort((left, right) => (left ?? '').localeCompare(right ?? ''));
        return (
          ids.length === input.originalFilteredRows.length &&
          ids.every((id, index) => id === input.originalFilteredRows[index])
        );
      },
      { root: sourceFree.root, unitId: sourceFree.unitId, originalFilteredRows },
      { timeout: Math.max(1, recoveryDeadline - Date.now()) },
    );
    expect(await readPreviewRecoveryPin()).toEqual(sourceFree);
    await target.screenshot(selectors.getByCss('body'), 's12-sourcefree-reusable-preview-gallery.png');
    await target.click(selectors.getByRole('button', { name: 'Close image preview', exact: true }));
    await target.expectCount(dialog, 0);
    const closedSibling = await target.evaluateLocator(image, async (element) => {
      if (
        !(element instanceof HTMLImageElement) ||
        !element.complete ||
        element.naturalWidth !== 1536 ||
        element.naturalHeight !== 1536
      ) {
        throw new Error('Gallery close lost the selected decoded sibling image.');
      }
      const response = await fetch(element.src);
      const bytes = await response.arrayBuffer();
      return {
        byteLength: bytes.byteLength,
        digest: `sha256:${[...new Uint8Array(await crypto.subtle.digest('SHA-256', bytes))].map((byte) => byte.toString(16).padStart(2, '0')).join('')}`,
      };
    });
    await target.writeArtifact(
      's12-sourcefree-gallery-closed-sibling.json',
      JSON.stringify({ closedSibling, sourceFree }, undefined, 2),
    );
    expect(closedSibling.digest).toBe(galleryEncoded.digest);
    expect(closedSibling.byteLength).toBe(galleryEncoded.byteLength);
    expect(
      await target.evaluate((input) => {
        const selection = (globalThis as PreviewRecoveryDocument).__TAU_SECTION_VIEW_TEST__?.getModelHoverState();
        return (
          selection?.activeUnitId === input.unitId &&
          selection.selectedComponentIds?.length === 1 &&
          selection.selectedComponentIds[0] === input.selectedId
        );
      }, gallerySubject),
    ).toBe(true);
    expect(await readPreviewRecoveryPin()).toEqual(sourceFree);
    // Existing abort handling can omit a terminal record; retain that gap without inventing completion.
    const galleryAfter = await readPreviewRecoveryJobs();
    expect(galleryAfter.slice(0, galleryBefore.length)).toEqual(galleryBefore);
    const galleryRecords = galleryAfter.slice(galleryBefore.length);
    const eventCounts: Record<string, Record<string, number>> = {};
    for (const record of galleryRecords) {
      const kind = typeof record.detail['kind'] === 'string' ? record.detail['kind'] : 'no-kind';
      const counts = eventCounts[kind] ?? {};
      eventCounts[kind] = counts;
      counts[record.name] = (counts[record.name] ?? 0) + 1;
    }
    const galleryServiceRequests = galleryRecords.filter(
      ({ name, detail }) => name === 'thumbnail.service.request' && detail['owner'] === 'gallery',
    );
    expect(galleryServiceRequests.length).toBeGreaterThan(0);
    const cachedRecipientObservations: Array<{
      id: string;
      identity: string;
      byteLength: number;
      decoded: boolean | undefined;
    }> = [];
    for (const { detail } of galleryServiceRequests) {
      const { requested, current } = detail;
      if (!Array.isArray(requested) || !Array.isArray(current)) {
        continue;
      }
      const requestedParts = requested.filter(
        (part: unknown): part is Record<string, unknown> =>
          typeof part === 'object' && part !== null && !Array.isArray(part),
      );
      for (const { id, identity } of requestedParts) {
        if (typeof id !== 'string' || typeof identity !== 'string') {
          continue;
        }
        const row = current.find(
          (value: unknown): value is Record<string, unknown> =>
            typeof value === 'object' &&
            value !== null &&
            'id' in value &&
            value.id === id &&
            'registeredIdentity' in value &&
            value.registeredIdentity === identity,
        );
        if (!row) {
          continue;
        }
        const { status, byteLength, decoded } = row;
        if (status === 'ready' && typeof byteLength === 'number' && byteLength > 0) {
          cachedRecipientObservations.push({
            id,
            identity,
            byteLength,
            decoded: typeof decoded === 'boolean' ? decoded : undefined,
          });
        }
      }
    }
    const serviceAcceptRecords = galleryRecords.filter(({ name }) => name === 'thumbnail.service.accept');
    const galleryCompletions = galleryRecords.filter(({ name }) => name === 'job.complete');
    const galleryFailures = galleryCompletions.filter(({ detail }) => detail['success'] === false);
    const outputRecords = galleryRecords
      .filter(({ detail }) => typeof detail['outputCount'] === 'number' || typeof detail['outputBytes'] === 'number')
      .map(({ name, detail }) => ({
        name,
        kind: detail['kind'],
        identity: detail['identity'],
        success: detail['success'],
        outputCount: detail['outputCount'],
        outputBytes: detail['outputBytes'],
      }));
    const admissionsWithoutTerminalRecord = galleryRecords
      .filter(
        ({ name, detail }) =>
          name === 'queue.admit' &&
          !galleryRecords.some(
            (record) => record.name === 'job.complete' && record.detail['identity'] === detail['identity'],
          ),
      )
      .map(({ detail }) => ({ kind: detail['kind'], identity: detail['identity'] }));
    expect(await readPreviewRecoveryPin()).toEqual(sourceFree);
    await target.writeArtifact(
      's12-sourcefree-reusable-preview-gallery.json',
      JSON.stringify(
        {
          status: 'actual separate gallery continuation only when this selected test completes',
          adapter: adapterEvidence,
          sourceFree,
          gallerySubject,
          galleryEncoded,
          decodedNeighbours,
          closedSibling,
          originalFilteredRows,
          rowVisibilityInterval: {
            beforeCount: rowVisibilityBefore.length,
            afterCount: rowVisibilityAfter.length,
            records: rowVisibilityAfter.slice(rowVisibilityBefore.length),
          },
          navigationInterval: galleryRecords.slice(frontierRecords.length - galleryBefore.length),
          before: galleryBefore,
          interval: galleryRecords,
          eventCounts,
          outputRecords,
          admissionsWithoutTerminalRecord,
          galleryServiceRequests,
          serviceAcceptRecords,
          failures: galleryFailures,
          cachedRecipientObservations,
          cachedRecipientObservationCount: cachedRecipientObservations.length,
          cancellations: {
            count: null,
            reason:
              'Existing recorder may omit cancellation terminal events; missing completions are retained above and are not classified as cancellations.',
          },
          decodedConsumers: { manualInterval: encoded, galleryShown: galleryEncoded, count: encoded.length + 1 },
          uniqueEncodedDigests: [...new Set([...encoded, galleryEncoded].map(({ digest }) => digest))],
          prequeueAttempts: {
            count: null,
            reason:
              'Existing image recorder does not emit cold/software refusals before queue admission; zero admissions does not establish zero attempts.',
          },
          nominalRgba: { bytesPerImage: 1536 * 1536 * 4, consumerCount: encoded.length + 1, measuredGpuOrRss: false },
          limits: {
            sourceBytes: 64 * 1024 * 1024,
            requestedParts: 128,
            automaticChunkKeys: 4,
            manualChunkKeys: 1,
            encodedRetainedBytes: 8 * 1024 * 1024,
          },
          limitations: [
            'no gallery-wide automatic-zero claim',
            'no closed image-worker frontier claim: abort handling may omit terminal records',
            'no pending-job cancellation or failed-native-render/retry cohort',
            'no material/density/texture/pose mutation cohort',
            'no measured decoded/GPU/RSS working set or per-frame timing claim',
          ],
        },
        null,
        2,
      ),
    );
  } catch (error) {
    try {
      const failure = await target.evaluate(
        async (input) => {
          const state: PreviewRecoveryDocument = globalThis;
          let pin: unknown;
          try {
            const capture = state.__TAU_SECTION_VIEW_TEST__?.getCommittedAssembly();
            pin = {
              root: capture?.assemblyDisplay?.root,
              current: capture?.isCurrent(),
              diagnostics: capture?.diagnostics,
            };
          } catch (captureError) {
            pin = { denial: String(captureError) };
          }
          const lists = [...document.querySelectorAll<HTMLElement>('[role="list"]')].filter(
            (element) => element.getAttribute('aria-label') === `Model components for ${input.path}`,
          );
          const records = state.__TAU_HEADLESS_IMAGE_DEBUG__?.records ?? [];
          const isRecord = (value: unknown): value is Record<string, unknown> =>
            typeof value === 'object' && value !== null && !Array.isArray(value);
          const hash = async (value: string): Promise<string> =>
            `sha256:${[...new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value)))].map((byte) => byte.toString(16).padStart(2, '0')).join('')}`;
          const privateKeys = new Set(['identity', 'registeredIdentity', 'jobIdentity', 'visualKey']);
          const copy = async (value: unknown): Promise<unknown> => {
            if (Array.isArray(value)) {
              return Promise.all(value.map(async (entry: unknown) => copy(entry)));
            }
            if (isRecord(value)) {
              return Object.fromEntries(
                await Promise.all(
                  Object.entries(value).map(async ([key, entry]) =>
                    privateKeys.has(key) && typeof entry === 'string'
                      ? [`${key}Sha256`, await hash(entry)]
                      : [key, await copy(entry)],
                  ),
                ),
              );
            }
            return value;
          };
          const requested = (detail: Readonly<Record<string, unknown>>) => {
            const value = detail['requested'];
            return Array.isArray(value)
              ? value
                  .filter((part: unknown): part is Record<string, unknown> => isRecord(part))
                  .map((part) => ({ id: part['id'], visualKey: part['visualKey'] }))
              : [];
          };
          const sameSource = (
            left: Readonly<Record<string, unknown>>,
            right: Readonly<Record<string, unknown>>,
          ): boolean =>
            typeof left['sourcePath'] === 'string' &&
            typeof left['geometryHash'] === 'string' &&
            typeof left['visualKey'] === 'string' &&
            left['sourcePath'] === right['sourcePath'] &&
            left['geometryHash'] === right['geometryHash'] &&
            left['visualKey'] === right['visualKey'];
          const sameParts = (
            left: Readonly<Record<string, unknown>>,
            right: Readonly<Record<string, unknown>>,
          ): boolean => {
            const actualParts = requested(left);
            const serviceParts = requested(right);
            return (
              actualParts.length > 0 &&
              actualParts.length === serviceParts.length &&
              actualParts.every(
                (part) =>
                  typeof part.id === 'string' &&
                  typeof part.visualKey === 'string' &&
                  serviceParts.some((candidate) => candidate.id === part.id && candidate.visualKey === part.visualKey),
              )
            );
          };
          const explorerRequestsForService = (service: PreviewRecoveryRecord) =>
            records.filter(
              (record) =>
                record.name === 'thumbnail.explorer.request' &&
                sameSource(record.detail, service.detail) &&
                record.detail['manualPartId'] === service.detail['manualPartId'] &&
                sameParts(record.detail, service.detail),
            );
          const manualCompletions = records.filter(
            ({ name, detail }) => name === 'job.complete' && detail['kind'] === 'manual-thumbnail',
          );
          const ownerJoins = await Promise.all(
            manualCompletions.map(async ({ detail }) => {
              const { identity: jobIdentity } = detail;
              const accepts = records.filter(
                (record) =>
                  record.name === 'thumbnail.service.accept' &&
                  typeof jobIdentity === 'string' &&
                  record.detail['jobIdentity'] === jobIdentity,
              );
              const joined = await Promise.all(
                accepts.map(async (accept) => {
                  const serviceRequests = records.filter(
                    (record) =>
                      record.name === 'thumbnail.service.request' &&
                      record.detail['owner'] === 'explorer' &&
                      sameSource(record.detail, accept.detail) &&
                      record.detail['manualPartId'] === accept.detail['manualPartId'],
                  );
                  const explorerRequests = serviceRequests.flatMap((service) => explorerRequestsForService(service));
                  const currentCallers = explorerRequests.filter(({ detail: caller }) => {
                    const { root } = caller;
                    return (
                      caller['projectId'] === input.projectId &&
                      caller['unitId'] === input.unitId &&
                      caller['sourceCurrent'] === true &&
                      caller['entryPath'] === input.path &&
                      isRecord(root) &&
                      root['path'] === input.root.path &&
                      root['digest'] === input.root.digest &&
                      root['byteLength'] === input.root.byteLength
                    );
                  });
                  return {
                    serviceRequestMatches: serviceRequests.length,
                    explorerRequestMatches: explorerRequests.length,
                    currentSubjectMatches: currentCallers.length,
                    exactUniqueCaller:
                      serviceRequests.length === 1 && explorerRequests.length === 1 && currentCallers.length === 1,
                    acceptance: await copy(accept.detail),
                    serviceRequests: await copy(serviceRequests),
                    explorerRequests: await copy(explorerRequests),
                  };
                }),
              );
              return {
                jobIdentitySha256: typeof jobIdentity === 'string' ? await hash(jobIdentity) : undefined,
                acceptanceMatches: accepts.length,
                exactUniqueAcceptance: accepts.length === 1,
                joins: joined,
              };
            }),
          );
          return {
            pin,
            listCount: lists.length,
            evidenceTruncated: records.length >= 512,
            records: await copy(records.slice(0, 512)),
            ownerJoins,
            ownerObservationComplete:
              records.length < 512 &&
              manualCompletions.length === 1 &&
              ownerJoins.every(
                (join) => join.exactUniqueAcceptance && join.joins.every((caller) => caller.exactUniqueCaller),
              ),
            rows: lists.flatMap((list) =>
              [...list.querySelectorAll<HTMLElement>('[data-model-component-row]')].map((row) => {
                const image = row.querySelector('img');
                const rect = row.getBoundingClientRect();
                return {
                  id: row.dataset['modelComponentId'],
                  unitId: row.dataset['modelComponentUnitId'],
                  text: row.textContent,
                  connected: row.isConnected,
                  x: rect.x,
                  y: rect.y,
                  width: rect.width,
                  height: rect.height,
                  image: image
                    ? { complete: image.complete, width: image.naturalWidth, height: image.naturalHeight }
                    : undefined,
                };
              }),
            ),
            properties: document.querySelector('[data-slot="part-properties"]')?.textContent,
          };
        },
        { path: sourceFree.root.path, root: sourceFree.root, unitId: sourceFree.unitId, projectId },
      );
      await target.writeArtifact('s12-sourcefree-reusable-preview-failure.json', JSON.stringify(failure, null, 2));
    } catch {
      // Failure evidence is best effort; retain the original recovery error if its document is no longer readable.
    }
    throw error;
  }
});

test('should reuse current authored S05 previews across density and rigid pose changes and replace material previews', async () => {
  await target.setViewport({ width: 1440, height: 900 });
  await target.navigate(`${seedRoute}?main=preview-assembly-secondary`);
  await target.expectUrl(/\/w\/[^/]+\/[^/]+/u, 60_000);
  await target.click(selectors.getByRole('button', { name: /^decline$/iu }), { timeout: 5000 }).catch(() => undefined);
  await openCommand('Open files');
  const initialFilesPane = selectors.getByRole('region', { name: /^Files for /u }).first();
  const initialLauncherFiles = selectors
    .getByCss('[data-project-workspace]')
    .getByRole('group', { name: 'Project', exact: true })
    .getByRole('button')
    .filter({ has: selectors.getByText('Files', { exact: true }) });
  await expect
    .poll(async () => (await target.isVisible(initialFilesPane)) || (await target.isVisible(initialLauncherFiles)))
    .toBe(true);
  if (!(await target.isVisible(initialFilesPane))) {
    await target.click(initialLauncherFiles);
  }
  await expandPath('preview');
  await target.click(rootedTreeItem('preview/assembly.json'), { button: 'right' });
  await target.click(selectors.getByRole('menuitem', { name: 'Open in Viewer', exact: true }));
  await target.waitFor(
    () => {
      const state: PreviewRecoveryDocument = globalThis;
      const bridge = state.__TAU_SECTION_VIEW_TEST__;
      const capture = bridge?.getCommittedAssembly();
      return Boolean(
        bridge?.isGeometryFramed() &&
        capture?.assemblyDisplay &&
        capture.isCurrent() &&
        capture.diagnostics.sourceEntryPath === 'preview/assembly.json',
      );
    },
    undefined,
    { timeout: 120_000 },
  );
  const original = await readPreviewRecoveryPin();
  const originalProject = await target.evaluate(() => {
    const state: PreviewRecoveryDocument = globalThis;
    return state.__TAU_SECTION_VIEW_TEST__?.getCommittedAssembly().diagnostics.projectId;
  });
  if (!originalProject) {
    throw new Error('The authored mutation cohort has no actual current project.');
  }
  await openCommand('Open model structure');
  await target.fill(selectors.getByRole('searchbox', { name: 'Filter parts' }), 'Known housing');
  const list = selectors.getByRole('list', { name: 'Model components for preview/assembly.json', exact: true });
  await target.expectVisible(list, 60_000);
  const separatorName = await target.evaluate((entryPath) => {
    const body = document.querySelector('[data-slot="model-panel-body"]');
    const lists = [...(body?.querySelectorAll('[role="list"]') ?? [])].filter(
      (element) => element.getAttribute('aria-label') === `Model components for ${entryPath}`,
    );
    if (lists.length !== 1) {
      throw new Error('The authored Model unit has no unique actual component list.');
    }
    const currentView = lists[0]?.closest('.dv-view');
    const nextView = currentView?.nextElementSibling;
    if (!currentView || !nextView) {
      throw new Error('The authored Model unit has no actual adjacent native section views.');
    }
    const beforeLabel = currentView.querySelector('[data-slot="paneview-header"] button')?.textContent.trim();
    const afterLabel = nextView.querySelector('[data-slot="paneview-header"] button')?.textContent.trim();
    if (!beforeLabel || afterLabel !== 'Properties' || !nextView.classList.contains('dv-view')) {
      throw new Error('The authored Model unit has no actual adjacent native section headers.');
    }
    const label = `Resize ${beforeLabel} and ${afterLabel} sections`;
    const separators = [...(body?.querySelectorAll('[role="separator"]') ?? [])].filter(
      (element) =>
        element.getAttribute('aria-orientation') === 'horizontal' && element.getAttribute('aria-label') === label,
    );
    if (separators.length !== 1) {
      throw new Error('The authored Model unit has no unique actual native section separator.');
    }
    return separators[0]?.getAttribute('aria-label');
  }, 'preview/assembly.json');
  if (!separatorName) {
    throw new Error('The authored section separator has no accessible identity.');
  }
  const separator = selectors.getByRole('separator', { name: separatorName, exact: true });
  await target.expectAttribute(separator, 'aria-disabled', 'false');
  await target.press(separator, 'End');
  const selectedId = original.leaves.find(
    ({ ancestry, component }) =>
      ancestry.length === 1 && ancestry[0] === 'body-right' && component.name === 'Known housing',
  )?.component.id;
  if (!selectedId || !original.knownHousingIds.includes(selectedId)) {
    throw new Error('The moved body-right occurrence has no actual canonical housing recipient.');
  }
  await target.click(list.getByCss(`[data-model-part-button][data-model-component-id=${JSON.stringify(selectedId)}]`));
  const properties = selectors.getByCss('[data-slot="part-properties"]');

  const replaceAuthoredFile = async (file: Readonly<{ path: string; content: string }>): Promise<void> => {
    await openCommand('Open files');
    await expandPath('preview');
    await target.click(rootedTreeItem(file.path), { button: 'right' });
    await target.chooseFile(selectors.getByRole('menuitem', { name: 'Upload Files', exact: true }), {
      name: file.path.slice(file.path.lastIndexOf('/') + 1),
      mimeType: 'text/plain',
      base64: uint8ArrayToBase64(new TextEncoder().encode(file.content)),
    });
    const dialog = selectors.getByRole('alertdialog', { name: `Replace '${file.path}'?`, exact: true });
    await target.expectVisible(dialog);
    await target.click(dialog.getByRole('button', { name: 'Replace', exact: true }));
    await target.expectHidden(dialog);
    await target.click(rootedTreeItem(file.path), { button: 'right' });
    const downloaded = await target.download(selectors.getByRole('menuitem', { name: 'Download', exact: true }));
    expect(new TextDecoder().decode(base64ToUint8Array(downloaded.base64))).toBe(file.content);
  };
  const bodySource = (density: number, color?: string): string => `import { makeBaseBox } from 'replicad';
export default function main() {
  return [
    { shape: makeBaseBox(26, 20, 24), name: 'Known housing', density: ${density}${color ? `, color: '${color}'` : ''} },
    { shape: makeBaseBox(10, 8, 6).translate([40, 0, 0]), name: 'Unknown density' },
  ];
}
`;
  const readPhase = async (
    input: Readonly<{
      name: string;
      before: readonly PreviewRecoveryRecord[];
      previousDigest?: string;
      previousEncodedDigest?: string;
    }>,
  ) => {
    await target.waitFor(
      (held) => {
        const state: PreviewRecoveryDocument = globalThis;
        const bridge = state.__TAU_SECTION_VIEW_TEST__;
        const capture = bridge?.getCommittedAssembly();
        const draw = bridge?.getCommittedDrawInventory();
        const root = capture?.assemblyDisplay?.root;
        return Boolean(
          bridge?.isGeometryFramed() &&
          capture?.isCurrent() &&
          root &&
          root.digest !== held.previousDigest &&
          capture.diagnostics.projectId === held.projectId &&
          capture.diagnostics.sourceEntryPath === 'preview/assembly.json' &&
          draw?.unitId === held.unitId &&
          draw.key === root.digest,
        );
      },
      { previousDigest: input.previousDigest, projectId: originalProject, unitId: original.unitId },
      { timeout: 120_000 },
    );
    const pin = await readPreviewRecoveryPin();
    expect(pin.unitId).toBe(original.unitId);
    expect(pin.knownHousingIds).toEqual(original.knownHousingIds);
    await openCommand('Open model structure');
    await target.fill(selectors.getByRole('searchbox', { name: 'Filter parts' }), 'Known housing');
    const selectedRow = list.getByCss(
      `[data-model-part-button][data-model-component-id=${JSON.stringify(selectedId)}]`,
    );
    if ((await target.getAttribute(selectedRow, 'aria-pressed')) !== 'true') {
      await target.click(selectedRow);
    }
    await target.waitFor(
      (held) => {
        const state: PreviewRecoveryDocument = globalThis;
        const capture = state.__TAU_SECTION_VIEW_TEST__?.getCommittedAssembly();
        if (!capture?.isCurrent() || capture.assemblyDisplay?.root.digest !== held.digest) {
          throw new Error('Mutation preview preparation lost its fresh publication.');
        }
        const records = state.__TAU_HEADLESS_IMAGE_DEBUG__?.records ?? [];
        const isRecord = (value: unknown): value is Record<string, unknown> =>
          typeof value === 'object' && value !== null && !Array.isArray(value);
        const readyRecipient = (value: unknown): boolean =>
          Array.isArray(value) &&
          value.some((row: unknown) => isRecord(row) && row['id'] === held.id && row['status'] === 'ready');
        const serviceReady = records.some(({ name, detail }) => {
          if (detail['sourcePath'] !== held.path) {
            return false;
          }
          if (name === 'thumbnail.service.request') {
            return readyRecipient(detail['current']);
          }
          const { outputs } = detail;
          return (
            name === 'thumbnail.service.accept' &&
            Array.isArray(outputs) &&
            outputs.some((output: unknown) => isRecord(output) && readyRecipient(output['recipientStates']))
          );
        });
        return (
          serviceReady ||
          [...document.querySelectorAll('[data-slot="part-properties"] button')].some(
            (button) => button.textContent.trim() === 'Retry preview',
          )
        );
      },
      { digest: pin.root.digest, path: 'preview/assembly.json', id: selectedId },
      { timeout: 120_000 },
    );
    const retry = properties.getByRole('button', { name: 'Retry preview', exact: true });
    if (await target.isVisible(retry)) {
      await target.click(retry);
    }
    await expect
      .poll(
        async () =>
          target.evaluate(
            async (held) => {
              const state: PreviewRecoveryDocument = globalThis;
              const bridge = state.__TAU_SECTION_VIEW_TEST__;
              const capture = bridge?.getCommittedAssembly();
              const draw = bridge?.getCommittedDrawInventory();
              const selected = bridge?.getModelHoverState();
              if (
                !capture?.isCurrent() ||
                capture.assemblyDisplay?.root.path !== held.root.path ||
                capture.assemblyDisplay.root.digest !== held.digest ||
                capture.assemblyDisplay.root.byteLength !== held.root.byteLength ||
                capture.diagnostics.projectId !== held.projectId ||
                capture.diagnostics.sourceEntryPath !== held.path ||
                draw?.key !== held.digest ||
                draw.unitId !== held.unitId ||
                selected?.activeUnitId !== held.unitId ||
                selected.selectedComponentIds?.length !== 1 ||
                selected.selectedComponentIds[0] !== held.id
              ) {
                throw new Error('Mutation decode lost its exact publication.');
              }
              const records = state.__TAU_HEADLESS_IMAGE_DEBUG__?.records ?? [];
              if (records.length >= 512) {
                throw new Error('The mutation recorder reached its closed evidence bound.');
              }
              const isRecord = (value: unknown): value is Record<string, unknown> =>
                typeof value === 'object' && value !== null && !Array.isArray(value);
              const readyRecipient = (value: unknown): boolean =>
                Array.isArray(value) &&
                value.some(
                  (row: unknown) =>
                    isRecord(row) &&
                    row['id'] === held.id &&
                    row['status'] === 'ready' &&
                    typeof row['byteLength'] === 'number' &&
                    row['byteLength'] > 0,
                );
              const serviceReady = records.some(({ name, detail }) => {
                if (detail['sourcePath'] !== held.path) {
                  return false;
                }
                if (name === 'thumbnail.service.request') {
                  return readyRecipient(detail['current']);
                }
                const { outputs } = detail;
                return (
                  name === 'thumbnail.service.accept' &&
                  Array.isArray(outputs) &&
                  outputs.some((output: unknown) => isRecord(output) && readyRecipient(output['recipientStates']))
                );
              });
              const containsRecipient = (value: unknown): boolean =>
                Array.isArray(value) && value.some((row: unknown) => isRecord(row) && row['id'] === held.id);
              const caller = records.findLast(({ name, detail }) => {
                const { root } = detail;
                return (
                  name === 'thumbnail.explorer.request' &&
                  detail['sourceCurrent'] === true &&
                  detail['projectId'] === held.projectId &&
                  detail['unitId'] === held.unitId &&
                  detail['sourcePath'] === held.path &&
                  isRecord(root) &&
                  root['path'] === held.root.path &&
                  root['digest'] === held.digest &&
                  root['byteLength'] === held.root.byteLength &&
                  typeof detail['geometryHash'] === 'string' &&
                  typeof detail['visualKey'] === 'string' &&
                  containsRecipient(detail['requested'])
                );
              })?.detail;
              const service =
                caller &&
                records.findLast(
                  ({ name, detail }) =>
                    name === 'thumbnail.service.request' &&
                    detail['owner'] === 'explorer' &&
                    detail['sourcePath'] === held.path &&
                    detail['geometryHash'] === caller['geometryHash'] &&
                    detail['visualKey'] === caller['visualKey'] &&
                    containsRecipient(detail['requested']),
                );
              const image = document.querySelector(
                '[data-slot="part-properties"] button[aria-label="Preview Known housing"] img',
              );
              if (
                !caller ||
                !service ||
                !serviceReady ||
                !(image instanceof HTMLImageElement) ||
                !image.complete ||
                image.naturalWidth !== 1536 ||
                image.naturalHeight !== 1536
              ) {
                return false;
              }
              if (held.previousEncodedDigest !== undefined) {
                const response = await fetch(image.src);
                const bytes = await response.arrayBuffer();
                const digest = `sha256:${[...new Uint8Array(await crypto.subtle.digest('SHA-256', bytes))].map((byte) => byte.toString(16).padStart(2, '0')).join('')}`;
                if (digest === held.previousEncodedDigest) {
                  return false;
                }
              }
              return capture.isCurrent();
            },
            {
              digest: pin.root.digest,
              root: pin.root,
              projectId: originalProject,
              unitId: pin.unitId,
              path: 'preview/assembly.json',
              id: selectedId,
              previousEncodedDigest: input.previousEncodedDigest,
            },
          ),
        { timeout: 120_000 },
      )
      .toBe(true);
    const evidence = await target.evaluate(
      async (held) => {
        const state: PreviewRecoveryDocument = globalThis;
        const bridge = state.__TAU_SECTION_VIEW_TEST__;
        const capture = bridge?.getCommittedAssembly();
        const draw = bridge?.getCommittedDrawInventory();
        const selected = bridge?.getModelHoverState();
        if (
          !capture?.isCurrent() ||
          capture.assemblyDisplay?.root.path !== held.root.path ||
          capture.assemblyDisplay.root.digest !== held.root.digest ||
          capture.assemblyDisplay.root.byteLength !== held.root.byteLength ||
          capture.diagnostics.projectId !== held.projectId ||
          capture.diagnostics.sourceEntryPath !== 'preview/assembly.json' ||
          draw?.key !== held.root.digest ||
          draw.unitId !== held.unitId ||
          selected?.activeUnitId !== held.unitId ||
          selected.selectedComponentIds?.length !== 1 ||
          selected.selectedComponentIds[0] !== held.selectedId
        ) {
          throw new Error('Mutation evidence has no exact current authored subject.');
        }
        const records = state.__TAU_HEADLESS_IMAGE_DEBUG__?.records ?? [];
        if (
          records.length >= 512 ||
          JSON.stringify(records.slice(0, held.before.length)) !== JSON.stringify(held.before)
        ) {
          throw new Error('Mutation evidence lost its original closed recorder prefix.');
        }
        const mutationRecords = records.slice(held.before.length);
        const caller = records.findLast(
          ({ name, detail }) =>
            name === 'thumbnail.explorer.request' &&
            detail['sourceCurrent'] === true &&
            detail['projectId'] === held.projectId &&
            detail['unitId'] === held.unitId &&
            typeof detail['root'] === 'object' &&
            detail['root'] !== null &&
            'digest' in detail['root'] &&
            detail['root'].digest === held.root.digest,
        )?.detail;
        const service = records.findLast(
          ({ name, detail }) =>
            name === 'thumbnail.service.request' &&
            detail['owner'] === 'explorer' &&
            detail['sourcePath'] === 'preview/assembly.json' &&
            caller !== undefined &&
            detail['geometryHash'] === caller['geometryHash'] &&
            detail['visualKey'] === caller['visualKey'],
        )?.detail;
        const requested = service?.['requested'];
        if (!caller || !service || !Array.isArray(requested)) {
          throw new Error('The current mutation has no actual Explorer/service request join.');
        }
        const actualParts = requested.filter(
          (part: unknown): part is Record<string, unknown> =>
            typeof part === 'object' && part !== null && !Array.isArray(part),
        );
        const part = actualParts.find((candidate) => candidate['id'] === held.selectedId);
        if (typeof part?.['visualKey'] !== 'string' || typeof part['identity'] !== 'string') {
          throw new TypeError('The actual selected mutation recipient has no service appearance identity.');
        }
        const image = document.querySelector(
          '[data-slot="part-properties"] button[aria-label="Preview Known housing"] img',
        );
        if (
          !(image instanceof HTMLImageElement) ||
          !image.complete ||
          image.naturalWidth !== 1536 ||
          image.naturalHeight !== 1536
        ) {
          throw new Error('The current mutation consumer has not decoded 1536 pixels.');
        }
        const response = await fetch(image.src);
        const blob = await response.blob();
        if (blob.type !== 'image/webp' || blob.size === 0) {
          throw new Error('The mutation consumer has no actual encoded WebP.');
        }
        const hash = async (bytes: BufferSource): Promise<string> =>
          `sha256:${[...new Uint8Array(await crypto.subtle.digest('SHA-256', bytes))].map((byte) => byte.toString(16).padStart(2, '0')).join('')}`;
        const bytes = await blob.arrayBuffer();
        const { geometryHash } = service;
        const boundJobs = mutationRecords.filter(
          ({ detail }) =>
            typeof detail['identity'] === 'string' &&
            typeof geometryHash === 'string' &&
            detail['identity'].startsWith(`${geometryHash}:parts:`),
        );
        const counts = (entries: readonly PreviewRecoveryRecord[]) => ({
          admissions: entries.filter(({ name }) => name === 'queue.admit').length,
          waits: entries.filter(({ name }) => name === 'queue.wait').length,
          transcodes: entries.filter(({ name }) => name === 'runtime.transcode').length,
          completions: entries.filter(({ name }) => name === 'job.complete').length,
          failures: entries.filter(({ name, detail }) => name === 'job.complete' && detail['success'] === false).length,
          outputBytes: entries.filter(({ name }) => name === 'job.complete').map(({ detail }) => detail['outputBytes']),
          outputCounts: entries
            .filter(({ name }) => name === 'job.complete')
            .map(({ detail }) => detail['outputCount']),
        });
        const selectedIdentity = part['identity'];
        const isRecord = (value: unknown): value is Record<string, unknown> =>
          typeof value === 'object' && value !== null && !Array.isArray(value);
        const intervalJobs = new Map<string, PreviewRecoveryRecord[]>();
        for (const record of mutationRecords) {
          const identity =
            record.name === 'thumbnail.service.accept' ? record.detail['jobIdentity'] : record.detail['identity'];
          if (
            typeof identity !== 'string' ||
            !['queue.admit', 'queue.wait', 'runtime.transcode', 'job.complete', 'thumbnail.service.accept'].includes(
              record.name,
            )
          ) {
            continue;
          }
          const entries = intervalJobs.get(identity) ?? [];
          entries.push(record);
          intervalJobs.set(identity, entries);
        }
        const jobAttribution = [];
        // oxlint-disable no-await-in-loop -- Hash each bounded actual interval identity before retaining its copied recipient evidence.
        for (const [identity, entries] of intervalJobs) {
          const prefix = typeof geometryHash === 'string' ? `${geometryHash}:parts:` : undefined;
          const end = identity.lastIndexOf(':submission-');
          const chunk =
            prefix !== undefined &&
            identity.startsWith(prefix) &&
            end >= prefix.length &&
            /^\d+$/.test(identity.slice(end + ':submission-'.length))
              ? identity.slice(prefix.length, end).split('|')
              : undefined;
          const chunkIdentitySha256 = [];
          for (const member of chunk ?? []) {
            chunkIdentitySha256.push(await hash(new TextEncoder().encode(member)));
          }
          const outputs = [];
          let acceptCount = 0;
          for (const record of mutationRecords) {
            if (record.name !== 'thumbnail.service.accept' || record.detail['jobIdentity'] !== identity) {
              continue;
            }
            acceptCount++;
            const actualOutputs = record.detail['outputs'];
            if (!Array.isArray(actualOutputs)) {
              continue;
            }
            const outputRecords: readonly unknown[] = actualOutputs;
            for (const value of outputRecords) {
              if (!isRecord(value)) {
                continue;
              }
              const outputIdentity = value['identity'];
              const recipients: string[] = [];
              const actualRecipients = value['recipients'];
              const recipientRecords: readonly unknown[] = Array.isArray(actualRecipients) ? actualRecipients : [];
              for (const recipient of recipientRecords) {
                if (typeof recipient === 'string') {
                  recipients.push(recipient);
                }
              }
              const recipientStates = [];
              for (const stage of ['before', 'after']) {
                const states = value[stage === 'after' ? 'recipientStates' : stage];
                const stateRecords: readonly unknown[] = Array.isArray(states) ? states : [];
                for (const current of stateRecords) {
                  if (!isRecord(current)) {
                    continue;
                  }
                  recipientStates.push({
                    stage,
                    id: typeof current['id'] === 'string' ? current['id'] : undefined,
                    status: typeof current['status'] === 'string' ? current['status'] : undefined,
                    byteLength: typeof current['byteLength'] === 'number' ? current['byteLength'] : undefined,
                    registeredIdentitySha256:
                      typeof current['registeredIdentity'] === 'string'
                        ? await hash(new TextEncoder().encode(current['registeredIdentity']))
                        : undefined,
                    registeredSelectedIdentity:
                      typeof current['registeredIdentity'] === 'string'
                        ? current['registeredIdentity'] === selectedIdentity
                        : null,
                    cachePresent: typeof current['cachePresent'] === 'boolean' ? current['cachePresent'] : undefined,
                    decoded: typeof current['decoded'] === 'boolean' ? current['decoded'] : undefined,
                  });
                }
              }
              outputs.push({
                acceptSourcePath:
                  typeof record.detail['sourcePath'] === 'string' ? record.detail['sourcePath'] : undefined,
                acceptSourceMatchesCurrent:
                  record.detail['sourcePath'] === 'preview/assembly.json' &&
                  record.detail['geometryHash'] === geometryHash &&
                  record.detail['visualKey'] === service['visualKey'],
                id: typeof value['id'] === 'string' ? value['id'] : undefined,
                identitySha256:
                  typeof outputIdentity === 'string' ? await hash(new TextEncoder().encode(outputIdentity)) : undefined,
                selectedIdentity: typeof outputIdentity === 'string' ? outputIdentity === selectedIdentity : null,
                fileName: typeof value['fileName'] === 'string' ? value['fileName'] : undefined,
                outputBytes: typeof value['outputBytes'] === 'number' ? value['outputBytes'] : undefined,
                outputAccepted: typeof value['outputAccepted'] === 'boolean' ? value['outputAccepted'] : undefined,
                recipients,
                selectedRecipient: recipients.includes(held.selectedId),
                recipientStates,
              });
            }
          }
          jobAttribution.push({
            identitySha256: await hash(new TextEncoder().encode(identity)),
            counts: counts(entries),
            currentSourceChunk: chunk !== undefined,
            chunkIdentitySha256,
            selectedIdentityQueued:
              chunk !== undefined && !selectedIdentity.includes('|') ? chunk.includes(selectedIdentity) : null,
            acceptCount,
            outputs,
          });
        }
        // oxlint-enable no-await-in-loop
        const result = {
          projectId: held.projectId,
          root: held.root,
          unitId: held.unitId,
          selectedId: held.selectedId,
          requestedIds: actualParts.map((candidate) => candidate['id']),
          visualKeySha256: await hash(new TextEncoder().encode(part['visualKey'])),
          identitySha256: await hash(new TextEncoder().encode(part['identity'])),
          geometryHashSha256:
            typeof geometryHash === 'string' ? await hash(new TextEncoder().encode(geometryHash)) : undefined,
          encoded: {
            digest: await hash(bytes),
            byteLength: bytes.byteLength,
            width: image.naturalWidth,
            height: image.naturalHeight,
          },
          jobAttribution,
          boundJobs: counts(boundJobs),
          allIntervalJobs: counts(mutationRecords),
          automaticIntervalJobs: counts(
            mutationRecords.filter(({ detail }) => detail['kind'] === 'automatic-thumbnail'),
          ),
          manualIntervalJobs: counts(mutationRecords.filter(({ detail }) => detail['kind'] === 'manual-thumbnail')),
          prequeueAttempts: null,
          cancellations: null,
          recordCount: records.length,
          evidenceTruncated: false,
        };
        if (!capture.isCurrent() || bridge?.getCommittedAssembly().assemblyDisplay !== capture.assemblyDisplay) {
          throw new Error('Mutation source changed while encoded evidence was captured.');
        }
        return result;
      },
      { before: input.before, root: pin.root, projectId: originalProject, unitId: pin.unitId, selectedId },
    );
    await target.writeArtifact(
      `s05-authored-mutation-${input.name}.json`,
      JSON.stringify({ pin, evidence }, undefined, 2),
    );
    return { pin, evidence };
  };
  const baseline = await readPhase({ name: 'baseline', before: await readPreviewRecoveryJobs() });
  const beforeDensity = await readPreviewRecoveryJobs();
  await replaceAuthoredFile({ path: 'preview/body.js', content: bodySource(2.1) });
  const density = await readPhase({ name: 'density', before: beforeDensity, previousDigest: baseline.pin.root.digest });
  await target.expectVisible(properties.getByText('2.1 g/cm³', { exact: true }));
  expect(density.evidence.identitySha256).toBe(baseline.evidence.identitySha256);
  expect(density.evidence.encoded).toEqual(baseline.evidence.encoded);
  expect(density.evidence.boundJobs.admissions).toBe(0);
  const authored = {
    schemaVersion: 1,
    parts: { body: { source: { path: 'preview/body.js' } }, face: { source: { path: 'preview/face.js' } } },
    occurrences: density.pin.occurrences.map(({ id, part, transform }) => ({
      id,
      part,
      transform: id === 'body-right' ? transform.map((value, index) => (index === 12 ? 0.12 : value)) : transform,
    })),
  };
  const beforePose = await readPreviewRecoveryJobs();
  await replaceAuthoredFile({ path: 'preview/assembly.json', content: JSON.stringify(authored) });
  const pose = await readPhase({ name: 'rigid-pose', before: beforePose, previousDigest: density.pin.root.digest });
  expect(pose.pin.occurrences.find(({ id }) => id === 'body-right')?.transform[12]).toBe(0.12);
  expect(pose.evidence.identitySha256).toBe(density.evidence.identitySha256);
  expect(pose.evidence.encoded).toEqual(density.evidence.encoded);
  expect(pose.evidence.boundJobs.admissions).toBe(0);
  const beforeMaterial = await readPreviewRecoveryJobs();
  await replaceAuthoredFile({ path: 'preview/body.js', content: bodySource(2.1, '#e53935') });
  const material = await readPhase({
    name: 'material',
    before: beforeMaterial,
    previousDigest: pose.pin.root.digest,
    previousEncodedDigest: pose.evidence.encoded.digest,
  });
  expect(material.evidence.identitySha256).not.toBe(pose.evidence.identitySha256);
  expect(material.evidence.encoded.digest).not.toBe(pose.evidence.encoded.digest);
  expect(material.evidence.boundJobs.admissions).toBeGreaterThan(0);
  expect(material.evidence.boundJobs.completions).toBeGreaterThan(0);
  expect(material.evidence.boundJobs.failures).toBe(0);

  await openCommand('Open files');
  await expandPath(material.pin.root.path.slice(0, material.pin.root.path.lastIndexOf('/')));
  await target.click(rootedTreeItem(material.pin.root.path), { button: 'right' });
  await target.click(selectors.getByRole('menuitem', { name: 'Open in Viewer', exact: true }));
  await target.waitFor(
    (root) => {
      const state: PreviewRecoveryDocument = globalThis;
      const capture = state.__TAU_SECTION_VIEW_TEST__?.getCommittedAssembly();
      return Boolean(
        capture?.isCurrent() &&
        capture.diagnostics.sourceEntryPath === root.path &&
        capture.assemblyDisplay?.root.digest === root.digest,
      );
    },
    material.pin.root,
    { timeout: 120_000 },
  );
  const managed = await readPreviewRecoveryPin();
  const { unitId: authoredUnit, ...authoredPin } = material.pin;
  const { unitId: managedUnit, ...managedPin } = managed;
  expect(managedUnit).not.toBe(authoredUnit);
  expect(managedPin).toEqual(authoredPin);
  await openCommand('Open files');
  for (const path of ['preview/body.js', 'preview/face.js', 'preview/assembly.json']) {
    // oxlint-disable-next-line no-await-in-loop -- Delete and verify each actual authored file before the next Files gesture.
    await expandPath('preview');
    // oxlint-disable-next-line no-await-in-loop -- The expanded original source row owns its context menu.
    await target.click(rootedTreeItem(path), { button: 'right' });
    // oxlint-disable-next-line no-await-in-loop -- The current file's real menu owns deletion.
    await target.click(selectors.getByRole('menuitem', { name: 'Delete', exact: true }));
    // oxlint-disable-next-line no-await-in-loop -- The actual alertdialog owns confirmation.
    await target.click(selectors.getByRole('alertdialog').getByRole('button', { name: /^Delete/u }));
    // oxlint-disable-next-line no-await-in-loop -- Source absence is mandatory before proceeding.
    await target.expectCount(rootedTreeItem(path), 0, 60_000);
  }
  expect(await readPreviewRecoveryPin()).toEqual(managed);
  await target.writeArtifact(
    's05-authored-mutation-managed-handoff.json',
    JSON.stringify(
      {
        authored: material.pin,
        managed,
        deletedSources: ['preview/body.js', 'preview/face.js', 'preview/assembly.json'],
        crossUnitReuseClaimed: false,
        textureMutationQualified: false,
        measuredGpuBytes: null,
        measuredRssBytes: null,
      },
      undefined,
      2,
    ),
  );
});

test('should replace current authored embedded-texture previews while retaining an unrelated part preview', async () => {
  await target.setViewport({ width: 1440, height: 900 });
  await target.navigate(`${seedRoute}?main=preview-assembly-secondary`);
  await target.expectUrl(/\/w\/[^/]+\/[^/]+/u, 60_000);
  await target.click(selectors.getByRole('button', { name: /^decline$/iu }), { timeout: 5000 }).catch(() => undefined);
  await openCommand('Open files');
  const initialFilesPane = selectors.getByRole('region', { name: /^Files for /u }).first();
  const initialLauncherFiles = selectors
    .getByCss('[data-project-workspace]')
    .getByRole('group', { name: 'Project', exact: true })
    .getByRole('button')
    .filter({ has: selectors.getByText('Files', { exact: true }) });
  await expect
    .poll(async () => (await target.isVisible(initialFilesPane)) || (await target.isVisible(initialLauncherFiles)))
    .toBe(true);
  if (!(await target.isVisible(initialFilesPane))) {
    await target.click(initialLauncherFiles);
  }
  await expandPath('preview');
  await target.click(rootedTreeItem('preview/assembly.json'), { button: 'right' });
  await target.click(selectors.getByRole('menuitem', { name: 'Open in Viewer', exact: true }));
  await target.waitFor(
    () => {
      const state: PreviewRecoveryDocument = globalThis;
      const bridge = state.__TAU_SECTION_VIEW_TEST__;
      const capture = bridge?.getCommittedAssembly();
      return Boolean(
        bridge?.isGeometryFramed() &&
        capture?.assemblyDisplay &&
        capture.isCurrent() &&
        capture.diagnostics.sourceEntryPath === 'preview/assembly.json',
      );
    },
    undefined,
    { timeout: 120_000 },
  );
  const original = await readPreviewRecoveryPin();
  const originalProject = await target.evaluate(() => {
    const state: PreviewRecoveryDocument = globalThis;
    return state.__TAU_SECTION_VIEW_TEST__?.getCommittedAssembly().diagnostics.projectId;
  });
  if (!originalProject) {
    throw new Error('The authored mutation cohort has no actual current project.');
  }
  await openCommand('Open model structure');
  await target.fill(selectors.getByRole('searchbox', { name: 'Filter parts' }), 'Known housing');
  const list = selectors.getByRole('list', { name: 'Model components for preview/assembly.json', exact: true });
  await target.expectVisible(list, 60_000);
  const separatorName = await target.evaluate((entryPath) => {
    const body = document.querySelector('[data-slot="model-panel-body"]');
    const lists = [...(body?.querySelectorAll('[role="list"]') ?? [])].filter(
      (element) => element.getAttribute('aria-label') === `Model components for ${entryPath}`,
    );
    if (lists.length !== 1) {
      throw new Error('The authored Model unit has no unique actual component list.');
    }
    const currentView = lists[0]?.closest('.dv-view');
    const nextView = currentView?.nextElementSibling;
    if (!currentView || !nextView) {
      throw new Error('The authored Model unit has no actual adjacent native section views.');
    }
    const beforeLabel = currentView.querySelector('[data-slot="paneview-header"] button')?.textContent.trim();
    const afterLabel = nextView.querySelector('[data-slot="paneview-header"] button')?.textContent.trim();
    if (!beforeLabel || afterLabel !== 'Properties' || !nextView.classList.contains('dv-view')) {
      throw new Error('The authored Model unit has no actual adjacent native section headers.');
    }
    const label = `Resize ${beforeLabel} and ${afterLabel} sections`;
    const separators = [...(body?.querySelectorAll('[role="separator"]') ?? [])].filter(
      (element) =>
        element.getAttribute('aria-orientation') === 'horizontal' && element.getAttribute('aria-label') === label,
    );
    if (separators.length !== 1) {
      throw new Error('The authored Model unit has no unique actual native section separator.');
    }
    return separators[0]?.getAttribute('aria-label');
  }, 'preview/assembly.json');
  if (!separatorName) {
    throw new Error('The authored section separator has no accessible identity.');
  }
  const separator = selectors.getByRole('separator', { name: separatorName, exact: true });
  await target.expectAttribute(separator, 'aria-disabled', 'false');
  await target.press(separator, 'End');
  const selectedId = original.leaves.find(
    ({ ancestry, component }) =>
      ancestry.length === 1 && ancestry[0] === 'body-right' && component.name === 'Known housing',
  )?.component.id;
  if (!selectedId || !original.knownHousingIds.includes(selectedId)) {
    throw new Error('The moved body-right occurrence has no actual canonical housing recipient.');
  }
  await target.click(list.getByCss(`[data-model-part-button][data-model-component-id=${JSON.stringify(selectedId)}]`));
  const properties = selectors.getByCss('[data-slot="part-properties"]');

  const replaceAuthoredFile = async (
    file: Readonly<{ path: string; content: string; expectedSha256: string }>,
  ): Promise<void> => {
    const actualSha256 = await target.evaluate(
      async (content) =>
        [...new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(content)))]
          .map((byte) => byte.toString(16).padStart(2, '0'))
          .join(''),
      file.content,
    );
    expect(actualSha256).toBe(file.expectedSha256);
    await openCommand('Open files');
    await expandPath('preview');
    await target.click(rootedTreeItem(file.path), { button: 'right' });
    await target.chooseFile(selectors.getByRole('menuitem', { name: 'Upload Files', exact: true }), {
      name: file.path.slice(file.path.lastIndexOf('/') + 1),
      mimeType: 'text/plain',
      base64: uint8ArrayToBase64(new TextEncoder().encode(file.content)),
    });
    const dialog = selectors.getByRole('alertdialog', { name: `Replace '${file.path}'?`, exact: true });
    await target.expectVisible(dialog);
    await target.click(dialog.getByRole('button', { name: 'Replace', exact: true }));
    await target.expectHidden(dialog);
    await target.click(rootedTreeItem(file.path), { button: 'right' });
    const downloaded = await target.download(selectors.getByRole('menuitem', { name: 'Download', exact: true }));
    const downloadedContent = new TextDecoder().decode(base64ToUint8Array(downloaded.base64));
    expect(downloadedContent).toBe(file.content);
    expect(
      await target.evaluate(
        async (content) =>
          [...new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(content)))]
            .map((byte) => byte.toString(16).padStart(2, '0'))
            .join(''),
        downloadedContent,
      ),
    ).toBe(file.expectedSha256);
  };
  const fixtureSources = {
    warm: "import { makeBaseBox } from 'replicad';\nconst image = Uint8Array.from(atob('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR4nGN4amn6HwAFrQJT9TAiZQAAAABJRU5ErkJggg=='), (character) => character.charCodeAt(0));\nexport default function main() {\n  return {\n    images: [{ data: image, mimeType: 'image/png' }],\n    textures: [{ source: 0 }],\n    shapes: [\n      { shape: makeBaseBox(26, 20, 24), name: 'Known housing', density: 1.55,\n        material: { pbrMetallicRoughness: { baseColorFactor: [1, 1, 1, 1],\n          baseColorTexture: { index: 0 }, metallicFactor: 0, roughnessFactor: 0.8 } } },\n      { shape: makeBaseBox(10, 8, 6).translate([40, 0, 0]), name: 'Unknown density' },\n    ],\n  };\n}\n",
    cool: "import { makeBaseBox } from 'replicad';\nconst image = Uint8Array.from(atob('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR4nGOQ63j6HwAE3gKLdjmh0wAAAABJRU5ErkJggg=='), (character) => character.charCodeAt(0));\nexport default function main() {\n  return {\n    images: [{ data: image, mimeType: 'image/png' }],\n    textures: [{ source: 0 }],\n    shapes: [\n      { shape: makeBaseBox(26, 20, 24), name: 'Known housing', density: 1.55,\n        material: { pbrMetallicRoughness: { baseColorFactor: [1, 1, 1, 1],\n          baseColorTexture: { index: 0 }, metallicFactor: 0, roughnessFactor: 0.8 } } },\n      { shape: makeBaseBox(10, 8, 6).translate([40, 0, 0]), name: 'Unknown density' },\n    ],\n  };\n}\n",
    unrelated:
      "import { drawRectangle } from 'replicad';\nexport default function main() {\n  return { shape: drawRectangle(10, 8).sketchOnPlane().face(), name: 'Open face', color: '#7e57c2' };\n}\n",
  };
  const readPhase = async (
    input: Readonly<{
      name: string;
      before: readonly PreviewRecoveryRecord[];
      previousDigest?: string;
      previousEncodedDigest?: string;
    }>,
  ) => {
    await target.waitFor(
      (held) => {
        const state: PreviewRecoveryDocument = globalThis;
        const bridge = state.__TAU_SECTION_VIEW_TEST__;
        const capture = bridge?.getCommittedAssembly();
        const draw = bridge?.getCommittedDrawInventory();
        const root = capture?.assemblyDisplay?.root;
        return Boolean(
          bridge?.isGeometryFramed() &&
          capture?.isCurrent() &&
          root &&
          root.digest !== held.previousDigest &&
          capture.diagnostics.projectId === held.projectId &&
          capture.diagnostics.sourceEntryPath === 'preview/assembly.json' &&
          draw?.unitId === held.unitId &&
          draw.key === root.digest,
        );
      },
      { previousDigest: input.previousDigest, projectId: originalProject, unitId: original.unitId },
      { timeout: 120_000 },
    );
    const pin = await readPreviewRecoveryPin();
    expect(pin.unitId).toBe(original.unitId);
    expect(pin.knownHousingIds).toEqual(original.knownHousingIds);
    expect(
      pin.leaves.find(
        ({ ancestry, component }) =>
          ancestry.length === 1 && ancestry[0] === 'body-right' && component.name === 'Known housing',
      )?.component.id,
    ).toBe(selectedId);
    await openCommand('Open model structure');
    await target.fill(selectors.getByRole('searchbox', { name: 'Filter parts' }), 'Known housing');
    const selectedRow = list.getByCss(
      `[data-model-part-button][data-model-component-id=${JSON.stringify(selectedId)}]`,
    );
    if ((await target.getAttribute(selectedRow, 'aria-pressed')) !== 'true') {
      await target.click(selectedRow);
    }
    await target.waitFor(
      (held) => {
        const state: PreviewRecoveryDocument = globalThis;
        const capture = state.__TAU_SECTION_VIEW_TEST__?.getCommittedAssembly();
        if (!capture?.isCurrent() || capture.assemblyDisplay?.root.digest !== held.digest) {
          throw new Error('Mutation preview preparation lost its fresh publication.');
        }
        const records = state.__TAU_HEADLESS_IMAGE_DEBUG__?.records ?? [];
        const isRecord = (value: unknown): value is Record<string, unknown> =>
          typeof value === 'object' && value !== null && !Array.isArray(value);
        const readyRecipient = (value: unknown): boolean =>
          Array.isArray(value) &&
          value.some((row: unknown) => isRecord(row) && row['id'] === held.id && row['status'] === 'ready');
        const serviceReady = records.some(({ name, detail }) => {
          if (detail['sourcePath'] !== held.path) {
            return false;
          }
          if (name === 'thumbnail.service.request') {
            return readyRecipient(detail['current']);
          }
          const { outputs } = detail;
          return (
            name === 'thumbnail.service.accept' &&
            Array.isArray(outputs) &&
            outputs.some((output: unknown) => isRecord(output) && readyRecipient(output['recipientStates']))
          );
        });
        return (
          serviceReady ||
          [...document.querySelectorAll('[data-slot="part-properties"] button')].some(
            (button) => button.textContent.trim() === 'Retry preview',
          )
        );
      },
      { digest: pin.root.digest, path: 'preview/assembly.json', id: selectedId },
      { timeout: 120_000 },
    );
    const retry = properties.getByRole('button', { name: 'Retry preview', exact: true });
    if (await target.isVisible(retry)) {
      await target.click(retry);
    }
    await expect
      .poll(
        async () =>
          target.evaluate(
            async (held) => {
              const state: PreviewRecoveryDocument = globalThis;
              const bridge = state.__TAU_SECTION_VIEW_TEST__;
              const capture = bridge?.getCommittedAssembly();
              const draw = bridge?.getCommittedDrawInventory();
              const selected = bridge?.getModelHoverState();
              if (
                !capture?.isCurrent() ||
                capture.assemblyDisplay?.root.path !== held.root.path ||
                capture.assemblyDisplay.root.digest !== held.digest ||
                capture.assemblyDisplay.root.byteLength !== held.root.byteLength ||
                capture.diagnostics.projectId !== held.projectId ||
                capture.diagnostics.sourceEntryPath !== held.path ||
                draw?.key !== held.digest ||
                draw.unitId !== held.unitId ||
                selected?.activeUnitId !== held.unitId ||
                selected.selectedComponentIds?.length !== 1 ||
                selected.selectedComponentIds[0] !== held.id
              ) {
                throw new Error('Mutation decode lost its exact publication.');
              }
              const records = state.__TAU_HEADLESS_IMAGE_DEBUG__?.records ?? [];
              if (records.length >= 512) {
                throw new Error('The mutation recorder reached its closed evidence bound.');
              }
              const isRecord = (value: unknown): value is Record<string, unknown> =>
                typeof value === 'object' && value !== null && !Array.isArray(value);
              const readyRecipient = (value: unknown): boolean =>
                Array.isArray(value) &&
                value.some(
                  (row: unknown) =>
                    isRecord(row) &&
                    row['id'] === held.id &&
                    row['status'] === 'ready' &&
                    typeof row['byteLength'] === 'number' &&
                    row['byteLength'] > 0,
                );
              const serviceReady = records.some(({ name, detail }) => {
                if (detail['sourcePath'] !== held.path) {
                  return false;
                }
                if (name === 'thumbnail.service.request') {
                  return readyRecipient(detail['current']);
                }
                const { outputs } = detail;
                return (
                  name === 'thumbnail.service.accept' &&
                  Array.isArray(outputs) &&
                  outputs.some((output: unknown) => isRecord(output) && readyRecipient(output['recipientStates']))
                );
              });
              const containsRecipient = (value: unknown): boolean =>
                Array.isArray(value) && value.some((row: unknown) => isRecord(row) && row['id'] === held.id);
              const caller = records.findLast(({ name, detail }) => {
                const { root } = detail;
                return (
                  name === 'thumbnail.explorer.request' &&
                  detail['sourceCurrent'] === true &&
                  detail['projectId'] === held.projectId &&
                  detail['unitId'] === held.unitId &&
                  detail['sourcePath'] === held.path &&
                  isRecord(root) &&
                  root['path'] === held.root.path &&
                  root['digest'] === held.digest &&
                  root['byteLength'] === held.root.byteLength &&
                  typeof detail['geometryHash'] === 'string' &&
                  typeof detail['visualKey'] === 'string' &&
                  containsRecipient(detail['requested'])
                );
              })?.detail;
              const service =
                caller &&
                records.findLast(
                  ({ name, detail }) =>
                    name === 'thumbnail.service.request' &&
                    detail['owner'] === 'explorer' &&
                    detail['sourcePath'] === held.path &&
                    detail['geometryHash'] === caller['geometryHash'] &&
                    detail['visualKey'] === caller['visualKey'] &&
                    containsRecipient(detail['requested']),
                );
              const image = document.querySelector(
                '[data-slot="part-properties"] button[aria-label="Preview Known housing"] img',
              );
              if (
                !caller ||
                !service ||
                !serviceReady ||
                !(image instanceof HTMLImageElement) ||
                !image.complete ||
                image.naturalWidth !== 1536 ||
                image.naturalHeight !== 1536
              ) {
                return false;
              }
              if (held.previousEncodedDigest !== undefined) {
                const response = await fetch(image.src);
                const bytes = await response.arrayBuffer();
                const digest = `sha256:${[...new Uint8Array(await crypto.subtle.digest('SHA-256', bytes))].map((byte) => byte.toString(16).padStart(2, '0')).join('')}`;
                if (digest === held.previousEncodedDigest) {
                  return false;
                }
              }
              return capture.isCurrent();
            },
            {
              digest: pin.root.digest,
              root: pin.root,
              projectId: originalProject,
              unitId: pin.unitId,
              path: 'preview/assembly.json',
              id: selectedId,
              previousEncodedDigest: input.previousEncodedDigest,
            },
          ),
        { timeout: 120_000 },
      )
      .toBe(true);
    const evidence = await target.evaluate(
      async (held) => {
        const state: PreviewRecoveryDocument = globalThis;
        const bridge = state.__TAU_SECTION_VIEW_TEST__;
        const capture = bridge?.getCommittedAssembly();
        const draw = bridge?.getCommittedDrawInventory();
        const selected = bridge?.getModelHoverState();
        if (
          !capture?.isCurrent() ||
          capture.assemblyDisplay?.root.path !== held.root.path ||
          capture.assemblyDisplay.root.digest !== held.root.digest ||
          capture.assemblyDisplay.root.byteLength !== held.root.byteLength ||
          capture.diagnostics.projectId !== held.projectId ||
          capture.diagnostics.sourceEntryPath !== 'preview/assembly.json' ||
          draw?.key !== held.root.digest ||
          draw.unitId !== held.unitId ||
          selected?.activeUnitId !== held.unitId ||
          selected.selectedComponentIds?.length !== 1 ||
          selected.selectedComponentIds[0] !== held.selectedId
        ) {
          throw new Error('Mutation evidence has no exact current authored subject.');
        }
        const records = state.__TAU_HEADLESS_IMAGE_DEBUG__?.records ?? [];
        if (
          records.length >= 512 ||
          JSON.stringify(records.slice(0, held.before.length)) !== JSON.stringify(held.before)
        ) {
          throw new Error('Mutation evidence lost its original closed recorder prefix.');
        }
        const mutationRecords = records.slice(held.before.length);
        const caller = records.findLast(
          ({ name, detail }) =>
            name === 'thumbnail.explorer.request' &&
            detail['sourceCurrent'] === true &&
            detail['projectId'] === held.projectId &&
            detail['unitId'] === held.unitId &&
            typeof detail['root'] === 'object' &&
            detail['root'] !== null &&
            'digest' in detail['root'] &&
            detail['root'].digest === held.root.digest,
        )?.detail;
        const service = records.findLast(
          ({ name, detail }) =>
            name === 'thumbnail.service.request' &&
            detail['owner'] === 'explorer' &&
            detail['sourcePath'] === 'preview/assembly.json' &&
            caller !== undefined &&
            detail['geometryHash'] === caller['geometryHash'] &&
            detail['visualKey'] === caller['visualKey'],
        )?.detail;
        const requested = service?.['requested'];
        if (!caller || !service || !Array.isArray(requested)) {
          throw new Error('The current mutation has no actual Explorer/service request join.');
        }
        const actualParts = requested.filter(
          (part: unknown): part is Record<string, unknown> =>
            typeof part === 'object' && part !== null && !Array.isArray(part),
        );
        const part = actualParts.find((candidate) => candidate['id'] === held.selectedId);
        if (typeof part?.['visualKey'] !== 'string' || typeof part['identity'] !== 'string') {
          throw new TypeError('The actual selected mutation recipient has no service appearance identity.');
        }
        const image = document.querySelector(
          '[data-slot="part-properties"] button[aria-label="Preview Known housing"] img',
        );
        if (
          !(image instanceof HTMLImageElement) ||
          !image.complete ||
          image.naturalWidth !== 1536 ||
          image.naturalHeight !== 1536
        ) {
          throw new Error('The current mutation consumer has not decoded 1536 pixels.');
        }
        const response = await fetch(image.src);
        const blob = await response.blob();
        if (blob.type !== 'image/webp' || blob.size === 0) {
          throw new Error('The mutation consumer has no actual encoded WebP.');
        }
        const hash = async (bytes: BufferSource): Promise<string> =>
          `sha256:${[...new Uint8Array(await crypto.subtle.digest('SHA-256', bytes))].map((byte) => byte.toString(16).padStart(2, '0')).join('')}`;
        const bytes = await blob.arrayBuffer();
        const { geometryHash } = service;
        const boundJobs = mutationRecords.filter(
          ({ detail }) =>
            typeof detail['identity'] === 'string' &&
            typeof geometryHash === 'string' &&
            detail['identity'].startsWith(`${geometryHash}:parts:`),
        );
        const counts = (entries: readonly PreviewRecoveryRecord[]) => ({
          admissions: entries.filter(({ name }) => name === 'queue.admit').length,
          waits: entries.filter(({ name }) => name === 'queue.wait').length,
          transcodes: entries.filter(({ name }) => name === 'runtime.transcode').length,
          completions: entries.filter(({ name }) => name === 'job.complete').length,
          failures: entries.filter(({ name, detail }) => name === 'job.complete' && detail['success'] === false).length,
          outputBytes: entries.filter(({ name }) => name === 'job.complete').map(({ detail }) => detail['outputBytes']),
          outputCounts: entries
            .filter(({ name }) => name === 'job.complete')
            .map(({ detail }) => detail['outputCount']),
        });
        const selectedIdentity = part['identity'];
        const isRecord = (value: unknown): value is Record<string, unknown> =>
          typeof value === 'object' && value !== null && !Array.isArray(value);
        const intervalJobs = new Map<string, PreviewRecoveryRecord[]>();
        for (const record of mutationRecords) {
          const identity =
            record.name === 'thumbnail.service.accept' ? record.detail['jobIdentity'] : record.detail['identity'];
          if (
            typeof identity !== 'string' ||
            !['queue.admit', 'queue.wait', 'runtime.transcode', 'job.complete', 'thumbnail.service.accept'].includes(
              record.name,
            )
          ) {
            continue;
          }
          const entries = intervalJobs.get(identity) ?? [];
          entries.push(record);
          intervalJobs.set(identity, entries);
        }
        const jobAttribution = [];
        // oxlint-disable no-await-in-loop -- Hash each bounded actual interval identity before retaining its copied recipient evidence.
        for (const [identity, entries] of intervalJobs) {
          const prefix = typeof geometryHash === 'string' ? `${geometryHash}:parts:` : undefined;
          const end = identity.lastIndexOf(':submission-');
          const chunk =
            prefix !== undefined &&
            identity.startsWith(prefix) &&
            end >= prefix.length &&
            /^\d+$/.test(identity.slice(end + ':submission-'.length))
              ? identity.slice(prefix.length, end).split('|')
              : undefined;
          const chunkIdentitySha256 = [];
          for (const member of chunk ?? []) {
            chunkIdentitySha256.push(await hash(new TextEncoder().encode(member)));
          }
          const outputs = [];
          let acceptCount = 0;
          for (const record of mutationRecords) {
            if (record.name !== 'thumbnail.service.accept' || record.detail['jobIdentity'] !== identity) {
              continue;
            }
            acceptCount++;
            const actualOutputs = record.detail['outputs'];
            if (!Array.isArray(actualOutputs)) {
              continue;
            }
            const outputRecords: readonly unknown[] = actualOutputs;
            for (const value of outputRecords) {
              if (!isRecord(value)) {
                continue;
              }
              const outputIdentity = value['identity'];
              const recipients: string[] = [];
              const actualRecipients = value['recipients'];
              const recipientRecords: readonly unknown[] = Array.isArray(actualRecipients) ? actualRecipients : [];
              for (const recipient of recipientRecords) {
                if (typeof recipient === 'string') {
                  recipients.push(recipient);
                }
              }
              const recipientStates = [];
              for (const stage of ['before', 'after']) {
                const states = value[stage === 'after' ? 'recipientStates' : stage];
                const stateRecords: readonly unknown[] = Array.isArray(states) ? states : [];
                for (const current of stateRecords) {
                  if (!isRecord(current)) {
                    continue;
                  }
                  recipientStates.push({
                    stage,
                    id: typeof current['id'] === 'string' ? current['id'] : undefined,
                    status: typeof current['status'] === 'string' ? current['status'] : undefined,
                    byteLength: typeof current['byteLength'] === 'number' ? current['byteLength'] : undefined,
                    registeredIdentitySha256:
                      typeof current['registeredIdentity'] === 'string'
                        ? await hash(new TextEncoder().encode(current['registeredIdentity']))
                        : undefined,
                    registeredSelectedIdentity:
                      typeof current['registeredIdentity'] === 'string'
                        ? current['registeredIdentity'] === selectedIdentity
                        : null,
                    cachePresent: typeof current['cachePresent'] === 'boolean' ? current['cachePresent'] : undefined,
                    decoded: typeof current['decoded'] === 'boolean' ? current['decoded'] : undefined,
                  });
                }
              }
              outputs.push({
                acceptSourcePath:
                  typeof record.detail['sourcePath'] === 'string' ? record.detail['sourcePath'] : undefined,
                acceptSourceMatchesCurrent:
                  record.detail['sourcePath'] === 'preview/assembly.json' &&
                  record.detail['geometryHash'] === geometryHash &&
                  record.detail['visualKey'] === service['visualKey'],
                id: typeof value['id'] === 'string' ? value['id'] : undefined,
                identitySha256:
                  typeof outputIdentity === 'string' ? await hash(new TextEncoder().encode(outputIdentity)) : undefined,
                selectedIdentity: typeof outputIdentity === 'string' ? outputIdentity === selectedIdentity : null,
                fileName: typeof value['fileName'] === 'string' ? value['fileName'] : undefined,
                outputBytes: typeof value['outputBytes'] === 'number' ? value['outputBytes'] : undefined,
                outputAccepted: typeof value['outputAccepted'] === 'boolean' ? value['outputAccepted'] : undefined,
                recipients,
                selectedRecipient: recipients.includes(held.selectedId),
                recipientStates,
              });
            }
          }
          jobAttribution.push({
            identitySha256: await hash(new TextEncoder().encode(identity)),
            counts: counts(entries),
            currentSourceChunk: chunk !== undefined,
            chunkIdentitySha256,
            selectedIdentityQueued:
              chunk !== undefined && !selectedIdentity.includes('|') ? chunk.includes(selectedIdentity) : null,
            acceptCount,
            outputs,
          });
        }
        // oxlint-enable no-await-in-loop
        const admittedJobs = jobAttribution.filter(({ counts: jobCounts }) => jobCounts.admissions > 0);
        const attributionComplete = admittedJobs.every(
          (job) =>
            job.selectedIdentityQueued !== null &&
            job.outputs.every((output) => !output.selectedRecipient || output.selectedIdentity === true),
        );
        const selectedJobs = admittedJobs.filter(({ selectedIdentityQueued }) => selectedIdentityQueued === true);
        const selectedBoundJobs = {
          attributionComplete,
          admissions: attributionComplete ? selectedJobs.reduce((sum, job) => sum + job.counts.admissions, 0) : null,
          completions: attributionComplete ? selectedJobs.reduce((sum, job) => sum + job.counts.completions, 0) : null,
          failures: attributionComplete ? selectedJobs.reduce((sum, job) => sum + job.counts.failures, 0) : null,
          acceptedOutputs: selectedJobs
            .flatMap(({ outputs }) => outputs)
            .filter(
              (output) =>
                output.selectedIdentity === true && output.selectedRecipient && output.outputAccepted === true,
            ).length,
          gap: attributionComplete
            ? null
            : 'An actual admitted job lacks unambiguous selected identity/chunk/output boundaries.',
        };
        const selectedComponent = draw.canonicalComponents.find(
          ({ ancestry, component }) =>
            ancestry.length === 1 && ancestry[0] === 'body-right' && component.id === held.selectedId,
        )?.component;
        if (!selectedComponent) {
          throw new Error('Texture evidence lost actual body-right canonical membership.');
        }
        const physical: unknown = Reflect.get(selectedComponent, 'physical');
        const volume = isRecord(physical) && isRecord(physical['volume']) ? physical['volume'] : undefined;
        const density = isRecord(physical) && isRecord(physical['density']) ? physical['density'] : undefined;
        const nativePhysical = {
          volumeState: typeof volume?.['state'] === 'string' ? volume['state'] : null,
          volumeMm3: typeof volume?.['valueMm3'] === 'number' ? volume['valueMm3'] : null,
          geometryDigest: typeof volume?.['geometryDigest'] === 'string' ? volume['geometryDigest'] : null,
          addedAbsDeterminant:
            typeof volume?.['addedAbsDeterminant'] === 'number' ? volume['addedAbsDeterminant'] : null,
          densityGramsPerCubicCentimetre:
            typeof density?.['valueGPerCm3'] === 'number' ? density['valueGPerCm3'] : null,
          densityProvenance: typeof density?.['provenance'] === 'string' ? density['provenance'] : null,
          volumeWork: null,
        };
        const result = {
          nativePhysical,
          projectId: held.projectId,
          root: held.root,
          unitId: held.unitId,
          selectedId: held.selectedId,
          requestedIds: actualParts.map((candidate) => candidate['id']),
          visualKeySha256: await hash(new TextEncoder().encode(part['visualKey'])),
          identitySha256: await hash(new TextEncoder().encode(part['identity'])),
          geometryHashSha256:
            typeof geometryHash === 'string' ? await hash(new TextEncoder().encode(geometryHash)) : undefined,
          encoded: {
            digest: await hash(bytes),
            byteLength: bytes.byteLength,
            width: image.naturalWidth,
            height: image.naturalHeight,
          },
          selectedBoundJobs,
          jobAttribution,
          wholeSourceJobs: counts(boundJobs),
          allIntervalJobs: counts(mutationRecords),
          automaticIntervalJobs: counts(
            mutationRecords.filter(({ detail }) => detail['kind'] === 'automatic-thumbnail'),
          ),
          manualIntervalJobs: counts(mutationRecords.filter(({ detail }) => detail['kind'] === 'manual-thumbnail')),
          prequeueAttempts: null,
          cancellations: null,
          recordCount: records.length,
          evidenceTruncated: false,
        };
        if (!capture.isCurrent() || bridge?.getCommittedAssembly().assemblyDisplay !== capture.assemblyDisplay) {
          throw new Error('Mutation source changed while encoded evidence was captured.');
        }
        return result;
      },
      { before: input.before, root: pin.root, projectId: originalProject, unitId: pin.unitId, selectedId },
    );
    await target.writeArtifact(
      `s05-texture-unrelated-${input.name}.json`,
      JSON.stringify({ pin, evidence }, undefined, 2),
    );
    return { pin, evidence };
  };
  const beforeWarm = await readPreviewRecoveryJobs();
  await replaceAuthoredFile({
    path: 'preview/body.js',
    content: fixtureSources.warm,
    expectedSha256: '1d2fb228c5ab24968a9175c564815f0da4b0b364b1ceb3654adf13f88f7c2f68',
  });
  const warm = await readPhase({ name: 'warm', before: beforeWarm, previousDigest: original.root.digest });
  await target.expectVisible(properties.getByText('1.55 g/cm³', { exact: true }));
  if (warm.evidence.nativePhysical.volumeMm3 !== null) {
    expect(warm.evidence.nativePhysical.volumeMm3).toBeCloseTo(12_480, 6);
    expect(warm.evidence.nativePhysical.densityGramsPerCubicCentimetre).toBe(1.55);
    expect(warm.evidence.nativePhysical.densityProvenance).toBe('authored-shape-config');
    if (warm.evidence.nativePhysical.addedAbsDeterminant !== null) {
      expect(warm.evidence.nativePhysical.addedAbsDeterminant).toBe(1);
    }
  }
  const beforeCool = await readPreviewRecoveryJobs();
  await replaceAuthoredFile({
    path: 'preview/body.js',
    content: fixtureSources.cool,
    expectedSha256: 'ce66c69ceaaf783e0e247acfa8efaa9e28742a7c04ef21241e373a6037a568d8',
  });
  const cool = await readPhase({
    name: 'cool',
    before: beforeCool,
    previousDigest: warm.pin.root.digest,
    previousEncodedDigest: warm.evidence.encoded.digest,
  });
  expect(cool.pin.occurrences).toEqual(warm.pin.occurrences);
  expect(cool.evidence.nativePhysical).toEqual(warm.evidence.nativePhysical);
  expect(cool.evidence.visualKeySha256).not.toBe(warm.evidence.visualKeySha256);
  expect(cool.evidence.identitySha256).not.toBe(warm.evidence.identitySha256);
  expect(cool.evidence.encoded.digest).not.toBe(warm.evidence.encoded.digest);
  expect(cool.evidence.selectedBoundJobs.attributionComplete).toBe(true);
  expect(cool.evidence.selectedBoundJobs.admissions).toBeGreaterThan(0);
  expect(cool.evidence.selectedBoundJobs.completions).toBeGreaterThan(0);
  expect(cool.evidence.selectedBoundJobs.acceptedOutputs).toBeGreaterThan(0);
  expect(cool.evidence.selectedBoundJobs.failures).toBe(0);
  const beforeUnrelated = await readPreviewRecoveryJobs();
  await replaceAuthoredFile({
    path: 'preview/face.js',
    content: fixtureSources.unrelated,
    expectedSha256: '5683c5438935ed07c9b12bbbda2c4e885b8795b583455ab6c98cf0151b882db0',
  });
  const unrelated = await readPhase({
    name: 'unrelated-face',
    before: beforeUnrelated,
    previousDigest: cool.pin.root.digest,
  });
  expect(unrelated.pin.occurrences).toEqual(cool.pin.occurrences);
  expect(unrelated.evidence.nativePhysical).toEqual(cool.evidence.nativePhysical);
  expect(unrelated.pin.references.find(({ part }) => part === 'body')).toEqual(
    cool.pin.references.find(({ part }) => part === 'body'),
  );
  expect(unrelated.pin.references.find(({ part }) => part === 'face')?.digest).not.toBe(
    cool.pin.references.find(({ part }) => part === 'face')?.digest,
  );
  expect(unrelated.evidence.visualKeySha256).toBe(cool.evidence.visualKeySha256);
  expect(unrelated.evidence.identitySha256).toBe(cool.evidence.identitySha256);
  expect(unrelated.evidence.encoded).toEqual(cool.evidence.encoded);
  expect(unrelated.evidence.selectedBoundJobs.attributionComplete).toBe(true);
  expect(unrelated.evidence.selectedBoundJobs.admissions).toBe(0);

  await openCommand('Open files');
  await expandPath(unrelated.pin.root.path.slice(0, unrelated.pin.root.path.lastIndexOf('/')));
  await target.click(rootedTreeItem(unrelated.pin.root.path), { button: 'right' });
  await target.click(selectors.getByRole('menuitem', { name: 'Open in Viewer', exact: true }));
  await target.waitFor(
    (root) => {
      const state: PreviewRecoveryDocument = globalThis;
      const capture = state.__TAU_SECTION_VIEW_TEST__?.getCommittedAssembly();
      return Boolean(
        capture?.isCurrent() &&
        capture.diagnostics.sourceEntryPath === root.path &&
        capture.assemblyDisplay?.root.digest === root.digest,
      );
    },
    unrelated.pin.root,
    { timeout: 120_000 },
  );
  const managed = await readPreviewRecoveryPin();
  const { unitId: authoredUnit, ...authoredPin } = unrelated.pin;
  const { unitId: managedUnit, ...managedPin } = managed;
  expect(managedUnit).not.toBe(authoredUnit);
  expect(managedPin).toEqual(authoredPin);
  await openCommand('Open files');
  for (const path of ['preview/body.js', 'preview/face.js', 'preview/assembly.json']) {
    // oxlint-disable-next-line no-await-in-loop -- Delete and verify each actual authored file before the next Files gesture.
    await expandPath('preview');
    // oxlint-disable-next-line no-await-in-loop -- The expanded original source row owns its context menu.
    await target.click(rootedTreeItem(path), { button: 'right' });
    // oxlint-disable-next-line no-await-in-loop -- The current file's real menu owns deletion.
    await target.click(selectors.getByRole('menuitem', { name: 'Delete', exact: true }));
    // oxlint-disable-next-line no-await-in-loop -- The actual alertdialog owns confirmation.
    await target.click(selectors.getByRole('alertdialog').getByRole('button', { name: /^Delete/u }));
    // oxlint-disable-next-line no-await-in-loop -- Source absence is mandatory before proceeding.
    await target.expectCount(rootedTreeItem(path), 0, 60_000);
  }
  expect(await readPreviewRecoveryPin()).toEqual(managed);
  await target.writeArtifact(
    's05-texture-unrelated-managed-handoff.json',
    JSON.stringify(
      {
        authored: unrelated.pin,
        managed,
        deletedSources: ['preview/body.js', 'preview/face.js', 'preview/assembly.json'],
        crossUnitReuseClaimed: false,
        textureMutationQualified: true,
        measuredGpuBytes: null,
        measuredRssBytes: null,
      },
      undefined,
      2,
    ),
  );
});
