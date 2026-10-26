import { expect, it } from 'vitest';
import type { BufferGeometry, Material } from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import {
  Color,
  DepthStencilFormat,
  DepthTexture,
  FloatType,
  Mesh,
  MeshBasicMaterial,
  NoToneMapping,
  OrthographicCamera,
  UnsignedIntType,
  PerspectiveCamera,
  PlaneGeometry,
  Scene,
  UnsignedInt248Type,
} from 'three';
import type { Node } from 'three/webgpu';
import { NodeMaterial, QuadMesh, RenderTarget, WebGLBackend, WebGPUBackend, WebGPURenderer } from 'three/webgpu';
import {
  getViewPosition,
  logarithmicDepthToViewZ,
  reference,
  sample,
  screenUV,
  texture,
  uniform,
  vec4,
  viewZToPerspectiveDepth,
} from 'three/tsl';
import { createLogDepthAoAdapter } from '#graphics/three/gtao-log-depth.js';
import { createRenderer } from '#graphics/three/renderer.js';

// The deployed planetary failure's native (render-local millimetre) clip interval.
// Its camera is inside the model bounds; the near plane must not be moved to hide the defect.
const near = 1.178361845751682e-7;
const far = 796.0040564306529;

it.each(['webgl', 'webgpu'] as const)(
  'keeps rear surfaces occluded at the deployed close-up clip interval on %s',
  async (backend) => {
    const renderer = await createRenderer('viewport', backend, {
      canvas: document.createElement('canvas'),
      nodePipeline: true,
    });
    expect(renderer).toBeInstanceOf(WebGPURenderer);
    if (!(renderer instanceof WebGPURenderer)) {
      throw new Error('Expected the node renderer');
    }
    expect(renderer.backend).toBeInstanceOf(backend === 'webgpu' ? WebGPUBackend : WebGLBackend);
    renderer.setSize(64, 64);
    renderer.toneMapping = NoToneMapping;
    const target = new RenderTarget(64, 64, { samples: 0, stencilBuffer: backend === 'webgl' });
    target.depthTexture = new DepthTexture(64, 64, backend === 'webgpu' ? FloatType : UnsignedInt248Type);
    if (backend === 'webgl') {
      target.depthTexture.format = DepthStencilFormat;
    }
    const geometry = new PlaneGeometry(100, 100);
    const frontMaterial = new MeshBasicMaterial({ color: 0xff_00_00 });
    const rearMaterial = new MeshBasicMaterial({ color: 0x00_ff_00 });
    const front = new Mesh(geometry, frontMaterial);
    const rear = new Mesh(geometry, rearMaterial);
    front.frustumCulled = false;
    rear.frustumCulled = false;
    front.position.z = -100;
    rear.position.z = -101;
    const beauty = new Scene();
    beauty.background = new Color(0);
    beauty.add(front);
    const overlays = new Scene();
    overlays.add(rear);
    const camera = new PerspectiveCamera(60, 955 / 1410, near, far);
    try {
      renderer.setRenderTarget(target);
      for (const shift of [0, 0.01, -0.01, 0]) {
        camera.position.x = shift;
        renderer.autoClear = true;
        renderer.render(beauty, camera);
        renderer.autoClear = false;
        renderer.render(overlays, camera);
        // oxlint-disable-next-line no-await-in-loop -- Read each pose before moving the camera.
        const pixel = await renderer.readRenderTargetPixelsAsync(target, 32, 32, 1, 1);
        expect([...pixel], `hidden rear surface at camera offset ${shift}`).toEqual([255, 0, 0, 255]);
      }
    } finally {
      target.dispose();
      geometry.dispose();
      frontMaterial.dispose();
      rearMaterial.dispose();
      renderer.dispose();
    }
  },
);

it('reconstructs logarithmic AO depth across tiny-near perspective and signed orthographic cameras', async () => {
  const renderer = await createRenderer('viewport', 'webgl', {
    canvas: document.createElement('canvas'),
    nodePipeline: true,
  });
  if (!(renderer instanceof WebGPURenderer)) {
    throw new Error('Expected the node renderer');
  }
  expect(renderer.backend).toBeInstanceOf(WebGLBackend);
  const depthTarget = new RenderTarget(32, 32, { samples: 0 });
  depthTarget.depthTexture = new DepthTexture(32, 32, UnsignedIntType);
  const outputTarget = new RenderTarget(1, 1, { type: FloatType, depthBuffer: false });
  const geometry = new PlaneGeometry(1000, 1000);
  const surface = new MeshBasicMaterial();
  const plane = new Mesh(geometry, surface);
  const scene = new Scene();
  scene.add(plane);
  const cameras = [new PerspectiveCamera(60, 1, near, far), new OrthographicCamera(-200, 200, 200, -200, -far, far)];
  const adapter = createLogDepthAoAdapter(
    cameras[0]!,
    sample((uv) => texture(depthTarget.depthTexture!, uv).r),
  );
  // The actual GTAO node decodes with references to the adapter's camera.
  const forward = viewZToPerspectiveDepth(
    logarithmicDepthToViewZ(
      (adapter.gtaoDepth.sample(screenUV) as Node<'vec4'>).r,
      reference('near', 'float', adapter.camera),
      reference('far', 'float', adapter.camera),
    ),
    reference('near', 'float', adapter.camera),
    reference('far', 'float', adapter.camera),
  );
  const material = new NodeMaterial();
  material.depthTest = false;
  material.depthWrite = false;
  material.fragmentNode = vec4(getViewPosition(screenUV, forward, uniform(adapter.camera.projectionMatrixInverse)), 1);
  const quad = new QuadMesh(material);
  try {
    for (const camera of [...cameras, cameras[0]!]) {
      for (const z of [-10, -100, -700]) {
        // Node uniforms update once per animation frame, as in the viewport scheduler.
        // oxlint-disable-next-line no-await-in-loop -- Each camera/depth is a separate presented frame.
        await new Promise<void>((resolve) => {
          requestAnimationFrame(() => {
            resolve();
          });
        });
        adapter.update(camera);
        plane.position.z = z;
        renderer.setRenderTarget(depthTarget);
        renderer.render(scene, camera);
        renderer.setRenderTarget(outputTarget);
        quad.render(renderer);
        // oxlint-disable-next-line no-await-in-loop -- Read each camera/depth before changing its uniforms.
        const bytes = await renderer.readRenderTargetPixelsAsync(outputTarget, 0, 0, 1, 1);
        const point = new Float32Array(bytes.buffer, bytes.byteOffset, bytes.byteLength / 4);
        expect(point[0]).toBeCloseTo(0, 3);
        expect(point[1]).toBeCloseTo(0, 3);
        // Allow 20 ppm for D24 quantization plus GPU logarithmic reconstruction.
        expect(Math.abs(point[2]! - z), `${camera.type} z=${z}`).toBeLessThan(Math.abs(z) * 2e-5);
      }
    }
  } finally {
    renderer.setRenderTarget(null);
    material.dispose();
    geometry.dispose();
    surface.dispose();
    depthTarget.dispose();
    outputTarget.dispose();
    renderer.dispose();
  }
});

it.each(['webgl', 'webgpu'] as const)(
  'preserves opaque ownership on the reported planetary close-up on %s',
  async (backend) => {
    const renderer = await createRenderer('viewport', backend, {
      canvas: document.createElement('canvas'),
      nodePipeline: true,
    });
    if (!(renderer instanceof WebGPURenderer)) {
      throw new Error('Expected node renderer');
    }
    const width = 1910;
    const height = 2820;
    const target = new RenderTarget(width, height, { samples: 0, stencilBuffer: backend === 'webgl' });
    target.depthTexture = new DepthTexture(width, height, backend === 'webgpu' ? FloatType : UnsignedInt248Type);
    if (backend === 'webgl') {
      target.depthTexture.format = DepthStencilFormat;
    }
    const response = await fetch(new URL('fixtures/planetary-depth-repro.glb', import.meta.url));
    const gltf = await new GLTFLoader().parseAsync(await response.arrayBuffer(), '');
    const scene = new Scene();
    scene.background = new Color(0xff_ff_ff);
    gltf.scene.rotation.x = Math.PI / 2;
    gltf.scene.scale.setScalar(1000);
    scene.add(gltf.scene);
    const materials: MeshBasicMaterial[] = [];
    const geometries = new Set<BufferGeometry>();
    gltf.scene.traverse((object) => {
      if (object instanceof Mesh) {
        geometries.add(object.geometry as BufferGeometry);
        const original = object.material as Material | Material[];
        for (const material of Array.isArray(original) ? original : [original]) {
          material.dispose();
        }
        // Distinct unlit IDs isolate opaque ownership from lighting and AO.
        const material = new MeshBasicMaterial({ color: new Color().setHSL(materials.length * 0.137, 0.8, 0.5) });
        materials.push(material);
        object.material = material;
        object.frustumCulled = false;
      }
    });
    const camera = new PerspectiveCamera(60, width / height, near, far);
    camera.position.set(58.25144951836576, -72.29818094416098, 70.5610640001441);
    camera.quaternion.set(0.41334356651478255, 0.14579961015189566, 0.29899015680835966, 0.8476405227642833);
    renderer.toneMapping = NoToneMapping;
    const capture = async (clipNear: number): Promise<Uint8Array<ArrayBuffer>> => {
      camera.near = clipNear;
      camera.updateProjectionMatrix();
      renderer.setRenderTarget(target);
      renderer.render(scene, camera);
      const pixels = await renderer.readRenderTargetPixelsAsync(target, 0, 0, width, height);
      return new Uint8Array(pixels.buffer, pixels.byteOffset, pixels.byteLength).slice();
    };
    try {
      for (const shift of [0, 0.01, -0.01]) {
        camera.position.x = 58.25144951836576 + shift;
        // oxlint-disable-next-line no-await-in-loop -- Paired clip intervals must share one geometry/camera pose.
        const reference = await capture(0.1);
        // oxlint-disable-next-line no-await-in-loop -- Compare the reported interval at that same pose.
        const actual = await capture(near);
        let interiorChanges = 0;
        let interiorPixels = 0;
        // Ignore only one-pixel material boundaries. Every flat ownership interior is strict,
        // so concentrated hidden-face leaks cannot disappear into a whole-image average.
        for (let y = 1; y < height - 1; y++) {
          for (let x = 1; x < width - 1; x++) {
            const offset = (y * width + x) * 4;
            let interior = true;
            for (const neighbor of [offset - width * 4, offset + width * 4, offset - 4, offset + 4]) {
              for (let c = 0; c < 3; c++) {
                interior &&= reference[offset + c] === reference[neighbor + c];
              }
            }
            if (interior) {
              interiorPixels++;
              if ([0, 1, 2].some((c) => Math.abs(actual[offset + c]! - reference[offset + c]!) > 1)) {
                interiorChanges++;
              }
            }
          }
        }
        console.info(
          'Planetary depth ownership',
          JSON.stringify({ backend, width, height, shift, interiorPixels, interiorChanges }),
        );
        expect(interiorChanges).toBe(0);
      }
    } finally {
      renderer.setRenderTarget(null);
      for (const material of materials) {
        material.dispose();
      }
      for (const geometry of geometries) {
        geometry.dispose();
      }
      target.dispose();
      renderer.dispose();
    }
  },
);
