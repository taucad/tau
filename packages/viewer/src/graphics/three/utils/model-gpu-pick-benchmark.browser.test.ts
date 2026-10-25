import { expect, inject, it, vi } from 'vitest';
import * as THREE from 'three';
import { WebGPURenderer, WebGPUBackend } from 'three/webgpu';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { createRenderer } from '#graphics/three/renderer.js';
import { createModelGpuPicker } from '#graphics/three/utils/model-gpu-pick.js';
import { clearRendererSpans, rendererSpans } from '#lib/renderer-telemetry.js';

declare module 'vitest' {
  // oxlint-disable-next-line typescript/consistent-type-definitions -- Vitest context is extended by declaration merging.
  export interface ProvidedContext {
    pickingBenchmark: string;
    pickingFixture: string;
  }
}

const run = inject('pickingBenchmark');
const nextFrame = async (): Promise<void> =>
  new Promise((resolve) => {
    requestAnimationFrame(() => {
      resolve();
    });
  });
const summarize = (values: number[]): Record<string, number> => {
  const sorted = [...values].sort((a, b) => a - b);
  const at = (fraction: number): number => sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * fraction))]!;
  return {
    median: at(0.5),
    p95: at(0.95),
    p99: at(0.99),
    samples: values.length,
  };
};

/** Opt-in, isolated production-picker measurement; no full-renderer FPS claim. */
it.skipIf(!run)('should measure the planetary picker at a 5K buffer', async () => {
  const native = run.includes('native');
  const timed = !run.includes('natural');
  const width = 2560;
  const height = 1440;
  const canvas = document.createElement('canvas');
  canvas.tabIndex = 0;
  document.body.append(canvas);
  canvas.focus();
  const renderer = await createRenderer(native ? 'viewport' : 'showcase', native ? 'webgpu' : 'webgl', canvas);
  expect(renderer).toBeInstanceOf(WebGPURenderer);
  const node = renderer as WebGPURenderer;
  expect(node.backend instanceof WebGPUBackend).toBe(native);
  node.setPixelRatio(2);
  node.setSize(width, height);
  expect(node.getDrawingBufferSize(new THREE.Vector2()).toArray()).toEqual([5120, 2880]);
  expect(THREE.REVISION).toBe('184');
  // Three r184 backend instrumentation is enabled before any descriptor is created;
  // the entire owned renderer is retired afterwards, including cached descriptors.
  Object.assign(node.backend, { trackTimestamp: native && timed });
  const response = await fetch(`/@fs${inject('pickingFixture')}`);
  expect(response.ok).toBe(true);
  const bytes = await response.arrayBuffer();
  const hash = [...new Uint8Array(await crypto.subtle.digest('SHA-256', bytes))]
    .map((x) => x.toString(16).padStart(2, '0'))
    .join('');
  expect(hash).toBe('7ffb9e08bd07eab38e853c5ed0684223012737616297d5bc003e4aa3531a5585');
  const { scene } = await new GLTFLoader().parseAsync(bytes, '');
  scene.scale.setScalar(1000);
  scene.updateMatrixWorld(true);
  const meshes: THREE.Mesh[] = [];
  scene.traverse((object) => {
    if (object instanceof THREE.Mesh) {
      meshes.push(object as THREE.Mesh);
    }
  });
  const bounds = new THREE.Box3().setFromObject(scene);
  const center = bounds.getCenter(new THREE.Vector3());
  const radius = bounds.getSize(new THREE.Vector3()).length() / 2;
  const camera = new THREE.PerspectiveCamera(40, width / height, radius * 0.05, radius * 20);
  camera.position.copy(center).add(new THREE.Vector3(0.6, 0.8, 1).normalize().multiplyScalar(radius * 3.2));
  camera.lookAt(center);
  node.render(scene, camera);
  if (native && timed) {
    await node.resolveTimestampsAsync();
  }
  const memoryBefore = node.info.memory.texturesSize;
  const picker = createModelGpuPicker({
    renderer: node,
    sectionClip: undefined,
    settleMilliseconds: 0,
  });
  const reads: Array<{
    width: number;
    height: number;
    bytes: number;
    samples: number;
    type: number;
    depth: boolean;
  }> = [];
  const originalRead = node.readRenderTargetPixelsAsync.bind(node);
  const read = vi.spyOn(node, 'readRenderTargetPixelsAsync').mockImplementation(async (...args) => {
    const target = args[0];
    const w = args[3];
    const h = args[4];
    const result = await originalRead(...args);
    reads.push({
      width: w,
      height: h,
      bytes: result.byteLength,
      samples: target.samples,
      type: target.texture.type,
      depth: target.depthBuffer,
    });
    return result;
  });
  const gl = native ? undefined : (node.getContext() as WebGL2RenderingContext);
  const extension = gl?.getExtension('EXT_disjoint_timer_query_webgl2') as
    | { TIME_ELAPSED_EXT: number; GPU_DISJOINT_EXT: number }
    | undefined;
  if (timed) {
    expect(native ? node.hasFeature('timestamp-query') : extension).toBeTruthy();
  }
  const ray = new THREE.Raycaster();
  const gpu: number[] = [];
  const latencies: number[] = [];
  const states: string[] = [];
  let unfocused = 0;
  let firstDemandLatency = 0;
  let retained = 0;
  let idleReads = 0;
  let disposedBytes = 0;
  const baseX = meshes[0]!.position.x;
  try {
    clearRendererSpans();
    picker.frame({ camera, width, height, meshes });
    await nextFrame();
    await picker.refresh();
    idleReads = reads.length;
    for (let index = 0; index < 130; index++) {
      // Independent deterministic model movement invalidates the old full-frame cache too.
      meshes[0]!.position.x = baseX + Math.sin(index * 0.11) * radius * 0.001;
      scene.updateMatrixWorld(true);
      picker.frame({ camera, width, height, meshes });
      picker.frame({ camera, width, height, meshes });
      ray.setFromCamera(new THREE.Vector2(Math.sin(index * 0.19) * 0.45, Math.cos(index * 0.17) * 0.3), camera);
      picker.pick(ray);
      const query = timed && gl ? gl.createQuery() : undefined;
      if (query) {
        gl!.beginQuery(extension!.TIME_ELAPSED_EXT, query);
      }
      const start = performance.now();
      const pending = picker.refresh();
      if (query) {
        gl!.endQuery(extension!.TIME_ELAPSED_EXT);
      }
      // oxlint-disable-next-line no-await-in-loop -- Serialize readbacks, as the production owner does.
      await pending;
      const latency = performance.now() - start;
      if (index === 0) {
        firstDemandLatency = latency;
      }
      let gpuDuration: number | undefined;
      if (native && timed) {
        // oxlint-disable-next-line no-await-in-loop -- Resolve the one isolated pick render before another sample.
        gpuDuration = await node.resolveTimestampsAsync();
      } else if (query) {
        // oxlint-disable-next-line no-await-in-loop -- Nonblocking query polling after asynchronous pixel readback.
        await vi.waitFor(() => {
          expect(gl!.getQueryParameter(query, gl!.QUERY_RESULT_AVAILABLE)).toBe(true);
        });
        expect(gl!.getParameter(extension!.GPU_DISJOINT_EXT)).toBe(false);
        gpuDuration = Number(gl!.getQueryParameter(query, gl!.QUERY_RESULT)) / 1_000_000;
        gl!.deleteQuery(query);
      }
      if (index >= 30) {
        latencies.push(latency);
        if (gpuDuration !== undefined) {
          gpu.push(gpuDuration);
        }
        states.push(picker.pick(ray).status);
        if (!document.hasFocus() || document.hidden) {
          unfocused++;
        }
      }
      // oxlint-disable-next-line no-await-in-loop -- Pace independent pointer samples without a busy loop.
      await nextFrame();
    }
    retained = node.info.memory.texturesSize - memoryBefore;
    expect(states.every((status) => status === 'hit' || status === 'miss')).toBe(true);
  } finally {
    read.mockRestore();
    picker.dispose();
    disposedBytes = node.info.memory.texturesSize - memoryBefore;
    const spans = rendererSpans().filter((span) => span.name === 'renderer.pick');
    console.log(
      'PICK_BENCHMARK ' +
        JSON.stringify({
          run,
          backend: native ? 'webgpu' : 'webgl2-node',
          timed,
          fixtureSha256: hash,
          meshes: meshes.length,
          viewport: {
            width,
            height,
            dpr: 2,
            buffer: [canvas.width, canvas.height],
          },
          userAgent: navigator.userAgent,
          revision: THREE.REVISION,
          unfocused,
          idleReads,
          firstDemandLatency,
          retainedTextureBytes: retained,
          afterPickerDisposeBytes: disposedBytes,
          readbacks: reads,
          gpu: gpu.length > 0 ? summarize(gpu) : undefined,
          gpuSamples: gpu,
          latency: summarize(latencies),
          latencySamples: latencies,
          states,
          spans: spans.map(({ duration, detail }) => ({ duration, detail })),
        }),
    );
    for (const object of meshes) {
      object.geometry.dispose();
      for (const material of Array.isArray(object.material) ? object.material : [object.material]) {
        material.dispose();
      }
    }
    node.dispose();
    canvas.remove();
  }
});
