// @vitest-environment jsdom
import { render, screen, within } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createActor, createAsyncLogic } from 'xstate';
import { TooltipProvider } from '@taucad/ui/components/tooltip';
import { NavigationControls } from '#cad/navigation-controls.jsx';
import {
  classifyCameraChange,
  readCamera,
  startNavigableViewer,
} from '#graphics/three/adapters/controls-adapter.test-utils.js';
import type { NavigableViewer } from '#graphics/three/adapters/controls-adapter.test-utils.js';
import type { CameraPresetId } from '#graphics/three/controls/camera-presets.js';
import { GraphicsProvider } from '#hooks/use-graphics.jsx';
import { graphicsMachine } from '#machines/graphics.machine.js';

/*
 * N2: beside the gizmo, orbit left, right, up and down, a switch that turns those four into pan, zoom in, zoom out and
 * fit, each a named button of at least 24 px that one click operates, under every preset. The camera rows read the
 * real controls' state through the graphics actor and its controls adapter.
 */

const viewers: NavigableViewer[] = [];

afterEach(() => {
  for (const viewer of viewers.splice(0)) {
    viewer.stop();
  }
  vi.restoreAllMocks();
});

/* A model makes framing move the camera on its own schedule, so only the Fit view row starts with one. */
const startViewer = (preset: CameraPresetId = 'tau', model = false): NavigableViewer => {
  const viewer = startNavigableViewer(preset, { model });
  viewers.push(viewer);
  return viewer;
};

const renderControls = (viewer: Pick<NavigableViewer, 'graphics'>, inFrame = true): void => {
  const controls = (
    <TooltipProvider>
      <GraphicsProvider graphicsRef={viewer.graphics}>
        <NavigationControls />
      </GraphicsProvider>
    </TooltipProvider>
  );
  render(inFrame ? <div data-viewer-frame>{controls}</div> : controls);
};

/** Records what the controls send, still delivering it; the actor's `send` is a prototype getter. */
const recordSends = (actor: NavigableViewer['graphics']): ReturnType<typeof vi.fn> => {
  const send = vi.fn(actor.send);
  Object.defineProperty(actor, 'send', { value: send, configurable: true });
  return send;
};

const group = (): HTMLElement => screen.getByRole('group', { name: 'Camera' });
const button = (name: string): HTMLElement => within(group()).getByRole('button', { name });

/** Clicks `name` once and names what the camera did, after one frame. */
const click = async (viewer: NavigableViewer, name: string): Promise<string> => {
  const before = readCamera(viewer);
  await userEvent.click(button(name));
  viewer.tick();
  return classifyCameraChange(before, readCamera(viewer));
};

const arrowNames = ['left', 'right', 'up', 'down'] as const;

describe('NavigationControls (N2)', () => {
  it('names every control, each at least 24 px', () => {
    renderControls(startViewer());
    const names = within(group())
      .getAllByRole('button')
      .map((element) => element.getAttribute('aria-label'));
    expect(names).toEqual([
      'Orbit up',
      'Orbit left',
      'Pan with the arrows',
      'Orbit right',
      'Orbit down',
      'Zoom in',
      'Zoom out',
      'Fit view',
    ]);
    // `icon-sm` is 28 px (`size-7`), `icon-touch` 44 px: both clear 24 px (WCAG 2.5.8).
    for (const element of within(group()).getAllByRole('button')) {
      expect(element.className).toMatch(/\bsize-(?:7|11)\b/);
    }
  });

  it('sits in the viewer frame, beside the gizmo, rather than in the bar', () => {
    renderControls(startViewer());
    expect(group().parentElement?.dataset['viewerFrame'] !== undefined).toBe(true);
    expect(group().dataset['slot']).toBe('viewer-navigation');
  });

  describe.each(['tau', 'middle-ctrl'] as const satisfies readonly CameraPresetId[])(
    'under the %s preset',
    (preset) => {
      it.each(arrowNames)('orbits %s with one click', async (direction) => {
        const viewer = startViewer(preset);
        renderControls(viewer);
        expect(await click(viewer, `Orbit ${direction}`)).toBe('orbit');
      });

      it.each(arrowNames)('pans %s with one click once the switch is on', async (direction) => {
        const viewer = startViewer(preset);
        renderControls(viewer);
        await userEvent.click(button('Pan with the arrows'));
        expect(button('Pan with the arrows').getAttribute('aria-pressed')).toBe('true');
        expect(await click(viewer, `Pan ${direction}`)).toBe('pan');
      });

      it('zooms in and out with one click each', async () => {
        const viewer = startViewer(preset);
        renderControls(viewer);
        const { distance } = readCamera(viewer);
        expect(await click(viewer, 'Zoom in')).toBe('zoom');
        expect(readCamera(viewer).distance).toBeLessThan(distance);
        expect(await click(viewer, 'Zoom out')).toBe('zoom');
        expect(readCamera(viewer).distance).toBeCloseTo(distance, 9);
      });
    },
  );

  it('turns the switch back to orbit', async () => {
    const viewer = startViewer();
    renderControls(viewer);
    await userEvent.click(button('Pan with the arrows'));
    await userEvent.click(button('Pan with the arrows'));
    expect(button('Pan with the arrows').getAttribute('aria-pressed')).toBe('false');
    expect(await click(viewer, 'Orbit left')).toBe('orbit');
  });

  it('fits the view with one click', async () => {
    const viewer = startViewer('tau', true);
    renderControls(viewer);
    const send = recordSends(viewer.graphics);
    await userEvent.click(button('Fit view'));
    expect(send).toHaveBeenCalledWith({ type: 'fitView' });
  });

  it('offers nothing to click before the canvas has its controls', async () => {
    const graphics = createActor(
      graphicsMachine.provide({ actors: { probeWebGpu: createAsyncLogic({ run: async () => false }) } }),
      { input: {} },
    ).start();
    renderControls({ graphics });
    const send = recordSends(graphics);
    expect(button('Orbit left').getAttribute('aria-disabled')).toBe('true');
    await userEvent.click(button('Orbit left'));
    expect(send).not.toHaveBeenCalled();
    graphics.stop();
  });

  it('renders in place outside a viewer frame', () => {
    renderControls(startViewer(), false);
    expect(group().parentElement?.dataset['viewerFrame'] !== undefined).toBe(false);
  });
});
