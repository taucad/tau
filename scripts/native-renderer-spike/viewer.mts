import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
// eslint-disable-next-line @nx/enforce-module-boundaries -- Isolated benchmark uses the actual UI factory to preserve baseline settings.
import { createRenderer } from '../../apps/ui/app/components/geometry/graphics/three/renderer.ts';

const token = location.hash.slice(1);
history.replaceState(null, '', location.pathname + location.search);
const api = async (path, init = {}) => {
  const response = await fetch(path, {
    ...init,
    headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
  });
  if (!response.ok) throw new Error(`Scene request ${response.status}`);
  return response;
};
const hash = async (bytes) =>
  [...new Uint8Array(await crypto.subtle.digest('SHA-256', bytes))]
    .map((x) => x.toString(16).padStart(2, '0'))
    .join('');
const percentile = (values, q) => [...values].sort((a, b) => a - b)[Math.ceil(values.length * q) - 1];
const run = async () => {
  const start = performance.now();
  let state = await (await api('/scene')).json();
  const transferStart = performance.now();
  const urls = new Map();
  const fetchAsset = async (asset) => {
    const bytes = await (await api(`/assets/${asset.digest}`)).arrayBuffer();
    if (bytes.byteLength !== asset.bytes || (await hash(bytes)) !== asset.digest) throw new Error('Asset integrity');
    return bytes;
  };
  const bytes = await fetchAsset(state.asset);
  for (const [uri, asset] of Object.entries(state.asset.dependencies))
    urls.set(uri, URL.createObjectURL(new Blob([await fetchAsset(asset)])));
  const transferMs = performance.now() - transferStart;
  const manager = new THREE.LoadingManager();
  manager.setURLModifier((url) => {
    if (urls.has(url)) return urls.get(url);
    if (url.startsWith('blob:')) return url;
    throw new Error('Undeclared dependency');
  });
  const decodeStart = performance.now();
  const gltf = await new GLTFLoader(manager).parseAsync(bytes, '');
  const decodeMs = performance.now() - decodeStart;
  const canvas = document.querySelector('canvas');
  const backend = new URLSearchParams(location.search).get('backend') === 'webgpu' ? 'webgpu' : 'webgl';
  const renderer = await createRenderer('viewport', backend, canvas);
  renderer.setSize(640, 480, false);
  renderer.setPixelRatio(1);
  renderer.setClearColor(0x202020, 1);
  renderer.toneMapping = THREE.NoToneMapping;
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  const scene = new THREE.Scene();
  scene.add(gltf.scene);
  const camera = new THREE.PerspectiveCamera(45, 640 / 480, 0.1, 100);
  const materials = [];
  gltf.scene.traverse((object) => {
    if (object.isMesh) materials.push({ material: object.material, color: object.material.color.clone() });
  });
  const draw = (angle, intensity = 1) => {
    camera.position.set(24 * Math.sin(angle), 10, 24 * Math.cos(angle));
    camera.lookAt(0, 0, 0);
    for (const { material, color } of materials) material.color.copy(color).multiplyScalar(intensity);
    renderer.render(scene, camera);
  };
  const finish = async () => {
    if (backend === 'webgl') {
      const gl = renderer.getContext();
      if (gl.isContextLost()) throw new Error('WebGL context lost');
      gl.finish();
      if (renderer.getRenderTarget() === null) gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, new Uint8Array(4));
    } else await renderer.backend.device.queue.onSubmittedWorkDone();
  };
  const uploadStart = performance.now();
  draw(state.view.angle, state.view.intensity);
  await finish();
  const uploadAndFirstDrawMs = performance.now() - uploadStart;
  const firstSubmittedFrameMs = performance.now() - start;
  let frames = 0;
  const render = async () => {
    draw(state.view.angle, state.view.intensity);
    await finish();
    frames++;
  };
  // Deterministic projected triangle visibility checked via framebuffer evidence by the runner.
  window.spike = {
    metrics: {
      backend,
      three: THREE.REVISION,
      transferMs,
      decodeMs,
      uploadAndFirstDrawMs,
      firstSubmittedFrameMs,
      firstCorrectFrameMs: null,
      validation: 'pending pixel check',
    },
    async benchmark(count = 120) {
      const samples = [];
      for (let i = 0; i < 10; i++) {
        draw(i * 0.01 + 0.4);
        await finish();
      }
      for (let i = 0; i < count; i++) {
        const t = performance.now();
        draw(0.4 + i * 0.002);
        await finish();
        samples.push(performance.now() - t);
      }
      await render();
      return {
        ...this.metrics,
        drawCalls: renderer.info.render.calls,
        triangles: renderer.info.render.triangles,
        p50Ms: percentile(samples, 0.5),
        p95Ms: percentile(samples, 0.95),
        samplesMs: samples,
        frames,
      };
    },
    async update(view) {
      const t = performance.now();
      state = await (
        await api('/view', { method: 'PATCH', body: JSON.stringify({ revision: state.revision, view }) })
      ).json();
      await render();
      return { revisionLatencyMs: performance.now() - t, revision: state.revision };
    },
    async stats() {
      return (await api('/stats')).json();
    },
    frames: () => frames,
    async pixels() {
      const target = new (backend === 'webgl' ? THREE.WebGLRenderTarget : THREE.RenderTarget)(640, 480, { samples: 4 });
      target.texture.colorSpace = THREE.SRGBColorSpace;
      renderer.setRenderTarget(target);
      draw(state.view.angle, state.view.intensity);
      await finish();
      renderer.setRenderTarget(null);
      const pixels = new Uint8Array(640 * 480 * 4);
      if (backend === 'webgl') renderer.readRenderTargetPixels(target, 0, 0, 640, 480, pixels);
      else pixels.set(await renderer.readRenderTargetPixelsAsync(target, 0, 0, 640, 480));
      renderer.setRenderTarget(null);
      target.dispose();
      await render();
      let colored = 0;
      for (let i = 0; i < pixels.length; i += 4)
        if (Math.max(pixels[i], pixels[i + 1], pixels[i + 2]) - Math.min(pixels[i], pixels[i + 1], pixels[i + 2]) > 20)
          colored++;
      if (colored < 10000 || colored > 160000)
        throw new Error(
          `Visibility witness failed: ${colored}, calls ${renderer.info.render.calls}, first ${pixels.slice(0, 4)}`,
        );
      if (this.metrics.firstCorrectFrameMs === null) {
        this.metrics.firstCorrectFrameMs = performance.now() - start;
        this.metrics.validation = 'offscreen visibility readback';
      }
      return Array.from(pixels);
    },
    dispose() {
      renderer.dispose();
      gltf.scene.traverse((object) => {
        object.geometry?.dispose();
        if (object.material)
          for (const mat of Array.isArray(object.material) ? object.material : [object.material]) mat.dispose();
      });
      for (const url of urls.values()) URL.revokeObjectURL(url);
    },
  };
  await window.spike.pixels();
  window.spike.ready = true;
  document.querySelector('#status').textContent = JSON.stringify(window.spike.metrics, null, 2);
  document.querySelector('#orbit').onclick = () =>
    window.spike.update({ ...state.view, angle: state.view.angle + 0.2 });
  document.querySelector('#light').onclick = () =>
    window.spike.update({ ...state.view, intensity: state.view.intensity === 1 ? 0.6 : 1 });
  window.addEventListener('pagehide', () => window.spike.dispose(), { once: true });
};
run().catch((error) => {
  document.querySelector('#status').textContent = String(error);
  window.spikeError = String(error);
});
