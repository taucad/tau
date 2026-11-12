import '#test/browser.css';
import { useRef } from 'react';
import { act, cleanup, render, screen, within } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import { afterEach, describe, expect, it } from 'vitest';
import { KeyboardProvider } from '@taucad/ui/components/keyboard';
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
import { useViewerShortcuts } from '#hooks/use-viewer-shortcuts.js';

/*
 * N1 and N2 in a real browser: real key and click events reach the viewer's shortcuts and single-click controls, and
 * the camera's azimuth, polar angle, distance and target are read through the graphics actor, its controls adapter
 * and `camera-controls`, under two mouse presets.
 */

const viewers: NavigableViewer[] = [];

afterEach(() => {
  cleanup();
  for (const viewer of viewers.splice(0)) {
    viewer.stop();
  }
});

function Viewer(): React.JSX.Element {
  const barRef = useRef<HTMLDivElement>(null);
  const keys = useViewerShortcuts(barRef, () => undefined, { navigation: true });
  return (
    <section data-viewer-frame aria-label='Viewer' style={{ position: 'relative', width: 800, height: 600 }}>
      <div ref={barRef}>
        <button type='button'>Viewer control</button>
        <NavigationControls keys={keys.navigation} fitViewShortcut={keys.fitView} />
      </div>
    </section>
  );
}

const mount = (preset: CameraPresetId): NavigableViewer => {
  const viewer = startNavigableViewer(preset);
  viewers.push(viewer);
  render(
    <KeyboardProvider>
      <TooltipProvider>
        <GraphicsProvider graphicsRef={viewer.graphics}>
          <Viewer />
        </GraphicsProvider>
      </TooltipProvider>
    </KeyboardProvider>,
  );
  act(() => {
    screen.getByRole('button', { name: 'Viewer control' }).focus();
  });
  return viewer;
};

const after = async (viewer: NavigableViewer, action: () => Promise<unknown>): Promise<string> => {
  const before = readCamera(viewer);
  await action();
  viewer.tick();
  return classifyCameraChange(before, readCamera(viewer));
};

describe.each(['tau', 'shift-middle'] as const satisfies readonly CameraPresetId[])('under the %s preset', (preset) => {
  it('orbits with the arrow keys, pans with Shift and zooms with plus and minus (N1)', async () => {
    const viewer = mount(preset);
    expect(await after(viewer, async () => userEvent.keyboard('{ArrowLeft}'))).toBe('orbit');
    expect(await after(viewer, async () => userEvent.keyboard('{ArrowUp}'))).toBe('orbit');
    expect(await after(viewer, async () => userEvent.keyboard('{Shift>}{ArrowRight}{/Shift}'))).toBe('pan');
    expect(await after(viewer, async () => userEvent.keyboard('+'))).toBe('zoom');
    expect(await after(viewer, async () => userEvent.keyboard('-'))).toBe('zoom');
  });

  it('orbits, pans and zooms with one click each, on buttons of at least 24 px (N2)', async () => {
    const viewer = mount(preset);
    const camera = screen.getByRole('group', { name: 'Camera' });
    for (const button of within(camera).getAllByRole('button')) {
      const { width, height } = button.getBoundingClientRect();
      expect(Math.min(width, height)).toBeGreaterThanOrEqual(24);
    }
    const click = (name: string) => async () => userEvent.click(within(camera).getByRole('button', { name }));
    expect(await after(viewer, click('Orbit right'))).toBe('orbit');
    expect(await after(viewer, click('Orbit down'))).toBe('orbit');
    await userEvent.click(within(camera).getByRole('button', { name: 'Pan with the arrows' }));
    expect(await after(viewer, click('Pan left'))).toBe('pan');
    expect(await after(viewer, click('Zoom in'))).toBe('zoom');
    expect(await after(viewer, click('Zoom out'))).toBe('zoom');
  });
});
