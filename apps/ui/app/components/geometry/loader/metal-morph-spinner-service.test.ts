import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Mock } from 'vitest';
import type { MetalMorphLoaderController } from '#components/geometry/loader/metal-morph-controller.js';
import type { MetalMorphSpinnerTarget } from '#components/geometry/loader/metal-morph-spinner-service.js';

const hoisted = vi.hoisted(() => ({
  controllers: [] as MetalMorphLoaderController[],
  createOptions: [] as Array<{ canvas?: HTMLCanvasElement; onFrame?: () => void; theme?: string; quality?: string }>,
  probeResult: false,
}));

vi.mock('#components/geometry/loader/metal-morph-controller.js', () => ({
  createMetalMorphLoader: vi.fn((options: { onFrame?: () => void }) => {
    hoisted.createOptions.push(options);
    const controller = {
      ready: Promise.resolve(),
      play: vi.fn(),
      pause: vi.fn(),
      renderOnce: vi.fn(),
      setSize: vi.fn(),
      setTheme: vi.fn(),
      setSpeed: vi.fn(),
      jumpTo: vi.fn(),
      tune: vi.fn(),
      getTuning: vi.fn(),
      getSequenceState: vi.fn(),
      getStatistics: vi.fn(() => ({ backend: 'webgl2' })),
      getShaderSource: vi.fn(),
      captureFrame: vi.fn(),
      dispose: vi.fn(),
    } as unknown as MetalMorphLoaderController;
    hoisted.controllers.push(controller);
    return controller;
  }),
}));

vi.mock('#components/geometry/graphics/graphics-backend.js', () => ({
  probeWebGpuSupport: vi.fn(async (): Promise<boolean> => hoisted.probeResult),
  readGraphicsBackendQueryOverride: vi.fn((): undefined => undefined),
  resolveGraphicsBackendPreference: vi.fn((): string => 'webgl'),
}));

const { createMetalMorphSpinnerService } = await import('#components/geometry/loader/metal-morph-spinner-service.js');

type FakeContext = {
  clearRect: ReturnType<typeof vi.fn>;
  drawImage: Mock<(source: CanvasImageSource, ...box: number[]) => void>;
  imageSmoothingEnabled: boolean;
  imageSmoothingQuality: string;
};

type FakeTarget = MetalMorphSpinnerTarget & {
  context: FakeContext;
  firstFrames: number;
};

/** A spinner canvas without jsdom's 2D context, which the service only ever clears and copies into. */
const createTarget = (options: { isIntersecting?: boolean; size?: number; paintFails?: boolean } = {}): FakeTarget => {
  const context: FakeContext = {
    clearRect: vi.fn(),
    drawImage: vi.fn(() => {
      if (options.paintFails) {
        throw new DOMException('The canvas backing store is gone.', 'InvalidStateError');
      }
    }),
    imageSmoothingEnabled: false,
    imageSmoothingQuality: 'low',
  };
  const canvas = { width: 0, height: 0, getContext: vi.fn((): FakeContext => context) };
  const side = options.size ?? 16;
  const target = {
    canvas: canvas as unknown as HTMLCanvasElement,
    getSize: () => ({ width: side, height: side, pixelRatio: 2 }),
    isIntersecting: () => options.isIntersecting ?? true,
    onFirstFrame: () => {
      target.firstFrames += 1;
    },
    context,
    firstFrames: 0,
  };
  return target;
};

const lastController = (): MetalMorphLoaderController => {
  const controller = hoisted.controllers.at(-1);
  if (!controller) {
    throw new Error('the service created no controller');
  }
  return controller;
};

/** Runs the microtasks the service awaits while it probes the adapter and warms the controller. */
const settle = async (): Promise<void> => {
  await Promise.resolve();
  await Promise.resolve();
  await Promise.resolve();
};

describe('metalMorphSpinnerService', () => {
  beforeEach(() => {
    hoisted.controllers.length = 0;
    hoisted.createOptions.length = 0;
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.clearAllMocks();
  });

  it('should open one renderer however many spinners subscribe', async () => {
    const service = createMetalMorphSpinnerService();
    const targets = Array.from({ length: 20 }, () => createTarget());
    for (const target of targets) {
      service.subscribe(target);
    }
    await settle();

    expect(hoisted.controllers).toHaveLength(1);
    expect(service.getDiagnostics()).toMatchObject({ subscriberCount: 20, activeCount: 20, rendererCount: 1 });
  });

  it('should reuse the live renderer for a spinner that subscribes later', async () => {
    const service = createMetalMorphSpinnerService();
    service.subscribe(createTarget());
    await settle();
    expect(hoisted.controllers).toHaveLength(1);

    service.subscribe(createTarget());
    await settle();

    expect(hoisted.controllers).toHaveLength(1);
    expect(service.getDiagnostics().subscriberCount).toBe(2);
  });

  it('should ask the inline tier for a source that covers the largest spinner', async () => {
    const service = createMetalMorphSpinnerService();
    service.subscribe(createTarget({ size: 16 }));
    await settle();
    expect(hoisted.createOptions[0]).toMatchObject({ quality: 'inline' });

    service.subscribe(createTarget({ size: 96 }));
    await settle();

    // 96 CSS px at a 2× ratio is 192 device px, which the inline tier caps at 128.
    expect(service.getDiagnostics().sourceSize).toBe(128);
    expect(lastController().setSize).toHaveBeenCalledWith({ width: 128, height: 128, pixelRatio: 1 });
  });

  it('should copy each frame to the spinners on screen and leave the others untouched', async () => {
    const service = createMetalMorphSpinnerService();
    const visible = createTarget({ isIntersecting: true });
    const offscreen = createTarget({ isIntersecting: false });
    service.subscribe(visible);
    service.subscribe(offscreen);
    await settle();

    hoisted.createOptions[0]?.onFrame?.();

    expect(visible.context.drawImage).toHaveBeenCalledTimes(1);
    expect(visible.firstFrames).toBe(1);
    expect(offscreen.context.drawImage).not.toHaveBeenCalled();
    expect(offscreen.firstFrames).toBe(0);
  });

  it('should announce the first frame once and keep painting afterwards', async () => {
    const service = createMetalMorphSpinnerService();
    const target = createTarget();
    service.subscribe(target);
    await settle();

    hoisted.createOptions[0]?.onFrame?.();
    hoisted.createOptions[0]?.onFrame?.();

    expect(target.context.drawImage).toHaveBeenCalledTimes(2);
    expect(target.firstFrames).toBe(1);
  });

  it('should size a spinner canvas to its own device box before copying into it', async () => {
    const service = createMetalMorphSpinnerService();
    const target = createTarget({ size: 16 });
    service.subscribe(target);
    await settle();

    hoisted.createOptions[0]?.onFrame?.();

    expect(target.canvas.width).toBe(32);
    expect(target.canvas.height).toBe(32);
    expect(target.context.drawImage).toHaveBeenCalledWith(expect.anything(), 0, 0, 32, 32);
  });

  it('should hold the loop while every spinner is offscreen', async () => {
    const service = createMetalMorphSpinnerService();
    service.subscribe(createTarget({ isIntersecting: false }));
    await settle();

    expect(lastController().play).not.toHaveBeenCalled();
    expect(lastController().pause).toHaveBeenCalled();
    expect(service.getDiagnostics()).toMatchObject({ activeCount: 0, isLooping: false });
  });

  it('should hold a still frame under reduced motion and paint every spinner, on screen or not', async () => {
    const service = createMetalMorphSpinnerService();
    const offscreen = createTarget({ isIntersecting: false });
    service.subscribe(createTarget());
    service.subscribe(offscreen);
    service.setMotionAllowed(false);
    await settle();

    expect(lastController().play).not.toHaveBeenCalled();
    expect(lastController().renderOnce).toHaveBeenCalled();

    hoisted.createOptions[0]?.onFrame?.();

    expect(offscreen.context.drawImage).toHaveBeenCalledTimes(1);
  });

  it('should pause while the document is hidden and resume when it returns', async () => {
    const service = createMetalMorphSpinnerService();
    service.subscribe(createTarget());
    await settle();
    const controller = lastController();
    vi.mocked(controller.play).mockClear();

    service.setDocumentHidden(true);
    expect(controller.pause).toHaveBeenCalled();
    expect(service.getDiagnostics().isLooping).toBe(false);

    service.setDocumentHidden(false);
    expect(controller.play).toHaveBeenCalled();
    expect(service.getDiagnostics().isLooping).toBe(true);
  });

  it('should forward a theme change to the one renderer, and only when it changes', async () => {
    const service = createMetalMorphSpinnerService();
    service.subscribe(createTarget());
    await settle();

    service.setTheme('light');
    service.setTheme('light');

    expect(lastController().setTheme).toHaveBeenCalledExactlyOnceWith('light');
  });

  it('should release the renderer after the page has gone without spinners, and open a new one on demand', async () => {
    const service = createMetalMorphSpinnerService();
    const unsubscribe = service.subscribe(createTarget());
    await settle();
    const controller = lastController();

    unsubscribe();
    expect(controller.pause).toHaveBeenCalled();
    expect(service.getDiagnostics().rendererCount).toBe(1);

    await vi.advanceTimersByTimeAsync(30_000);

    expect(controller.dispose).toHaveBeenCalled();
    expect(service.getDiagnostics()).toMatchObject({ subscriberCount: 0, rendererCount: 0, isLooping: false });

    service.subscribe(createTarget());
    await settle();

    expect(hoisted.controllers).toHaveLength(2);
    expect(service.getDiagnostics().rendererCount).toBe(1);
  });

  it('should keep the renderer when a spinner returns before the idle delay', async () => {
    const service = createMetalMorphSpinnerService();
    const unsubscribe = service.subscribe(createTarget());
    await settle();

    unsubscribe();
    await vi.advanceTimersByTimeAsync(10_000);
    service.subscribe(createTarget());
    await vi.advanceTimersByTimeAsync(30_000);

    expect(lastController().dispose).not.toHaveBeenCalled();
    expect(hoisted.controllers).toHaveLength(1);
  });

  it('should stop copying to a spinner once it unsubscribes', async () => {
    const service = createMetalMorphSpinnerService();
    const target = createTarget();
    const unsubscribe = service.subscribe(target);
    service.subscribe(createTarget());
    await settle();

    unsubscribe();
    hoisted.createOptions[0]?.onFrame?.();

    expect(target.context.drawImage).not.toHaveBeenCalled();
  });

  it('should keep painting every other spinner in the frame when one canvas throws', async () => {
    const service = createMetalMorphSpinnerService();
    const before = createTarget();
    const broken = createTarget({ paintFails: true });
    const after = createTarget();
    service.subscribe(before);
    service.subscribe(broken);
    service.subscribe(after);
    await settle();

    hoisted.createOptions[0]?.onFrame?.();

    // One canvas losing its backing store is that canvas's problem: the frame still reaches the others.
    expect(before.context.drawImage).toHaveBeenCalledTimes(1);
    expect(after.context.drawImage).toHaveBeenCalledTimes(1);
    expect(after.firstFrames).toBe(1);
    expect(service.getDiagnostics()).toMatchObject({ missedFrameCount: 1, paintFailureCount: 1 });
  });

  it('should fan each frame out from one snapshot of the source rather than reading the renderer per spinner', async () => {
    const snapshotContext: FakeContext = {
      clearRect: vi.fn(),
      drawImage: vi.fn(),
      imageSmoothingEnabled: false,
      imageSmoothingQuality: 'low',
    };
    // The service's own snapshot canvas is the only one that reaches jsdom's `getContext`.
    const getContext = vi
      .spyOn(HTMLCanvasElement.prototype, 'getContext')
      .mockImplementation(() => snapshotContext as unknown as CanvasRenderingContext2D);
    try {
      const service = createMetalMorphSpinnerService();
      const targets = [createTarget(), createTarget(), createTarget()];
      for (const target of targets) {
        service.subscribe(target);
      }
      await settle();

      hoisted.createOptions[0]?.onFrame?.();

      // The renderer's drawing buffer is read once per frame, into the snapshot; the spinners copy that.
      expect(snapshotContext.drawImage).toHaveBeenCalledTimes(1);
      const [snapshotSource] = snapshotContext.drawImage.mock.calls[0] ?? [];
      expect(snapshotSource).toBe(hoisted.createOptions[0]?.canvas);
      for (const target of targets) {
        const [copied] = target.context.drawImage.mock.calls[0] ?? [];
        expect(copied).toBeInstanceOf(HTMLCanvasElement);
        expect(copied).not.toBe(snapshotSource);
      }
      expect(service.getDiagnostics()).toMatchObject({ missedFrameCount: 0, paintFailureCount: 0 });
    } finally {
      getContext.mockRestore();
    }
  });

  it('should report every spinner on screen as painted by the latest frame', async () => {
    const service = createMetalMorphSpinnerService();
    const visible = [createTarget(), createTarget()];
    const offscreen = createTarget({ isIntersecting: false });
    for (const target of [...visible, offscreen]) {
      service.subscribe(target);
    }
    await settle();

    hoisted.createOptions[0]?.onFrame?.();
    hoisted.createOptions[0]?.onFrame?.();

    // Two frames drawn, both copied to both spinners on screen; the one offscreen is not counted as missed.
    for (const target of visible) {
      expect(target.context.drawImage).toHaveBeenCalledTimes(2);
    }
    expect(service.getDiagnostics()).toMatchObject({ frameCount: 2, missedFrameCount: 0 });
  });

  it('should tune the renderer it has and start a renderer it opens later with the same tuning', async () => {
    const service = createMetalMorphSpinnerService();
    service.tune({ material: { roughnessRest: 0.3 }, timing: { restDuration: 900 } });
    service.tune({ material: { swell: 0.1 }, exposure: 1.2 });
    const unsubscribe = service.subscribe(createTarget());
    await settle();

    // Opened after both patches: it starts from their fold, not from the last one alone.
    expect(lastController().tune).toHaveBeenCalledExactlyOnceWith({
      material: { roughnessRest: 0.3, swell: 0.1 },
      timing: { restDuration: 900 },
      bloom: {},
      environment: {},
      exposure: 1.2,
    });

    service.tune({ bloom: { strength: 0.5 } });
    expect(lastController().tune).toHaveBeenLastCalledWith({ bloom: { strength: 0.5 } });

    unsubscribe();
    await vi.advanceTimersByTimeAsync(30_000);
    service.subscribe(createTarget());
    await settle();
    expect(hoisted.controllers).toHaveLength(2);
    expect(lastController().tune).toHaveBeenCalledExactlyOnceWith(
      expect.objectContaining({ exposure: 1.2, bloom: { strength: 0.5 } }),
    );
  });

  it('should not open a context when every spinner leaves while the adapter is being probed', async () => {
    const service = createMetalMorphSpinnerService();
    const unsubscribe = service.subscribe(createTarget());
    unsubscribe();
    await settle();

    expect(hoisted.controllers).toHaveLength(0);
    expect(service.getDiagnostics().rendererCount).toBe(0);
  });
});
