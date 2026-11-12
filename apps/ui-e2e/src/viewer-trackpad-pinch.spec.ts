import { describe, expect, test } from 'vitest';
import { page as selectors } from 'vitest/browser';
import * as target from '#support/external-target.js';

/*
 * PF1, the trackpad pinch fix (onboarding plan T4a.1): a pinch is a `ctrlKey` wheel in Chromium and Firefox. In
 * perspective it changes the camera's distance and leaves `camera.zoom` at 1, in the same direction and by the same
 * ratio as a plain wheel of the same sign; in orthographic both change the zoom (the span shown). This spec runs in the
 * chromium, firefox and webkit-smoke projects. Playwright's WebKit is not Safari, so real Safari, which sends gesture
 * events for a pinch, is the manual run RO9.
 */

type CameraReading = Readonly<{
  projection: 'orthographic' | 'perspective';
  requestedFov: number;
  controlsDistance: number;
  zoom?: number;
  requestedPerspectiveZoom: number;
  verticalSpan: number;
  revision: number;
}>;

type PinchBridgeWindow = Window & {
  __TAU_SECTION_VIEW_TEST__?: {
    getCamera(): CameraReading;
    setFovAngle(angle: number): void;
    setPostProcessingEnabled(enabled: boolean): void;
  };
};

const previewCanvasSelector = 'canvas[data-engine]';
const birdhouseFixtureRoute = '/__e2e/example-fixture?locator=replicad.birdhouse&graphicsBackend=webgl';
/** One trackpad-sized wheel step, in pixels. */
const wheelDeltaPixels = 40;

async function openBirdhouseFixture(): Promise<void> {
  await target.setViewport({ width: 1280, height: 800 });
  await target.navigate(birdhouseFixtureRoute);
  await target.expectVisible(selectors.getByCss(previewCanvasSelector), 60_000);
  await target.expectGeometryFramed();
  await target.evaluate(() => {
    (globalThis as unknown as PinchBridgeWindow).__TAU_SECTION_VIEW_TEST__?.setPostProcessingEnabled(false);
  });
}

async function readCamera(): Promise<CameraReading> {
  return target.evaluate(() => {
    const bridge = (globalThis as unknown as PinchBridgeWindow).__TAU_SECTION_VIEW_TEST__;
    if (!bridge) {
      throw new Error('Section view e2e bridge is not installed.');
    }
    const camera = bridge.getCamera();
    return {
      projection: camera.projection,
      requestedFov: camera.requestedFov,
      controlsDistance: camera.controlsDistance,
      zoom: camera.zoom,
      requestedPerspectiveZoom: camera.requestedPerspectiveZoom,
      verticalSpan: camera.verticalSpan,
      revision: camera.revision,
    };
  });
}

/**
 * Sends one wheel step to the viewer's canvas centre, as the browser does for a mouse wheel (`ctrlKey` false) or a
 * trackpad pinch (`ctrlKey` true), and waits until the camera has taken it and settled.
 */
async function wheel({ deltaY, ctrlKey }: Readonly<{ deltaY: number; ctrlKey: boolean }>): Promise<{
  readonly before: CameraReading;
  readonly after: CameraReading;
  readonly defaultPrevented: boolean;
}> {
  const before = await readCamera();
  const defaultPrevented = await target.evaluateLocator(
    selectors.getByCss(previewCanvasSelector).first(),
    (canvas, init) => {
      const box = canvas.getBoundingClientRect();
      const event = new WheelEvent('wheel', {
        bubbles: true,
        cancelable: true,
        composed: true,
        clientX: box.left + box.width / 2,
        clientY: box.top + box.height / 2,
        deltaMode: 0,
        deltaY: init.deltaY,
        ctrlKey: init.ctrlKey,
      });
      canvas.dispatchEvent(event);
      return event.defaultPrevented;
    },
    { deltaY, ctrlKey },
  );
  await target.waitFor(
    (revision) =>
      ((globalThis as unknown as PinchBridgeWindow).__TAU_SECTION_VIEW_TEST__?.getCamera().revision ?? revision) >
      revision,
    before.revision,
  );
  // The step has landed when the camera has changed and then stayed the same for two frames.
  await target.evaluate(
    async () =>
      new Promise<void>((resolve) => {
        const readRevision = (): number | undefined =>
          (globalThis as unknown as PinchBridgeWindow).__TAU_SECTION_VIEW_TEST__?.getCamera().revision;
        let last = readRevision();
        let quietFrames = 0;
        const tick = (): void => {
          const revision = readRevision();
          quietFrames = revision === last ? quietFrames + 1 : 0;
          last = revision;
          if (quietFrames >= 2) {
            resolve();
            return;
          }
          requestAnimationFrame(tick);
        };
        requestAnimationFrame(tick);
      }),
  );
  const after = await readCamera();
  return { before, after, defaultPrevented };
}

async function setOrthographic(): Promise<void> {
  await target.evaluate(() => {
    (globalThis as unknown as PinchBridgeWindow).__TAU_SECTION_VIEW_TEST__?.setFovAngle(0);
  });
  await target.waitFor(() => {
    const camera = (globalThis as unknown as PinchBridgeWindow).__TAU_SECTION_VIEW_TEST__?.getCamera();
    return camera?.projection === 'orthographic' && camera.requestedFov === 0;
  });
}

describe('Viewer trackpad pinch (PF1)', () => {
  test.each([
    { direction: 'in', deltaY: -wheelDeltaPixels },
    { direction: 'out', deltaY: wheelDeltaPixels },
  ])('dollies a perspective pinch $direction as a plain wheel does, leaving the zoom at 1', async ({ deltaY }) => {
    await openBirdhouseFixture();

    const pinch = await wheel({ deltaY, ctrlKey: true });
    const plain = await wheel({ deltaY, ctrlKey: false });

    expect(pinch.before.projection).toBe('perspective');
    expect(pinch.defaultPrevented, 'a pinch inside the viewer never zooms the page').toBe(true);
    const pinchRatio = pinch.after.controlsDistance / pinch.before.controlsDistance;
    const plainRatio = plain.after.controlsDistance / plain.before.controlsDistance;
    expect(Math.sign(pinchRatio - 1), 'the pinch moves the camera the way the wheel does').toBe(Math.sign(deltaY));
    expect(pinchRatio).toBeCloseTo(plainRatio, 3);
    expect(pinch.after.zoom).toBe(1);
    expect(pinch.after.requestedPerspectiveZoom).toBe(1);
    expect(plain.after.zoom).toBe(1);
  });

  test.each([
    { direction: 'in', deltaY: -wheelDeltaPixels },
    { direction: 'out', deltaY: wheelDeltaPixels },
  ])('zooms an orthographic pinch $direction as a plain wheel does', async ({ deltaY }) => {
    await openBirdhouseFixture();
    await setOrthographic();

    const pinch = await wheel({ deltaY, ctrlKey: true });
    const plain = await wheel({ deltaY, ctrlKey: false });

    expect(pinch.before.projection).toBe('orthographic');
    const pinchRatio = pinch.after.verticalSpan / pinch.before.verticalSpan;
    const plainRatio = plain.after.verticalSpan / plain.before.verticalSpan;
    expect(Math.sign(pinchRatio - 1), 'the pinch zooms the way the wheel does').toBe(Math.sign(deltaY));
    expect(pinchRatio).toBeCloseTo(plainRatio, 3);
    expect(pinch.after.controlsDistance).toBeCloseTo(pinch.before.controlsDistance, 6);
  });
});
