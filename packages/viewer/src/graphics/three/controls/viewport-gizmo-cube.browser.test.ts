import '#test/browser.css';
import { afterEach, expect, it, vi } from 'vitest';
import { page } from 'vitest/browser';
import { Color, NoToneMapping, PerspectiveCamera, Raycaster, RenderTarget, Scene, Vector3, WebGLRenderer } from 'three';
import { ViewportGizmo } from 'three-viewport-gizmo';
import { createRenderer } from '#graphics/three/renderer.js';
import { applyViewportGizmoSurface } from '#graphics/three/controls/viewport-gizmo-cube-surface.js';
import { readViewportGizmoStyle, viewportGizmoMetrics } from '#graphics/three/controls/viewport-gizmo-cube-style.js';

const measureCoverage = (
  data: ArrayLike<number>,
): { opaquePixels: number; interiorGaps: number; antialiasedPixels: number } => {
  let interiorGaps = 0;
  let antialiasedPixels = 0;
  let opaquePixels = 0;
  for (let y = 0; y < 384; y++) {
    let first = -1;
    let last = -1;
    for (let x = 0; x < 384; x++) {
      const alpha = data[(y * 384 + x) * 4 + 3]!;
      if (alpha === 255) {
        if (first < 0) {
          first = x;
        }
        last = x;
        opaquePixels++;
      } else if (alpha > 0) {
        antialiasedPixels++;
      }
    }
    // A convex cube has no translucent pixels between its opaque silhouette ends.
    for (let x = first + 2; x < last - 2; x++) {
      if (data[(y * 384 + x) * 4 + 3]! < 250) {
        interiorGaps++;
      }
    }
  }
  return { opaquePixels, interiorGaps, antialiasedPixels };
};

afterEach(() => {
  document.documentElement.classList.remove('dark', 'black', 'high-contrast');
});

it.each(['light', 'dark', 'black', 'high-contrast'])(
  'should keep face and hover labels legible in %s mode',
  (theme) => {
    if (theme !== 'light') {
      document.documentElement.classList.add('dark', theme);
    }
    const luminance = (color: number): number => {
      const linear = new Color(color);
      return linear.r * 0.2126 + linear.g * 0.7152 + linear.b * 0.0722;
    };
    const contrast = (left: number, right: number): number =>
      (Math.max(luminance(left), luminance(right)) + 0.05) / (Math.min(luminance(left), luminance(right)) + 0.05);
    for (const accentColor of ['#008c7d', '#ffcc00', '#401060']) {
      const style = readViewportGizmoStyle({
        container: document.body,
        colorScheme: theme === 'light' ? 'light' : 'dark',
        isHighContrast: theme === 'high-contrast',
        accentColor,
      });
      expect(contrast(style.label, style.face)).toBeGreaterThanOrEqual(4.5);
      expect(contrast(style.hoverLabel, style.hover)).toBeGreaterThanOrEqual(4.5);
    }
  },
);

it.each(['webgl', 'webgpu'] as const)(
  'should keep the %s cube opaque inside and antialiased outside',
  async (backend) => {
    await page.viewport(500, 500);
    const canvas = document.createElement('canvas');
    document.body.append(canvas);
    const renderer = await createRenderer('viewport', backend, { canvas, preserveDrawingBuffer: true });
    renderer.setSize(384, 384);
    renderer.setClearColor(0, 0);
    renderer.toneMapping = NoToneMapping;
    const camera = new PerspectiveCamera(45, 1, 0.1, 100);
    camera.up.set(0, 0, 1);
    const gizmo = new ViewportGizmo(camera, renderer, {
      type: 'rounded-cube',
      up: 'z',
      size: 320,
      radius: viewportGizmoMetrics.radius,
      container: document.body,
      placement: 'top-left',
      offset: { top: 0, left: 0 },
      background: { enabled: false },
    });
    const scene = new Scene();
    const copy = document.createElement('canvas');
    copy.width = 384;
    copy.height = 384;
    const context = copy.getContext('2d', { willReadFrequently: true })!;
    // Software WebGPU adapters may not present their canvas. Read their real multisampled
    // target, while WebGL exercises the presented canvas, with the same gizmo render path.
    const target = renderer instanceof WebGLRenderer ? undefined : new RenderTarget(384, 384, { samples: 4 });
    if (!(renderer instanceof WebGLRenderer)) {
      expect('isWebGPUBackend' in renderer.backend && renderer.backend.isWebGPUBackend).toBe(true);
    }
    try {
      for (const theme of ['light', 'dark'] as const) {
        document.documentElement.classList.toggle('dark', theme === 'dark');
        const style = readViewportGizmoStyle({
          container: document.body,
          colorScheme: theme,
          isHighContrast: false,
          accentColor: '#008c7d',
        });
        applyViewportGizmoSurface(gizmo, style);
        gizmo.updateMatrixWorld(true);
        const raycaster = new Raycaster();
        for (const region of gizmo.children) {
          const direction = region.position.clone().transformDirection(gizmo.matrixWorld);
          raycaster.set(direction.clone().multiplyScalar(7), direction.negate());
          expect(raycaster.intersectObjects(gizmo.children, false)[0]?.object, 'face, edge and corner picking').toBe(
            region,
          );
        }
        // oxlint-disable-next-line eslint/no-await-in-loop -- A theme creates a new set of label textures and materials.
        await renderer.compileAsync(gizmo, camera);
        for (let yaw = 0; yaw < 360; yaw += 30) {
          camera.position.set(7 * Math.sin((yaw * Math.PI) / 180), -7 * Math.cos((yaw * Math.PI) / 180), 3);
          camera.lookAt(new Vector3());
          // WebGPU may finish compiling its canvas output pass after scene compilation.
          let data: ArrayLike<number> = [];
          // oxlint-disable-next-line eslint/no-await-in-loop -- Observe each orientation after the GPU has presented it.
          await vi.waitFor(async () => {
            if (target && !(renderer instanceof WebGLRenderer)) {
              renderer.setRenderTarget(target);
            } else {
              renderer.setRenderTarget(null);
            }
            target?.viewport.set(0, 0, 384, 384);
            renderer.render(scene, camera);
            gizmo.cameraUpdate();
            target?.viewport.set(0, 0, 320, 320);
            gizmo.render();
            if (target && !(renderer instanceof WebGLRenderer)) {
              data = await renderer.readRenderTargetPixelsAsync(target, 0, 0, 384, 384);
            } else {
              context.clearRect(0, 0, 384, 384);
              context.drawImage(canvas, 0, 0);
              data = context.getImageData(0, 0, 384, 384).data;
            }
            renderer.setRenderTarget(null);
            expect(data[(160 * 384 + 160) * 4 + 3]).toBe(255);
          });
          const { opaquePixels, interiorGaps, antialiasedPixels } = measureCoverage(data);
          expect(opaquePixels, `${theme}, yaw ${yaw}: rendered cube`).toBeGreaterThan(10_000);
          expect(interiorGaps, `${theme}, yaw ${yaw}: no face/edge gaps`).toBe(0);
          expect(antialiasedPixels, `${theme}, yaw ${yaw}: smooth silhouette`).toBeGreaterThan(20);
        }
      }
    } finally {
      gizmo.dispose();
      target?.dispose();
      renderer.dispose();
      canvas.remove();
    }
  },
);
