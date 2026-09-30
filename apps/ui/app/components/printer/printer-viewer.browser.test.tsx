import '#styles/global.css';
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { commands, page, userEvent } from 'vitest/browser';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { useCallback } from 'react';
import { mock } from 'vitest-mock-extended';
import { writeBambuContainer } from '@taucad/slicer/container';
import { bambuA1MiniManifest } from '@taucad/bambu';
import { TooltipProvider } from '@taucad/ui/components/tooltip';
import { FileContentService } from '@taucad/fs-client/file-content-service';
import type { ComposedViewClient } from '@taucad/fs-client/composed-view-client';
import { RefreshGenerationGuard } from '@taucad/fs-client/refresh-generation-guard';
import { WorkerChangeChannel } from '@taucad/fs-client/worker-change-channel';
import { WorkspacePathResolver } from '@taucad/fs-client/workspace-path-resolver';
import type { PrinterFileKind } from '#components/printer/printer-file.js';
import { fixtureGcode } from '#components/printer/testing/toolpath-fixture.js';
import type { PrinterLiveState } from '#components/printer/use-printer-live.js';
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
  live: undefined as PrinterLiveState | undefined,
}));
const fileManager = vi.hoisted(() => ({ contentService: undefined as FileContentService | undefined }));

vi.mock('#hooks/use-theme.js', () => ({ useTheme: () => ({ theme: mocks.theme }) }));
vi.mock('#components/printer/use-printer-live.js', () => ({ usePrinterLive: () => mocks.live }));
vi.mock('#hooks/use-file-manager.js', () => ({ useFileManager: () => fileManager }));

const { PrinterViewer } = await import('#components/printer/printer-viewer.js');

const evidenceDirectory = '../../../../../out/research/machines-production-readiness-blueprint/2026-09-27-execution/V';
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
  runState: 'idle',
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
  runState: 'printing',
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
): Promise<{ frame: HTMLElement; scene: HTMLElement }> => {
  mocks.theme = theme;
  document.documentElement.classList.toggle('dark', theme === 'dark');
  globalThis.history.replaceState(undefined, '', '?graphicsBackend=webgl');
  await page.viewport(1320, 780);
  const { container: root } = render(
    <TooltipProvider>
      <PrinterViewer name={file.name} kind={file.kind} revision={1} readAll={file.readAll} renderPane={renderPane} />
    </TooltipProvider>,
  );
  await screen.findByRole('region', { name: `Printer simulation: ${file.name}` });
  const frame = within(root).getByTestId('frame');
  resize(frame, size);
  await nextFrames(6);
  return {
    frame,
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
  document.documentElement.classList.remove('dark');
});

describe('Printer viewer framing', () => {
  it('should keep a live .gcode.3mf scene and playback through an unchanged file refresh', async () => {
    mocks.theme = 'light';
    mocks.live = idleLive;
    document.documentElement.classList.remove('dark');
    globalThis.history.replaceState(undefined, '', '?graphicsBackend=webgl');
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
      const scene = await within(frame).findByRole('img', { name: `Bambu Lab X1 Carbon printing ${name}` });
      await pauseAt(frame, 0.55, /^6\d \/ 120$/u);
      const canvas = scene.querySelector('canvas');
      const before = within(frame).getByRole('slider', { name: 'Time' }).getAttribute('value');
      const firstOutcome = service.peekOutcome(name);

      emitFileChanged({ type: 'fileWritten', path: name, backend: 'indexeddb' });
      await waitFor(() => {
        expect(proxy.readFile).toHaveBeenCalledTimes(3);
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
    mocks.live = { ...idleLive, machineName: 'Mini', manifest: bambuA1MiniManifest };
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

  it('shows the whole printer from the More menu', async () => {
    mocks.live = idleLive;
    const { frame, scene } = await mount('dark', [1280, 720]);
    await pauseAt(frame, 0.55, /^6\d \/ 120$/u);
    await chooseFromMore(frame, 'menuitemcheckbox', 'Show the whole printer');
    await capture(frame, 'whole-printer-dark.png');
    expectFramed(await measurePrint(scene), 0.05);
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
      expectFramed(await measurePrint(scene), 0.05);
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
