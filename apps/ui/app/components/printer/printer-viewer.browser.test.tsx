import '#styles/global.css';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { page } from 'vitest/browser';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { writeBambuContainer } from '@taucad/slicer/container';
import { TooltipProvider } from '@taucad/ui/components/tooltip';
import { fixtureGcode } from '#components/printer/testing/toolpath-fixture.js';
import type { PrinterLiveState } from '#components/printer/use-printer-live.js';
import type { FileViewerPaneContent } from '#routes/w.$workspace.$project/file-viewers/file-viewer.types.js';

/**
 * Framing evidence for the printer simulation scene: the print framed wide and
 * in a narrow pane, light and dark, the pane from the manual dry run, a zoom
 * the person made surviving a resize until they frame the print again, and the
 * viewer following a live run. The print's extent is measured from the
 * rendered pixels; PNGs land under `out/research/.../K/`.
 */

const mocks = vi.hoisted(() => ({
  theme: 'light' as 'light' | 'dark',
  live: undefined as PrinterLiveState | undefined,
}));

vi.mock('#hooks/use-theme.js', () => ({ useTheme: () => ({ theme: mocks.theme }) }));
vi.mock('#components/printer/use-printer-live.js', () => ({ usePrinterLive: () => mocks.live }));

const { PrinterViewer } = await import('#components/printer/printer-viewer.js');

const evidenceDirectory = '../../../../../out/research/design-to-print-workbench-blueprint/2026-09-24-implementation/K';
const name = 'bracket.gcode.3mf';
// A 50 mm square tube, 24 mm tall: about the size of the dry run's pyramid.
const container = writeBambuContainer({
  gcode: fixtureGcode({ layers: 120, size: 50 }),
  modelName: 'bracket',
  plate: 'textured-pei',
});
const readAll = async (): Promise<Uint8Array<ArrayBuffer>> => container;
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
type PrintExtent = Readonly<{ left: number; right: number; top: number; bottom: number; width: number }>;

/**
 * Find the loaded spool's red in a screenshot of the scene: pixels far redder
 * than they are green or blue. The purge line, trail and machine are not.
 */
const measurePrint = async (scene: HTMLElement): Promise<PrintExtent> => {
  const base64 = await page.screenshot({ element: scene, save: false });
  const response = await fetch(`data:image/png;base64,${base64}`);
  const bitmap = await createImageBitmap(await response.blob());
  const context = new OffscreenCanvas(bitmap.width, bitmap.height).getContext('2d');
  if (!context) {
    throw new Error('No 2D context to read the screenshot');
  }
  context.drawImage(bitmap, 0, 0);
  const { data, width, height } = context.getImageData(0, 0, bitmap.width, bitmap.height);
  let [left, right, top, bottom] = [width, -1, height, -1];
  for (let pixel = 0; pixel < width * height; pixel += 1) {
    const [red, green, blue] = [data[pixel * 4]!, data[pixel * 4 + 1]!, data[pixel * 4 + 2]!];
    if (red > 110 && red > green * 1.6 && red > blue * 1.6) {
      const [x, y] = [pixel % width, Math.floor(pixel / width)];
      [left, right, top, bottom] = [Math.min(left, x), Math.max(right, x), Math.min(top, y), Math.max(bottom, y)];
    }
  }
  expect(right, 'the print shows in the scene').toBeGreaterThan(left);
  return {
    left: left / width,
    right: (right + 1) / width,
    top: top / height,
    bottom: (bottom + 1) / height,
    width: (right + 1 - left) / width,
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
): Promise<{ frame: HTMLElement; scene: HTMLElement }> => {
  mocks.theme = theme;
  document.documentElement.classList.toggle('dark', theme === 'dark');
  globalThis.history.replaceState(undefined, '', '?graphicsBackend=webgl');
  await page.viewport(1320, 780);
  const { container: root } = render(
    <TooltipProvider>
      <PrinterViewer name={name} kind='container' revision={1} readAll={readAll} renderPane={renderPane} />
    </TooltipProvider>,
  );
  await screen.findByRole('region', { name: `Printer simulation: ${name}` });
  const frame = within(root).getByTestId('frame');
  resize(frame, size);
  await nextFrames(6);
  return { frame, scene: within(frame).getByRole('img', { name: `Bambu Lab X1 Carbon printing ${name}` }) };
};

const resize = (frame: HTMLElement, [width, height]: readonly [number, number]): void => {
  frame.style.width = `${width}px`;
  frame.style.height = `${height}px`;
};

/** Pause at a time share and wait for the HUD's layer to reach it. */
const pauseAt = async (frame: HTMLElement, share: number, layer: RegExp): Promise<void> => {
  const controls = within(frame).getByRole('group', { name: 'Playback controls' });
  fireEvent.click(within(controls).getByRole('button', { name: 'Pause' }));
  const time = within(controls).getByRole('slider', { name: 'Time' });
  fireEvent.change(time, { target: { value: String(Math.round(Number(time.getAttribute('max')) * share)) } });
  const hud = within(frame).getByRole('region', { name: 'Print HUD' });
  await waitFor(() => {
    expect(within(hud).getByText('Layer').nextElementSibling?.textContent).toMatch(layer);
  });
  await nextFrames(6);
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
  for (const theme of ['light', 'dark'] as const) {
    it(`frames the print wide, then again when the pane narrows to 570 px, in ${theme}`, async () => {
      mocks.live = idleLive;
      const { frame, scene } = await mount(theme, [1280, 720]);
      await pauseAt(frame, 0.55, /^6\d \/ 120$/u);
      await capture(frame, `printer-wide-${theme}.png`);
      expectFramed(await measurePrint(scene), 0.1);

      resize(frame, [570, 720]);
      await nextFrames(8);
      await capture(frame, `printer-570-${theme}.png`);
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

    // Zoom in with the wheel until the print is clearly larger than framed; each step settles before the next.
    let zoomed = framed;
    for (let attempt = 0; attempt < 10 && zoomed.width < framed.width * 1.6; attempt += 1) {
      const bounds = scene.getBoundingClientRect();
      // The camera listens on the canvas's own wrapper; a canvas has no role to query it by.
      fireEvent.wheel(scene.querySelector('canvas')!, {
        deltaY: -40,
        clientX: bounds.left + bounds.width / 2,
        clientY: bounds.top + bounds.height / 2,
      });
      // oxlint-disable-next-line no-await-in-loop -- the camera eases between steps; measuring needs each settled
      await nextFrames(40);
      // oxlint-disable-next-line no-await-in-loop -- as above: one measurement per settled step
      zoomed = await measurePrint(scene);
    }
    expect(zoomed.width).toBeGreaterThan(framed.width * 1.6);

    resize(frame, [640, 720]);
    await nextFrames(40);
    const afterResize = await measurePrint(scene);
    expect(afterResize.width, 'a resize leaves the zoom alone').toBeGreaterThan(framed.width * 1.3);

    fireEvent.click(within(frame).getByRole('button', { name: 'Frame the print' }));
    await nextFrames(60);
    const reframed = await measurePrint(scene);
    expectFramed(reframed, 0.1);
    expect(reframed.width).toBeLessThan(afterResize.width);
    await capture(frame, 'printer-reframed-light.png');
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
