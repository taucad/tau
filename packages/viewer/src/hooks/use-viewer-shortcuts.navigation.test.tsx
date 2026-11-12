// @vitest-environment jsdom
import { useRef } from 'react';
import { act, render, screen } from '@testing-library/react';
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
import type { ViewerShortcutKeys } from '#hooks/use-viewer-shortcuts.js';

/*
 * N1 from the camera's state: in a focused viewer, under two mouse presets, the arrow keys orbit, Shift with an arrow
 * key pans and plus and minus zoom, through the real graphics actor, controls adapter and `camera-controls`. They do
 * nothing in a text field or a control with arrow keys of its own, nor while the host leaves them off.
 */

const viewers: NavigableViewer[] = [];

afterEach(() => {
  for (const viewer of viewers.splice(0)) {
    viewer.stop();
  }
});

const startViewer = (preset: CameraPresetId): NavigableViewer => {
  const viewer = startNavigableViewer(preset);
  viewers.push(viewer);
  return viewer;
};

let shortcutKeys: ViewerShortcutKeys | undefined;

function Viewer({ navigation }: Readonly<{ navigation: boolean }>): React.JSX.Element {
  const barRef = useRef<HTMLDivElement>(null);
  shortcutKeys = useViewerShortcuts(barRef, () => undefined, { navigation });
  return (
    <section data-viewer-frame aria-label='Viewer'>
      <div ref={barRef}>
        <button type='button'>Viewer control</button>
        <input aria-label='Viewer field' />
        <div role='slider' tabIndex={0} aria-label='Viewer slider' aria-valuenow={1} />
      </div>
    </section>
  );
}

const renderViewer = (viewer: NavigableViewer, navigation = true): void => {
  render(
    <KeyboardProvider>
      <GraphicsProvider graphicsRef={viewer.graphics}>
        <Viewer navigation={navigation} />
      </GraphicsProvider>
    </KeyboardProvider>,
  );
  act(() => {
    screen.getByRole('button', { name: 'Viewer control' }).focus();
  });
};

/** Presses `keys` and names what the camera did, after one frame. */
const press = async (viewer: NavigableViewer, keys: string): Promise<string> => {
  const before = readCamera(viewer);
  await userEvent.keyboard(keys);
  viewer.tick();
  return classifyCameraChange(before, readCamera(viewer));
};

const rows: ReadonlyArray<readonly [keys: string, gesture: string]> = [
  ['{ArrowLeft}', 'orbit'],
  ['{ArrowRight}', 'orbit'],
  ['{ArrowUp}', 'orbit'],
  ['{ArrowDown}', 'orbit'],
  ['{Shift>}{ArrowLeft}{/Shift}', 'pan'],
  ['{Shift>}{ArrowRight}{/Shift}', 'pan'],
  ['{Shift>}{ArrowUp}{/Shift}', 'pan'],
  ['{Shift>}{ArrowDown}{/Shift}', 'pan'],
  ['+', 'zoom'],
  ['=', 'zoom'],
  ['-', 'zoom'],
];

describe('viewer navigation keys (N1)', () => {
  describe.each(['tau', 'alt'] as const satisfies readonly CameraPresetId[])('under the %s preset', (preset) => {
    it.each(rows)('%s does a %s', async (keys, gesture) => {
      const viewer = startViewer(preset);
      renderViewer(viewer);
      expect(await press(viewer, keys)).toBe(gesture);
    });

    it('zooms in with plus and back out with minus', async () => {
      const viewer = startViewer(preset);
      renderViewer(viewer);
      const { distance } = readCamera(viewer);
      await press(viewer, '+');
      expect(readCamera(viewer).distance).toBeLessThan(distance);
      await press(viewer, '-');
      expect(readCamera(viewer).distance).toBeCloseTo(distance, 9);
    });
  });

  it("reports each step to the camera as the person's input", async () => {
    const viewer = startViewer('tau');
    renderViewer(viewer);
    await press(viewer, '{ArrowLeft}');
    expect(viewer.graphics.getSnapshot().context.cameraRef.getSnapshot().context.lastChange.source).toBe('input');
  });

  it('does nothing while focus is in a text field or a control with arrow keys of its own', async () => {
    const viewer = startViewer('tau');
    renderViewer(viewer);
    act(() => {
      screen.getByRole('textbox', { name: 'Viewer field' }).focus();
    });
    expect(await press(viewer, '{ArrowLeft}')).toBe('none');
    expect(await press(viewer, '-')).toBe('none');
    act(() => {
      screen.getByRole('slider', { name: 'Viewer slider' }).focus();
    });
    expect(await press(viewer, '{ArrowRight}')).toBe('none');
  });

  it('does nothing while the host leaves navigation off', async () => {
    const viewer = startViewer('tau');
    renderViewer(viewer, false);
    expect(await press(viewer, '{ArrowLeft}')).toBe('none');
    expect(await press(viewer, '+')).toBe('none');
  });

  it('gives each step its key for tooltips', () => {
    const viewer = startViewer('tau');
    renderViewer(viewer);
    expect(shortcutKeys?.navigation.zoomIn).toBe('+');
    expect(shortcutKeys?.navigation.zoomOut).toBe('-');
    expect(shortcutKeys?.navigation.panLeft).not.toBe(shortcutKeys?.navigation.orbitLeft);
  });
});
