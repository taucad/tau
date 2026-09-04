import { expect, test } from 'vitest';
import { page as selectors } from 'vitest/browser';
import type { Locator } from 'vitest/browser';
import * as target from '#support/external-target.js';
import type { CaptureEvidence } from '#support/headless-capture.js';
import {
  hasDarkGrayBackground,
  hasLosslessEncoding,
  readBase64CaptureEvidence,
  readCaptureErrorToasts,
  readCaptureEvidence,
  readLineCoverageEvidence,
  readSectionColorEvidence,
  seedVisionModel,
  waitForCaptureAttachments,
  waitForRenderedGeometry,
} from '#support/headless-capture.js';

type EventOffsets = {
  readonly consoleMessages: number;
  readonly pageErrors: number;
};

type DebugTimingRecord = Readonly<{
  name: string;
  startTime: number;
  duration: number;
  detail: Readonly<Record<string, unknown>>;
}>;

const installWorkerTracking = async (): Promise<void> => {
  await target.addInitScript(() => {
    const nativeWorker = globalThis.Worker;
    const workerNames: string[] = [];
    globalThis.Worker = class extends nativeWorker {
      public constructor(scriptURL: string | URL, options?: WorkerOptions) {
        super(scriptURL, options);
        workerNames.push(options?.name ?? '');
      }
    };
    (globalThis as typeof globalThis & { __TAU_E2E_WORKER_NAMES__?: string[] }).__TAU_E2E_WORKER_NAMES__ = workerNames;
  });
};

const imageDebugRecords = async (): Promise<DebugTimingRecord[]> =>
  target.evaluate(
    () =>
      (
        globalThis as typeof globalThis & {
          __TAU_HEADLESS_IMAGE_DEBUG__?: { readonly records: DebugTimingRecord[] };
        }
      ).__TAU_HEADLESS_IMAGE_DEBUG__?.records ?? [],
  );

type ViewerCamera = Readonly<{
  position: readonly [number, number, number];
  target: readonly [number, number, number];
  fov: number;
  zoom: number;
  rollRadians?: number;
}>;

type PresentationBridge = Readonly<{
  clearSectionView(): void;
  getModelComponents(): ReadonlyArray<Readonly<{ id: string; name: string }>>;
  getModelVisibility(): Readonly<{ hiddenComponentIds: readonly string[]; isolatedComponentIds: readonly string[] }>;
  getPresentation(): Readonly<{
    isSectionViewActive: boolean;
    selectedSectionViewId: string | undefined;
    sectionViewDirection: 1 | -1;
    sectionViewPivot: readonly [number, number, number];
    sectionViewRotation: readonly [number, number, number];
    enableClippingLines: boolean;
    enableClippingMesh: boolean;
  }>;
  hideModelComponent(componentId: string): void;
  isolateModelComponent(componentId: string): void;
  resetModelVisibility(): void;
  setPresentation(presentation: Readonly<{ surfaces: boolean; lines: boolean }>): void;
  setSectionView(
    state: Readonly<{
      plane: 'xy' | 'xz' | 'yz';
      direction?: 1 | -1;
      rotationRadians?: readonly [number, number, number];
      pivot?: readonly [number, number, number];
      translation?: number;
    }>,
  ): void;
}>;

const captureFailurePatterns = [
  /GPUValidationError/iu,
  /device lost/iu,
  /headless image.*(?:error|fail)/iu,
  /resvg.*(?:error|fail|initial)/iu,
] as const;

const eventOffsets = async (): Promise<EventOffsets> => {
  const events = await target.events();
  return { consoleMessages: events.consoleMessages.length, pageErrors: events.pageErrors.length };
};

const expectNoCaptureFailures = async (from: EventOffsets): Promise<void> => {
  const events = await target.events();
  const messages = [
    ...events.pageErrors.slice(from.pageErrors),
    ...events.consoleMessages.slice(from.consoleMessages).map(({ text }) => text),
  ];
  const failures = messages.filter(
    (message) =>
      !message.includes('kind: automatic-thumbnail') && captureFailurePatterns.some((pattern) => pattern.test(message)),
  );
  expect(failures, `Headless capture errors leaked to the browser:\n${failures.join('\n')}`).toEqual([]);
};

const attachment = (index: number): Locator => selectors.getByAltText(`Uploaded ${index + 1}`);

const attachmentSource = async (index: number): Promise<string> => {
  const source = await target.getAttribute(attachment(index), 'src');
  if (!source) {
    throw new Error(`Uploaded image ${index + 1} has no source`);
  }
  return source;
};

const setViewerCamera = async (camera: ViewerCamera): Promise<void> => {
  await target.evaluate((nextCamera) => {
    const bridge = (
      globalThis as {
        __TAU_SECTION_VIEW_TEST__?: { setCamera(value: ViewerCamera): void };
      }
    ).__TAU_SECTION_VIEW_TEST__;
    bridge?.setCamera(nextCamera);
  }, camera);
  await target.evaluate(
    async () =>
      new Promise<void>((resolve) => {
        requestAnimationFrame(() => {
          requestAnimationFrame(() => {
            resolve();
          });
        });
      }),
  );
};

const currentCaptureSize = async (): Promise<readonly [number, number]> => {
  const aspect = await target.evaluate(() => {
    const canvases = [
      ...document.querySelectorAll<HTMLCanvasElement>('[data-testid="cad-viewer-canvas-region"] canvas'),
    ];
    const rect = canvases
      .map((canvas) => canvas.getBoundingClientRect())
      .find(({ width, height }) => width > 0 && height > 0);
    if (!rect) {
      throw new Error('No visible CAD viewer canvas was found');
    }
    return rect.width / rect.height;
  });
  return aspect >= 1
    ? [2400, Math.max(16, Math.round(2400 / aspect))]
    : [Math.max(16, Math.round(2400 * aspect)), 2400];
};

const readViewerEvidence = async (): Promise<CaptureEvidence> => {
  const base64 = await target.screenshot(selectors.getByTestId('cad-viewer-canvas-region').getByCss('canvas').first());
  return readBase64CaptureEvidence(base64, 'image/png');
};

const withPresentationBridge = async (
  action: keyof Pick<
    PresentationBridge,
    | 'clearSectionView'
    | 'hideModelComponent'
    | 'isolateModelComponent'
    | 'resetModelVisibility'
    | 'setPresentation'
    | 'setSectionView'
  >,
  value?: unknown,
): Promise<void> => {
  await target.evaluate(
    ({ action: method, value: argument }) => {
      const bridge = (globalThis as { __TAU_SECTION_VIEW_TEST__?: PresentationBridge }).__TAU_SECTION_VIEW_TEST__;
      if (!bridge) {
        throw new Error('Presentation test bridge is unavailable');
      }
      switch (method) {
        case 'setPresentation': {
          bridge.setPresentation(argument as { surfaces: boolean; lines: boolean });
          break;
        }
        case 'setSectionView': {
          bridge.setSectionView(argument as Parameters<PresentationBridge['setSectionView']>[0]);
          break;
        }
        case 'hideModelComponent': {
          bridge.hideModelComponent(argument as string);
          break;
        }
        case 'isolateModelComponent': {
          bridge.isolateModelComponent(argument as string);
          break;
        }
        default: {
          bridge[method]();
        }
      }
    },
    { action, value },
  );
  await target.evaluate(
    async () =>
      new Promise<void>((resolve) => {
        requestAnimationFrame(() => {
          requestAnimationFrame(() => {
            resolve();
          });
        });
      }),
  );
};

const componentId = async (name: string): Promise<string> =>
  target.evaluate((componentName) => {
    const bridge = (globalThis as { __TAU_SECTION_VIEW_TEST__?: PresentationBridge }).__TAU_SECTION_VIEW_TEST__;
    const component = bridge?.getModelComponents().find(({ name: candidate }) => candidate === componentName);
    if (!component) {
      throw new Error(`Model component ${componentName} is unavailable`);
    }
    return component.id;
  }, name);

const modelVisibility = async (): Promise<ReturnType<PresentationBridge['getModelVisibility']>> =>
  target.evaluate(() => {
    const bridge = (globalThis as { __TAU_SECTION_VIEW_TEST__?: PresentationBridge }).__TAU_SECTION_VIEW_TEST__;
    if (!bridge) {
      throw new Error('Presentation test bridge is unavailable');
    }
    return bridge.getModelVisibility();
  });

const presentation = async (): Promise<ReturnType<PresentationBridge['getPresentation']>> =>
  target.evaluate(() => {
    const bridge = (globalThis as { __TAU_SECTION_VIEW_TEST__?: PresentationBridge }).__TAU_SECTION_VIEW_TEST__;
    if (!bridge) {
      throw new Error('Presentation test bridge is unavailable');
    }
    return bridge.getPresentation();
  });

const requireColorCentroid = (
  evidence: CaptureEvidence,
  color: keyof CaptureEvidence['modelColorCentroids'],
): readonly [number, number] => {
  const centroid = evidence.modelColorCentroids[color];
  expect(centroid, `Expected ${color} model pixels in ${evidence.digest}`).toBeDefined();
  return centroid!;
};

const pointDistance = (first: readonly [number, number], second: readonly [number, number]): number =>
  Math.hypot(first[0] - second[0], first[1] - second[1]);

const vectorAngle = (first: readonly [number, number], second: readonly [number, number]): number =>
  Math.atan2(second[1] - first[1], second[0] - first[0]);

const angularDistance = (first: number, second: number): number =>
  Math.abs(Math.atan2(Math.sin(first - second), Math.cos(first - second)));

const clearAttachments = async (): Promise<void> => {
  let state = await target.read(selectors.getByRole('button', { name: /Remove uploaded image/u }));
  while (state.count > 0) {
    // oxlint-disable-next-line no-await-in-loop -- Each removal reindexes the remaining attachment buttons.
    await target.click(selectors.getByRole('button', { name: 'Remove uploaded image 1' }));
    // oxlint-disable-next-line no-await-in-loop -- Each removal reindexes the remaining attachment buttons.
    state = await target.read(selectors.getByRole('button', { name: /Remove uploaded image/u }));
  }
  await target.evaluate(async () => {
    await new Promise<void>((resolve) => {
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          resolve();
        });
      });
    });
  });
};

const expectAnnotated = (evidence: CaptureEvidence, mimeType: string, size: readonly [number, number]): void => {
  expect(evidence).toMatchObject({ mimeType, width: size[0], height: size[1] });
  expect(hasLosslessEncoding(evidence), `Expected lossless bytes, received ${evidence.encoding}`).toBe(true);
  expect(
    hasDarkGrayBackground(evidence),
    `Expected dark gray background, received ${JSON.stringify(evidence.background)}`,
  ).toBe(true);
  expect(evidence.modelPixels).toBeGreaterThan(100);
  expect(evidence.topLeftPixels).toBeGreaterThan(20);
  expect(evidence.bottomLeftPixels).toBeGreaterThan(20);
  expect(evidence.bottomRightPixels).toBeGreaterThan(20);
};

const dismissCookies = async (): Promise<void> => {
  await target.click(selectors.getByRole('button', { name: /^decline$/iu }), { timeout: 5000 }).catch(() => undefined);
};

const openCommandPalette = async (query: string): Promise<void> => {
  await target.click(selectors.getByRole('button', { name: 'Search', exact: true }));
  await target.fill(selectors.getByPlaceholder('Search projects, chats, and actions...'), query);
};

const openScreenshotMenu = async (): Promise<void> => {
  const editor = selectors.getByCss('.tiptap[contenteditable="true"]');
  await target.expectVisible(editor);
  await target.fill(editor, '@');
  const category = selectors.getByText('Take Screenshot', { exact: true });
  await target.expectVisible(category);
  await target.click(category);
};

const openSecondaryViewer = async (): Promise<void> => {
  const fileName = 'secondary.ts';
  await target.click(selectors.getByRole('button', { name: 'Search', exact: true }));
  const commandSearch = selectors.getByPlaceholder('Search projects, chats, and actions...');
  await target.fill(commandSearch, 'Open files');
  await target.click(selectors.getByText('Open files', { exact: true }));
  const source = selectors.getByCss('[data-testid="file-tree-item"][data-file-tree-path="src"]');
  await target.expectVisible(source, 60_000);
  if ((await target.getAttribute(source, 'aria-expanded')) !== 'true') {
    await target.click(source, { position: { x: 8, y: 14 } });
  }
  await target.hover(selectors.getByCss(`[data-testid="file-tree-item"][data-file-tree-path="src/${fileName}"]`));
  await target.click(selectors.getByRole('button', { name: `Actions for ${fileName}` }));
  await target.click(selectors.getByRole('menuitem', { name: 'Open in Viewer' }));
  await target.expectClass(selectors.getByCss(`.dv-tab[aria-label="src/${fileName}"]`), /\bdv-active-tab\b/u, 60_000);
  await target.expectVisible(selectors.getByTestId('cad-viewer-canvas-region').getByCss('canvas').first(), 60_000);
  await target.waitFor(() =>
    Boolean((globalThis as { __TAU_SECTION_VIEW_TEST__?: unknown }).__TAU_SECTION_VIEW_TEST__),
  );
};

test('GLTF toolbar and @ actions use one annotated headless camera path', async () => {
  const eventsBefore = await eventOffsets();
  await seedVisionModel();
  await target.setViewport({ width: 1440, height: 960 });
  await target.navigate('/__e2e/headless-chat-image-capture');
  await target.expectUrl(/\/w\/[^/]+\/[^/]+$/u, 60_000);
  const hasWebGpu = await target.evaluate(() => 'gpu' in navigator);
  expect(hasWebGpu, 'Chromium E2E must expose WebGPU for headless GLTF capture').toBe(true);
  await dismissCookies();
  await target.expectVisible(selectors.getByRole('button', { name: 'Capture view to chat' }), 60_000);
  await waitForRenderedGeometry('gltf');

  const initialCamera = { position: [0.13, -0.095, 0.075], target: [0, 0, 0.006], fov: 42, zoom: 1 } as const;
  await setViewerCamera(initialCamera);
  const viewer = await readViewerEvidence();
  expect(viewer.modelPixels).toBeGreaterThan(100);
  const desktopCaptureSize = await currentCaptureSize();
  await target.click(selectors.getByRole('button', { name: 'Capture view to chat' }));
  await waitForCaptureAttachments(1);
  const first = await readCaptureEvidence(attachment(0));
  expectAnnotated(first, 'image/webp', desktopCaptureSize);
  for (const color of ['red', 'green', 'blue'] as const) {
    expect(pointDistance(requireColorCentroid(first, color), requireColorCentroid(viewer, color))).toBeLessThan(0.08);
  }
  for (let index = 0; index < first.coloredModelBounds.length; index++) {
    expect(Math.abs(first.coloredModelBounds[index]! - viewer.coloredModelBounds[index]!)).toBeLessThan(0.09);
  }

  await clearAttachments();
  await setViewerCamera({ ...initialCamera, zoom: 1.6 });
  await target.click(selectors.getByRole('button', { name: 'Capture view to chat' }));
  await waitForCaptureAttachments(1);
  const zoomed = await readCaptureEvidence(attachment(0));
  expectAnnotated(zoomed, 'image/webp', desktopCaptureSize);
  const firstRed = requireColorCentroid(first, 'red');
  const firstBlue = requireColorCentroid(first, 'blue');
  const zoomedRed = requireColorCentroid(zoomed, 'red');
  const zoomedBlue = requireColorCentroid(zoomed, 'blue');
  expect(pointDistance(zoomedRed, zoomedBlue)).toBeGreaterThan(pointDistance(firstRed, firstBlue) * 1.35);

  await clearAttachments();
  await setViewerCamera({ ...initialCamera, rollRadians: 0.45 });
  await target.click(selectors.getByRole('button', { name: 'Capture view to chat' }));
  await waitForCaptureAttachments(1);
  const rolled = await readCaptureEvidence(attachment(0));
  expectAnnotated(rolled, 'image/webp', desktopCaptureSize);
  expect(
    angularDistance(
      vectorAngle(firstRed, firstBlue),
      vectorAngle(requireColorCentroid(rolled, 'red'), requireColorCentroid(rolled, 'blue')),
    ),
  ).toBeGreaterThan(0.3);

  await clearAttachments();
  await setViewerCamera({ position: [-0.051, 0.047, 0.024], target: [0.012, 0, 0.006], fov: 52, zoom: 1.2 });
  await target.click(selectors.getByRole('button', { name: 'Capture view to chat' }));
  await waitForCaptureAttachments(1);
  const second = await readCaptureEvidence(attachment(0));
  expectAnnotated(second, 'image/webp', desktopCaptureSize);
  expect(second.digest).not.toBe(first.digest);
  expect(pointDistance(second.modelCentroid, first.modelCentroid)).toBeGreaterThan(0.01);

  await clearAttachments();
  await openScreenshotMenu();
  await target.click(selectors.getByRole('button', { name: 'Current view' }));
  await waitForCaptureAttachments(1);
  const secondFromAt = await readCaptureEvidence(attachment(0));
  expectAnnotated(secondFromAt, 'image/webp', desktopCaptureSize);
  expect(secondFromAt.digest).toBe(second.digest);

  await clearAttachments();
  await withPresentationBridge('setPresentation', { surfaces: false, lines: true });
  await target.click(selectors.getByRole('button', { name: 'Capture view to chat' }));
  await waitForCaptureAttachments(1);
  const toolbarLinesOnly = await readCaptureEvidence(attachment(0));
  expectAnnotated(toolbarLinesOnly, 'image/webp', desktopCaptureSize);

  await clearAttachments();
  await openScreenshotMenu();
  await target.click(selectors.getByRole('button', { name: 'Current view' }));
  await waitForCaptureAttachments(1);
  const atLinesOnly = await readCaptureEvidence(attachment(0));
  expectAnnotated(atLinesOnly, 'image/webp', desktopCaptureSize);
  expect(atLinesOnly.digest).toBe(toolbarLinesOnly.digest);

  await clearAttachments();
  await withPresentationBridge('setPresentation', { surfaces: true, lines: false });
  await target.click(selectors.getByRole('button', { name: 'Capture view to chat' }));
  await waitForCaptureAttachments(1);
  const toolbarSurfacesOnly = await readCaptureEvidence(attachment(0));
  expectAnnotated(toolbarSurfacesOnly, 'image/webp', desktopCaptureSize);
  expect(toolbarSurfacesOnly.digest).not.toBe(toolbarLinesOnly.digest);
  expect(toolbarSurfacesOnly.modelPixels).toBeGreaterThan(toolbarLinesOnly.modelPixels);

  await clearAttachments();
  await openScreenshotMenu();
  await target.click(selectors.getByRole('button', { name: 'Current view' }));
  await waitForCaptureAttachments(1);
  const atSurfacesOnly = await readCaptureEvidence(attachment(0));
  expectAnnotated(atSurfacesOnly, 'image/webp', desktopCaptureSize);
  expect(atSurfacesOnly.digest).toBe(toolbarSurfacesOnly.digest);

  await clearAttachments();
  await withPresentationBridge('setPresentation', { surfaces: true, lines: false });
  const xArmId = await componentId('X arm');
  await withPresentationBridge('hideModelComponent', xArmId);
  const hiddenVisibility = await modelVisibility();
  expect(hiddenVisibility.hiddenComponentIds).toContain(xArmId);
  await target.click(selectors.getByRole('button', { name: 'Capture view to chat' }));
  await waitForCaptureAttachments(1);
  const hiddenComponent = await readCaptureEvidence(attachment(0));
  expectAnnotated(hiddenComponent, 'image/webp', desktopCaptureSize);
  expect(hiddenComponent.modelColorCentroids.red).toBeUndefined();
  requireColorCentroid(hiddenComponent, 'green');
  requireColorCentroid(hiddenComponent, 'blue');

  await clearAttachments();
  await withPresentationBridge('resetModelVisibility');
  const zTowerId = await componentId('Z tower');
  await withPresentationBridge('isolateModelComponent', zTowerId);
  const isolatedVisibility = await modelVisibility();
  expect(isolatedVisibility.isolatedComponentIds).toEqual([zTowerId]);
  await openScreenshotMenu();
  await target.click(selectors.getByRole('button', { name: 'Current view' }));
  await waitForCaptureAttachments(1);
  const isolatedComponent = await readCaptureEvidence(attachment(0));
  expectAnnotated(isolatedComponent, 'image/webp', desktopCaptureSize);
  expect(isolatedComponent.modelColorCentroids.red).toBeUndefined();
  expect(isolatedComponent.modelColorCentroids.green).toBeUndefined();
  requireColorCentroid(isolatedComponent, 'blue');

  await clearAttachments();
  await withPresentationBridge('resetModelVisibility');
  expect(await modelVisibility()).toEqual({ hiddenComponentIds: [], isolatedComponentIds: [] });
  await withPresentationBridge('setPresentation', { surfaces: true, lines: false });
  await withPresentationBridge('setSectionView', {
    plane: 'yz',
    direction: 1,
    rotationRadians: [0.35, -0.25, 0.2],
    pivot: [0.004, -0.003, 0.008],
    translation: 0.006,
  });
  await target.click(selectors.getByRole('button', { name: 'Capture view to chat' }));
  await waitForCaptureAttachments(1);
  const toolbarSection = await readCaptureEvidence(attachment(0));
  expectAnnotated(toolbarSection, 'image/webp', desktopCaptureSize);
  expect(toolbarSection.digest).not.toBe(second.digest);

  await clearAttachments();
  await openScreenshotMenu();
  await target.click(selectors.getByRole('button', { name: 'Current view' }));
  await waitForCaptureAttachments(1);
  const atSection = await readCaptureEvidence(attachment(0));
  expectAnnotated(atSection, 'image/webp', desktopCaptureSize);
  expect(atSection.digest).toBe(toolbarSection.digest);

  await clearAttachments();
  await withPresentationBridge('setSectionView', {
    plane: 'yz',
    direction: -1,
    rotationRadians: [0.35, -0.25, 0.2],
    pivot: [0.004, -0.003, 0.008],
    translation: 0.006,
  });
  await target.click(selectors.getByRole('button', { name: 'Capture view to chat' }));
  await waitForCaptureAttachments(1);
  const flippedSection = await readCaptureEvidence(attachment(0));
  expectAnnotated(flippedSection, 'image/webp', desktopCaptureSize);
  expect(flippedSection.digest).not.toBe(toolbarSection.digest);
  expect(flippedSection.modelPixels).not.toBe(toolbarSection.modelPixels);

  await clearAttachments();
  await openScreenshotMenu();
  await target.click(selectors.getByRole('button', { name: 'Current view' }));
  await waitForCaptureAttachments(1);
  const atFlippedSection = await readCaptureEvidence(attachment(0));
  expect(atFlippedSection.digest).toBe(flippedSection.digest);

  await clearAttachments();
  await withPresentationBridge('clearSectionView');

  await openScreenshotMenu();
  await target.click(selectors.getByRole('button', { name: 'Orthographic views x 6' }));
  await waitForCaptureAttachments(6);
  const views: CaptureEvidence[] = [];
  for (let index = 0; index < 6; index++) {
    // oxlint-disable-next-line no-await-in-loop -- Ordered attachment evidence is the batch contract under test.
    views.push(await readCaptureEvidence(attachment(index)));
  }
  for (const view of views) {
    expectAnnotated(view, 'image/webp', [1600, 1600]);
  }
  expect(new Set(views.map(({ digest }) => digest)).size).toBe(6);

  await target.click(selectors.getByRole('button', { name: 'Open uploaded image 1' }));
  for (let index = 2; index <= 6; index++) {
    // oxlint-disable-next-line no-await-in-loop -- The carousel state must advance before the next assertion.
    await target.keyboardPress('ArrowRight');
    // oxlint-disable-next-line no-await-in-loop -- Each visible count proves the real six-image carousel sequence.
    await target.expectVisible(selectors.getByText(`${index} / 6`, { exact: true }));
  }

  await target.keyboardPress('Escape');
  await clearAttachments();
  await openSecondaryViewer();
  await setViewerCamera({ position: [0.043, -0.031, 0.027], target: [0, 0, 0.005], fov: 42, zoom: 1 });
  await openScreenshotMenu();
  await target.click(selectors.getByRole('button', { name: 'secondary.ts', exact: true }));
  await waitForCaptureAttachments(1);
  const secondary = await readCaptureEvidence(attachment(0));
  const secondaryCaptureSize = await currentCaptureSize();
  expectAnnotated(secondary, 'image/webp', secondaryCaptureSize);
  expect(secondary.digest).not.toBe(second.digest);

  await clearAttachments();
  await target.drag(
    selectors.getByCss('.dv-tab[aria-label="src/secondary.ts"]'),
    selectors.getByCss('.tiptap[contenteditable="true"]'),
  );
  await waitForCaptureAttachments(1);
  const droppedSecondary = await readCaptureEvidence(attachment(0));
  expectAnnotated(droppedSecondary, 'image/webp', secondaryCaptureSize);
  expect(droppedSecondary.digest).toBe(secondary.digest);

  await clearAttachments();
  await target.setViewport({ width: 320, height: 844 });
  await target.click(
    selectors.getByTestId('chat-viewer-bottom-controls-overlay').getByCss('button:has(svg.lucide-settings)'),
  );
  await target.click(selectors.getByRole('menuitem', { name: 'Capture view to chat' }));
  await waitForCaptureAttachments(1);
  const mobileCaptureSize = await currentCaptureSize();
  expectAnnotated(await readCaptureEvidence(attachment(0)), 'image/webp', mobileCaptureSize);
  await target.expectHidden(selectors.getByRole('menuitem', { name: 'Capture view to chat' }));

  await clearAttachments();
  await target.click(selectors.getByRole('button', { name: 'Open chat options' }));
  await target.click(selectors.getByText('Current view'));
  await waitForCaptureAttachments(1);
  const mobileChatCapture = await readCaptureEvidence(attachment(0));
  expectAnnotated(mobileChatCapture, 'image/webp', [mobileChatCapture.width, mobileChatCapture.height]);
  expect(Math.max(mobileChatCapture.width, mobileChatCapture.height)).toBe(2400);
  await target.expectHidden(selectors.getByText('Current view'));

  await clearAttachments();
  await target.click(selectors.getByRole('button', { name: 'Open chat options' }));
  await target.click(selectors.getByText('Orthographic views x 6'));
  await waitForCaptureAttachments(6);
  const mobileViews: CaptureEvidence[] = [];
  for (let index = 0; index < 6; index++) {
    // oxlint-disable-next-line no-await-in-loop -- Every mobile batch artifact must be decoded.
    mobileViews.push(await readCaptureEvidence(attachment(index)));
  }
  expect(mobileViews.map(({ width, height }) => [width, height])).toEqual(
    Array.from({ length: 6 }, () => [1600, 1600]),
  );
  for (const view of mobileViews) {
    expectAnnotated(view, 'image/webp', [1600, 1600]);
  }

  await target.setViewport({ width: 1440, height: 960 });
  await openCommandPalette('Download PNG');
  const gltfDownload = await target.download(selectors.getByText('Download PNG', { exact: true }));
  expect(gltfDownload.suggestedFilename).toBe('Headless GLTF Capture E2E.png');
  const gltfDownloadEvidence = await readBase64CaptureEvidence(gltfDownload.base64, 'image/png');
  expect(gltfDownloadEvidence).toMatchObject({
    mimeType: 'image/png',
    encoding: 'png',
    width: mobileChatCapture.width,
    height: mobileChatCapture.height,
  });
  expect(hasDarkGrayBackground(gltfDownloadEvidence)).toBe(true);
  expect(gltfDownloadEvidence.modelPixels).toBeGreaterThan(100);

  expect(await readCaptureErrorToasts()).toEqual([]);
  await expectNoCaptureFailures(eventsBefore);
});

test('section captures preserve complete caps and positive-area overlap evidence', async () => {
  const eventsBefore = await eventOffsets();
  await seedVisionModel();
  await target.setViewport({ width: 1440, height: 960 });
  await target.navigate('/__e2e/headless-chat-image-capture?kind=section-overlap');
  await target.expectUrl(/\/w\/[^/]+\/[^/]+$/u, 60_000);
  await dismissCookies();
  await waitForRenderedGeometry('gltf');
  await setViewerCamera({ position: [0.14, -0.1, 0.075], target: [0, 0.006, 0.012], fov: 42, zoom: 1 });
  await withPresentationBridge('setPresentation', { surfaces: true, lines: true });
  await withPresentationBridge('setSectionView', { plane: 'yz', direction: 1, pivot: [0, 0, 0] });
  expect(await presentation()).toMatchObject({
    isSectionViewActive: true,
    selectedSectionViewId: 'yz',
    sectionViewDirection: 1,
    enableClippingLines: true,
    enableClippingMesh: true,
  });

  await target.click(selectors.getByRole('button', { name: 'Capture view to chat' }));
  await waitForCaptureAttachments(1);
  const captureSize = await currentCaptureSize();
  const toolbar = await readCaptureEvidence(attachment(0));
  const overlap = await readSectionColorEvidence(attachment(0));
  expectAnnotated(toolbar, 'image/webp', captureSize);
  expect(overlap.darkRed).toBeGreaterThan(100);
  expect(overlap.yellow).toBeGreaterThan(20);
  expect(overlap.cyanOrBlue).toBeGreaterThan(100);
  expect(overlap.black).toBeGreaterThan(100);

  await clearAttachments();
  await openScreenshotMenu();
  await target.click(selectors.getByRole('button', { name: 'Current view' }));
  await waitForCaptureAttachments(1);
  const fromAt = await readCaptureEvidence(attachment(0));
  expect(fromAt.digest).toBe(toolbar.digest);

  await clearAttachments();
  await withPresentationBridge('setSectionView', {
    plane: 'yz',
    direction: 1,
    rotationRadians: [0.2, -0.1, 0.15],
    pivot: [0, 0, 0],
    translation: 0.003,
  });
  await target.click(selectors.getByRole('button', { name: 'Capture view to chat' }));
  await waitForCaptureAttachments(1);
  const oblique = await readCaptureEvidence(attachment(0));
  const obliqueColors = await readSectionColorEvidence(attachment(0));
  expectAnnotated(oblique, 'image/webp', captureSize);
  expect(oblique.digest).not.toBe(toolbar.digest);
  expect(obliqueColors.darkRed).toBeGreaterThan(100);
  expect(obliqueColors.yellow).toBeGreaterThan(20);

  await clearAttachments();
  const overlapCyan = await componentId('Overlap cyan');
  await withPresentationBridge('hideModelComponent', overlapCyan);
  await target.click(selectors.getByRole('button', { name: 'Capture view to chat' }));
  await waitForCaptureAttachments(1);
  const hiddenColors = await readSectionColorEvidence(attachment(0));
  expect(hiddenColors.darkRed).toBeLessThan(overlap.darkRed * 0.1);
  expect(hiddenColors.yellow).toBeLessThan(overlap.yellow * 0.1);

  await clearAttachments();
  await withPresentationBridge('resetModelVisibility');
  await withPresentationBridge('isolateModelComponent', overlapCyan);
  await target.click(selectors.getByRole('button', { name: 'Capture view to chat' }));
  await waitForCaptureAttachments(1);
  const isolatedColors = await readSectionColorEvidence(attachment(0));
  expect(isolatedColors.darkRed).toBeLessThan(overlap.darkRed * 0.1);
  expect(isolatedColors.yellow).toBeLessThan(overlap.yellow * 0.1);

  expect(await readCaptureErrorToasts()).toEqual([]);
  await expectNoCaptureFailures(eventsBefore);
});

test('capture edges retain the shared 800-pixel reference through the attachment modal', async () => {
  const eventsBefore = await eventOffsets();
  await seedVisionModel();
  await target.setViewport({ width: 1440, height: 960 });
  await target.navigate('/__e2e/headless-chat-image-capture?kind=edge');
  await target.expectUrl(/\/w\/[^/]+\/[^/]+$/u, 60_000);
  await dismissCookies();
  await waitForRenderedGeometry('gltf');
  await setViewerCamera({ position: [-0.000_02, 0, 0.3], target: [-0.000_02, 0, 0.002], fov: 35, zoom: 1 });

  await withPresentationBridge('setPresentation', { surfaces: true, lines: true });
  await target.click(selectors.getByRole('button', { name: 'Capture view to chat' }));
  await waitForCaptureAttachments(1);
  const currentSize = await currentCaptureSize();
  const toolbarCurrent = await readCaptureEvidence(attachment(0));
  expectAnnotated(toolbarCurrent, 'image/webp', currentSize);
  const currentWithLines = await attachmentSource(0);
  await target.click(selectors.getByRole('button', { name: 'Open uploaded image 1' }));
  const preview = selectors.getByRole('dialog').getByAltText('Uploaded 1');
  await target.expectVisible(preview);
  const previewBox = await target.boundingBox(preview);
  if (!previewBox) {
    throw new Error('Attachment modal image has no rendered box');
  }
  await target.keyboardPress('Escape');

  await clearAttachments();
  await openScreenshotMenu();
  await target.click(selectors.getByRole('button', { name: 'Current view' }));
  await waitForCaptureAttachments(1);
  const atCurrent = await readCaptureEvidence(attachment(0));
  expectAnnotated(atCurrent, 'image/webp', currentSize);
  expect(atCurrent.digest).toBe(toolbarCurrent.digest);

  await clearAttachments();
  await withPresentationBridge('setPresentation', { surfaces: false, lines: false });
  await target.click(selectors.getByRole('button', { name: 'Capture view to chat' }));
  await waitForCaptureAttachments(1);
  const currentWithoutLines = await attachmentSource(0);
  const currentCoverage = await readLineCoverageEvidence(currentWithLines, currentWithoutLines);
  expect(Math.abs(currentCoverage.straight - 3), JSON.stringify(currentCoverage)).toBeLessThan(0.35);
  expect(Math.abs(currentCoverage.diagonal - 3), JSON.stringify(currentCoverage)).toBeLessThan(0.35);
  const displayedCoverage = await readLineCoverageEvidence(currentWithLines, currentWithoutLines, previewBox);
  expect(displayedCoverage.straight, JSON.stringify(displayedCoverage)).toBeGreaterThan(0.1);
  expect(displayedCoverage.diagonal, JSON.stringify(displayedCoverage)).toBeGreaterThan(0.1);

  await clearAttachments();
  await withPresentationBridge('setPresentation', { surfaces: true, lines: false });
  await openScreenshotMenu();
  await target.click(selectors.getByRole('button', { name: 'Orthographic views x 6' }));
  await waitForCaptureAttachments(6);
  const topWithoutLines = await attachmentSource(4);

  await clearAttachments();
  await withPresentationBridge('setPresentation', { surfaces: true, lines: true });
  await openScreenshotMenu();
  await target.click(selectors.getByRole('button', { name: 'Orthographic views x 6' }));
  await waitForCaptureAttachments(6);
  const topWithLines = await attachmentSource(4);
  const canonicalCoverage = await readLineCoverageEvidence(topWithLines, topWithoutLines);
  expect(Math.abs(canonicalCoverage.straight - 3), JSON.stringify(canonicalCoverage)).toBeLessThan(0.35);
  expect(Math.abs(canonicalCoverage.diagonal - 3), JSON.stringify(canonicalCoverage)).toBeLessThan(0.35);

  expect(await readCaptureErrorToasts()).toEqual([]);
  await expectNoCaptureFailures(eventsBefore);
});

test('SVG toolbar, desktop, and mobile actions use real resvg', async () => {
  const eventsBefore = await eventOffsets();
  await seedVisionModel();
  await target.setViewport({ width: 1440, height: 960 });
  await target.navigate('/__e2e/headless-chat-image-capture?kind=svg');
  await target.expectUrl(/\/w\/[^/]+\/[^/]+$/u, 60_000);
  await dismissCookies();
  await target.expectVisible(selectors.getByRole('button', { name: 'Capture view to chat' }), 60_000);
  await waitForRenderedGeometry('svg');

  await target.click(selectors.getByRole('button', { name: 'Capture view to chat' }));
  await waitForCaptureAttachments(1);
  expectAnnotated(await readCaptureEvidence(attachment(0)), 'image/png', [2400, 1350]);

  await clearAttachments();
  await openScreenshotMenu();
  const orthographicAction = await target.read(selectors.getByRole('button', { name: 'Orthographic views x 6' }));
  expect(orthographicAction.count).toBe(0);
  await target.click(selectors.getByRole('button', { name: 'Current view' }));
  await waitForCaptureAttachments(1);
  expectAnnotated(await readCaptureEvidence(attachment(0)), 'image/png', [2400, 1350]);

  await clearAttachments();
  await target.setViewport({ width: 390, height: 844 });
  await target.click(selectors.getByRole('button', { name: 'Open chat options' }));
  await target.click(selectors.getByText('Current view'));
  await waitForCaptureAttachments(1);
  expectAnnotated(await readCaptureEvidence(attachment(0)), 'image/png', [2400, 1350]);

  await target.setViewport({ width: 1440, height: 960 });
  await openCommandPalette('Download PNG');
  const svgDownload = await target.download(selectors.getByText('Download PNG', { exact: true }));
  expect(svgDownload.suggestedFilename).toBe('Headless SVG Capture E2E.png');
  const svgDownloadEvidence = await readBase64CaptureEvidence(svgDownload.base64, 'image/png');
  expect(svgDownloadEvidence).toMatchObject({ mimeType: 'image/png', encoding: 'png', width: 2400, height: 1350 });
  expect(hasDarkGrayBackground(svgDownloadEvidence)).toBe(true);
  expect(svgDownloadEvidence.modelPixels).toBeGreaterThan(100);

  expect(await readCaptureErrorToasts()).toEqual([]);
  await expectNoCaptureFailures(eventsBefore);
});

test('capture retains one image worker and warm GPU resources beyond the former idle timeout', async () => {
  const eventsBefore = await eventOffsets();
  await seedVisionModel();
  await installWorkerTracking();
  await target.navigate('/__e2e/headless-chat-image-capture');
  await target.expectUrl(/\/w\/[^/]+\/[^/]+$/u, 60_000);
  await dismissCookies();
  await waitForRenderedGeometry('gltf');

  await target.click(selectors.getByRole('button', { name: 'Capture view to chat' }));
  await waitForCaptureAttachments(1);
  const first = await readCaptureEvidence(attachment(0));
  await target.delay(60_100);

  await clearAttachments();
  await setViewerCamera({ position: [0.105, -0.125, 0.082], target: [0, 0, 0.006], fov: 47, zoom: 1.1 });
  await target.evaluate(() => {
    (
      globalThis as typeof globalThis & { __TAU_HEADLESS_IMAGE_DEBUG__?: { reset(): void } }
    ).__TAU_HEADLESS_IMAGE_DEBUG__?.reset();
  });
  await target.click(selectors.getByRole('button', { name: 'Capture view to chat' }));
  await waitForCaptureAttachments(1);
  const second = await readCaptureEvidence(attachment(0));
  expect(second.digest).not.toBe(first.digest);
  const workerNames = await target.evaluate(
    () => (globalThis as typeof globalThis & { __TAU_E2E_WORKER_NAMES__?: string[] }).__TAU_E2E_WORKER_NAMES__ ?? [],
  );
  expect(workerNames.filter((name) => name === 'tau-headless-image-transcoder-worker')).toHaveLength(1);
  expect(workerNames).not.toContain('tau-headless-image-runtime-worker');
  const records = await imageDebugRecords();
  expect(records.find(({ name }) => name === 'worker.ready')?.detail).toMatchObject({ cold: false });
  const runtimeRecord = records.find(({ name }) => name === 'runtime.transcode');
  expect(runtimeRecord?.detail['inputBytes']).toBeGreaterThan(0);
  const telemetry = runtimeRecord?.detail['telemetry'] as
    | ReadonlyArray<{ readonly name: string; readonly detail?: Readonly<Record<string, unknown>> }>
    | undefined;
  expect(telemetry?.find(({ name }) => name === 'kernel.transcode')).toBeDefined();
  expect(telemetry?.find(({ name }) => name === 'image.render')?.detail).toMatchObject({
    adapterDeviceRequests: 0,
    pipelineSets: 0,
    success: true,
  });
  expect(await readCaptureErrorToasts()).toEqual([]);
  await expectNoCaptureFailures(eventsBefore);
});

test('capture attachment waiting fails immediately on a terminal service toast', async () => {
  await target.evaluate(() => {
    const toast = document.createElement('div');
    toast.dataset['sonnerToast'] = '';
    toast.dataset['type'] = 'error';
    toast.textContent = 'HeadlessImageService is disposed';
    document.body.append(toast);
  });

  await expect(waitForCaptureAttachments(1)).rejects.toThrow('HeadlessImageService is disposed');
});
