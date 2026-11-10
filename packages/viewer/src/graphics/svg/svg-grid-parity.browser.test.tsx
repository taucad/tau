import '#test/browser.css';
import { cleanup, render, screen } from '@testing-library/react';
import { useEffect } from 'react';
import { createActor, createAsyncLogic } from 'xstate';
import { afterEach, expect, it, vi } from 'vitest';
import { page } from 'vitest/browser';
import type { KnownArtifact } from '@taucad/runtime';
import { KeyboardProvider } from '@taucad/ui/components/keyboard';
import { CadViewer } from '#cad/cad-viewer.jsx';
import { defaultViewerEnvironment, ViewerEnvironmentProvider } from '#environment/viewer-environment.jsx';
import { GraphicsProvider, useCameraRig } from '#hooks/use-graphics.jsx';
import { graphicsMachine } from '#machines/graphics.machine.js';

// Both panes are 400 x 300 CSS pixels and show 36 mm top to bottom with the origin at the centre: the 3D camera looks
// straight down at the grid plane, and the drawing's 40 x 30 mm viewBox fits with the viewer's 10% margin.
const paneWidth = 400;
const paneHeight = 300;
const verticalSpanMeters = 0.036;
const drawing: Extract<KnownArtifact, { mimeType: 'image/svg+xml' }> = {
  mimeType: 'image/svg+xml',
  content: '<svg viewBox="-20 -15 40 30"></svg>',
};

type Rig = ReturnType<typeof useCameraRig>;

function TopView(): undefined {
  const rig: Rig = useCameraRig();
  useEffect(() => {
    rig.actorRef.send({
      type: 'setView',
      target: [0, 0, 0],
      direction: [0, 0, 1],
      up: [0, 1, 0],
      verticalSpan: verticalSpanMeters,
    });
  }, [rig]);
  return undefined;
}

const readPixels = async (element: HTMLElement): Promise<ImageData> => {
  const base64 = await page.screenshot({ element, save: false });
  const response = await fetch(`data:image/png;base64,${base64}`);
  const bitmap = await createImageBitmap(await response.blob());
  const context = new OffscreenCanvas(bitmap.width, bitmap.height).getContext('2d');
  if (!context) {
    throw new Error('No 2D context to read the screenshot');
  }
  context.drawImage(bitmap, 0, 0);
  return context.getImageData(0, 0, bitmap.width, bitmap.height);
};

/** The red channel along the middle row; the grid is neutral grey, so one channel carries the line profile. */
const middleRow = ({ data, width, height }: ImageData): number[] => {
  const row = Math.floor(height / 2) + 4;
  return Array.from({ length: width }, (_, x) => data[(row * width + x) * 4]!);
};

afterEach(() => {
  cleanup();
  document.documentElement.classList.remove('dark');
});

it.each([
  ['webgl', 'light'],
  ['webgl', 'dark'],
  ['webgpu', 'light'],
  ['webgpu', 'dark'],
] as const)('should draw the SVG grid as the %s 3D grid draws it in %s mode', async (backend, theme) => {
  document.documentElement.classList.toggle('dark', theme === 'dark');
  await page.viewport(900, 400);
  const createGraphics = () =>
    createActor(
      graphicsMachine.provide({
        actors: { probeWebGpu: createAsyncLogic({ run: async () => backend === 'webgpu' }) },
      }),
      { input: {} },
    ).start();
  const boardGraphics = createGraphics();
  const drawingGraphics = createGraphics();
  if (backend === 'webgpu') {
    await vi.waitFor(() => {
      expect(boardGraphics.getSnapshot().context.webGpuAvailable).toBe(true);
    });
  }
  const pane = { width: paneWidth, height: paneHeight, position: 'relative' } as const;
  render(
    <ViewerEnvironmentProvider value={{ ...defaultViewerEnvironment, colorScheme: theme, graphicsBackend: backend }}>
      <KeyboardProvider>
        <div className='flex gap-4 bg-background'>
          <div data-testid='board' className='bg-background' style={pane}>
            <GraphicsProvider graphicsRef={boardGraphics}>
              <CadViewer enableGrid enableAxes={false} enableGizmo={false} artifact={undefined} sourceFile='main.ts' />
              <TopView />
            </GraphicsProvider>
          </div>
          <div data-testid='drawing' className='bg-background' style={pane}>
            <GraphicsProvider graphicsRef={drawingGraphics}>
              <CadViewer enableGrid enableAxes={false} artifact={drawing} sourceFile='main.ts' />
            </GraphicsProvider>
          </div>
        </div>
      </KeyboardProvider>
    </ViewerEnvironmentProvider>,
  );
  const board = screen.getByTestId('board');
  const drawingPane = screen.getByTestId('drawing');
  expect(board.getBoundingClientRect().width).toBe(paneWidth);
  expect(drawingPane.getBoundingClientRect().height).toBe(paneHeight);

  // Both viewers settle on the same grid: 1 mm minor and 10 mm major cells.
  await vi.waitFor(() => {
    expect(boardGraphics.getSnapshot().context.cameraVisibleSpan).toBeCloseTo(verticalSpanMeters, 9);
    expect(drawingGraphics.getSnapshot().context.cameraVisibleSpan).toBeCloseTo(verticalSpanMeters, 9);
  });
  const { smallSize, largeSize } = boardGraphics.getSnapshot().context.gridSizes;
  expect(drawingGraphics.getSnapshot().context.gridSizes).toMatchObject({ smallSize, largeSize });

  let boardPixels = await readPixels(board);
  await vi.waitFor(
    async () => {
      const next = await readPixels(board);
      const settled = next.data.every((value, index) => value === boardPixels.data[index]);
      boardPixels = next;
      expect(settled && new Set(middleRow(next)).size > 1, 'the 3D grid has drawn and settled').toBe(true);
    },
    { timeout: 45_000, interval: 250 },
  );
  const drawingPixels = await readPixels(drawingPane);
  expect([drawingPixels.width, drawingPixels.height]).toEqual([boardPixels.width, boardPixels.height]);

  expect(Boolean(board.querySelector('canvas')?.getContext('webgpu')), 'the requested backend').toBe(
    backend === 'webgpu',
  );

  // Measured on 2026-11-10 (Chromium, 1x): every channel of every pixel within 1 of the 3D grid, on both backends
  // and in both themes. 2 leaves room for a rounding step in each of the two compositing paths.
  let worst = 0;
  for (let index = 0; index < boardPixels.data.length; index++) {
    worst = Math.max(worst, Math.abs(boardPixels.data[index]! - drawingPixels.data[index]!));
  }
  expect(worst, 'largest channel difference between the 3D grid and the SVG grid').toBeLessThanOrEqual(2);
  // Negative control: the same comparison sees the lines, so a blank pair of panes cannot pass.
  const row = middleRow(drawingPixels);
  expect(Math.max(...row) - Math.min(...row), 'the grid lines stand out from the background').toBeGreaterThan(15);
  await page.screenshot({ path: `../../../../../out/test-results/svg-viewer/grid-parity-${backend}-${theme}.png` });
});
