import { Line2NodeMaterial } from '#graphics/three/materials/line2.material.js';
import { Line2 } from 'three/addons/lines/webgpu/Line2.js';
import { LineGeometry } from 'three/addons/lines/LineGeometry.js';
import { expect, it, vi } from 'vitest';
import { page } from 'vitest/browser';
import {
  RenderTarget,
  HalfFloatType,
  UnsignedByteType,
  LinearSRGBColorSpace,
  NormalBlending,
  Vector2,
  AlwaysDepth,
  WebGLCoordinateSystem,
  Color,
  DirectionalLight,
  Mesh,
  MeshBasicMaterial,
  MeshStandardMaterial,
  NoToneMapping,
  OrthographicCamera,
  PerspectiveCamera,
  PlaneGeometry,
  Scene,
  SRGBColorSpace,
} from 'three';
import { WebGLBackend, WebGPUBackend, RenderPipeline, NodeMaterial, QuadMesh } from 'three/webgpu';
import { pass, screenUV, vec4 } from 'three/tsl';
import { createRenderer } from '#graphics/three/renderer.js';

// This minimal reference intentionally isolates output ownership from AO, edge
// coverage, clipping and stencil. Those remain separate production gates.
it.each(['classic', 'node-webgpu', 'node-webgl2', 'node-webgpu-viewport'] as const)(
  'should preserve PBR color and cap depth through subsequent draws on %s',
  async (configuration) => {
    await page.viewport(400, 300);
    const canvas = document.createElement('canvas');
    document.body.append(canvas);
    const renderer =
      configuration === 'classic'
        ? await createRenderer('viewport', 'webgl', canvas)
        : configuration === 'node-webgpu-viewport'
          ? await createRenderer('viewport', 'webgpu', canvas)
          : await createRenderer('showcase', configuration === 'node-webgpu' ? 'webgpu' : 'webgl', canvas);
    const geometry = new PlaneGeometry(4, 4);
    const material = new MeshStandardMaterial({ color: 0x42_8a_c4, roughness: 0.6, metalness: 0.2 });
    const scene = new Scene();
    scene.background = new Color(0xff_ff_ff);
    scene.add(new Mesh(geometry, material));
    const light = new DirectionalLight(0xff_ff_ff, 3);
    light.position.set(1, 2, 4);
    scene.add(light);
    const camera = new OrthographicCamera(-2, 2, 2, -2, 0.1, 20);
    camera.position.z = 5;
    const overlay = new Scene();
    const overlayMaterial = new MeshBasicMaterial({ color: 0xff_00_00 });
    const gridMaterial = new MeshBasicMaterial({ color: 0x00_ff_00 });
    const cap = new Mesh(geometry, overlayMaterial);
    cap.scale.set(0.25, 0.25, 1);
    cap.position.z = 0.2;
    overlay.add(cap);
    const grid = new Scene();
    const stripe = new Mesh(geometry, gridMaterial);
    stripe.scale.set(1, 0.125, 1);
    stripe.position.z = 0.1;
    grid.add(stripe);
    const hidden = new Mesh(geometry, gridMaterial);
    hidden.scale.set(1, 0.125, 1);
    hidden.position.set(0, 1, -0.2);
    grid.add(hidden);
    const restoreMaterial = new NodeMaterial();
    restoreMaterial.depthWrite = true;
    restoreMaterial.depthTest = renderer.coordinateSystem === WebGLCoordinateSystem;
    restoreMaterial.depthFunc = AlwaysDepth;
    restoreMaterial.colorWrite = false;
    const restore = new QuadMesh(restoreMaterial);
    let pipeline: RenderPipeline | undefined;
    let scenePass: ReturnType<typeof pass> | undefined;
    const copy = document.createElement('canvas');
    copy.width = 128;
    copy.height = 128;
    const context = copy.getContext('2d', { willReadFrequently: true });
    if (!context) {
      throw new Error('Reference capture requires Canvas2D');
    }
    const capture = (): Uint8ClampedArray => {
      context.drawImage(canvas, 0, 0);
      return context.getImageData(0, 0, 128, 128).data;
    };
    try {
      renderer.setPixelRatio(1);
      renderer.setSize(128, 128);
      renderer.toneMapping = NoToneMapping;
      renderer.outputColorSpace = SRGBColorSpace;
      if ('isWebGPURenderer' in renderer) {
        expect(renderer.backend).toBeInstanceOf(configuration === 'node-webgl2' ? WebGLBackend : WebGPUBackend);
        scenePass = pass(scene, camera);
        pipeline = new RenderPipeline(renderer, scenePass.getTextureNode().mul(vec4(0.5, 1, 0.25, 1)));
        restoreMaterial.depthNode = scenePass.getTextureNode('depth').sample(screenUV);
      }
      const draw = (): void => {
        renderer.autoClear = true;
        if (pipeline) {
          pipeline.render();
        } else {
          renderer.render(scene, camera);
        }
      };
      draw();
      const before = capture();
      const center = (64 * 128 + 64) * 4;
      expect(before[center + 2]).toBeGreaterThan(80);
      expect(before[center + 3]).toBe(255);
      // A fresh frame avoids relying on preserveDrawingBuffer in classic GL.
      draw();
      renderer.autoClear = false;
      if ('isWebGPURenderer' in renderer) {
        restore.render(renderer);
      }
      renderer.render(overlay, camera);
      renderer.render(grid, camera);
      const after = capture();
      // Cap depth must reject the later green stripe, and the outside stripe
      // must remain in front of the base. Uncovered PBR color must survive.
      expect([...after.subarray(center, center + 4)]).toEqual([255, 0, 0, 255]);
      const outside = (64 * 128 + 16) * 4;
      expect([...after.subarray(outside, outside + 4)]).toEqual([0, 255, 0, 255]);
      const hiddenPixel = (32 * 128 + 64) * 4;
      for (let channel = 0; channel < 4; channel++) {
        expect(
          Math.abs(after[hiddenPixel + channel]! - before[hiddenPixel + channel]!),
          JSON.stringify({
            before: [...before.subarray(hiddenPixel, hiddenPixel + 4)],
            after: [...after.subarray(hiddenPixel, hiddenPixel + 4)],
          }),
        ).toBeLessThanOrEqual(2);
      }
      const untouched = (16 * 128 + 16) * 4;
      for (let channel = 0; channel < 4; channel++) {
        expect(Math.abs(after[untouched + channel]! - before[untouched + channel]!)).toBeLessThanOrEqual(2);
      }
    } finally {
      pipeline?.dispose();
      scenePass?.dispose();
      geometry.dispose();
      material.dispose();
      overlayMaterial.dispose();
      gridMaterial.dispose();
      restoreMaterial.dispose();
      renderer.dispose();
      canvas.remove();
    }
  },
);

it.each(['webgpu', 'webgl'] as const)('should draw Tau node lines directly on %s', async (backend) => {
  const { createGltfFatLineMaterial, createGltfFatLineSegmentsFromPositions } =
    await import('#graphics/three/materials/gltf-edges.js');
  const { createSectionClip, installSectionClip } = await import('#graphics/three/materials/section-clip.js');
  const canvas = document.createElement('canvas');
  document.body.append(canvas);
  const renderer = await createRenderer('showcase', backend, canvas);
  const material = createGltfFatLineMaterial({ backend: 'webgpu', resolution: new Vector2(128, 128), edgeColor: 0 });
  installSectionClip(material, createSectionClip('webgpu'));
  const lines = createGltfFatLineSegmentsFromPositions({
    backend: 'webgpu',
    material,
    positions: new Float32Array([-1, 0, 0, 1, 0, 0]),
  });
  if (!lines) {
    throw new Error('Expected node line fixture');
  }
  const scene = new Scene();
  scene.background = new Color(0xff_ff_ff);
  scene.add(lines);
  const camera = new OrthographicCamera(-2, 2, 2, -2, 0.1, 20);
  camera.position.z = 5;
  const copy = document.createElement('canvas');
  copy.width = 128;
  copy.height = 128;
  const context = copy.getContext('2d');
  if (!context) {
    throw new Error('Expected Canvas2D');
  }
  try {
    expect(renderer.backend).toBeInstanceOf(backend === 'webgpu' ? WebGPUBackend : WebGLBackend);
    renderer.setSize(128, 128);
    renderer.render(scene, camera);
    context.drawImage(canvas, 0, 0);
    const pixels = context.getImageData(0, 0, 128, 128).data;
    expect(pixels[(63 * 128 + 64) * 4]).toBeLessThan(240);
  } finally {
    lines.geometry.dispose();
    material.dispose();
    renderer.dispose();
    canvas.remove();
  }
});

it.each(['webgpu', 'webgl'] as const)(
  'should preserve display ramps, alpha and linear overlay blends in compact frame storage on %s',
  async (backend) => {
    const { texture, renderOutput, uv, vec3, uniform } = await import('three/tsl');
    const canvas = document.createElement('canvas');
    const renderer = await createRenderer('showcase', backend, canvas);
    const reference = new RenderTarget(256, 32, { type: HalfFloatType, depthBuffer: false });
    reference.texture.colorSpace = LinearSRGBColorSpace;
    const compact = new RenderTarget(256, 32, { type: UnsignedByteType, depthBuffer: false });
    compact.texture.colorSpace = SRGBColorSpace;
    // Deliberately wrong storage: uniformly spaced linear bytes visibly crush dark ramps.
    const negative = new RenderTarget(256, 32, { type: UnsignedByteType, depthBuffer: false });
    negative.texture.colorSpace = LinearSRGBColorSpace;
    const destination = new RenderTarget(256, 32, { type: UnsignedByteType, depthBuffer: false });
    const base = new NodeMaterial();
    const alpha = uniform(1);
    const dark = uniform(0.05);
    base.fragmentNode = vec4(uv().x.mul(dark), uv().x.mul(dark), uv().x.mul(dark), alpha);
    base.depthTest = false;
    base.depthWrite = false;
    const baseQuad = new QuadMesh(base);
    const overlay = new NodeMaterial();
    overlay.fragmentNode = vec4(vec3(1, 0.12, 0.02), 0.17);
    overlay.transparent = true;
    overlay.blending = NormalBlending;
    overlay.depthTest = false;
    overlay.depthWrite = false;
    const overlayQuad = new QuadMesh(overlay);
    const outputs = [reference, compact, negative].map((target) => {
      const material = new NodeMaterial();
      material.fragmentNode = renderOutput(texture(target.texture), NoToneMapping, SRGBColorSpace);
      material.depthTest = false;
      material.depthWrite = false;
      return new QuadMesh(material);
    });
    const onError = vi.fn();
    // Installed r184 declarations omit the native device property.
    const device =
      renderer.backend instanceof WebGPUBackend && 'device' in renderer.backend
        ? (renderer.backend.device as Pick<EventTarget, 'addEventListener' | 'removeEventListener'>)
        : undefined;
    device?.addEventListener('uncapturederror', onError);
    try {
      expect(renderer.backend).toBeInstanceOf(backend === 'webgpu' ? WebGPUBackend : WebGLBackend);
      renderer.setSize(256, 32);
      renderer.outputColorSpace = LinearSRGBColorSpace;
      renderer.toneMapping = NoToneMapping;
      for (const scenario of [
        { range: 0.05, alpha: 1, layers: 0, tolerance: 2 },
        { range: 1, alpha: 0.31, layers: 0, tolerance: 2 },
        { range: 1, alpha: 1, layers: 1, tolerance: 2 },
        { range: 1, alpha: 0.31, layers: 4, tolerance: 3 },
      ]) {
        dark.value = scenario.range;
        alpha.value = scenario.alpha;
        const images: Array<Uint8Array<ArrayBuffer>> = [];
        for (const [index, target] of [reference, compact, negative].entries()) {
          renderer.setRenderTarget(target);
          renderer.autoClear = true;
          baseQuad.render(renderer);
          renderer.autoClear = false;
          for (let layer = 0; layer < scenario.layers; layer++) {
            overlayQuad.render(renderer);
          }
          renderer.setRenderTarget(destination);
          renderer.autoClear = true;
          outputs[index]!.render(renderer);
          // oxlint-disable-next-line no-await-in-loop -- Read each completed variant before reusing the destination.
          const bytes = await renderer.readRenderTargetPixelsAsync(destination, 0, 0, 256, 32);
          images.push(new Uint8Array(bytes.buffer, bytes.byteOffset, bytes.byteLength).slice());
        }
        const maximum = (image: Uint8Array<ArrayBuffer>): number => {
          let largest = 0;
          for (const [index, value] of image.entries()) {
            largest = Math.max(largest, Math.abs(value - images[0]![index]!));
          }
          return largest;
        };
        expect(maximum(images[1]!), JSON.stringify(scenario)).toBeLessThanOrEqual(scenario.tolerance);
        if (scenario.range === 0.05) {
          expect(maximum(images[2]!)).toBeGreaterThan(3);
        }
      }
      expect(onError).not.toHaveBeenCalled();
    } finally {
      device?.removeEventListener('uncapturederror', onError);
      renderer.setRenderTarget(null);
      for (const quad of outputs) {
        (quad.material as NodeMaterial).dispose();
      }
      base.dispose();
      overlay.dispose();
      reference.dispose();
      compact.dispose();
      negative.dispose();
      destination.dispose();
      renderer.dispose();
    }
  },
);

it.each(
  (['webgpu', 'webgl'] as const).flatMap((backend) =>
    [false, true].flatMap((prepared) => [false, true].map((perspective) => ({ backend, prepared, perspective }))),
  ),
)(
  'should preserve long-axis coverage across cached materials and frame formats at 5K on $backend preparation=$prepared perspective=$perspective',
  async ({ backend, prepared, perspective }) => {
    const { texture, renderOutput } = await import('three/tsl');
    const canvas = document.createElement('canvas');
    const renderer = await createRenderer('showcase', backend, canvas);
    const width = 5120;
    const height = 2880;
    const compact = new RenderTarget(width, height, { type: UnsignedByteType });
    compact.texture.colorSpace = SRGBColorSpace;
    const half = new RenderTarget(width, height, { type: HalfFloatType });
    half.texture.colorSpace = LinearSRGBColorSpace;
    const destination = new RenderTarget(width, height, { depthBuffer: false });
    const scene = new Scene();
    const camera = perspective
      ? new PerspectiveCamera(35, width / height, 0.1, 100_000)
      : new OrthographicCamera(-200, 200, 112.5, -112.5, 0.1, 100_000);
    camera.up.set(0, 0, 1);
    camera.position.set(150, 150, 150);
    camera.lookAt(0, 0, 0);
    const materials = [0, 1].map(
      () =>
        new Line2NodeMaterial({
          color: 0xe0_30_28,
          linewidth: 1.25,
          opacity: 0.6,
          transparent: true,
          depthWrite: false,
          worldUnits: false,
        }),
    );
    const geometries = [500, 50_000].map((length) => new LineGeometry().setPositions([0, 0, 0, length, 0, 0]));
    const line = new Line2(geometries[0], materials[0]);
    scene.add(line);
    const outputs = [compact, half].map((target) => {
      const material = new NodeMaterial();
      material.fragmentNode = renderOutput(texture(target.texture), NoToneMapping, SRGBColorSpace);
      material.depthTest = false;
      material.depthWrite = false;
      return new QuadMesh(material);
    });
    const images: Array<Uint8Array<ArrayBuffer>> = [];
    const preparedMaterial = new Line2NodeMaterial({ transparent: true, linewidth: 1.25, depthWrite: false });
    preparedMaterial.analyticButtCaps = true;
    const preparedLine = new Line2(geometries[0], preparedMaterial);
    try {
      expect(renderer.backend).toBeInstanceOf(backend === 'webgpu' ? WebGPUBackend : WebGLBackend);
      renderer.setPixelRatio(2);
      renderer.setSize(width / 2, height / 2);
      renderer.outputColorSpace = LinearSRGBColorSpace;
      renderer.toneMapping = NoToneMapping;
      renderer.setClearColor(0, 0);
      renderer.setRenderTarget(compact);
      if (prepared) {
        scene.add(preparedLine);
        await renderer.compileAsync(scene, camera);
        scene.remove(preparedLine);
      }
      for (const [targetIndex, target] of [compact, half].entries()) {
        for (const geometry of geometries) {
          for (const material of materials) {
            line.geometry = geometry;
            line.material = material;
            renderer.setRenderTarget(target);
            renderer.render(scene, camera);
            renderer.setRenderTarget(destination);
            outputs[targetIndex]!.render(renderer);
            // oxlint-disable-next-line no-await-in-loop -- Capture each warmed context before the next draw.
            const bytes = await renderer.readRenderTargetPixelsAsync(destination, 0, 0, width, height);
            images.push(new Uint8Array(bytes.buffer, bytes.byteOffset, bytes.byteLength).slice());
          }
        }
      }
      const differences = images.map((image) => {
        let maximum = 0;
        let aboveThree = 0;
        let ink = 0;
        for (let offset = 0; offset < image.length; offset += 4) {
          let pixelError = 0;
          for (let channel = 0; channel < 4; channel++) {
            pixelError = Math.max(pixelError, Math.abs(image[offset + channel]! - images[0]![offset + channel]!));
          }
          maximum = Math.max(maximum, pixelError);
          aboveThree += Number(pixelError > 3);
          ink += image[offset + 3]!;
        }
        return { maximum, aboveThree, ink };
      });
      // First and second materials share a builder. Both lengths extend offscreen;
      // the 100x farther endpoint must not alter the visible stroke. Format changes
      // allow three output levels of quantization; cached instances must be exact.
      expect(differences[1]!.maximum).toBe(0);
      expect(differences[0]!.ink).toBeGreaterThan(1_000_000);
      expect(differences[0]!.ink).toBeLessThan(1_200_000);
      expect(
        differences.every(({ aboveThree }) => aboveThree === 0),
        JSON.stringify(differences),
      ).toBe(true);
      // A retained graph must follow a later DPR change, not its preparation DPR.
      for (const dpr of [1, 2]) {
        renderer.setPixelRatio(dpr);
        renderer.setRenderTarget(compact);
        renderer.render(scene, camera);
        renderer.setRenderTarget(destination);
        outputs[0]!.render(renderer);
        // oxlint-disable-next-line no-await-in-loop -- Observe each change before restoring DPR.
        const bytes = await renderer.readRenderTargetPixelsAsync(destination, 0, 0, width, height);
        const pixels = new Uint8Array(bytes.buffer, bytes.byteOffset, bytes.byteLength);
        let ink = 0;
        let maximum = 0;
        for (const [offset, value] of pixels.entries()) {
          if (offset % 4 === 3) {
            ink += value;
          }
          maximum = Math.max(maximum, Math.abs(value - images[3]![offset]!));
        }
        expect(ink / differences[3]!.ink).toBeCloseTo(dpr / 2, 2);
        if (dpr === 2) {
          expect(maximum, 'DPR round trip must restore the retained graph exactly').toBe(0);
        }
      }
    } finally {
      renderer.setRenderTarget(null);
      preparedMaterial.dispose();
      for (const material of materials) {
        material.dispose();
      }
      for (const geometry of geometries) {
        geometry.dispose();
      }
      for (const output of outputs) {
        (output.material as NodeMaterial).dispose();
      }
      compact.dispose();
      half.dispose();
      destination.dispose();
      renderer.dispose();
    }
  },
);

/** Independent polygon-area oracle: clip a unit pixel square against both sides of the strip. */
const stripPixelArea = (normal: readonly [number, number], distance: number, width: number): number => {
  let polygon = [
    [-0.5, -0.5],
    [0.5, -0.5],
    [0.5, 0.5],
    [-0.5, 0.5],
  ];
  for (const side of [1, -1]) {
    const signed = (point: number[]): number =>
      side * (normal[0] * point[0]! + normal[1] * point[1]! + distance) - (side === -1 ? width : 0);
    const clipped: number[][] = [];
    for (let index = 0; index < polygon.length; index++) {
      const a = polygon[index]!;
      const b = polygon[(index + 1) % polygon.length]!;
      const da = signed(a);
      const db = signed(b);
      if (da <= 0) {
        clipped.push(a);
      }
      if (da <= 0 !== db <= 0) {
        const fraction = da / (da - db);
        clipped.push([a[0]! + fraction * (b[0]! - a[0]!), a[1]! + fraction * (b[1]! - a[1]!)]);
      }
    }
    polygon = clipped;
  }
  let twiceArea = 0;
  for (const [index, a] of polygon.entries()) {
    const b = polygon[(index + 1) % polygon.length]!;
    twiceArea += a[0]! * b[1]! - a[1]! * b[0]!;
  }
  return Math.abs(twiceArea) / 2;
};

it.each(['webgpu', 'webgl'] as const)(
  'should give section outlines the BREP square-pixel coverage at 5K on %s',
  async (backend) => {
    const { createSectionCapOutlineNodeMaterial } =
      await import('#graphics/three/materials/section-cap-outline.node.js');
    const { createSectionCapOutlineFaces, writeSectionCapOutlineCamera } =
      await import('#graphics/three/materials/section-cap-outline.material.js');
    const { createSectionStencilCaps } = await import('#graphics/three/utils/section-stencil-caps.js');
    const caps = createSectionStencilCaps('webgpu');
    const canvas = document.createElement('canvas');
    document.body.append(canvas);
    const renderer = await createRenderer('showcase', backend, canvas);
    const target = new RenderTarget(5120, 2880, { samples: 0, type: UnsignedByteType });
    target.texture.colorSpace = LinearSRGBColorSpace;
    const geometry = new PlaneGeometry(10_240, 5760);
    const faces = createSectionCapOutlineFaces();
    const cap = createSectionCapOutlineNodeMaterial(faces, 0);
    const lineMaterial = new Line2NodeMaterial({ color: 0, linewidth: 1, transparent: true });
    lineMaterial.analyticButtCaps = true;
    const lineGeometry = new LineGeometry();
    lineGeometry.setPositions([0, 0, 0, 1, 0, 0]);
    const line = new Line2(lineGeometry, lineMaterial);
    const scene = new Scene();
    scene.background = new Color(0xff_ff_ff);
    const mesh = new Mesh(geometry, cap);
    const camera = new OrthographicCamera(-2560, 2560, 1440, -1440, 0.1, 1000);
    camera.position.z = 100;
    camera.updateMatrixWorld();
    renderer.setPixelRatio(2);
    renderer.setSize(2560, 1440);
    renderer.toneMapping = NoToneMapping;
    renderer.outputColorSpace = LinearSRGBColorSpace;
    renderer.setRenderTarget(target);
    writeSectionCapOutlineCamera(faces, camera, 2880);
    faces.settings.set(1, 2);
    faces.bounds[0]!.set(0, 0, 0, -1);
    try {
      expect(renderer.backend).toBeInstanceOf(backend === 'webgpu' ? WebGPUBackend : WebGLBackend);
      for (const angle of [0, Math.PI / 4, Math.PI / 3]) {
        for (const phase of [0, 0.25, 0.5]) {
          const nx = Math.cos(angle);
          const ny = Math.sin(angle);
          faces.planes[0]!.set(nx, ny, 0, phase);
          // The cap band is inside the cut, so its centre is half a stroke inward.
          const centre = phase - 1;
          const start = lineGeometry.getAttribute('instanceStart');
          const end = lineGeometry.getAttribute('instanceEnd');
          start.setXYZ(0, nx * centre - ny * 5000, ny * centre + nx * 5000, 0);
          end.setXYZ(0, nx * centre + ny * 5000, ny * centre - nx * 5000, 0);
          start.needsUpdate = true;
          end.needsUpdate = true;
          line.frustumCulled = false;
          scene.clear();
          scene.add(mesh);
          renderer.render(scene, camera);
          // oxlint-disable-next-line no-await-in-loop -- Read this retained target before the next draw overwrites it.
          const capPixels = await renderer.readRenderTargetPixelsAsync(target, 2496, 1376, 128, 128);
          scene.clear();
          scene.add(line);
          renderer.render(scene, camera);
          // oxlint-disable-next-line no-await-in-loop -- Read this retained target before the next draw overwrites it.
          const edgePixels = await renderer.readRenderTargetPixelsAsync(target, 2496, 1376, 128, 128);
          scene.clear();
          renderer.render(scene, camera);
          const plane = { normal: [nx, ny, 0] as const, constant: phase };
          // Exercise the actual owner's section mask too: it must retain the fractional footprint.
          caps.render(renderer, {
            camera,
            pieces: [{ cutId: 'coverage', halfSpaces: [plane], faces: [{ cutId: 'coverage', plane, bounds: [] }] }],
            sources: [{ key: 'plane', ownerKey: 'plane', meshes: [mesh], tintHex: 0xff_ff_ff, edgeHex: 0 }],
            stripes: { stripeFrequency: 1, stripeWidth: 0 },
            outlineWidthPixels: 2,
            viewportHeightPixels: 2880,
          });
          // oxlint-disable-next-line no-await-in-loop -- Read this retained target before the next draw overwrites it.
          const ownedPixels = await renderer.readRenderTargetPixelsAsync(target, 2496, 1376, 128, 128);
          let maximum = 0;
          let ink = 0;
          let oracleError = 0;
          for (let index = 0; index < capPixels.length; index += 4) {
            const error = Math.abs(Number(capPixels[index]) - Number(edgePixels[index]));
            const column = (index / 4) % 128;
            const row = Math.floor(index / 4 / 128);
            const x = column - 63.5;
            const y = backend === 'webgpu' ? 63.5 - row : row - 63.5;
            const expected = 255 * (1 - stripPixelArea([nx, ny], nx * x + ny * y - phase, 2));
            oracleError = Math.max(
              oracleError,
              Math.abs(Number(capPixels[index]) - expected),
              Math.abs(Number(edgePixels[index]) - expected),
              Math.abs(Number(ownedPixels[index]) - expected),
            );
            maximum = Math.max(maximum, error);
            ink += 255 - Number(edgePixels[index]);
          }
          expect(ink).toBeGreaterThan(1000);
          expect(oracleError, `CPU area ${backend}, angle=${angle}, phase=${phase}`).toBeLessThanOrEqual(4);
          // Same square-pixel area, allowing four linear UNORM8 levels for interpolation/quantization.
          expect(maximum, `${backend}, angle=${angle}, phase=${phase}`).toBeLessThanOrEqual(4);
        }
      }
    } finally {
      renderer.setRenderTarget(null);
      target.dispose();
      geometry.dispose();
      lineGeometry.dispose();
      cap.dispose();
      caps.dispose();
      lineMaterial.dispose();
      renderer.dispose();
      canvas.remove();
    }
  },
);
