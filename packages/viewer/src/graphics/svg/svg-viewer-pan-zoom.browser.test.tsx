import '#test/browser.css';
import { cleanup, render, screen } from '@testing-library/react';
import { createActor } from 'xstate';
import type { ActorRefFrom } from 'xstate';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { commands, page } from 'vitest/browser';
import type { KnownArtifact } from '@taucad/runtime';
import { SvgViewer } from '#graphics/svg/svg-viewer.jsx';
import { GraphicsProvider } from '#hooks/use-graphics.jsx';
import { graphicsMachine } from '#machines/graphics.machine.js';

type MouseOptions = { x?: number; y?: number; button?: 'left' | 'right'; deltaY?: number; pinch?: boolean };

declare module 'vitest/internal/browser' {
  // oxlint-disable-next-line typescript/consistent-type-definitions -- Augments the installed browser command registry.
  interface BrowserCommands {
    svgMouse(action: 'move' | 'down' | 'up' | 'wheel', options?: MouseOptions): Promise<void>;
  }
}

// A 480 x 360 pane shows this 100 x 75 mm drawing at 4 px per mm once the viewer adds its 10% margin, so the grid
// starts with 1 mm minor and 10 mm major cells. The marker's left and top edges sit on major lines (40 mm, 30 mm).
const paneLeft = 40;
const paneTop = 30;
const paneWidth = 480;
const paneHeight = 360;
const drawing: Extract<KnownArtifact, { mimeType: 'image/svg+xml' }> = {
  mimeType: 'image/svg+xml',
  // oxlint-disable-next-line tau-lint/no-hardcoded-color -- Test fixture marker.
  content: '<svg viewBox="0 0 100 75"><rect x="40" y="30" width="20" height="15" fill="rgb(200, 40, 40)"/></svg>',
};
const schematic: typeof drawing = {
  mimeType: 'image/svg+xml',
  // As tscircuit writes a schematic: 1200 x 600 px at 40 px per schematic millimetre.
  content:
    '<svg viewBox="0 0 1200 600" data-real-to-screen-transform="matrix(40,0,0,-40,600,300)"><rect x="400" y="200" width="200" height="100"/></svg>',
};

type Graphics = ActorRefFrom<typeof graphicsMachine>;
type Viewer = { graphics: Graphics; marker: () => DOMRect; root: ShadowRoot };

const mount = async (artifact: typeof drawing = drawing): Promise<Viewer> => {
  await page.viewport(720, 520);
  const graphics = createActor(graphicsMachine, { input: {} }).start();
  render(
    <div style={{ position: 'absolute', left: paneLeft, top: paneTop, width: paneWidth, height: paneHeight }}>
      <GraphicsProvider graphicsRef={graphics}>
        <SvgViewer artifact={artifact} />
      </GraphicsProvider>
    </div>,
  );
  const host = await screen.findByTestId('svg-viewer-host');
  const root = await vi.waitFor(() => {
    const shadow = host.shadowRoot;
    if (!shadow?.querySelector('rect')) {
      throw new Error('The drawing has not rendered');
    }
    return shadow;
  });
  // A hidden or collapsed pane would let every geometric assertion pass vacuously.
  expect(host.getBoundingClientRect()).toMatchObject({ width: paneWidth, height: paneHeight });
  const marker = (): DOMRect => root.querySelector('rect')!.getBoundingClientRect();
  await vi.waitFor(() => {
    expect(root.querySelector('canvas')?.width).toBe(paneWidth);
  });
  return { graphics, marker, root };
};

/** The grid's own coverage in each pixel column: the least alpha down the column, which the row lines cannot lower. */
const gridColumns = (root: ShadowRoot): number[] => {
  const canvas = root.querySelector('canvas')!;
  const { data, width, height } = canvas.getContext('2d')!.getImageData(0, 0, canvas.width, canvas.height);
  return Array.from({ length: width }, (_, x) => {
    let least = 255;
    for (let y = 0; y < height; y++) {
      least = Math.min(least, data[(y * width + x) * 4 + 3]!);
    }
    return least / 255;
  });
};

/**
 * Expects a major grid line centred on a page x position. A major line integrates to its 2 px width (a minor line to
 * 1.25 px, a gap to 0), and its centroid is the line's centre.
 */
const expectMajorLineAt = (root: ShadowRoot, pageX: number): void => {
  const columns = gridColumns(root);
  const x = pageX - paneLeft;
  let area = 0;
  let moment = 0;
  for (let column = Math.floor(x - 1.75); column <= Math.ceil(x + 0.75); column++) {
    area += columns[column] ?? 0;
    moment += (columns[column] ?? 0) * (column + 0.5);
  }
  expect(area, `a major grid line at ${x}`).toBeGreaterThan(1.7);
  expect(Math.abs(moment / area - x), `the grid line's offset from ${x}`).toBeLessThan(0.3);
};

const drag = async (from: { x: number; y: number }, by: { x: number; y: number }): Promise<void> => {
  await commands.svgMouse('move', from);
  await commands.svgMouse('down');
  // Two moves, as a hand makes them: the drag follows the pointer rather than jumping on release.
  await commands.svgMouse('move', { x: from.x + by.x / 2, y: from.y + by.y / 2 });
  await commands.svgMouse('move', { x: from.x + by.x, y: from.y + by.y });
};

afterEach(async () => {
  await commands.svgMouse('up');
  cleanup();
});

describe('SVG viewer pan and zoom in Chromium', () => {
  it('should move the drawing and its grid by the distance dragged', async () => {
    const { marker, root } = await mount();
    const start = marker();
    expect(start).toMatchObject({ x: paneLeft + 200, y: paneTop + 150, width: 80, height: 60 });
    expectMajorLineAt(root, start.left);

    await drag({ x: paneLeft + 100, y: paneTop + 100 }, { x: 63, y: 35 });
    await vi.waitFor(() => {
      expect(marker().x - start.x).toBeCloseTo(63, 0);
      expect(marker().y - start.y).toBeCloseTo(35, 0);
    });
    // Mid-drag, before release: the drawing follows the pointer and the grid stays on it.
    expect(marker().width).toBe(80);
    expectMajorLineAt(root, marker().left);

    await commands.svgMouse('up');
    const released = marker();
    await commands.svgMouse('move', { x: paneLeft + 300, y: paneTop + 300 });
    await new Promise((resolve) => {
      setTimeout(resolve, 100);
    });
    expect(marker(), 'the drawing stays put once the button is up').toEqual(released);
  });

  it('should zoom about the pointer and keep dragging true to the pointer afterwards', async () => {
    const { graphics, marker, root } = await mount();
    const start = marker();
    // Zoom in on the marker's top-left corner: that point stays under the pointer while everything grows around it.
    await commands.svgMouse('move', { x: start.left, y: start.top });
    await commands.svgMouse('wheel', { deltaY: -300 });
    const factor = Math.exp(0.6);
    await vi.waitFor(() => {
      expect(marker().width).toBeCloseTo(80 * factor, 0);
    });
    expect(marker().left).toBeCloseTo(start.left, 0);
    expect(marker().top).toBeCloseTo(start.top, 0);
    expect(marker().height).toBeCloseTo(60 * factor, 0);
    expectMajorLineAt(root, marker().left);
    // The grid readout follows the zoom: 90 mm of drawing was visible top to bottom, now 90 / factor.
    await vi.waitFor(() => {
      expect(graphics.getSnapshot().context.cameraVisibleSpan).toBeCloseTo(0.09 / factor, 6);
    });

    // A trackpad pinch zooms about the pointer too.
    const beforePinch = marker();
    await commands.svgMouse('wheel', { deltaY: -40, pinch: true });
    await vi.waitFor(() => {
      expect(marker().width).toBeCloseTo(beforePinch.width * Math.exp(0.4), 0);
    });
    expect(marker().left).toBeCloseTo(start.left, 0);
    expect(marker().top).toBeCloseTo(start.top, 0);

    // Drag after zoom: one pixel of pointer is still one pixel of drawing.
    const zoomed = marker();
    await drag({ x: paneLeft + 60, y: paneTop + 300 }, { x: -47, y: 22 });
    await vi.waitFor(() => {
      expect(marker().x - zoomed.x).toBeCloseTo(-47, 0);
      expect(marker().y - zoomed.y).toBeCloseTo(22, 0);
    });
    expect(marker().width).toBeCloseTo(zoomed.width, 3);
    expectMajorLineAt(root, marker().left);
    await commands.svgMouse('up');

    // The viewer's fit control returns to the fitted view.
    graphics.send({ type: 'fitView' });
    await vi.waitFor(() => {
      expect(marker().x).toBeCloseTo(start.x, 3);
      expect(marker().y).toBeCloseTo(start.y, 3);
      expect(marker().width).toBeCloseTo(80, 3);
    });
    expectMajorLineAt(root, marker().left);
  });

  it('should keep dragging past the viewport edge and stop on a release outside it', async () => {
    const { marker } = await mount();
    const start = marker();
    // From inside the pane to 70 px beyond its right edge and 40 px below its bottom edge.
    const from = { x: paneLeft + 400, y: paneTop + 300 };
    await drag(from, { x: 150, y: 100 });
    await vi.waitFor(() => {
      expect(marker().x - start.x).toBeCloseTo(150, 0);
      expect(marker().y - start.y).toBeCloseTo(100, 0);
    });

    await commands.svgMouse('up');
    const released = marker();
    // Back over the drawing with the button up: a release outside the viewport ended the drag.
    await commands.svgMouse('move', { x: paneLeft + 200, y: paneTop + 200 });
    await commands.svgMouse('move', { x: paneLeft + 100, y: paneTop + 100 });
    await new Promise((resolve) => {
      setTimeout(resolve, 100);
    });
    expect(marker()).toEqual(released);
  });

  it('should leave the drawing alone under the secondary button', async () => {
    const { marker } = await mount();
    const start = marker();
    await commands.svgMouse('move', { x: paneLeft + 100, y: paneTop + 100 });
    await commands.svgMouse('down', { button: 'right' });
    await commands.svgMouse('move', { x: paneLeft + 180, y: paneTop + 160 });
    await commands.svgMouse('up', { button: 'right' });
    await new Promise((resolve) => {
      setTimeout(resolve, 100);
    });
    expect(marker()).toEqual(start);
  });

  it('should size the grid of a tscircuit schematic in its declared millimetres', async () => {
    const { graphics, marker, root } = await mount(schematic);
    // 1200 x 600 px with the margin fits the pane's width: 1440 px across 480, so 1080 px (27 mm) top to bottom.
    await vi.waitFor(() => {
      expect(graphics.getSnapshot().context.cameraVisibleSpan).toBeCloseTo(0.027, 6);
    });
    // 5 mm major cells are 200 px of schematic; the marker's left edge (400 px) is on one.
    expect(graphics.getSnapshot().context.gridSizes).toMatchObject({ smallSize: 0.0005, largeSize: 0.005 });
    expectMajorLineAt(root, marker().left);
  });
});
