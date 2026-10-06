import * as THREE from 'three';
import { createRenderer } from '#components/geometry/graphics/three/renderer.js';
import { printerPreparation } from '#components/printer/printer-preparation.js';
import {
  createToolpathReveal,
  createToolpathPalette,
  updateToolpathReveal,
  setToolpathAppearance,
} from '#components/printer/printer-toolpath.js';
import '#styles/global.css';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { commands, page, userEvent } from 'vitest/browser';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { useCallback } from 'react';
import { mock } from 'vitest-mock-extended';
import { writeBambuContainer } from '@taucad/slicer/container';
import { parseGcode } from '@taucad/slicer/toolpath';
import { TooltipProvider } from '@taucad/ui/components/tooltip';
import { FileContentService } from '@taucad/fs-client/file-content-service';
import type { ComposedViewClient } from '@taucad/fs-client/composed-view-client';
import { RefreshGenerationGuard } from '@taucad/fs-client/refresh-generation-guard';
import { WorkerChangeChannel } from '@taucad/fs-client/worker-change-channel';
import { WorkspacePathResolver } from '@taucad/fs-client/workspace-path-resolver';
import { probeWebGpuSupport } from '#components/geometry/graphics/graphics-backend.js';
import type { PrinterFileKind } from '#components/printer/printer-file.js';
import { fixtureGcode } from '#components/printer/testing/toolpath-fixture.js';
import type { PrinterLiveState } from '#components/printer/use-printer-live.js';
import { a1MiniManifest } from '#components/print/testing/machines.fixture.js';
import { useFileContent } from '#hooks/use-file-content.js';
import type { FileViewerPaneContent } from '#routes/w.$workspace.$project/file-viewers/file-viewer.types.js';

/**
 * Framing evidence for the printer simulation scene: the plate-focus view
 * framed wide and in a narrow pane, light and dark, the pane from the manual
 * dry run, a zoom the person made surviving a resize until they frame the
 * print again, the viewer following a live run, the part alone with the
 * preparation hidden, the whole printer, each X1C plate, the preparation on
 * the gold plate and a dark one, and a two-colour print in its own filaments.
 * The print's extent is measured from the rendered pixels; PNGs land under
 * `out/research/.../V/`.
 */

const mocks = vi.hoisted(() => ({
  theme: 'light' as 'light' | 'dark',
  backend: 'webgl' as 'webgl' | 'webgpu',
  live: undefined as PrinterLiveState | undefined,
}));
const fileManager = vi.hoisted(() => ({ contentService: undefined as FileContentService | undefined }));

vi.mock('#hooks/use-theme.js', () => ({ useTheme: () => ({ theme: mocks.theme }) }));
vi.mock('#components/printer/use-printer-live.js', () => ({ usePrinterLive: () => mocks.live }));
vi.mock('#hooks/use-file-manager.js', () => ({ useFileManager: () => fileManager }));

const { PrinterViewer } = await import('#components/printer/printer-viewer.js');

const evidenceDirectory = '../../../../../out/research/gcode-extrusion-rendering-blueprint/implementation/screenshots';
const name = 'bracket.gcode.3mf';
// A 50 mm square tube, 24 mm tall: about the size of the dry run's pyramid.
const container = writeBambuContainer({
  gcode: fixtureGcode({ layers: 120, size: 50 }),
  modelName: 'bracket',
  plate: 'textured-pei',
});
const readAll = async (): Promise<Uint8Array<ArrayBuffer>> => container;
type PrinterFile = Readonly<{ name: string; kind: PrinterFileKind; readAll: () => Promise<Uint8Array<ArrayBuffer>> }>;
const bracket: PrinterFile = { name, kind: 'container', readAll };
const renderPane = ({ actions, body }: FileViewerPaneContent): React.ReactNode => (
  <div data-testid='frame' className='flex flex-col bg-background' style={{ width: '1280px', height: '720px' }}>
    <header
      role='group'
      aria-label={`File actions for ${name}`}
      className='flex h-9 shrink-0 items-center justify-end border-b border-border/70 px-2'
    >
      {actions}
    </header>
    <div className='min-h-0 flex-1'>{body}</div>
  </div>
);

function PrinterFromFileContentService(): React.JSX.Element {
  const result = useFileContent(name);
  const service = fileManager.contentService;
  const readBytes = useCallback(async (): Promise<Uint8Array<ArrayBuffer>> => {
    if (result.kind !== 'binary' || !service) {
      throw new Error('Toolpath bytes are unavailable');
    }
    return service.readRawBytes(name, { sizeLimit: result.size });
  }, [result, service]);
  if (result.kind !== 'binary') {
    return <span>Loading file…</span>;
  }
  return (
    <TooltipProvider>
      <PrinterViewer
        name={name}
        kind='container'
        revision={result.revision}
        readAll={readBytes}
        renderPane={renderPane}
      />
    </TooltipProvider>
  );
}

// oxlint-disable-next-line tau-lint/no-hardcoded-color -- the `#RRGGBB` a machine reports for its loaded spool
const loadedSpoolColor = '#E0523C';

/** A bound machine with a red spool loaded and nothing printing: the scene takes the spool's colour. */
const idleLive: PrinterLiveState = {
  machineId: 'machine-1',
  machineName: 'Workshop X1C',
  runState: undefined,
  isActive: false,
  printsThisFile: false,
  position: {},
  chamberLight: 'on',
  nozzleTarget: undefined,
  bedTarget: undefined,
  filamentColor: loadedSpoolColor,
  manifest: undefined,
};

const printingLive: PrinterLiveState = {
  ...idleLive,
  runState: 'running',
  isActive: true,
  printsThisFile: true,
  position: { currentLayer: 70, totalLayers: 120, progress: 58 },
  nozzleTarget: 250,
  bedTarget: 65,
};

const nextFrames = async (count: number): Promise<void> =>
  new Promise<void>((resolve) => {
    let remaining = count;
    const tick = (): void => {
      remaining -= 1;
      if (remaining <= 0) {
        resolve();
        return;
      }
      requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  });

/** The print's extent in the scene canvas, as fractions of its width and height. */
type PrintExtent = Readonly<{
  left: number;
  right: number;
  top: number;
  bottom: number;
  width: number;
  /** The mean column of the print's pixels. */
  centre: number;
}>;

/** Whether one pixel is the print's colour. */
type PrintInk = (red: number, green: number, blue: number) => boolean;

/**
 * A red print, such as the loaded spool's: pixels far redder than green or blue.
 * The purge line, trail and machine are not.
 */
const isRed: PrintInk = (red, green, blue) => red > 110 && red > green * 1.6 && red > blue * 1.6;
/** A blue print: pixels far bluer than red or green. */
const isBlue: PrintInk = (red, green, blue) => blue > 110 && blue > red * 1.6 && blue > green * 1.6;

/** Find the print, red unless told otherwise, in a screenshot of the scene. */
const measurePrint = async (scene: HTMLElement, isInk: PrintInk = isRed): Promise<PrintExtent> => {
  const base64 = await page.screenshot({ element: scene, save: false });
  const response = await fetch(`data:image/png;base64,${base64}`);
  const bitmap = await createImageBitmap(await response.blob());
  const context = new OffscreenCanvas(bitmap.width, bitmap.height).getContext('2d');
  if (!context) {
    throw new Error('No 2D context to read the screenshot');
  }
  context.drawImage(bitmap, 0, 0);
  const { data, width, height } = context.getImageData(0, 0, bitmap.width, bitmap.height);
  // The G-code legend's swatches share the print's colours; its area over the scene is not the print.
  const sceneBounds = scene.getBoundingClientRect();
  const legendBounds = screen.getByRole('region', { name: 'G-code filter' }).getBoundingClientRect();
  const scale = width / sceneBounds.width;
  const isLegend = (x: number, y: number): boolean =>
    x >= (legendBounds.left - sceneBounds.left) * scale &&
    x <= (legendBounds.right - sceneBounds.left) * scale &&
    y >= (legendBounds.top - sceneBounds.top) * scale &&
    y <= (legendBounds.bottom - sceneBounds.top) * scale;
  let [left, right, top, bottom, count, columns] = [width, -1, height, -1, 0, 0];
  for (let pixel = 0; pixel < width * height; pixel += 1) {
    const [x, y] = [pixel % width, Math.floor(pixel / width)];
    if (isInk(data[pixel * 4]!, data[pixel * 4 + 1]!, data[pixel * 4 + 2]!) && !isLegend(x, y)) {
      [left, right, top, bottom] = [Math.min(left, x), Math.max(right, x), Math.min(top, y), Math.max(bottom, y)];
      [count, columns] = [count + 1, columns + x];
    }
  }
  expect(right, 'the print shows in the scene').toBeGreaterThan(left);
  return {
    left: left / width,
    right: (right + 1) / width,
    top: top / height,
    bottom: (bottom + 1) / height,
    width: (right + 1 - left) / width,
    centre: (columns / count + 0.5) / width,
  };
};

/** Framed: whole, clear of the canvas edges, centred across, and at least `share` of the width. */
const expectFramed = (extent: PrintExtent, share: number): void => {
  expect(extent.width).toBeGreaterThanOrEqual(share);
  expect(extent.left).toBeGreaterThan(0.02);
  expect(extent.right).toBeLessThan(0.98);
  expect(extent.top).toBeGreaterThan(0.02);
  expect(extent.bottom).toBeLessThan(0.98);
  expect(Math.abs((extent.left + extent.right) / 2 - 0.5)).toBeLessThan(0.15);
};

const mount = async (
  theme: 'light' | 'dark',
  size: readonly [number, number],
  file: PrinterFile = bracket,
): Promise<{ frame: HTMLElement; scene: HTMLElement; unmount: () => void }> => {
  mocks.theme = theme;
  document.documentElement.classList.toggle('dark', theme === 'dark');
  globalThis.history.replaceState(undefined, '', `?graphicsBackend=${mocks.backend}`);
  await page.viewport(1320, 780);
  const { container: root, unmount } = render(
    <TooltipProvider>
      <PrinterViewer name={file.name} kind={file.kind} revision={1} readAll={file.readAll} renderPane={renderPane} />
    </TooltipProvider>,
  );
  await within(root).findByRole('region', { name: `Printer simulation: ${file.name}` }, { timeout: 10_000 });
  const frame = within(root).getByTestId('frame');
  resize(frame, size);
  await nextFrames(6);
  return {
    frame,
    unmount,
    scene: within(frame).getByRole('img', {
      name: `${mocks.live?.manifest?.identity.displayName ?? 'Bambu Lab X1 Carbon'} printing ${file.name}`,
    }),
  };
};

const resize = (frame: HTMLElement, [width, height]: readonly [number, number]): void => {
  frame.style.width = `${width}px`;
  frame.style.height = `${height}px`;
};

/** Seek the paused preview, which opens on the finished print, to a time share and wait for the HUD's layer to reach it. */
const pauseAt = async (frame: HTMLElement, share: number, layer: RegExp): Promise<void> => {
  const controls = within(frame).getByRole('group', { name: 'Playback controls' });
  expect(within(controls).getByRole('button', { name: 'Play' })).toBeInTheDocument();
  const time = within(controls).getByRole('slider', { name: 'Time' });
  fireEvent.change(time, { target: { value: String(Math.round(Number(time.getAttribute('max')) * share)) } });
  const hud = within(frame).getByRole('region', { name: 'Print HUD' });
  await waitFor(() => {
    expect(within(hud).getByText('Layer').nextElementSibling?.textContent).toMatch(layer);
  });
  await nextFrames(6);
};

/** Pick one item from the pane's More menu. */
const chooseFromMore = async (
  frame: HTMLElement,
  role: 'menuitem' | 'menuitemcheckbox' | 'menuitemradio',
  name: string,
) => {
  await userEvent.click(within(frame).getByRole('button', { name: 'More' }));
  await userEvent.click(await screen.findByRole(role, { name }));
  // Closing the menu returns focus to its button, whose tooltip would cover the filter in the capture.
  if (document.activeElement instanceof HTMLElement) {
    document.activeElement.blur();
  }
  await nextFrames(60);
};

const capture = async (frame: HTMLElement, file: string): Promise<void> => {
  const path = await page.screenshot({ element: frame, path: `${evidenceDirectory}/${file}` });
  expect(path).toContain(file);
};

afterEach(() => {
  cleanup();
  mocks.live = undefined;
  mocks.backend = 'webgl';
  document.documentElement.classList.remove('dark');
});

describe('Printer viewer framing', () => {
  it('should keep a live .gcode.3mf scene and playback through an unchanged file refresh', async () => {
    mocks.theme = 'light';
    mocks.live = idleLive;
    document.documentElement.classList.remove('dark');
    globalThis.history.replaceState(undefined, '', `?graphicsBackend=${mocks.backend}`);
    await page.viewport(1320, 780);
    const proxy = mock<ComposedViewClient>({
      stat: vi.fn().mockResolvedValue({ size: container.byteLength }),
      readFile: vi.fn().mockImplementation(async () => new Uint8Array(container)),
    });
    let emitFileChanged: (event: unknown) => void = () => undefined;
    const channel = new WorkerChangeChannel({
      transport: {
        listen: (_event, callback) => {
          emitFileChanged = callback;
          return () => undefined;
        },
      },
    });
    const service = new FileContentService({
      proxy,
      paths: new WorkspacePathResolver('/project'),
      channel,
      refreshGuard: new RefreshGenerationGuard(),
    });
    fileManager.contentService = service;
    const digest = vi.spyOn(globalThis.crypto.subtle, 'digest');
    try {
      const { container: root } = render(<PrinterFromFileContentService />);
      const frame = await within(root).findByTestId('frame');
      resize(frame, [570, 720]);
      const scene = await within(frame).findByRole(
        'img',
        { name: `Bambu Lab X1 Carbon printing ${name}` },
        { timeout: 10_000 },
      );
      await pauseAt(frame, 0.55, /^6\d \/ 120$/u);
      const canvas = scene.querySelector('canvas');
      const before = within(frame).getByRole('slider', { name: 'Time' }).getAttribute('value');
      const firstOutcome = service.peekOutcome(name);

      emitFileChanged({ type: 'fileWritten', path: name, backend: 'indexeddb' });
      await waitFor(() => {
        expect(proxy.readFile).toHaveBeenCalledTimes(2);
        expect(digest).toHaveBeenCalledTimes(3);
      });
      await act(async () => {
        await digest.mock.results[2]!.value;
        await new Promise((resolve) => {
          setTimeout(resolve, 0);
        });
      });
      await nextFrames(6);

      expect(service.peekOutcome(name)).toBe(firstOutcome);
      expect(within(frame).getByRole('img', { name: `Bambu Lab X1 Carbon printing ${name}` })).toBe(scene);
      expect(scene.querySelector('canvas')).toBe(canvas);
      expect(within(frame).getByRole('slider', { name: 'Time' })).toHaveAttribute('value', before);
      await page.screenshot({
        element: frame,
        path: '../../../../../out/research/live-file-pane-stability-blueprint/2026-09-28/I3/printer-noop-refresh.png',
      });
    } finally {
      fileManager.contentService = undefined;
      service.dispose();
      channel.dispose();
    }
  });

  for (const theme of ['light', 'dark'] as const) {
    it(`frames the print wide, then again when the pane narrows to 570 px, in ${theme}`, async () => {
      mocks.live = idleLive;
      const { frame, scene } = await mount(theme, [1280, 720]);
      await pauseAt(frame, 0.55, /^6\d \/ 120$/u);
      await capture(frame, `plate-focus-1280-${theme}.png`);
      expectFramed(await measurePrint(scene), 0.1);

      resize(frame, [570, 720]);
      await nextFrames(8);
      await capture(frame, `plate-focus-570-${theme}.png`);
      expectFramed(await measurePrint(scene), 0.1);
    });
  }

  it('frames the print in the 420 px pane from the manual dry run', async () => {
    mocks.live = idleLive;
    const { frame, scene } = await mount('dark', [420, 710]);
    await pauseAt(frame, 0.55, /^6\d \/ 120$/u);
    await capture(frame, 'printer-420-dark.png');
    expectFramed(await measurePrint(scene), 0.1);
  });

  it("keeps the person's zoom across a resize until they frame the print again", async () => {
    mocks.live = idleLive;
    const { frame, scene } = await mount('light', [570, 720]);
    await pauseAt(frame, 0.55, /^6\d \/ 120$/u);
    const framed = await measurePrint(scene);
    expectFramed(framed, 0.1);

    // Zoom out with the wheel until the print is clearly smaller than framed; each step settles before the next.
    let zoomed = framed;
    for (let attempt = 0; attempt < 10 && zoomed.width > framed.width * 0.6; attempt += 1) {
      const bounds = scene.getBoundingClientRect();
      // The camera listens on the canvas's own wrapper; a canvas has no role to query it by.
      fireEvent.wheel(scene.querySelector('canvas')!, {
        deltaY: 40,
        clientX: bounds.left + bounds.width / 2,
        clientY: bounds.top + bounds.height / 2,
      });
      // oxlint-disable-next-line no-await-in-loop -- the camera moves between steps; measuring needs each settled
      await nextFrames(40);
      // oxlint-disable-next-line no-await-in-loop -- as above: one measurement per settled step
      zoomed = await measurePrint(scene);
    }
    expect(zoomed.width).toBeLessThan(framed.width * 0.6);

    resize(frame, [640, 720]);
    await nextFrames(40);
    const afterResize = await measurePrint(scene);
    expect(afterResize.width, 'a resize leaves the zoom alone').toBeLessThan(framed.width * 0.8);

    await chooseFromMore(frame, 'menuitem', 'Frame the print');
    const reframed = await measurePrint(scene);
    expectFramed(reframed, 0.1);
    expect(reframed.width).toBeGreaterThan(afterResize.width);
    await capture(frame, 'printer-reframed-light.png');
  });

  it('centres the finished part as the CAD viewer does and holds still while it prints', async () => {
    mocks.live = idleLive;
    const { frame, scene } = await mount('dark', [1280, 720]);
    // The preview opens on the finished print: the whole part, centred in the pane on both axes.
    const finished = await measurePrint(scene);
    await capture(frame, 'plate-focus-finished-dark.png');
    expectFramed(finished, 0.1);
    expect(Math.abs((finished.left + finished.right) / 2 - 0.5), 'centred across the pane').toBeLessThan(0.01);
    expect(Math.abs((finished.top + finished.bottom) / 2 - 0.5), 'centred down the pane').toBeLessThan(0.01);

    // Earlier in the run, and with the preparation hidden, the part stands in the same place: the camera never moved.
    await pauseAt(frame, 0.3, /^3\d \/ 120$/u);
    const midway = await measurePrint(scene);
    const filter = within(frame).getByRole('region', { name: 'G-code filter' });
    await userEvent.click(within(filter).getByRole('checkbox', { name: 'Preparation' }));
    await nextFrames(60);
    const filtered = await measurePrint(scene);
    for (const extent of [midway, filtered]) {
      // The base stands where it did; the sides narrow a little only because a shorter part's top is nearer the eye.
      expect(extent.bottom).toBeCloseTo(finished.bottom, 2);
      expect(Math.abs(extent.left - finished.left)).toBeLessThan(0.03);
      expect(Math.abs(extent.right - finished.right)).toBeLessThan(0.03);
    }
  });

  it('shades the plate from below so the print shows through it', async () => {
    mocks.live = idleLive;
    const { frame, scene } = await mount('light', [1280, 720]);
    // Orbit under the plate: a real upward drag across the scene takes the camera to the underside.
    const { width, height } = scene.getBoundingClientRect();
    await userEvent.dragAndDrop(scene, scene, {
      sourcePosition: { x: width / 2, y: height * 0.9 },
      targetPosition: { x: width / 2, y: height * 0.05 },
    });
    await nextFrames(60);
    await capture(frame, 'plate-underside-light.png');
    const extent = await measurePrint(scene);
    expect(extent.width, 'the finished print shows through the plate').toBeGreaterThan(0.05);
  });

  it('draws Mini’s own thin pierced sheet and restricts its plate menu', async () => {
    mocks.live = { ...idleLive, machineName: 'Mini', manifest: a1MiniManifest };
    const { frame, scene } = await mount('dark', [1280, 720]);
    await pauseAt(frame, 0.55, /^6\d \/ 120$/u);
    await userEvent.click(within(frame).getByRole('button', { name: 'More' }));
    expect(await screen.findByRole('menuitemradio', { name: 'Textured PEI Plate' })).toBeVisible();
    expect(screen.getByRole('menuitemradio', { name: 'Smooth PEI Plate' })).toBeVisible();
    expect(screen.queryByRole('menuitemradio', { name: 'Cool Plate' })).toBeNull();
    await userEvent.click(screen.getByRole('menuitemradio', { name: 'Textured PEI Plate' }));
    await nextFrames(60);
    await capture(frame, 'a1-mini-textured-pei-dark.png');
    expectFramed(await measurePrint(scene), 0.1);
    await chooseFromMore(frame, 'menuitemcheckbox', 'Show the whole printer');
    await capture(frame, 'a1-mini-whole-printer-dark.png');
    expectFramed(await measurePrint(scene), 0.05);
  });

  for (const theme of ['light', 'dark'] as const) {
    for (const mini of [false, true]) {
      it(`qualifies ${mini ? 'Mini' : 'X1C'} mechanical and part views in ${theme}`, async () => {
        mocks.live = mini ? { ...idleLive, machineName: 'Mini', manifest: a1MiniManifest } : idleLive;
        const { frame, scene } = await mount(theme, [1280, 720]);
        await pauseAt(frame, 0.55, /^6\d \/ 120$/u);
        const printer = mini ? 'mini' : 'x1c';
        await capture(frame, `${printer}-part-${theme}.png`);
        await chooseFromMore(frame, 'menuitemcheckbox', 'Show the whole printer');
        await capture(frame, `${printer}-mechanical-${theme}.png`);
        if (mini) {
          await userEvent.click(within(frame).getByRole('button', { name: 'More' }));
          expect(screen.queryByRole('menuitemcheckbox', { name: 'Show enclosure' })).toBeNull();
          await userEvent.keyboard('{Escape}');
        } else {
          await chooseFromMore(frame, 'menuitemcheckbox', 'Show enclosure');
          await capture(frame, `${printer}-without-enclosure-${theme}.png`);
        }
        await chooseFromMore(frame, 'menuitemradio', mini ? 'Smooth PEI Plate' : 'High Temp Plate');
        await capture(frame, `${printer}-smooth-mechanical-${theme}.png`);
        await chooseFromMore(frame, 'menuitemcheckbox', 'Show the whole printer');
        const { width, height } = scene.getBoundingClientRect();
        await userEvent.dragAndDrop(scene, scene, {
          sourcePosition: { x: width / 2, y: height * 0.9 },
          targetPosition: { x: width / 2, y: height * 0.05 },
        });
        await nextFrames(60);
        // The person deliberately orbits out of the automatic framing view; zoom out to keep the part whole.
        const bounds = scene.getBoundingClientRect();
        fireEvent.wheel(scene.querySelector('canvas')!, {
          deltaY: 100,
          clientX: bounds.left + bounds.width / 2,
          clientY: bounds.top + bounds.height / 2,
        });
        await nextFrames(60);
        await capture(frame, `${printer}-below-${theme}.png`);
        expectFramed(await measurePrint(scene), 0.05);
      });
    }
  }

  for (const [mini, plate] of [
    [true, 'Smooth PEI Plate'],
    [false, 'Cool Plate'],
    [false, 'Engineering Plate'],
  ] as const) {
    it(`announces an unavailable ${mini ? 'Mini' : 'X1C'} ${plate} and preserves its pierced stand-in`, async () => {
      const failure = vi.spyOn(GLTFLoader.prototype, 'loadAsync').mockRejectedValue(new Error('Asset unavailable'));
      try {
        mocks.live = mini ? { ...idleLive, machineName: 'Mini', manifest: a1MiniManifest } : idleLive;
        const { frame } = await mount('light', [1280, 720]);
        await pauseAt(frame, 0.55, /^6\d \/ 120$/u);
        await chooseFromMore(frame, 'menuitemradio', plate);
        await waitFor(() => {
          expect(screen.getByRole('status', { name: 'Build plate preview' })).toHaveTextContent('schematic plate');
        });
        await capture(frame, `failed-${mini ? 'mini' : 'x1c'}-${plate.toLowerCase().replaceAll(' ', '-')}.png`);
      } finally {
        failure.mockRestore();
      }
    });
  }

  for (const mini of [false, true]) {
    it(`renders ${mini ? 'Mini' : 'X1C'} grain and translucent hardware with WebGPU`, async () => {
      expect(await probeWebGpuSupport(), 'WebGPU qualification requires an actual adapter').toBe(true);
      mocks.backend = 'webgpu';
      mocks.live = mini ? { ...idleLive, machineName: 'Mini', manifest: a1MiniManifest } : idleLive;
      const { frame, scene } = await mount('dark', [1280, 720]);
      await pauseAt(frame, 0.55, /^6\d \/ 120$/u);
      expect(scene.querySelector('[data-graphics-backend="webgpu"]')).not.toBeNull();
      expectFramed(await measurePrint(scene), 0.1);
      await capture(frame, `${mini ? 'mini' : 'x1c'}-part-webgpu.png`);
      await chooseFromMore(frame, 'menuitemcheckbox', 'Show the whole printer');
      await capture(frame, `${mini ? 'mini' : 'x1c'}-mechanical-webgpu.png`);
      expectFramed(await measurePrint(scene), 0.035);
    });
  }

  it('loads a fresh plate after switching Mini Smooth to Textured and back', async () => {
    const loads = vi.spyOn(GLTFLoader.prototype, 'loadAsync');
    try {
      mocks.live = { ...idleLive, machineName: 'Mini', manifest: a1MiniManifest };
      const { frame, scene } = await mount('dark', [1280, 720]);
      await pauseAt(frame, 0.55, /^6\d \/ 120$/u);
      await chooseFromMore(frame, 'menuitemradio', 'Smooth PEI Plate');
      await chooseFromMore(frame, 'menuitemradio', 'Textured PEI Plate');
      await chooseFromMore(frame, 'menuitemradio', 'Smooth PEI Plate');
      await waitFor(() => {
        expect(screen.queryByRole('status', { name: 'Build plate preview' })).toBeNull();
      });
      const smoothLoads = loads.mock.calls.filter(([url]) => url.includes('a1-mini-high-temperature'));
      expect(smoothLoads).toHaveLength(2);
      expectFramed(await measurePrint(scene), 0.1);
      await capture(frame, 'mini-smooth-reselected.png');
    } finally {
      loads.mockRestore();
    }
  });

  for (const mini of [false, true]) {
    it(`captures ${mini ? 'Mini' : 'X1C'} mechanical travel limits and side views`, async () => {
      mocks.live = mini ? { ...idleLive, machineName: 'Mini', manifest: a1MiniManifest } : idleLive;
      const extent = mini ? 180 : 256;
      // Diagnostic motion only; this deliberately sparse fixture is never sent to a printer.
      const gcode = [
        'G90',
        'M83',
        'M104 S220',
        'G92 X0 Y0 Z0.2 E0',
        ';LAYER_CHANGE',
        ';Z:0.2',
        ';TYPE:Outer wall',
        `G1 X${extent} Y0 Z0.2 E1 F60`,
        ';LAYER_CHANGE',
        `;Z:${extent}`,
        `G1 X${extent} Y${extent} Z${extent} E1 F600`,
      ].join('\n');
      const motion = parseGcode(gcode);
      expect(motion.segmentCount).toBe(2);
      expect(motion.times[1]).toBeCloseTo(extent, 3);
      const file: PrinterFile = {
        name: 'mechanical-travel.gcode',
        kind: 'gcode',
        readAll: async () => new TextEncoder().encode(gcode),
      };
      const { frame, scene } = await mount('light', [1280, 720], file);
      await chooseFromMore(frame, 'menuitemcheckbox', 'Show the whole printer');
      if (!mini) {
        await chooseFromMore(frame, 'menuitemcheckbox', 'Show enclosure');
      }
      const time = within(frame).getByRole('slider', { name: 'Time' });
      // Times are [start, end] pairs, not one boundary per segment. The first X move
      // takes approximately integer seconds; range rounding stays within 0.001 mm of its endpoint.
      const poses = [0, Math.round(motion.times[1]!), Math.ceil(motion.duration)];
      for (const [index, label] of ['home', 'x-limit', 'yz-limit'].entries()) {
        fireEvent.change(time, { target: { value: String(poses[index]!) } });
        // oxlint-disable-next-line no-await-in-loop -- assert each seek before recording the pose
        await waitFor(() => {
          expect(time).toHaveAttribute('value', String(Math.floor(Math.min(poses[index]!, motion.duration))));
        });
        // oxlint-disable-next-line no-await-in-loop -- each pose must settle before its evidence capture
        await nextFrames(60);
        // oxlint-disable-next-line no-await-in-loop -- preserve each distinct mechanical pose
        await capture(frame, `${mini ? 'mini' : 'x1c'}-travel-${label}.png`);
      }
      const { width, height } = scene.getBoundingClientRect();
      await userEvent.dragAndDrop(scene, scene, {
        sourcePosition: { x: width / 2, y: height / 2 },
        targetPosition: { x: width * 0.66, y: height / 2 },
      });
      await nextFrames(60);
      await capture(frame, `${mini ? 'mini' : 'x1c'}-side-light.png`);
      expect(within(frame).getByRole('button', { name: 'Play' })).toBeVisible();
    }, 60_000);
  }

  it('shows the whole printer from the More menu', async () => {
    mocks.live = idleLive;
    const { frame, scene } = await mount('dark', [1280, 720]);
    await pauseAt(frame, 0.55, /^6\d \/ 120$/u);
    await chooseFromMore(frame, 'menuitemcheckbox', 'Show the whole printer');
    await capture(frame, 'whole-printer-dark.png');
    await chooseFromMore(frame, 'menuitemcheckbox', 'Show enclosure');
    await capture(frame, 'x1c-mechanical-cutaway-dark.png');
    // Whole-machine framing fits the full 457 mm chassis, rather than cropping to the sheet.
    expectFramed(await measurePrint(scene), 0.035);
  });

  for (const plate of ['Cool Plate', 'Engineering Plate', 'High Temp Plate', 'Textured PEI Plate']) {
    it(`draws the ${plate}`, async () => {
      mocks.live = idleLive;
      const { frame, scene } = await mount('dark', [1280, 720]);
      await pauseAt(frame, 0.55, /^6\d \/ 120$/u);
      await chooseFromMore(frame, 'menuitemradio', plate);
      await capture(frame, `plate-${plate.toLowerCase().replaceAll(' ', '-')}-dark.png`);
      expectFramed(await measurePrint(scene), 0.1);
    });
  }

  // The purge line runs along the plate's front edge, so the whole printer is the view that shows it.
  for (const plate of ['Textured PEI Plate', 'High Temp Plate']) {
    it(`shows the preparation on the ${plate}`, async () => {
      mocks.live = idleLive;
      const { frame, scene } = await mount('dark', [1280, 720]);
      await pauseAt(frame, 0.55, /^6\d \/ 120$/u);
      await chooseFromMore(frame, 'menuitemradio', plate);
      await chooseFromMore(frame, 'menuitemcheckbox', 'Show the whole printer');
      await capture(frame, `preparation-${plate.toLowerCase().replaceAll(' ', '-')}-dark.png`);
      expectFramed(await measurePrint(scene), 0.035);
    });
  }

  it('draws a two-colour print in its own filaments and lists both', async () => {
    // Bambu Studio's two-colour slice from @taucad/slicer's fixtures: a red cube left of a blue one, 10 mm apart.
    const gcode = new TextEncoder().encode(
      await commands.readFile('../../packages/plugins/slicer/src/__fixtures__/two-colour-cubes.gcode'),
    );
    const { frame, scene } = await mount('dark', [1280, 720], {
      name: 'two-colour-cubes.gcode',
      kind: 'gcode',
      readAll: async () => gcode,
    });
    const filaments = within(within(frame).getByRole('list', { name: 'Filaments' })).getAllByRole('listitem');
    expect(filaments.map((item) => item.textContent)).toEqual(['Filament 1', 'Filament 2']);
    await capture(frame, 'two-colour-cubes-dark.png');
    const red = await measurePrint(scene);
    const blue = await measurePrint(scene, isBlue);
    expect(blue.centre - red.centre, 'the red cube stands left of the blue one').toBeGreaterThan(0.2);
  });

  it('captures the scene following a live run in dark', async () => {
    mocks.live = printingLive;
    const { frame, scene } = await mount('dark', [570, 720]);
    const controls = within(frame).getByRole('group', { name: 'Playback controls' });
    fireEvent.click(within(controls).getByRole('switch', { name: 'Live' }));
    await waitFor(() => {
      expect(within(controls).getByRole('switch', { name: 'Live' })).toHaveAttribute('aria-checked', 'true');
      expect(within(controls).getByRole('slider', { name: 'Time' })).toBeDisabled();
    });
    const hud = within(frame).getByRole('region', { name: 'Print HUD' });
    expect(within(hud).getByText('Machine').nextElementSibling?.textContent).toContain('Workshop X1C');
    await nextFrames(6);
    await capture(frame, 'printer-live-dark.png');
    expectFramed(await measurePrint(scene), 0.1);
  });
});

// Three's shipped device declarations are empty; this fixture names only the native WebGPU methods it verifies.
type QualificationDevice = {
  createShaderModule: (descriptor: { code: string }) => {
    getCompilationInfo: () => Promise<{ messages: ReadonlyArray<{ type: string }> }>;
  };
  pushErrorScope: (filter: 'validation') => void;
  popErrorScope: () => Promise<unknown>;
  queue: { onSubmittedWorkDone: () => Promise<void> };
  addEventListener: (
    type: 'uncapturederror',
    callback: (event: Event & { error: { message: string } }) => void,
  ) => void;
  removeEventListener: (
    type: 'uncapturederror',
    callback: (event: Event & { error: { message: string } }) => void,
  ) => void;
};

/** Dense geometry validates the real backend and records synchronized whole-frame costs, not CPU submission alone. */
describe('filament GPU qualification', () => {
  for (const backend of ['webgl', 'webgpu'] as const) {
    it.each([100_000, 1_000_000])(
      `should compile filament with negative controls and measure dense whole frames on ${backend} with %i moves`,
      async (count) => {
        const lines = [
          'G28',
          'M104 S220',
          'G90',
          'M83',
          ';HEIGHT:0.2',
          ';WIDTH:0.45',
          ';TYPE:Outer wall',
          'G1 X100 Y100 Z0.2 F1800',
        ];
        for (let i = 0; i < count; i += 1) {
          lines.push(`G1 X${100 + (i % 2) * 40} Y${100 + (Math.floor(i / 2) % 400) / 10} E0.02`);
        }
        const bytes = new TextEncoder().encode(lines.join('\n'));
        const owner = new AbortController();
        const started = performance.now();
        const prepared = await printerPreparation.prepare({ bytes, kind: 'gcode', signal: owner.signal });
        expect(prepared.kind).toBe('ready');
        if (prepared.kind !== 'ready') {
          throw new Error('Dense qualification did not prepare');
        }
        /** Milliseconds, including worker startup. */
        const preparationDuration = performance.now() - started;
        const warmStart = performance.now();
        const warm = await printerPreparation.prepare({ bytes, kind: 'gcode', signal: owner.signal });
        expect(warm.kind === 'ready' && warm.value === prepared.value).toBe(true);
        /** Milliseconds. */
        const warmDuration = performance.now() - warmStart;
        const canvas = document.createElement('canvas');
        document.body.append(canvas);
        const renderer = await createRenderer('viewport', backend, canvas);
        renderer.info.autoReset = false;
        renderer.setSize(1280, 720);
        renderer.setPixelRatio(1);
        const scene = new THREE.Scene();
        const camera = new THREE.PerspectiveCamera(35, 1280 / 720, 0.1, 1000);
        camera.up.set(0, 0, 1);
        camera.position.set(140, 60, 100);
        camera.lookAt(120, 120, 0);
        camera.coordinateSystem = renderer.coordinateSystem;
        if ('reversedDepthBuffer' in renderer) {
          Object.assign(camera, { _reversedDepth: renderer.reversedDepthBuffer });
          camera.updateProjectionMatrix();
        }
        scene.add(new THREE.AmbientLight(0xff_ff_ff, 0.55));
        const light = new THREE.DirectionalLight(0xff_ff_ff, 1.1);
        light.position.set(300, -400, 600);
        scene.add(light);
        const reveal = createToolpathReveal(prepared.value.program, [createToolpathPalette(loadedSpoolColor, 'dark')], {
          backend,
          grouping: prepared.value.grouping,
          data: prepared.value.beads,
        });
        scene.add(reveal.lines);
        const head = new THREE.Vector3();
        updateToolpathReveal({ reveal, program: prepared.value.program, time: prepared.value.program.duration, head });
        const durations: number[] = [];
        try {
          if (renderer instanceof THREE.WebGLRenderer) {
            const gl = renderer.getContext();
            const invalid = gl.createShader(gl.VERTEX_SHADER)!;
            gl.shaderSource(invalid, 'not valid GLSL');
            gl.compileShader(invalid);
            expect(gl.getShaderParameter(invalid, gl.COMPILE_STATUS)).toBe(false);
            gl.deleteShader(invalid);
            renderer.compile(scene, camera);
            for (const program of renderer.info.programs ?? []) {
              if (!(program.program instanceof WebGLProgram)) {
                throw new Error('Compiled WebGL program missing');
              }
              expect(gl.getProgramParameter(program.program, gl.LINK_STATUS)).toBe(true);
            }
            for (let sample = 0; sample < 22; sample += 1) {
              const start = performance.now();
              renderer.info.reset();
              renderer.render(scene, camera);
              gl.finish();
              if (sample >= 2) {
                durations.push(performance.now() - start);
              }
            }
            expect(gl.getError()).toBe(gl.NO_ERROR);
          } else {
            // Runtime guard against probing a fallback backend as if it were WebGPU.
            const device = Reflect.get(renderer.backend, 'device') as QualificationDevice | undefined;
            expect(device).toBeDefined();
            if (!device) {
              throw new Error('Native WebGPU device unavailable');
            }
            device.pushErrorScope('validation');
            const invalid = device.createShaderModule({ code: 'not valid WGSL' });
            const invalidInfo = await invalid.getCompilationInfo();
            expect(invalidInfo.messages.some((message) => message.type === 'error')).toBe(true);
            const invalidError = await device.popErrorScope();
            expect(invalidError).toBeDefined();
            const errors: string[] = [];
            const error = (event: Event & { error: { message: string } }): void => {
              errors.push(event.error.message);
            };
            device.addEventListener('uncapturederror', error);
            try {
              await renderer.compileAsync(scene, camera);
              const shader = await renderer.debug.getShaderAsync(scene, camera, reveal.chunks[0]!.mesh);
              const { vertexShader, fragmentShader } = shader;
              if (!vertexShader || !fragmentShader) {
                throw new Error('Generated filament shader missing');
              }
              expect(vertexShader).toContain('aDimensions');
              const compilations = await Promise.all(
                [vertexShader, fragmentShader].map(async (code) =>
                  device.createShaderModule({ code }).getCompilationInfo(),
                ),
              );
              for (const compilation of compilations) {
                expect(compilation.messages.filter((message) => message.type === 'error')).toEqual([]);
              }
              for (let sample = 0; sample < 22; sample += 1) {
                const start = performance.now();
                renderer.info.reset();
                renderer.render(scene, camera);
                // oxlint-disable-next-line no-await-in-loop -- Each measured frame must complete before the next sample starts.
                await device.queue.onSubmittedWorkDone();
                if (sample >= 2) {
                  durations.push(performance.now() - start);
                }
              }
              expect(errors).toEqual([]);
            } finally {
              device.removeEventListener('uncapturederror', error);
            }
          }
          const drawCalls =
            renderer instanceof THREE.WebGLRenderer ? renderer.info.render.calls : renderer.info.render.drawCalls;
          expect(drawCalls).toBeLessThanOrEqual(Math.ceil(count / 16_384) + 4);
          expect(renderer.info.render.triangles).toBeGreaterThan(count * 30);
          const pixels = new Uint8Array(1280 * 720 * 4);
          if (renderer instanceof THREE.WebGLRenderer) {
            const gl = renderer.getContext();
            gl.readPixels(0, 0, 1280, 720, gl.RGBA, gl.UNSIGNED_BYTE, pixels);
            expect(
              pixels.some(
                (value, index) =>
                  index % 4 === 0 && value > 50 && value > pixels[index + 1]! * 1.3 && value > pixels[index + 2]! * 1.3,
              ),
            ).toBe(true);
          }
          const sorted = durations.toSorted((a, b) => a - b);
          const median = (sorted[9]! + sorted[10]!) / 2;
          const deviations = durations.map((duration) => Math.abs(duration - median)).toSorted((a, b) => a - b);
          await commands.writeFile(
            `../../out/research/gcode-extrusion-rendering-blueprint/implementation/screenshots/dense-${backend}-${count}.json`,
            JSON.stringify(
              {
                backend,
                revision: THREE.REVISION,
                count,
                samples: durations.length,
                preparationDuration,
                stages: prepared.stageDurations,
                warmDuration,
                median,
                p95: sorted[18],
                mad: deviations[10],
                durations,
                calls: drawCalls,
                triangles: renderer.info.render.triangles,
                cpuTypedBytes: prepared.value.beads.bytes,
                viewport: [1280, 720],
                dpr: 1,
                synchronization: 'completion fence; includes driver wait',
                gpuTimestampQueries: false,
              },
              undefined,
              2,
            ),
          );
          // Appearance changes share the exact same uploaded buffers.
          const buffers = reveal.chunks.map(({ mesh }) => mesh.geometry.getAttribute('aDimensions'));
          setToolpathAppearance(reveal, { mode: 'flow', maximum: prepared.value.maximums.flow, emphasizeLayer: true });
          renderer.render(scene, camera);
          expect(reveal.chunks.map(({ mesh }) => mesh.geometry.getAttribute('aDimensions'))).toEqual(buffers);
        } finally {
          reveal.dispose();
          renderer.dispose();
          canvas.remove();
          owner.abort();
        }
      },
      120_000,
    );
  }
});

describe('shared two-view lifecycle', () => {
  for (const backend of ['webgl', 'webgpu'] as const) {
    it(`should share prepared data and preserve independent playback after one view closes on ${backend}`, async () => {
      mocks.backend = backend;
      mocks.live = idleLive;
      const first = await mount('dark', [570, 650]);
      const second = await mount('dark', [570, 650], { ...bracket, name: 'second-view.gcode' });
      for (const view of [first, second]) {
        const root = view.frame.parentElement!;
        root.style.display = 'inline-block';
        root.style.width = '620px';
        root.style.verticalAlign = 'top';
      }
      await pauseAt(first.frame, 0.55, /^6\d \/ 120$/u);
      await pauseAt(second.frame, 0.3, /^3\d \/ 120$/u);
      expect(printerPreparation.diagnostics().active).toBe(1);
      const canvas = second.scene.querySelector('canvas');
      const time = within(second.frame).getByRole('slider', { name: 'Time' }).getAttribute('value');
      await page.screenshot({ element: document.body, path: `${evidenceDirectory}/two-views-${backend}.png` });
      first.unmount();
      expect(printerPreparation.diagnostics().active).toBe(1);
      expect(second.scene.querySelector('canvas')).toBe(canvas);
      expect(within(second.frame).getByRole('slider', { name: 'Time' })).toHaveAttribute('value', time);
      await pauseAt(second.frame, 0.55, /^6\d \/ 120$/u);
      second.unmount();
      expect(printerPreparation.diagnostics().active).toBe(0);
    }, 120_000);
  }
});
