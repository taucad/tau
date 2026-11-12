import '#test/browser.css';
import { useRef } from 'react';
import { act, cleanup, render, screen } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import { afterEach, describe, expect, it } from 'vitest';
import { KeyboardProvider } from '@taucad/ui/components/keyboard';
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
 * N1 in a real browser: real key events reach the viewer's shortcuts, and the camera's azimuth, polar angle, distance
 * and target are read through the graphics actor, its controls adapter and `camera-controls`, under two mouse presets.
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
  useViewerShortcuts(barRef, () => undefined, { navigation: true });
  return (
    <section data-viewer-frame aria-label='Viewer' style={{ position: 'relative', width: 800, height: 600 }}>
      <div ref={barRef}>
        <button type='button'>Viewer control</button>
      </div>
    </section>
  );
}

const mount = (preset: CameraPresetId): NavigableViewer => {
  const viewer = startNavigableViewer(preset);
  viewers.push(viewer);
  render(
    <KeyboardProvider>
      <GraphicsProvider graphicsRef={viewer.graphics}>
        <Viewer />
      </GraphicsProvider>
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
    expect(await after(viewer, async () => userEvent.keyboard('{ArrowRight}'))).toBe('orbit');
    expect(await after(viewer, async () => userEvent.keyboard('{ArrowDown}'))).toBe('orbit');
    expect(await after(viewer, async () => userEvent.keyboard('{Shift>}{ArrowRight}{/Shift}'))).toBe('pan');
    expect(await after(viewer, async () => userEvent.keyboard('{Shift>}{ArrowLeft}{/Shift}'))).toBe('pan');
    expect(await after(viewer, async () => userEvent.keyboard('+'))).toBe('zoom');
    expect(await after(viewer, async () => userEvent.keyboard('-'))).toBe('zoom');
  });
});
