/* oxlint-disable no-await-in-loop -- Each binding is a gesture on one live camera: they run one after another. */
import { describe, expect } from 'vitest';
import { page as selectors } from 'vitest/browser';
import * as target from '#support/external-target.js';
import { flagTest, runsInFlagStates } from '#support/flag-state-test.js';

/*
 * Step 3's live preview. (a) Steps 1 and 2 download no chunk holding three.js; step 3
 * does, behind a placeholder of the preview's final size. (b) The preview starts no kernel worker and loads no kernel
 * WebAssembly. (c) Every binding the legend lists moves the preview's camera as the legend says, classified from the
 * camera state as the viewer navigation specs do. (d) Changing the preset moves no camera. (f) Without WebGL, and with the
 * context lost, the diagram shows and setup carries on; under reduced motion it does not animate. (g) Leaving step 3
 * leaves no viewer canvas. The chunk-failure fallback is a component test (`setup-viewer-step.test.tsx`): this
 * harness cannot fail one chunk request. Runs in the flag states where step 3 exists.
 */

type Vector = readonly [number, number, number];
type CameraReading = Readonly<{
  position: Vector;
  target: Vector;
  controlsDistance: number;
  zoom?: number;
  revision: number;
}>;
type BridgeWindow = Window & { __TAU_SECTION_VIEW_TEST__?: { getCamera(): CameraReading } };

type Gesture = 'orbit' | 'pan' | 'zoom';
/** One legend binding, read back from its key caps. */
type Binding = Readonly<{
  input: 'left' | 'middle' | 'right' | 'scroll' | 'pinch';
  shiftKey: boolean;
  ctrlKey: boolean;
  altKey: boolean;
}>;

const previewCanvas = '[data-testid="setup-live-preview"] canvas';
const kernelWorker = /^runtime(?:-debug)?\.worker(?:-[\w-]+)?\.(?:js|ts)$/u;
/** Every three.js build registers itself under this global name. */
const threeMarker = '__THREE__';

const stepHeading = (name: string) => selectors.getByRole('heading', { level: 1, name });
const continueButton = () => selectors.getByRole('button', { name: 'Continue', exact: true });

/** The key caps the legend prints (`setup-copy.ts` `keyCapCopy`), back to the input they name. */
const capInputs: ReadonlyMap<string, Binding['input']> = new Map([
  ['Left drag', 'left'],
  ['Middle drag', 'middle'],
  ['Right drag', 'right'],
  ['Click drag', 'left'],
  ['Scroll', 'scroll'],
  ['Two-finger scroll', 'scroll'],
  ['Pinch', 'pinch'],
]);

const openStepTwo = async (): Promise<void> => {
  await target.setViewport({ width: 1280, height: 900 });
  await target.navigate('/welcome?entry=help');
  await target.expectVisible(stepHeading('What do you want to make?'), 60_000);
  await target.click(continueButton());
  await target.expectVisible(stepHeading('Where are you coming from?'));
};

const openStepThree = async (): Promise<void> => {
  await openStepTwo();
  await target.click(continueButton());
  await target.expectVisible(stepHeading('Make the viewer feel like home'));
};

const readCamera = async (): Promise<CameraReading> =>
  target.evaluate(() => {
    const bridge = (globalThis as unknown as BridgeWindow).__TAU_SECTION_VIEW_TEST__;
    if (!bridge) {
      throw new Error('The viewer e2e bridge is not installed: the preview has not rendered.');
    }
    const { position, target: focus, controlsDistance, zoom, revision } = bridge.getCamera();
    return { position, target: focus, controlsDistance, zoom, revision };
  });

/** Wait until the camera has stayed the same for a few frames, so damping has settled. */
const settleCamera = async (): Promise<void> => {
  await target.evaluate(
    async () =>
      new Promise<void>((resolve) => {
        const read = (): number | undefined =>
          (globalThis as unknown as BridgeWindow).__TAU_SECTION_VIEW_TEST__?.getCamera().revision;
        let last = read();
        let quiet = 0;
        const tick = (): void => {
          const revision = read();
          quiet = revision === last ? quiet + 1 : 0;
          last = revision;
          if (quiet >= 4) {
            resolve();
            return;
          }
          requestAnimationFrame(tick);
        };
        requestAnimationFrame(tick);
      }),
  );
};

const subtract = (left: Vector, right: Vector): Vector => [left[0] - right[0], left[1] - right[1], left[2] - right[2]];
const length = (vector: Vector): number => Math.hypot(...vector);

/** Which gesture moved the camera between two readings, classified as the viewer navigation specs do. */
const classify = (before: CameraReading, after: CameraReading): Gesture | 'none' | 'mixed' => {
  const scale = Math.max(before.controlsDistance, 1e-6);
  const directionBefore = subtract(before.position, before.target);
  const directionAfter = subtract(after.position, after.target);
  const cosine =
    (directionBefore[0] * directionAfter[0] +
      directionBefore[1] * directionAfter[1] +
      directionBefore[2] * directionAfter[2]) /
    Math.max(length(directionBefore) * length(directionAfter), 1e-12);
  const rotated = Math.acos(Math.min(1, Math.max(-1, cosine))) > 1e-3;
  const zoomed =
    Math.abs(after.controlsDistance - before.controlsDistance) / scale > 1e-3 ||
    Math.abs((after.zoom ?? 1) - (before.zoom ?? 1)) > 1e-3;
  const panned = length(subtract(after.target, before.target)) / scale > 1e-3;
  if (rotated && !zoomed) {
    return 'orbit';
  }
  if (zoomed && !rotated) {
    return 'zoom';
  }
  if (panned && !rotated && !zoomed) {
    return 'pan';
  }
  return rotated || zoomed || panned ? 'mixed' : 'none';
};

/** The legend's bindings for each gesture, read from its key caps. */
const readLegend = async (): Promise<ReadonlyArray<Readonly<{ gesture: Gesture; caps: readonly string[] }>>> =>
  target.evaluate(() =>
    (['orbit', 'pan', 'zoom'] as const).flatMap((gesture) =>
      [...document.querySelectorAll(`[data-testid="setup-legend-${gesture}"] > span.inline-flex`)].map((binding) => ({
        gesture,
        caps: [...binding.querySelectorAll('kbd')].map((cap) => cap.textContent),
      })),
    ),
  );

const bindingOf = (caps: readonly string[]): Binding => {
  const input = caps.map((cap) => capInputs.get(cap)).find((value) => value !== undefined);
  if (input === undefined) {
    throw new Error(`The legend binding ${caps.join(' + ')} names no input`);
  }
  return {
    input,
    shiftKey: caps.includes('Shift'),
    ctrlKey: caps.includes('Ctrl'),
    altKey: caps.includes('Alt'),
  };
};

/** Perform one binding on the preview's canvas, as the browser delivers it, and wait for the camera to settle. */
const perform = async (binding: Binding): Promise<void> => {
  await target.evaluateLocator(
    selectors.getByCss(previewCanvas).first(),
    (canvas, init) => {
      const box = canvas.getBoundingClientRect();
      const x = box.left + box.width / 2;
      const y = box.top + box.height / 2;
      const keys = { shiftKey: init.shiftKey, ctrlKey: init.ctrlKey, altKey: init.altKey };
      if (init.input === 'scroll' || init.input === 'pinch') {
        canvas.dispatchEvent(
          new WheelEvent('wheel', {
            bubbles: true,
            cancelable: true,
            composed: true,
            clientX: x,
            clientY: y,
            deltaMode: 0,
            deltaY: 60,
            ...keys,
            // A pinch is a `ctrlKey` wheel in Chromium.
            ctrlKey: init.input === 'pinch' || init.ctrlKey,
          }),
        );
        return;
      }
      const button = { left: 0, middle: 1, right: 2 }[init.input];
      const buttons = { left: 1, middle: 4, right: 2 }[init.input];
      const pointer = {
        bubbles: true,
        cancelable: true,
        composed: true,
        pointerId: 1,
        pointerType: 'mouse',
        isPrimary: true,
      };
      canvas.dispatchEvent(
        new PointerEvent('pointerdown', { ...pointer, ...keys, button, buttons, clientX: x, clientY: y }),
      );
      for (let step = 1; step <= 6; step += 1) {
        canvas.dispatchEvent(
          new PointerEvent('pointermove', {
            ...pointer,
            ...keys,
            button: -1,
            buttons,
            clientX: x + step * 12,
            clientY: y + step * 7,
          }),
        );
      }
      canvas.dispatchEvent(
        new PointerEvent('pointerup', { ...pointer, ...keys, button, buttons: 0, clientX: x + 72, clientY: y + 42 }),
      );
    },
    binding,
  );
  await settleCamera();
};

const expectPreviewRendered = async (): Promise<void> => {
  await target.expectVisible(selectors.getByCss(previewCanvas), 120_000);
  await target.waitFor(() => (globalThis as unknown as BridgeWindow).__TAU_SECTION_VIEW_TEST__ !== undefined);
  await settleCamera();
};

describe.runIf(runsInFlagStates(['all-on', 'viewer-controls-onboarding']))('setup step 3 live preview', () => {
  flagTest(
    'loads three.js only on step 3, behind a placeholder of the final size (a), with no kernel (b)',
    async () => {
      await target.startObservedRequests();
      await target.startObservedWasm();
      await openStepTwo();
      const requestedBefore = await target.readObservedRequests();
      const beforeStepThree = requestedBefore.filter((path) => path.endsWith('.js'));
      const threeBefore = await target.evaluate(
        async ({ paths, marker }) => {
          const holding: string[] = [];
          for (const path of paths) {
            const response = await fetch(path);
            const text = await response.text();
            if (text.includes(marker)) {
              holding.push(path);
            }
          }
          return holding;
        },
        { paths: beforeStepThree, marker: threeMarker },
      );
      expect(threeBefore, 'chunks holding three.js before step 3').toStrictEqual([]);

      await target.click(continueButton());
      const placeholderBox = await target.boundingBox(selectors.getByTestId('setup-viewer-preview'));
      await expectPreviewRendered();
      const renderedBox = await target.boundingBox(selectors.getByTestId('setup-viewer-preview'));
      expect(renderedBox, 'the preview area keeps its size').toStrictEqual(placeholderBox);
      const requestedOnStepThree = await target.readObservedRequests();
      const onStepThree = requestedOnStepThree.filter((path) => path.endsWith('.js'));
      const threeOnStepThree = await target.evaluate(
        async ({ paths, marker }) => {
          const texts = await Promise.all(
            paths.map(async (path) => {
              const response = await fetch(path);
              return response.text();
            }),
          );
          return texts.some((text) => text.includes(marker));
        },
        { paths: onStepThree, marker: threeMarker },
      );
      expect(threeOnStepThree, 'step 3 loads three.js').toBe(true);

      const running = await target.workers();
      const kernels = running.filter((worker) =>
        kernelWorker.test(new URL(worker.url).pathname.split('/').at(-1) ?? ''),
      );
      expect(kernels, 'kernel workers').toStrictEqual([]);
      expect(await target.readObservedWasm(), 'kernel WebAssembly').toStrictEqual([]);
    },
  );

  flagTest('moves the camera as every legend binding says, for every preset (c, d)', async () => {
    await openStepThree();
    await expectPreviewRendered();
    const presets = await target.evaluate(() =>
      [...document.querySelectorAll('fieldset [role="radio"]')].map((radio) => radio.getAttribute('value') ?? ''),
    );
    expect(presets).toHaveLength(6);
    const findings: Array<Readonly<{ mapping: string; caps: string; gesture: Gesture; moved: string }>> = [];

    const checkLegend = async (mapping: string): Promise<void> => {
      for (const { gesture, caps } of await readLegend()) {
        const before = await readCamera();
        await perform(bindingOf(caps));
        const moved = classify(before, await readCamera());
        findings.push({ mapping, caps: caps.join(' + '), gesture, moved });
        expect.soft(moved, `${mapping}: ${caps.join(' + ')}`).toBe(gesture);
      }
    };

    for (const preset of presets) {
      const before = await readCamera();
      await target.click(selectors.getByCss(`fieldset [role="radio"][value="${preset}"]`));
      await settleCamera();
      const after = await readCamera();
      // (d) A new preset changes the bindings, not the view.
      expect.soft(after.position, `${preset}: camera position after choosing it`).toStrictEqual(before.position);
      expect.soft(after.target, `${preset}: camera target after choosing it`).toStrictEqual(before.target);
      await checkLegend(preset);
    }
    await target.writeArtifact('onboarding-setup-preview/legend.json', `${JSON.stringify(findings, null, 2)}\n`);
  });

  flagTest('leaves no viewer canvas once step 3 is left (g)', async () => {
    await openStepThree();
    await expectPreviewRendered();
    await target.click(continueButton());
    await target.expectVisible(stepHeading('Design, verify, build'));
    await expect.poll(async () => target.evaluate(() => document.querySelectorAll('canvas').length)).toBe(0);
    expect(
      await target.evaluate(() => (globalThis as unknown as BridgeWindow).__TAU_SECTION_VIEW_TEST__ === undefined),
    ).toBe(true);
  });

  flagTest('shows the diagram when the context is lost, and setup carries on (f)', async ({ skip }) => {
    await openStepThree();
    await expectPreviewRendered();
    const lost = await target.evaluateLocator(selectors.getByCss(previewCanvas).first(), (canvas) => {
      const element = canvas as HTMLCanvasElement;
      const context = element.getContext('webgl2') ?? element.getContext('webgl');
      const extension = context?.getExtension('WEBGL_lose_context');
      extension?.loseContext();
      return extension !== undefined && extension !== null;
    });
    skip(!lost, 'The preview drew with WebGPU in this run: there is no WebGL context to lose.');
    await target.expectVisible(
      selectors.getByCss('[data-testid="setup-preview-fallback"][data-reason="context_lost"]'),
    );
    await target.expectVisible(selectors.getByTestId('setup-binding-legend'));
    await target.click(selectors.getByRole('radio', { name: 'Axes', exact: true }));
    await target.click(continueButton());
    await target.expectVisible(stepHeading('Design, verify, build'));
  });

  flagTest('shows a still diagram without WebGL under reduced motion, and setup carries on (f)', async () => {
    await target.addInitScript(() => {
      const original = HTMLCanvasElement.prototype.getContext;
      HTMLCanvasElement.prototype.getContext = function getContext(
        this: HTMLCanvasElement,
        kind: string,
        ...rest: unknown[]
      ) {
        if (kind === 'webgl' || kind === 'webgl2' || kind === 'experimental-webgl') {
          return null;
        }
        return Reflect.apply(original, this, [kind, ...rest]) as ReturnType<typeof original>;
      } as typeof HTMLCanvasElement.prototype.getContext;
    });
    await target.emulateReducedMotion('reduce');
    await openStepThree();
    await target.expectVisible(selectors.getByCss('[data-testid="setup-preview-fallback"][data-reason="no_webgl"]'));
    const animations = await target.evaluate(() =>
      [...document.querySelectorAll('[data-testid="setup-preview-fallback"] svg *')].map(
        (element) => getComputedStyle(element).animationName,
      ),
    );
    expect(animations.every((name) => name === 'none')).toBe(true);
    await target.click(
      selectors.getByRole('group', { name: 'Mouse controls' }).getByRole('radio', { name: /Alt-drag/u }),
    );
    await target.click(continueButton());
    await target.expectVisible(stepHeading('Design, verify, build'));
  });
});
