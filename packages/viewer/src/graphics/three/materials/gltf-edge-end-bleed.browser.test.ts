import { afterEach, describe, expect, inject, it } from 'vitest';
import { commands } from 'vitest/browser';
import {
  AmbientLight,
  BufferGeometry,
  DirectionalLight,
  DoubleSide,
  Float32BufferAttribute,
  Mesh,
  MeshStandardMaterial,
  OrthographicCamera,
  PerspectiveCamera,
  Raycaster,
  Scene,
  Vector2,
  Vector3,
} from 'three';
import type { RendererInstance } from '#graphics/three/renderer.js';
import { createRenderer } from '#graphics/three/renderer.js';
import {
  createGltfFatLineMaterial,
  createGltfFatLineSegmentsFromPositions,
  gltfEdgeLineWidth,
} from '#graphics/three/materials/gltf-edges.js';
import { applyGltfSurfaceDepthBias } from '#graphics/three/materials/gltf-surface-depth-bias.js';
import {
  captureRendererOutput,
  disposeRendererOutput,
  installRendererOutput,
} from '@taucad/runtime-testing/browser/three-renderer-output';

/**
 * A spur-gear-like prism. Every tooth has two flank faces and a tip land, so each far tooth carries
 * vertical edges on its hidden side that end exactly on the occluding top-face boundary. Those are
 * the edges that showed through the top face as short ticks past its contour.
 */
const teeth = 24;
const rootRadius = 0.042;
const tipRadius = 0.05;
const thickness = 0.012;

type Prism = Readonly<{ triangles: Float32Array; edges: Float32Array }>;
type SpineSample = Readonly<{ x: number; y: number; visible: boolean }>;
type Fixture = Readonly<{
  pixelRatio: number;
  elevation: number;
  projection: 'orthographic' | 'perspective';
}>;

const width = 640;
const height = 400;

const gearProfile = (): Vector2[] => {
  const points: Vector2[] = [];
  const pitch = (Math.PI * 2) / teeth;
  const at = (radius: number, angle: number): Vector2 =>
    new Vector2(Math.cos(angle) * radius, Math.sin(angle) * radius);
  for (let tooth = 0; tooth < teeth; tooth++) {
    const base = tooth * pitch;
    points.push(at(rootRadius, base), at(tipRadius, base + pitch * 0.18), at(tipRadius, base + pitch * 0.32));
    points.push(at(rootRadius, base + pitch * 0.5));
  }
  return points;
};

const buildPrism = (): Prism => {
  const profile = gearProfile();
  const triangles: number[] = [];
  const edges: number[] = [];
  const top = (point: Vector2): number[] => [point.x, point.y, thickness];
  const bottom = (point: Vector2): number[] => [point.x, point.y, 0];
  for (let index = 0; index < profile.length; index++) {
    const a = profile[index]!;
    const b = profile[(index + 1) % profile.length]!;
    triangles.push(0, 0, thickness, ...top(a), ...top(b));
    triangles.push(0, 0, 0, ...bottom(b), ...bottom(a));
    triangles.push(...bottom(a), ...bottom(b), ...top(b), ...bottom(a), ...top(b), ...top(a));
    edges.push(...top(a), ...top(b), ...bottom(a), ...bottom(b), ...bottom(a), ...top(a));
  }
  return { triangles: new Float32Array(triangles), edges: new Float32Array(edges) };
};

const degrees = (value: number): number => (value * Math.PI) / 180;

const makeCamera = ({ projection, elevation }: Fixture): OrthographicCamera | PerspectiveCamera => {
  const target = new Vector3(0.03, 0.03, thickness * 0.5);
  const direction = new Vector3(
    Math.cos(degrees(210)) * Math.cos(degrees(elevation)),
    Math.sin(degrees(210)) * Math.cos(degrees(elevation)),
    Math.sin(degrees(elevation)),
  );
  const span = 0.06;
  const aspect = width / height;
  const camera =
    projection === 'orthographic'
      ? new OrthographicCamera((-span * aspect) / 2, (span * aspect) / 2, span / 2, -span / 2, 0.05, 0.25)
      : new PerspectiveCamera(30, aspect, 0.05, 0.4);
  const distance = projection === 'orthographic' ? 0.15 : span / 2 / Math.tan(degrees(15));
  camera.up.set(0, 0, 1);
  camera.position.copy(target).addScaledVector(direction, distance);
  camera.lookAt(target);
  camera.updateMatrixWorld();
  camera.updateProjectionMatrix();
  return camera;
};

/** CPU ground truth: dense spine samples of every edge with exact ray visibility against the solid. */
const sampleSpine = (
  options: Readonly<{ prism: Prism; surface: Mesh; camera: OrthographicCamera | PerspectiveCamera; scale: number }>,
): SpineSample[] => {
  const { prism, surface, camera, scale } = options;
  const raycaster = new Raycaster();
  const forward = camera.getWorldDirection(new Vector3());
  const samples: SpineSample[] = [];
  const a = new Vector3();
  const b = new Vector3();
  const point = new Vector3();
  const ndc = new Vector3();
  for (let offset = 0; offset < prism.edges.length; offset += 6) {
    a.fromArray(prism.edges, offset);
    b.fromArray(prism.edges, offset + 3);
    const start = a.clone().project(camera);
    const end = b.clone().project(camera);
    const pixels = Math.hypot(((start.x - end.x) * width * scale) / 2, ((start.y - end.y) * height * scale) / 2);
    const steps = Math.max(8, Math.ceil(pixels * 3));
    for (let step = 0; step <= steps; step++) {
      point.lerpVectors(a, b, step / steps);
      ndc.copy(point).project(camera);
      // Rays are built by hand: WebGPU switches the camera to its own clip-space convention.
      const origin =
        camera instanceof OrthographicCamera ? point.clone().addScaledVector(forward, -1) : camera.position.clone();
      raycaster.set(origin, point.clone().sub(origin).normalize());
      const [hit] = raycaster.intersectObject(surface, false);
      samples.push({
        x: ((ndc.x + 1) / 2) * width * scale,
        y: ((1 - ndc.y) / 2) * height * scale,
        visible: !hit || hit.distance >= origin.distanceTo(point) - 1e-7,
      });
    }
  }
  return samples;
};

const isEdge = (pixels: Uint8ClampedArray, index: number): boolean =>
  pixels[index]! - Math.max(pixels[index + 1]!, pixels[index + 2]!) > 90;

/**
 * Edge pixels farther than the stroke's half width, plus half a pixel of raster/MSAA fringe, from
 * every visible spine sample. Each one is a hidden edge showing through.
 */
const countStrayEdgePixels = (
  options: Readonly<{ pixels: Uint8ClampedArray; spine: readonly SpineSample[]; scale: number }>,
): number => {
  const { pixels, spine, scale } = options;
  const columns = width * scale;
  const rows = height * scale;
  const reach = (gltfEdgeLineWidth * scale) / 2 + 0.5;
  const covered = new Uint8Array(columns * rows);
  for (const sample of spine.filter(({ visible }) => visible)) {
    for (let y = Math.max(0, Math.floor(sample.y - reach)); y <= Math.min(rows - 1, sample.y + reach); y++) {
      for (let x = Math.max(0, Math.floor(sample.x - reach)); x <= Math.min(columns - 1, sample.x + reach); x++) {
        if (Math.hypot(x + 0.5 - sample.x, y + 0.5 - sample.y) <= reach) {
          covered[y * columns + x] = 1;
        }
      }
    }
  }
  let stray = 0;
  for (let index = 0; index < columns * rows; index++) {
    stray += isEdge(pixels, index * 4) && !covered[index] ? 1 : 0;
  }
  return stray;
};

/** Visible spine samples, away from any visibility change, with no drawn edge pixel next to them. */
const countMissingSpineSamples = (
  options: Readonly<{ pixels: Uint8ClampedArray; spine: readonly SpineSample[]; scale: number }>,
): number => {
  const { pixels, spine, scale } = options;
  const columns = width * scale;
  const rows = height * scale;
  let missing = 0;
  for (let index = 6; index < spine.length - 6; index++) {
    const x = Math.floor(spine[index]!.x);
    const y = Math.floor(spine[index]!.y);
    const interior = x >= 1 && y >= 1 && x < columns - 1 && y < rows - 1;
    if (!interior || !spine.slice(index - 6, index + 7).every(({ visible }) => visible)) {
      continue;
    }
    const neighbours = [-1, 0, 1].flatMap((dy) => [-1, 0, 1].map((dx) => ((y + dy) * columns + x + dx) * 4));
    missing += neighbours.some((neighbour) => isEdge(pixels, neighbour)) ? 0 : 1;
  }
  return missing;
};

/** Browser-test evidence for review; the assertions do not depend on it. */
const writeEvidence = async (
  options: Readonly<{ pixels: Uint8ClampedArray; scale: number; name: string }>,
): Promise<void> => {
  const canvas = document.createElement('canvas');
  canvas.width = width * options.scale;
  canvas.height = height * options.scale;
  canvas.getContext('2d')!.putImageData(new ImageData(new Uint8ClampedArray(options.pixels), canvas.width), 0, 0);
  const data = canvas.toDataURL('image/png').split(',')[1]!;
  await commands.writeFile(`../../out/test-results/gltf-batches-browser/edge-end-bleed/${options.name}.png`, data, {
    encoding: 'base64',
  });
};

const renderers: RendererInstance[] = [];
afterEach(async () => {
  for (const renderer of renderers.splice(0)) {
    try {
      // oxlint-disable-next-line no-await-in-loop -- each renderer drains its owned output before teardown.
      await disposeRendererOutput(renderer);
    } finally {
      renderer.dispose();
    }
  }
});

const webGpuProfile = inject('webGpuProfile');

describe.each(['webgl', 'webgpu'] as const)('GLTF edge ends on %s', (backend) => {
  it.each<Fixture>([
    { pixelRatio: 1, elevation: 35, projection: 'orthographic' },
    { pixelRatio: 2, elevation: 35, projection: 'orthographic' },
    { pixelRatio: 1, elevation: 20, projection: 'orthographic' },
    { pixelRatio: 2, elevation: 20, projection: 'orthographic' },
    { pixelRatio: 1, elevation: 35, projection: 'perspective' },
    { pixelRatio: 2, elevation: 20, projection: 'perspective' },
  ])(
    'should keep a hidden edge that ends on a face boundary behind that face ($projection, dpr $pixelRatio, $elevation°)',
    async (fixture) => {
      const renderer = await createRenderer('viewport', backend, document.createElement('canvas'));
      renderers.push(renderer);
      renderer.setPixelRatio(fixture.pixelRatio);
      renderer.setSize(width, height);
      renderer.setClearColor(0xff_ff_ff, 1);
      installRendererOutput(renderer, webGpuProfile);

      const prism = buildPrism();
      const geometry = new BufferGeometry();
      geometry.setAttribute('position', new Float32BufferAttribute(prism.triangles, 3));
      const surfaceMaterial = new MeshStandardMaterial({ color: 0x9f_b3_c8, side: DoubleSide, flatShading: true });
      applyGltfSurfaceDepthBias(surfaceMaterial, backend);
      const surface = new Mesh(geometry, surfaceMaterial);
      const lineMaterial = createGltfFatLineMaterial({
        backend,
        resolution: new Vector2(width, height),
        edgeColor: 0xff_00_00,
      });
      const lines = createGltfFatLineSegmentsFromPositions({
        backend,
        positions: prism.edges,
        material: lineMaterial,
      })!;
      const light = new DirectionalLight(0xff_ff_ff, 2);
      light.position.set(-1, -2, 3);
      const scene = new Scene();
      scene.add(surface, lines, new AmbientLight(0xff_ff_ff, 1.2), light);
      const camera = makeCamera(fixture);

      renderer.render(scene, camera);
      const pixels = await captureRendererOutput(renderer);
      const scale = fixture.pixelRatio;
      const name = `${backend}-${fixture.projection}-dpr${scale}-el${fixture.elevation}`;
      await writeEvidence({ pixels, scale, name });

      const spine = sampleSpine({ prism, surface, camera, scale });
      // A few isolated pixels at line joins are the stroke's own corner, not a hidden edge.
      expect(countStrayEdgePixels({ pixels, spine, scale })).toBeLessThanOrEqual(6);
      expect(countMissingSpineSamples({ pixels, spine, scale })).toBe(0);
    },
  );
});
