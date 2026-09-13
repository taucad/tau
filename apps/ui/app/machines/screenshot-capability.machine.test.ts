import { describe, it, expect, vi, afterEach } from 'vitest';
import { createActor } from 'xstate';
import { mock } from 'vitest-mock-extended';
import type { AnyActorRef } from 'xstate';
import type * as THREE from 'three';
import type { ViewportCadGl } from '#components/geometry/graphics/three/viewport-cad-renderer.js';
import { screenshotCapabilityMachine, calculateOptimalGrid } from '#machines/screenshot-capability.machine.js';

// Three/addons -> lottie_canvas.module.js calls HTMLCanvasElement.getContext()
// during static init, which jsdom does not implement without the canvas npm
// package. Stub the transitive import so the module graph loads cleanly.
// eslint-disable-next-line @typescript-eslint/naming-convention -- Three.js export name
vi.mock('three/addons', () => ({ LineSegments2: vi.fn() }));

/* oxlint-disable @typescript-eslint/consistent-type-assertions -- test mocks use type assertions for complex third-party types */

// ---------------------------------------------------------------------------
// Factory helpers
// ---------------------------------------------------------------------------

function createMockGraphicsRef() {
  return mock<AnyActorRef>({ send: vi.fn() });
}

function createTestActor(graphicsRef?: AnyActorRef) {
  return createActor(screenshotCapabilityMachine, {
    input: { graphicsRef: graphicsRef ?? createMockGraphicsRef() },
  });
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('screenshotCapabilityMachine', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('calculateOptimalGrid', () => {
    it('should return 1x1 for zero items', () => {
      expect(calculateOptimalGrid(0)).toEqual({ columns: 1, rows: 1 });
    });

    it('should return 1x1 for negative items', () => {
      expect(calculateOptimalGrid(-5)).toEqual({ columns: 1, rows: 1 });
    });

    it('should return 1x1 for a single item', () => {
      expect(calculateOptimalGrid(1)).toEqual({ columns: 1, rows: 1 });
    });

    it('should calculate optimal grid for 6 items with 3:2 ratio', () => {
      const result = calculateOptimalGrid(6, { columns: 3, rows: 2 });
      expect(result).toEqual({ columns: 3, rows: 2 });
    });

    it('should calculate optimal grid for 4 items with default ratio', () => {
      const result = calculateOptimalGrid(4);
      expect(result).toEqual({ columns: 3, rows: 2 });
    });

    it('should produce enough cells for all items', () => {
      for (const count of [2, 3, 5, 7, 9, 12, 22]) {
        const grid = calculateOptimalGrid(count);
        expect(grid.columns * grid.rows).toBeGreaterThanOrEqual(count);
      }
    });

    it('should respect custom preferred ratios', () => {
      const wideResult = calculateOptimalGrid(6, { columns: 6, rows: 1 });
      const tallResult = calculateOptimalGrid(6, { columns: 1, rows: 6 });
      expect(wideResult.columns).toBeGreaterThanOrEqual(tallResult.columns);
    });
  });

  describe('initial state', () => {
    it('should start in waitingForRegistration', () => {
      const actor = createTestActor();
      actor.start();
      expect(actor.getSnapshot().value).toBe('waitingForRegistration');
      expect(actor.getSnapshot().context.isRegistered).toBe(false);
      expect(actor.getSnapshot().context.queuedCaptureRequests).toEqual([]);
      actor.stop();
    });

    it('should store graphicsRef from input', () => {
      const graphicsRef = createMockGraphicsRef();
      const actor = createTestActor(graphicsRef);
      actor.start();
      expect(actor.getSnapshot().context.graphicsRef).toBe(graphicsRef);
      actor.stop();
    });
  });

  describe('registration', () => {
    it('should transition to registered on registerCapture', () => {
      const graphicsRef = createMockGraphicsRef();
      const actor = createTestActor(graphicsRef);
      actor.start();

      actor.send({
        type: 'registerCapture',
        gl: {} as ViewportCadGl,
        scene: {} as THREE.Scene,
        camera: {} as THREE.Camera,
      });

      expect(actor.getSnapshot().value).toBe('registered');
      expect(actor.getSnapshot().context.isRegistered).toBe(true);
      expect(actor.getSnapshot().context.captureMode).toBe('threejs');
      actor.stop();
    });

    it('should transition to registered on registerSvgCapture', () => {
      const graphicsRef = createMockGraphicsRef();
      const actor = createTestActor(graphicsRef);
      actor.start();

      actor.send({
        type: 'registerSvgCapture',
        svgElement: {} as SVGSVGElement,
      });

      expect(actor.getSnapshot().value).toBe('registered');
      expect(actor.getSnapshot().context.isRegistered).toBe(true);
      expect(actor.getSnapshot().context.captureMode).toBe('svg');
      actor.stop();
    });

    it('should store gl, scene, and camera in context after registration', () => {
      const actor = createTestActor();
      actor.start();

      const gl = {} as ViewportCadGl;
      const scene = {} as THREE.Scene;
      const camera = {} as THREE.Camera;
      actor.send({ type: 'registerCapture', gl, scene, camera });

      const { context } = actor.getSnapshot();
      expect(context.gl).toBe(gl);
      expect(context.scene).toBe(scene);
      expect(context.camera).toBe(camera);
      actor.stop();
    });
  });

  describe('unregistration', () => {
    it('should transition back to waitingForRegistration on unregisterCapture', () => {
      const actor = createTestActor();
      actor.start();

      actor.send({
        type: 'registerCapture',
        gl: {} as ViewportCadGl,
        scene: {} as THREE.Scene,
        camera: {} as THREE.Camera,
      });
      expect(actor.getSnapshot().value).toBe('registered');

      actor.send({ type: 'unregisterCapture' });
      expect(actor.getSnapshot().value).toBe('waitingForRegistration');
      expect(actor.getSnapshot().context.isRegistered).toBe(false);
      actor.stop();
    });

    it('should not unregister if captureMode does not match', () => {
      const actor = createTestActor();
      actor.start();

      actor.send({
        type: 'registerSvgCapture',
        svgElement: {} as SVGSVGElement,
      });
      expect(actor.getSnapshot().value).toBe('registered');
      expect(actor.getSnapshot().context.captureMode).toBe('svg');

      actor.send({ type: 'unregisterCapture', captureMode: 'threejs' });
      expect(actor.getSnapshot().value).toBe('registered');
      actor.stop();
    });

    it('should unregister when captureMode matches', () => {
      const actor = createTestActor();
      actor.start();

      actor.send({
        type: 'registerSvgCapture',
        svgElement: {} as SVGSVGElement,
      });

      actor.send({ type: 'unregisterCapture', captureMode: 'svg' });
      expect(actor.getSnapshot().value).toBe('waitingForRegistration');
      actor.stop();
    });
  });

  describe('capture request queuing', () => {
    it('should queue capture requests while waiting for registration', () => {
      const actor = createTestActor();
      actor.start();

      actor.send({ type: 'capture', requestId: 'req-1' });
      actor.send({ type: 'capture', requestId: 'req-2' });

      expect(actor.getSnapshot().context.queuedCaptureRequests).toHaveLength(2);
      expect(actor.getSnapshot().context.queuedCaptureRequests[0]?.requestId).toBe('req-1');
      expect(actor.getSnapshot().context.queuedCaptureRequests[1]?.requestId).toBe('req-2');
      actor.stop();
    });

    it('should queue composite requests while waiting for registration', () => {
      const actor = createTestActor();
      actor.start();

      actor.send({ type: 'captureComposite', requestId: 'comp-1' });

      expect(actor.getSnapshot().context.queuedCaptureRequests).toHaveLength(1);
      expect(actor.getSnapshot().context.queuedCaptureRequests[0]?.isComposite).toBe(true);
      actor.stop();
    });

    it('should process queued requests after registration', () => {
      const actor = createTestActor();
      actor.start();

      actor.send({ type: 'capture', requestId: 'req-1' });
      expect(actor.getSnapshot().context.queuedCaptureRequests).toHaveLength(1);

      actor.send({
        type: 'registerCapture',
        gl: {} as ViewportCadGl,
        scene: {} as THREE.Scene,
        camera: {} as THREE.Camera,
      });

      expect(actor.getSnapshot().context.queuedCaptureRequests).toHaveLength(0);
      expect(actor.getSnapshot().value).toBe('capturing');
      actor.stop();
    });
  });

  describe('registration timeout', () => {
    it('should transition to registrationFailed after timeout', () => {
      vi.useFakeTimers();
      try {
        const graphicsRef = createMockGraphicsRef();
        const actor = createTestActor(graphicsRef);
        actor.start();

        actor.send({ type: 'capture', requestId: 'req-1' });

        vi.advanceTimersByTime(5000);

        expect(actor.getSnapshot().value).toBe('registrationFailed');
        expect(actor.getSnapshot().context.registrationError).toBe('Registration timeout after 5 seconds');
        expect(actor.getSnapshot().context.queuedCaptureRequests).toHaveLength(0);
        actor.stop();
      } finally {
        vi.useRealTimers();
      }
    });

    it('should clear queued requests on timeout', () => {
      vi.useFakeTimers();
      try {
        const actor = createTestActor();
        actor.start();

        actor.send({ type: 'capture', requestId: 'timeout-req' });
        expect(actor.getSnapshot().context.queuedCaptureRequests).toHaveLength(1);

        vi.advanceTimersByTime(5000);

        expect(actor.getSnapshot().value).toBe('registrationFailed');
        expect(actor.getSnapshot().context.queuedCaptureRequests).toHaveLength(0);
        actor.stop();
      } finally {
        vi.useRealTimers();
      }
    });

    it('should still allow registration recovery after timeout', () => {
      vi.useFakeTimers();
      try {
        const actor = createTestActor();
        actor.start();

        vi.advanceTimersByTime(5000);
        expect(actor.getSnapshot().value).toBe('registrationFailed');

        actor.send({
          type: 'registerCapture',
          gl: {} as ViewportCadGl,
          scene: {} as THREE.Scene,
          camera: {} as THREE.Camera,
        });
        expect(actor.getSnapshot().value).toBe('registered');
        actor.stop();
      } finally {
        vi.useRealTimers();
      }
    });

    it('should not queue new requests in registrationFailed state', () => {
      vi.useFakeTimers();
      try {
        const actor = createTestActor();
        actor.start();

        vi.advanceTimersByTime(5000);
        expect(actor.getSnapshot().value).toBe('registrationFailed');

        actor.send({ type: 'capture', requestId: 'late-req' });

        expect(actor.getSnapshot().value).toBe('registrationFailed');
        expect(actor.getSnapshot().context.queuedCaptureRequests).toHaveLength(0);
        actor.stop();
      } finally {
        vi.useRealTimers();
      }
    });
  });

  describe('re-registration', () => {
    it('should allow re-registration in registered state', () => {
      const graphicsRef = createMockGraphicsRef();
      const actor = createTestActor(graphicsRef);
      actor.start();

      actor.send({
        type: 'registerCapture',
        gl: {} as ViewportCadGl,
        scene: {} as THREE.Scene,
        camera: {} as THREE.Camera,
      });
      expect(actor.getSnapshot().value).toBe('registered');

      actor.send({
        type: 'registerSvgCapture',
        svgElement: {} as SVGSVGElement,
      });

      expect(actor.getSnapshot().value).toBe('registered');
      expect(actor.getSnapshot().context.captureMode).toBe('svg');
      actor.stop();
    });
  });
});
