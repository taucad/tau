/*
 * The view cube's mount: it hands graphics the cube's adapter from its group's ref, and nothing else. The adapter's own
 * behaviour is in `viewport-gizmo-adapter.test.ts`.
 */
import { StrictMode } from 'react';
import { render } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createActor, createAsyncLogic } from 'xstate';
import type { Actor } from 'xstate';
import { ViewportGizmoCube } from '#graphics/three/controls/viewport-gizmo-cube.jsx';
import type { SectionPlanePicker } from '#graphics/three/controls/section-plane-picker.js';
import type { ViewportGizmoHost } from '#graphics/three/controls/viewport-gizmo-adapter.js';
import { graphicsMachine } from '#machines/graphics.machine.js';
import type { CameraUpdateHandler } from '#services/graphics-camera-registry.js';

const mocks = vi.hoisted(() => {
  const perspectiveCamera = { kind: 'perspective' };
  const orthographicCamera = { kind: 'orthographic' };
  const rig = { activeCamera: perspectiveCamera, perspectiveCamera, orthographicCamera };
  const store = { getState: () => ({}), subscribe: () => () => undefined };
  return {
    rig,
    store,
    perspectiveCamera,
    orthographicCamera,
    consumersRef: { current: new Set<unknown>() },
    graphics: undefined as unknown,
    hosts: [] as unknown[],
    starts: 0,
    stops: 0,
  };
});

vi.mock('@react-three/fiber', () => ({
  useStore: () => mocks.store,
}));
vi.mock('#hooks/use-graphics.jsx', () => ({
  useCameraRig: () => mocks.rig,
  useCameraConsumersRef: () => mocks.consumersRef,
  useGraphics: () => mocks.graphics,
}));
vi.mock('#graphics/three/three-graphics-backend-context.jsx', () => ({
  useThreeGraphicsBackend: () => 'webgpu',
}));
// The adapter, scripted: it records the host it was built around, joins the consumers and counts its starts and stops.
vi.mock('#graphics/three/controls/viewport-gizmo-adapter.js', async () => {
  const { createCallbackLogic } = await import('xstate');
  return {
    createViewportGizmoAdapter: (host: ViewportGizmoHost) => {
      mocks.hosts.push(host);
      return createCallbackLogic(() => {
        mocks.starts += 1;
        const follow = (): void => undefined;
        host.consumersRef.current.add(follow as unknown as CameraUpdateHandler);
        return () => {
          mocks.stops += 1;
          host.consumersRef.current.delete(follow as unknown as CameraUpdateHandler);
        };
      });
    },
  };
});

/** A picker the cube only passes on. */
const pickerStub = Object.freeze({}) as unknown as SectionPlanePicker;
let graphics: Actor<typeof graphicsMachine>;

beforeEach(() => {
  graphics = createActor(
    graphicsMachine.provide({ actors: { probeWebGpu: createAsyncLogic({ run: async () => false }) } }),
    { input: {} },
  ).start();
  mocks.graphics = graphics;
  mocks.hosts.length = 0;
  mocks.starts = 0;
  mocks.stops = 0;
  mocks.consumersRef.current.clear();
});

afterEach(() => {
  graphics.stop();
});

describe('ViewportGizmoCube', () => {
  it('should hand graphics one adapter built around the canvas, the view and the cube placement', () => {
    render(<ViewportGizmoCube container='#gizmo' size={80} planePicker={pickerStub} />);

    expect(mocks.starts).toBe(1);
    expect(mocks.hosts).toEqual([
      expect.objectContaining({
        store: mocks.store,
        rig: mocks.rig,
        consumersRef: mocks.consumersRef,
        graphics,
        container: '#gizmo',
        size: 80,
        backend: 'webgpu',
        planePicker: pickerStub,
      }),
    ]);
    expect(graphics.getSnapshot().context.viewportGizmo).toBeDefined();
  });

  it('should keep its adapter across re-renders and a theme change, which reach it as events', () => {
    const mounted = render(<ViewportGizmoCube planePicker={pickerStub} />);
    mounted.rerender(<ViewportGizmoCube planePicker={pickerStub} />);
    graphics.send({
      type: 'viewerEnvironmentChanged',
      environment: { colorScheme: 'dark', isHighContrast: true, accentColor: '#00aaff' },
    });

    expect([mocks.starts, mocks.stops]).toEqual([1, 0]);
  });

  it('should run one gesture under StrictMode and stop it when the cube leaves', () => {
    const mounted = render(
      <StrictMode>
        <ViewportGizmoCube planePicker={pickerStub} />
      </StrictMode>,
    );

    expect(mocks.starts - mocks.stops).toBe(1);
    mounted.unmount();
    expect(mocks.starts - mocks.stops).toBe(0);
    expect(graphics.getSnapshot().context.viewportGizmo).toBeUndefined();
    expect(mocks.consumersRef.current.size).toBe(0);
  });

  it('should hand graphics a new adapter for a style change, and the style it draws (G5)', () => {
    const mounted = render(<ViewportGizmoCube planePicker={pickerStub} gizmoStyle='cube' />);
    mounted.rerender(<ViewportGizmoCube planePicker={pickerStub} gizmoStyle='axis-balls' />);

    expect(mocks.hosts).toEqual([
      expect.objectContaining({ gizmoStyle: 'cube' }),
      expect.objectContaining({ gizmoStyle: 'axis-balls' }),
    ]);
    expect([mocks.starts, mocks.stops]).toEqual([2, 1]);
    expect(mocks.consumersRef.current.size).toBe(1);
  });
});
