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
  PlaneGeometry,
  RGBAFormat,
  Scene,
  SphereGeometry,
  WebGLCoordinateSystem,
  WebGPUCoordinateSystem,
  WebGLRenderTarget,
  Vector4,
} from 'three';
import type { WebGLRenderer } from 'three';
import { NodeMaterial, QuadMesh, WebGPURenderer } from 'three/webgpu';
import { texture, screenUV } from 'three/tsl';
import { createRenderer } from '#graphics/three/renderer.js';
import { createSectionClip } from '#graphics/three/materials/section-clip.js';
import { createEmphasisMaskCrop } from '#graphics/three/materials/model-emphasis-crop.js';
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

// Finding 5 of docs/research/orthographic-controls-distance-clip-and-low-fov-grid-blueprint.md: a component of nested
// layers (a PCB's core, mask and silkscreen tens of µm apart) took one wash per layer wherever no surface separated them.
it.each(['webgpu', 'webgl'] as const)(
  'should wash nested layers of one component once per pixel on %s',
  async (backend) => {
    const renderer = await createRenderer('viewport', backend, {
      canvas: document.createElement('canvas'),
      nodePipeline: true,
    });
    if (!(renderer instanceof WebGPURenderer)) {
      throw new Error('Expected node renderer');
    }
    // 512-byte rows: WebGPU pads readback rows to 256 bytes.
    const width = 128;
    const height = 96;
    // Millimetre scale: a 100 mm board, layers 22 µm apart, seen at a slant so depth varies across the frame.
    const geometry = new PlaneGeometry(2000, 2000);
    const front = new Mesh(geometry, new MeshBasicMaterial());
    const buried = new Mesh(geometry, new MeshBasicMaterial());
    buried.position.z = -0.022;
    for (const layer of [front, buried]) {
      layer.updateMatrixWorld();
    }
    const camera = new PerspectiveCamera(60, width / height, 1, 5000);
    camera.position.set(0, -120, 160);
    camera.lookAt(0, 0, 0);
    camera.updateMatrixWorld();
    const target = new WebGLRenderTarget(width, height);
    const resources = createModelEmphasisResources(backend, createSectionClip(backend));
    // The wash alone; the composite needs a mask pass and is covered above.
    resources.overlayGroup.children[1]!.visible = false;
    const output = new Scene();
    output.add(resources.overlayGroup);
    const capture = async (hover: Mesh[]): Promise<Uint8Array<ArrayBuffer>> => {
      syncModelEmphasisProxies(resources, { hover, selected: [] });
      syncModelEmphasisFrame(resources);
      renderer.setRenderTarget(target);
      renderer.setClearColor(0x00_00_00, 1);
      renderer.autoClear = true;
      renderer.render(output, camera);
      const pixels = await renderer.readRenderTargetPixelsAsync(target, 0, 0, width, height);
      renderer.setRenderTarget(null);
      return new Uint8Array(pixels.buffer, pixels.byteOffset, pixels.byteLength).slice();
    };
    try {
      const single = await capture([front]);
      const nested = await capture([front, buried]);
      let maxDifference = 0;
      for (const [index, value] of nested.entries()) {
        maxDifference = Math.max(maxDifference, Math.abs(value - single[index]!));
      }
      expect(maxDifference).toBeLessThanOrEqual(1);

      // At full strength the depth tie must hold everywhere: a pixel the prepass claims but its wash misses stays black.
      resources.wash.hover.opacity = 1;
      const opaque = await capture([front, buried]);
      let missed = 0;
      for (let index = 0; index < opaque.length; index += 4) {
        if (opaque[index]! + opaque[index + 1]! + opaque[index + 2]! === 0) {
          missed++;
        }
      }
      expect(missed).toBe(0);
    } finally {
      resources.dispose();
      target.dispose();
      geometry.dispose();
      front.material.dispose();
      buried.material.dispose();
      renderer.dispose();
    }
  },
);

// A dimmed component writes no depth, so the grid drawn after the emphasis overlay must still show through it.
it.each(['webgpu', 'webgl'] as const)(
  'should leave the grid visible behind a highlighted translucent component on %s',
  async (backend) => {
    const renderer = await createRenderer('viewport', backend, {
      canvas: document.createElement('canvas'),
      nodePipeline: true,
    });
    if (!(renderer instanceof WebGPURenderer)) {
      throw new Error('Expected node renderer');
    }
    // 512-byte rows: WebGPU pads readback rows to 256 bytes.
    const width = 128;
    const height = 96;
    const geometry = new PlaneGeometry(4, 4);
    const dimmed = new Mesh(geometry, new MeshBasicMaterial({ transparent: true, opacity: 0.3, depthWrite: false }));
    dimmed.updateMatrixWorld();
    const grid = new Mesh(geometry, new MeshBasicMaterial({ color: 0xff_00_00 }));
    grid.position.z = -1;
    grid.updateMatrixWorld();
    const gridScene = new Scene();
    gridScene.add(grid);
    const camera = new PerspectiveCamera(40, width / height, 0.1, 20);
    camera.position.z = 5;
    camera.updateMatrixWorld();
    const target = new WebGLRenderTarget(width, height);
    const resources = createModelEmphasisResources(backend, createSectionClip(backend));
    resources.overlayGroup.children[1]!.visible = false;
    const output = new Scene();
    output.add(resources.overlayGroup);
    try {
      syncModelEmphasisProxies(resources, { hover: [dimmed], selected: [] });
      syncModelEmphasisFrame(resources);
      renderer.setRenderTarget(target);
      renderer.setClearColor(0x00_00_00, 1);
      renderer.autoClear = true;
      renderer.render(output, camera);
      // The grid overlay runs after emphasis against the same depth, without clearing it.
      renderer.autoClear = false;
      renderer.render(gridScene, camera);
      const pixels = await renderer.readRenderTargetPixelsAsync(target, 0, 0, width, height);
      const centre = ((height / 2) * width + width / 2) * 4;
      expect(pixels[centre]).toBeGreaterThan(200);
    } finally {
      renderer.setRenderTarget(null);
      resources.dispose();
      target.dispose();
      geometry.dispose();
      dimmed.material.dispose();
      grid.material.dispose();
      renderer.dispose();
    }
  },
);

// Finding 6 of docs/research/orthographic-controls-distance-clip-and-low-fov-grid-blueprint.md: native WebGPU's first
// render of a fresh crop camera recomputed its projection for reversed depth and drew the mask uncropped.
it('should crop the mask on the first render of a fresh crop camera on webgpu', async () => {
  const renderer = await createRenderer('viewport', 'webgpu', {
    canvas: document.createElement('canvas'),
    nodePipeline: true,
  });
  if (!(renderer instanceof WebGPURenderer)) {
    throw new Error('Expected node renderer');
  }
  const size = { width: 128, height: 96, pixelRatio: 1 };
  const geometry = new BoxGeometry(0.6, 0.4, 0.2);
  const mesh = new Mesh(geometry, new MeshBasicMaterial());
  mesh.position.set(0.3, 0.2, 0);
  mesh.updateMatrixWorld();
  const scene = new Scene();
  scene.add(mesh);
  const camera = new PerspectiveCamera(40, size.width / size.height, 0.1, 10);
  camera.position.z = 4;
  camera.updateMatrixWorld();
  const full = new WebGLRenderTarget(size.width, size.height);
  // Production renders the source camera before the mask, so its projection is already in this renderer's convention.
  renderer.setRenderTarget(full);
  renderer.render(scene, camera);
  const crop = createEmphasisMaskCrop();
  const cropCamera = crop.update(camera, new Vector4(-0.2, -0.2, 0.8, 0.8), size);
  expect(cropCamera).not.toBe(camera);
  const target = new WebGLRenderTarget(crop.pixels.z, crop.pixels.w);
  const capture = async (): Promise<Uint8Array<ArrayBuffer>> => {
    renderer.setRenderTarget(target);
    renderer.setClearColor(0x00_00_00, 1);
    renderer.autoClear = true;
    renderer.render(scene, cropCamera);
    const pixels = await renderer.readRenderTargetPixelsAsync(target, 0, 0, target.width, target.height);
    renderer.setRenderTarget(null);
    return new Uint8Array(pixels.buffer, pixels.byteOffset, pixels.byteLength).slice();
  };
  try {
    const first = await capture();
    crop.update(camera, new Vector4(-0.2, -0.2, 0.8, 0.8), size);
    const second = await capture();
    expect(second.some((value, index) => index % 4 !== 3 && value > 0)).toBe(true);
    let differing = 0;
    for (const [index, value] of first.entries()) {
      if (value !== second[index]) {
        differing++;
      }
    }
    expect(differing).toBe(0);
  } finally {
    full.dispose();
    target.dispose();
    geometry.dispose();
    mesh.material.dispose();
    renderer.dispose();
  }
});
