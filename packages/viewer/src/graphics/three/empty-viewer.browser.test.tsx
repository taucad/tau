import '#test/browser.css';
import { cleanup, render } from '@testing-library/react';
import { useFrame } from '@react-three/fiber';
import type { RootState } from '@react-three/fiber';
import type { ComponentProps } from 'react';
import { BoxGeometry, Mesh, MeshStandardMaterial, Vector3 } from 'three';
import { GLTFExporter } from 'three/addons/exporters/GLTFExporter.js';
import { createActor, createAsyncLogic } from 'xstate';
import { afterEach, expect, it, vi } from 'vitest';
import { page } from 'vitest/browser';
import type { Artifact } from '@taucad/runtime';
import { CadViewer } from '#cad/cad-viewer.jsx';
import { KeyboardProvider } from '@taucad/ui/components/keyboard';
import { GraphicsProvider } from '#hooks/use-graphics.jsx';
import { graphicsMachine } from '#machines/graphics.machine.js';
import { isViewportWebGpu } from '#graphics/three/viewport-cad-renderer.js';
import type * as threeContextModule from '#graphics/three/three-context.jsx';
import type { ThreeProvider } from '#graphics/three/three-context.jsx';

import { defaultViewerEnvironment, ViewerEnvironmentProvider } from '#environment/viewer-environment.jsx';

let state: RootState | undefined;
let pixels = new Uint8ClampedArray();
let frames = 0;
function FrameProbe(): undefined {
  useFrame((current) => {
    state = current;
    const canvas = current.gl.domElement;
    const copy = document.createElement('canvas');
    copy.width = canvas.width;
    copy.height = canvas.height;
    const context = copy.getContext('2d')!;
    context.drawImage(canvas, 0, 0);
    pixels = context.getImageData(0, 0, copy.width, copy.height).data;
    frames += 1;
  }, 4);
  return undefined;
}
// Keep the real renderer, scene and mesh loader; observe pixels after their final render pass.
vi.mock('#graphics/three/three-context.jsx', async (importOriginal) => {
  const actual = await importOriginal<typeof threeContextModule>();
  return {
    ...actual,
    ThreeProvider: (props: ComponentProps<typeof ThreeProvider>) => (
      <actual.ThreeProvider {...props}>
        {props.children}
        <FrameProbe />
      </actual.ThreeProvider>
    ),
  };
});

const difference = (left: Uint8ClampedArray, right: Uint8ClampedArray): number => {
  let changed = 0;
  for (let index = 0; index < left.length; index += 4) {
    if (
      Math.abs(left[index]! - right[index]!) +
        Math.abs(left[index + 1]! - right[index + 1]!) +
        Math.abs(left[index + 2]! - right[index + 2]!) +
        Math.abs(left[index + 3]! - right[index + 3]!) >
      20
    ) {
      changed += 1;
    }
  }
  return changed;
};

afterEach(() => {
  cleanup();
  document.documentElement.classList.remove('dark');
  state = undefined;
  pixels = new Uint8ClampedArray();
  frames = 0;
});

it.each([
  ['webgl', 'light'],
  ['webgpu', 'light'],
  ['webgl', 'dark'],
  ['webgpu', 'dark'],
] as const)('should retain the %s empty scene through model transitions in %s mode', async (backend, theme) => {
  document.documentElement.classList.toggle('dark', theme === 'dark');
  await page.viewport(900, 650);
  const actor = createActor(
    graphicsMachine.provide({
      actors: { probeWebGpu: createAsyncLogic({ run: async () => backend === 'webgpu' }) },
    }),
    { input: {} },
  ).start();
  if (backend === 'webgpu') {
    await vi.waitFor(() => {
      expect(actor.getSnapshot().context.webGpuAvailable).toBe(true);
    });
  }
  const geometry = new BoxGeometry(0.6, 0.6, 0.6);
  const material = new MeshStandardMaterial({ color: 0x16_aa_a4 });
  const binary = await new GLTFExporter().parseAsync(new Mesh(geometry, material), { binary: true });
  if (!(binary instanceof ArrayBuffer)) {
    throw new Error('Expected a binary GLB');
  }
  const artifact: Artifact = { mimeType: 'model/gltf-binary', content: new Uint8Array(binary) };
  const fixture = (
    model?: Artifact,
    { grid = true, axes = true, gizmo = true }: { grid?: boolean; axes?: boolean; gizmo?: boolean } = {},
  ): React.JSX.Element => (
    <div role='application' aria-label='CAD canvas' className='relative h-144 w-208 bg-background'>
      <ViewerEnvironmentProvider value={{ ...defaultViewerEnvironment, colorScheme: theme, graphicsBackend: backend }}>
        <KeyboardProvider>
          <GraphicsProvider graphicsRef={actor}>
            <CadViewer
              enableZoom
              enablePan
              enableGrid={grid}
              enableAxes={axes}
              enableGizmo={gizmo}
              artifact={model}
              artifactHash={model ? 'box' : undefined}
              sourceFile='main.ts'
            />
          </GraphicsProvider>
        </KeyboardProvider>
      </ViewerEnvironmentProvider>
    </div>
  );
  try {
    const view = render(fixture());
    await vi.waitFor(
      () => {
        expect(frames).toBeGreaterThan(2);
      },
      { timeout: 45_000 },
    );
    const renderer = state!.gl;
    const canvas = renderer.domElement;
    expect(isViewportWebGpu(renderer)).toBe(backend === 'webgpu');
    if (isViewportWebGpu(renderer)) {
      expect('isWebGPUBackend' in renderer.backend && renderer.backend.isWebGPUBackend).toBe(true);
    }
    const capture = async (): Promise<Uint8ClampedArray> => {
      // WebGPU pipeline compilation and the browser's canvas presentation can settle after the first draw.
      for (let sample = 0; sample < 3; sample++) {
        const before = frames;
        state!.invalidate();
        // oxlint-disable-next-line eslint/no-await-in-loop, eslint/no-loop-func -- Observe successive frames; the previous wait finishes before the next sample.
        await vi.waitFor(() => {
          expect(frames).toBeGreaterThan(before);
        });
      }
      return new Uint8ClampedArray(pixels);
    };
    const empty = await capture();
    const origin = new Vector3().project(state!.camera);
    expect(Math.abs(origin.x), 'default camera centres the origin horizontally').toBeLessThan(0.001);
    expect(Math.abs(origin.y), 'default camera centres the origin vertically').toBeLessThan(0.001);
    expect(
      origin.z,
      JSON.stringify({ position: state!.camera.position.toArray(), near: state!.camera.near, far: state!.camera.far }),
    ).toBeGreaterThan(-1);
    expect(origin.z).toBeLessThan(1);
    await page.screenshot({ path: `../../../../../out/test-results/empty-viewer/${backend}-${theme}-empty.png` });
    view.rerender(fixture(undefined, { grid: false }));
    const noGrid = await capture();
    // Exclude the bottom-right gizmo: each coloured world axis must contribute visible pixels.
    const axisPixels = [0, 0, 0];
    for (let index = 0; index < noGrid.length; index += 4) {
      const x = (index / 4) % canvas.width;
      const y = Math.floor(index / 4 / canvas.width);
      if (x > canvas.width * 0.75 && y > canvas.height * 0.7) {
        continue;
      }
      const channels = [noGrid[index]!, noGrid[index + 1]!, noGrid[index + 2]!];
      for (const channel of [0, 1, 2]) {
        if (
          channels[channel]! > channels[(channel + 1) % 3]! + 15 &&
          channels[channel]! > channels[(channel + 2) % 3]! + 15
        ) {
          axisPixels[channel]! += 1;
        }
      }
    }
    for (const count of axisPixels) {
      expect(count, 'each world axis is visible before a model loads').toBeGreaterThan(50);
    }
    expect(difference(empty, noGrid), 'grid contributes visible pixels').toBeGreaterThan(100);
    view.rerender(fixture(undefined, { grid: false, axes: false }));
    const noAxes = await capture();
    expect(difference(noGrid, noAxes), 'axes contribute visible pixels').toBeGreaterThan(50);
    view.rerender(fixture(undefined, { grid: false, axes: false, gizmo: false }));
    const noGizmo = await capture();
    expect(difference(noAxes, noGizmo), 'gizmo contributes visible pixels').toBeGreaterThan(100);

    actor.send({
      type: 'updateArtifact',
      artifact: { mimeType: 'model/gltf-binary', content: new Uint8Array(binary) },
      hash: 'box',
      sourceFile: 'main.ts',
    });
    view.rerender(fixture(artifact));
    await vi.waitFor(
      () => {
        expect(actor.getSnapshot().context.geometryRadius).toBeGreaterThan(0);
      },
      { timeout: 45_000 },
    );
    const model = await capture();
    expect(difference(empty, model), 'model becomes visible').toBeGreaterThan(1000);
    expect(state!.gl).toBe(renderer);
    expect(state!.gl.domElement).toBe(canvas);
    await page.screenshot({ path: `../../../../../out/test-results/empty-viewer/${backend}-${theme}-model.png` });

    actor.send({ type: 'clearArtifact' });
    view.rerender(fixture());
    const cleared = await capture();
    expect(difference(model, cleared), 'old model disappears').toBeGreaterThan(1000);
    expect(state!.gl).toBe(renderer);
    expect(state!.gl.domElement).toBe(canvas);
    view.rerender(fixture(undefined, { grid: false, axes: false, gizmo: false }));
    expect(difference(cleared, await capture()), 'empty scene remains visible after clearing').toBeGreaterThan(100);
  } finally {
    cleanup();
    actor.stop();
    geometry.dispose();
    material.dispose();
  }
});
