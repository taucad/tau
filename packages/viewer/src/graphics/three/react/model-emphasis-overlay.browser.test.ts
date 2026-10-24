import { expect, it, vi } from 'vitest';
import {
  AlwaysDepth,
  DepthTexture,
  DepthStencilFormat,
  UnsignedInt248Type,
  UnsignedIntType,
  BoxGeometry,
  Color,
  Mesh,
  MeshBasicMaterial,
  OrthographicCamera,
  PerspectiveCamera,
  RGBAFormat,
  Scene,
  SphereGeometry,
  WebGLCoordinateSystem,
  WebGPUCoordinateSystem,
  WebGLRenderTarget,
} from 'three';
import type { WebGLRenderer } from 'three';
import { NodeMaterial, QuadMesh, WebGPURenderer } from 'three/webgpu';
import { texture, screenUV } from 'three/tsl';
import { createRenderer } from '#graphics/three/renderer.js';
import { createSectionClip } from '#graphics/three/materials/section-clip.js';
import type { SilhouetteNodeMaterial } from '#graphics/three/materials/model-emphasis-silhouette.node.js';
import {
  createModelEmphasisResources,
  renderModelEmphasisMask,
  syncModelEmphasisFrame,
  syncModelEmphasisProxies,
} from '#graphics/three/react/model-emphasis-overlay.jsx';

it.each(['implicit', 'explicit', 'resolved', 'single-sample'] as const)(
  'should preserve required depth attachments and omit unused resolved mask depth: %s',
  async (mode) => {
    // eslint-disable-next-line @typescript-eslint/naming-convention -- Three constructor option.
    const renderer = new WebGPURenderer({ forceWebGL: true });
    await renderer.init();
    const gl = renderer.domElement.getContext('webgl2');
    if (!gl) {
      throw new Error('Expected an initialized WebGL2 context');
    }
    const storage = vi.spyOn(gl, 'texStorage2D');
    const multisample = vi.spyOn(gl, 'renderbufferStorageMultisample');
    const buffers = vi.spyOn(gl, 'createRenderbuffer');
    const resources = createModelEmphasisResources('webgpu', createSectionClip('webgpu'));
    try {
      switch (mode) {
        case 'explicit': {
          resources.maskTarget.depthTexture = new DepthTexture(1, 1, UnsignedIntType);
          break;
        }
        case 'resolved': {
          resources.maskTarget.resolveDepthBuffer = true;
          break;
        }
        case 'single-sample': {
          resources.maskTarget.samples = 0;
          break;
        }
        case 'implicit': {
          break;
        }
      }
      resources.setMaskSize({ width: 320, height: 240, pixelRatio: 1 });
      renderer.setRenderTarget(resources.maskTarget);
      renderer.clear();
      if (mode !== 'single-sample') {
        expect(multisample.mock.calls).toContainEqual([gl.RENDERBUFFER, 4, gl.DEPTH_COMPONENT24, 320, 240]);
      }
      expect(storage.mock.calls.filter((call) => call[2] === gl.DEPTH_COMPONENT24)).toHaveLength(
        mode === 'implicit' ? 0 : 1,
      );
      expect(gl.getError()).toBe(gl.NO_ERROR);
      const firstBuffers = buffers.mock.results
        .filter((result) => result.type === 'return')
        .map((result) => result.value);
      renderer.setRenderTarget(null);
      resources.setMaskSize({ width: 640, height: 480, pixelRatio: 2 });
      expect(firstBuffers.every((buffer) => !gl.isRenderbuffer(buffer))).toBe(true);
      renderer.setRenderTarget(resources.maskTarget);
      renderer.clear();
      if (mode !== 'single-sample') {
        expect(multisample.mock.calls).toContainEqual([gl.RENDERBUFFER, 4, gl.DEPTH_COMPONENT24, 640, 480]);
      }
      expect(storage.mock.calls.filter((call) => call[2] === gl.DEPTH_COMPONENT24)).toHaveLength(
        mode === 'implicit' ? 0 : 2,
      );
      renderer.setRenderTarget(null);
      resources.dispose();
      expect(
        buffers.mock.results
          .filter((result) => result.type === 'return')
          .every((result) => !gl.isRenderbuffer(result.value)),
      ).toBe(true);
    } finally {
      renderer.setRenderTarget(null);
      resources.dispose();
      storage.mockRestore();
      multisample.mockRestore();
      buffers.mockRestore();
      renderer.dispose();
    }
  },
);

const comparePixels = (
  packed: Uint8Array<ArrayBuffer>,
  reference: Uint8Array<ArrayBuffer>,
  { width, context, fullyOccludedHalf }: { width: number; context: string; fullyOccludedHalf: boolean },
): void => {
  let maxDifference = 0;
  let highlighted = 0;
  let visibleRed = 0;
  let hiddenRed = 0;
  const redLevels = new Set<number>();
  for (const [index, value] of packed.entries()) {
    maxDifference = Math.max(maxDifference, Math.abs(value - reference[index]!));
    if (index % 4 === 0) {
      redLevels.add(reference[index]!);
      if (reference[index]! > 100) {
        highlighted++;
      }
      const x = (index / 4) % width;
      if (x < width / 2 - 4) {
        visibleRed = Math.max(visibleRed, reference[index]!);
      }
      if (x > width / 2 + 4) {
        hiddenRed = Math.max(hiddenRed, reference[index]!);
      }
    }
  }
  expect(highlighted).toBeGreaterThan(100);
  expect(redLevels.size).toBeGreaterThan(5);
  if (fullyOccludedHalf) {
    expect(visibleRed, context).toBeGreaterThan(hiddenRed + 30);
  }
  // Predeclared one-byte tolerance, including resolved fractional edge pixels.
  expect(maxDifference, context).toBeLessThanOrEqual(1);
};

// Compare node WebGL2 clear/depth fusion with the separate stamp, plus RG/RGBA storage,
// on the same initialized renderer, poses and sample locations.
// The RGBA reference is the prior production channel contract, not a different renderer.
it.each([false, true])('preserves fractional and occluded highlights with node WebGL2=%s', async (forceWebGl) => {
  const renderer = forceWebGl
    ? new WebGPURenderer({
        // eslint-disable-next-line @typescript-eslint/naming-convention -- Three constructor option.
        forceWebGL: true,
        antialias: false,
      })
    : await createRenderer('viewport', 'webgpu', document.createElement('canvas'));
  if (!(renderer instanceof WebGPURenderer)) {
    throw new Error('Expected node renderer');
  }
  await renderer.init();
  expect(renderer.coordinateSystem).toBe(forceWebGl ? WebGLCoordinateSystem : WebGPUCoordinateSystem);
  const { device } = renderer.backend as typeof renderer.backend & { device?: EventTarget };
  const errors: string[] = [];
  const observe = (event: Event): void => {
    const gpuError = event as Event & { error: { message: string } };
    errors.push(gpuError.error.message);
  };
  device?.addEventListener('uncapturederror', observe);
  renderer.setSize(320, 240);
  const geometry = new SphereGeometry(0.65, 32, 24);
  const source = new Mesh(geometry, new MeshBasicMaterial());
  const occluderGeometry = new BoxGeometry(0.7, 2, 0.1);
  const depthMaterial = new MeshBasicMaterial({ colorWrite: false });
  const occluder = new Mesh(occluderGeometry, depthMaterial);
  occluder.position.set(0.35, 0, 0.8);
  const depthScene = new Scene();
  depthScene.add(occluder);
  const target = new WebGLRenderTarget(320, 240);
  const frame = new WebGLRenderTarget(320, 240);
  frame.stencilBuffer = true;
  frame.depthTexture = new DepthTexture(320, 240, UnsignedInt248Type);
  frame.depthTexture.format = DepthStencilFormat;
  const depthCopy = new NodeMaterial();
  depthCopy.colorWrite = false;
  depthCopy.depthWrite = true;
  depthCopy.depthTest = forceWebGl;
  depthCopy.depthFunc = AlwaysDepth;
  depthCopy.depthNode = texture(frame.depthTexture, screenUV);
  const depthQuad = new QuadMesh(depthCopy);
  const resources = createModelEmphasisResources('webgpu', createSectionClip('webgpu'));
  const composite = resources.composite as SilhouetteNodeMaterial;
  const output = new Scene();
  // Isolate the outline; production wash and full composition are checked by the 5K fixture.
  output.add(resources.overlayGroup.children[1]!);
  const poses = [false, true].flatMap((perspective) =>
    ['hover', 'selected', 'both'].flatMap((mode) =>
      [0.8, 0.35, -0.35].flatMap((occluderDepth) =>
        [0, 0.003, 0.007].map((shift) => ({ perspective, mode, occluderDepth, shift })),
      ),
    ),
  );
  const cases = poses.flatMap((pose) => [false, true].map((motion) => ({ ...pose, motion })));
  try {
    for (const { perspective, mode, occluderDepth, shift, motion } of cases) {
      const camera = perspective
        ? new PerspectiveCamera(40, 4 / 3, 0.1, 10)
        : new OrthographicCamera(-1.6, 1.6, 1.2, -1.2, 0.1, 10);
      camera.position.z = 4;
      camera.updateMatrixWorld();

      const pixelRatio = shift === 0.007 ? 2 : 1;
      const width = 320 * pixelRatio;
      const height = 240 * pixelRatio;
      renderer.setPixelRatio(pixelRatio);
      renderer.setSize(width / pixelRatio, height / pixelRatio);
      target.setSize(width, height);
      frame.setSize(width, height);
      occluder.position.z = occluderDepth;
      occluder.rotation.y = occluderDepth === 0.8 ? 0 : 0.3;
      source.position.x = shift;
      source.updateMatrixWorld();
      const capture = async (reference: boolean): Promise<Uint8Array<ArrayBuffer>> => {
        resources.maskTarget.dispose();
        resources.maskTarget.depthTexture = reference ? new DepthTexture(1, 1, UnsignedIntType) : null;
        syncModelEmphasisProxies(resources, {
          hover: mode === 'selected' ? [] : [source],
          selected: mode === 'hover' ? [] : [source],
        });
        if (reference) {
          resources.maskTarget.dispose();
          resources.maskTarget.texture.format = RGBAFormat;
          composite.silhouettePackedAlpha.value = 0;
          resources.mask.coverage.hover.color.setRGB(1, 0, 0);
          resources.mask.coverage.selected.color.setRGB(0, 1, 0);
          resources.mask.visibility.hover.color.setRGB(0, 0, 1);
          resources.mask.visibility.selected.color.setRGB(0, 0, 0);
          resources.mask.visibility.selected.opacity = 1;
        }
        resources.setMaskSize({ width, height, pixelRatio });
        syncModelEmphasisFrame(resources);
        renderer.setRenderTarget(frame);
        renderer.autoClear = true;
        renderer.render(depthScene, camera);
        if (reference) {
          renderer.setRenderTarget(null);
        }
        const restoreDepth = vi.fn(() => {
          depthQuad.render(renderer);
        });
        // Persistent production resources are rendered repeatedly, not rebuilt every frame.
        for (let frameIndex = 0; frameIndex < 3; frameIndex++) {
          source.position.x = shift + (motion ? frameIndex * 0.1 : 0);
          source.updateMatrixWorld();
          syncModelEmphasisFrame(resources);
          renderModelEmphasisMask(resources, {
            gl: renderer as unknown as WebGLRenderer,
            camera,
            previousClear: new Color(),
            restoreDepth,
            boundedComposite: !reference,
          });
          if (!reference) {
            expect(resources.maskTarget.width * resources.maskTarget.height).toBeLessThan(width * height);
            const quad = output.children[0] as Mesh;
            quad.geometry.computeBoundingBox();
            const bounds = quad.geometry.boundingBox!;
            expect(bounds.max.x - bounds.min.x).toBeLessThan(2);
          }
        }
        expect(restoreDepth).toHaveBeenCalledTimes(reference ? 3 : 0);
        renderer.setRenderTarget(target);
        renderer.setClearColor(0x12_34_56, 1);
        renderer.autoClear = true;
        renderer.render(output, camera);
        const pixels = await renderer.readRenderTargetPixelsAsync(target, 0, 0, width, height);
        renderer.setRenderTarget(null);
        syncModelEmphasisProxies(resources, { hover: [], selected: [] });
        return new Uint8Array(pixels.buffer, pixels.byteOffset, pixels.byteLength).slice();
      };
      // oxlint-disable-next-line no-await-in-loop -- Both captures mutate the same renderer and target.
      const packed = await capture(false);
      // oxlint-disable-next-line no-await-in-loop -- Compare only after the preceding readback completes.
      const reference = await capture(true);
      expect(errors).toEqual([]);
      comparePixels(packed, reference, {
        width,
        context: JSON.stringify({ perspective, mode, occluderDepth, shift, motion }),
        fullyOccludedHalf: !motion && occluderDepth === 0.8,
      });
    }
  } finally {
    device?.removeEventListener('uncapturederror', observe);
    resources.dispose();
    target.dispose();
    frame.dispose();
    depthCopy.dispose();
    geometry.dispose();
    source.material.dispose();
    occluderGeometry.dispose();
    depthMaterial.dispose();
    renderer.dispose();
  }
});
