import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import * as THREE from 'three';
import { MeshMatcapNodeMaterial } from 'three/webgpu';
import type { Backend } from 'three/webgpu';
import { fromRenderPoint, toRenderPoint } from '@taucad/spatial';
import type { RenderFrame } from '@taucad/spatial';
import {
  isSectionRemoved,
  resolveSectionPieces,
  toRenderSectionPieces,
} from '#components/geometry/graphics/section-cuts.js';
import type { SectionCut, SectionVector } from '#components/geometry/graphics/section-cuts.js';
import {
  createGltfFatLineMaterial,
  createGltfFatLineSegmentsFromPositions,
} from '#components/geometry/graphics/three/materials/gltf-edges.js';
import { applyGltfSurfaceDepthBias } from '#components/geometry/graphics/three/materials/gltf-surface-depth-bias.js';
import { createSectionClip, writeSectionClip } from '#components/geometry/graphics/three/materials/section-clip.js';
import { installSectionClipUnder } from '#components/geometry/graphics/three/react/section-view.utils.js';
import { createRenderer } from '#components/geometry/graphics/three/renderer.js';

/**
 * The section clip on a real GPU, on both backends. Every drawable family the clip is compiled into renders a
 * tilted plane under a known cut list: a plane, a narrow cutaway, and a cutaway past 180° whose two halves meet at a
 * mid plane. Each pixel must show what `isSectionRemoved` says of the plane point under it, a removed part must let
 * the backdrop behind it through, and stepping the cuts from none to one to three pieces and back never relinks.
 */

const size = 96;
/** Pixels this close to a boundary may differ: WebGL fat lines clip along their centreline, not their width. */
const boundaryBand = 2;
const setupTimeout = 120_000;
const renderFrame: RenderFrame = {
  anchorFrameId: 'tau:root',
  originMeters: [0.05, -0.02, 0.1],
  metersPerRenderUnit: 0.25,
};

const plane: SectionCut = { id: 'plane', kind: 'plane', plane: 'xy', offset: 0.35, isFlipped: false };
const narrowCutaway: SectionCut = {
  id: 'narrow',
  kind: 'revolution',
  axis: 'z',
  origin: [0.1, -0.05, 0],
  start: 20,
  sweep: 70,
};
const wideCutaway: SectionCut = {
  id: 'wide',
  kind: 'revolution',
  axis: 'x',
  origin: [0, 0, 0.1],
  start: 30,
  sweep: 200,
};
/** None, one piece, three pieces (the plane and both halves of the wide cutaway), none. */
const steps: ReadonlyArray<readonly SectionCut[]> = [[], [narrowCutaway], [plane, wideCutaway], []];
const projections = ['orthographic', 'perspective'] as const;

// The plane z = 0.1 + 0.5x + 0.4y (metres) fills the view, so every boundary crosses it.
const surfaceNormal = new THREE.Vector3(-0.5, -0.4, 1).normalize();
const surfacePoint = new THREE.Vector3(...toRenderPoint({ renderFrame, point: [0, 0, 0.1] }));
const surfacePlane = new THREE.Plane().setFromNormalAndCoplanarPoint(surfaceNormal, surfacePoint);
const halfExtent = 0.55 / renderFrame.metersPerRenderUnit;
const cameraDistance = 10;

const createCamera = (projection: (typeof projections)[number]): THREE.Camera => {
  const camera =
    projection === 'orthographic'
      ? new THREE.OrthographicCamera(-halfExtent, halfExtent, halfExtent, -halfExtent, 0.1, 100)
      : new THREE.PerspectiveCamera(THREE.MathUtils.radToDeg(2 * Math.atan(halfExtent / cameraDistance)), 1, 0.1, 100);
  camera.position.copy(surfacePoint).addScaledVector(new THREE.Vector3(0.2, -0.3, 1).normalize(), cameraDistance);
  camera.lookAt(surfacePoint);
  camera.updateMatrixWorld();
  return camera;
};

/** The render-space point of the plane under a pixel centre; rows count from the top, and may lie off the view. */
const planeHit = (camera: THREE.Camera, column: number, row: number): THREE.Vector3 => {
  const raycaster = new THREE.Raycaster();
  raycaster.setFromCamera(new THREE.Vector2(((column + 0.5) / size) * 2 - 1, 1 - ((row + 0.5) / size) * 2), camera);
  const hit = raycaster.ray.intersectPlane(surfacePlane, new THREE.Vector3());
  if (!hit) {
    throw new Error(`The ray through pixel ${column}, ${row} misses the plane.`);
  }
  return hit;
};

/** The plane point under every pixel, in metres, rows from the top. */
const pixelPoints = (camera: THREE.Camera): SectionVector[] =>
  Array.from({ length: size * size }, (_unused, index) => {
    const hit = planeHit(camera, index % size, Math.floor(index / size));
    return fromRenderPoint({ renderFrame, point: [hit.x, hit.y, hit.z] });
  });

const segmentsAcross = (camera: THREE.Camera, rows: readonly number[]): number[] =>
  rows.flatMap((row) => [
    ...planeHit(camera, -0.3 * size, row).toArray(),
    ...planeHit(camera, 1.3 * size, row).toArray(),
  ]);

const rowsFrom = (first: number): number[] =>
  Array.from({ length: Math.ceil((size - first) / 8) }, (_unused, index) => first + index * 8);

describe('section clip fixture', () => {
  it('should cross the view with both sides of every half-space, the mid plane included', () => {
    for (const projection of projections) {
      const points = pixelPoints(createCamera(projection));
      for (const piece of steps.flatMap((cuts) => resolveSectionPieces(cuts))) {
        const removed = points.filter((point) => isSectionRemoved(point, [piece])).length;
        expect(removed, `${projection}: ${piece.cutId} removes part of the view`).toBeGreaterThan(size * 8);
        for (const halfSpace of piece.halfSpaces) {
          const inside = points.filter((point) => isSectionRemoved(point, [{ ...piece, halfSpaces: [halfSpace] }]));
          expect(
            Math.min(inside.length, points.length - inside.length),
            `${projection}: ${piece.cutId} has pixels on both sides of each half-space`,
          ).toBeGreaterThan(size * 8);
        }
      }
    }
  });
});

type StepResult = Readonly<{
  label: string;
  /** Pixels showing the wrong side of the clip, away from every boundary. */
  hard: number;
  /** Pixels showing the wrong side within {@link boundaryBand} of a boundary. */
  boundary: number;
  /** Removed surface pixels away from a boundary that hide the backdrop: the clip let them write depth. */
  occluding: number;
  /** Pixels drawn, kept by the cuts. */
  kept: number;
  /** Pixels drawn, removed by the cuts. */
  removed: number;
}>;

type RelinkResult = Readonly<{ label: string; links: number; versions: readonly number[] }>;

describe.each(['webgl', 'webgpu'] as const)('section clip on %s', (backend) => {
  const results: StepResult[] = [];
  const relinks: RelinkResult[] = [];
  const errors: unknown[][] = [];
  const disposables: Array<{ dispose: () => void }> = [];

  beforeAll(async () => {
    // WebGL link errors and WebGPU pipeline validation errors reach three's `console.error`.
    vi.spyOn(console, 'error').mockImplementation((...data: unknown[]) => {
      errors.push(data);
    });
    const canvas = document.createElement('canvas');
    canvas.width = size;
    canvas.height = size;
    const renderer = await createRenderer('viewport', backend, canvas);
    disposables.push(renderer);
    const { renderToPixels, relinks: countRelinks } = createFrameReader(renderer, disposables);

    // Readback row order differs per backend: a quad over the top half tells which row comes first.
    const calibration = new THREE.Scene();
    const topHalf = new THREE.Mesh(new THREE.PlaneGeometry(2, 1), new THREE.MeshBasicMaterial({ color: 0xff_ff_ff }));
    topHalf.position.set(0, 0.5, 0);
    calibration.add(topHalf);
    const calibrationCamera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, 10);
    calibrationCamera.position.set(0, 0, 5);
    calibrationCamera.updateMatrixWorld();
    const calibrated = await renderToPixels(calibration, calibrationCamera);
    const isTopRowFirst = calibrated.red(0, 0) > 128;
    disposables.push(topHalf.geometry, topHalf.material);

    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x00_00_00);
    scene.add(new THREE.AmbientLight(0xff_ff_ff, 2));
    // Behind a surface, unclipped and drawn after it: a removed fragment that wrote depth would hide it.
    const backdrop = new THREE.Mesh(
      new THREE.PlaneGeometry(50, 50),
      new THREE.MeshBasicMaterial({ color: 0x00_00_ff }),
    );
    backdrop.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), surfaceNormal);
    backdrop.position.copy(surfacePoint).addScaledVector(surfaceNormal, -0.5);
    backdrop.renderOrder = 1;
    backdrop.updateMatrixWorld();
    disposables.push(backdrop.geometry, backdrop.material);

    const standard = new THREE.MeshStandardMaterial({
      color: 0x90_90_90,
      emissive: 0x30_30_30,
      side: THREE.DoubleSide,
    });
    applyGltfSurfaceDepthBias(standard, backend);
    const matcap =
      backend === 'webgpu'
        ? new MeshMatcapNodeMaterial({ color: 0xff_ff_ff, side: THREE.DoubleSide })
        : new THREE.MeshMatcapMaterial({ color: 0xff_ff_ff, side: THREE.DoubleSide });
    const edges = createGltfFatLineMaterial({
      backend,
      resolution: new THREE.Vector2(size, size),
      edgeColor: 0xff_ff_ff,
    });
    const thin = new THREE.LineBasicMaterial({ color: 0xff_ff_ff });
    const strip = new THREE.LineBasicMaterial({ color: 0xff_ff_ff });
    const points = new THREE.PointsMaterial({ color: 0xff_ff_ff, size: 1, sizeAttenuation: false });
    disposables.push(standard, matcap, edges, thin, strip, points);

    const surface = (material: THREE.Material): THREE.Object3D => {
      const mesh = new THREE.Mesh(new THREE.PlaneGeometry(50, 50), material);
      mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), surfaceNormal);
      mesh.position.copy(surfacePoint);
      mesh.updateMatrixWorld();
      return mesh;
    };
    const withPositions = (positions: readonly number[]): THREE.BufferGeometry =>
      new THREE.BufferGeometry().setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    // Each family is one production drawable kind. The strip snakes between rows through points off the view.
    const families: ReadonlyArray<
      Readonly<{
        name: string;
        material: THREE.Material;
        isSurface?: true;
        build: (camera: THREE.Camera) => THREE.Object3D;
      }>
    > = [
      { name: 'standard surface', material: standard, isSurface: true, build: () => surface(standard) },
      { name: 'matcap surface', material: matcap, isSurface: true, build: () => surface(matcap) },
      {
        name: 'edge lines',
        material: edges,
        build(camera) {
          const positions = new Float32Array(segmentsAcross(camera, rowsFrom(4)));
          const lines = createGltfFatLineSegmentsFromPositions({ backend, positions, material: edges });
          if (!lines) {
            throw new Error('The edge lines have no segments.');
          }
          return lines;
        },
      },
      {
        name: 'thin lines',
        material: thin,
        build: (camera) => new THREE.LineSegments(withPositions(segmentsAcross(camera, rowsFrom(4))), thin),
      },
      {
        name: 'line strip',
        material: strip,
        build: (camera) =>
          new THREE.Line(
            withPositions(
              rowsFrom(8).flatMap((row, index) => {
                const ends = [planeHit(camera, -0.3 * size, row), planeHit(camera, 1.3 * size, row)];
                return (index % 2 === 0 ? ends : ends.toReversed()).flatMap((end) => end.toArray());
              }),
            ),
            strip,
          ),
      },
      {
        name: 'points',
        material: points,
        build: (camera) =>
          new THREE.Points(
            withPositions(
              Array.from({ length: (size / 2) ** 2 }, (_unused, index) =>
                planeHit(camera, (index % (size / 2)) * 2 + 1, Math.floor(index / (size / 2)) * 2 + 1).toArray(),
              ).flat(),
            ),
            points,
          ),
      },
    ];

    const clip = createSectionClip(backend);
    for (const projection of projections) {
      // Every plane point is taken before the first render, which may re-project the camera for its backend.
      const camera = createCamera(projection);
      const meters = pixelPoints(camera);
      const objects = families.map(({ build }) => build(camera));
      for (const [familyIndex, { name, material, isSurface = false }] of families.entries()) {
        const object = objects[familyIndex]!;
        installSectionClipUnder(object, clip);
        scene.add(object);
        if (isSurface) {
          scene.add(backdrop);
        }
        writeSectionClip(clip, []);
        // oxlint-disable-next-line no-await-in-loop -- one renderer draws and reads back each frame in turn.
        const drawn = await renderToPixels(scene, camera);
        const linksBefore = countRelinks();
        const versionBefore = material.version;
        for (const [index, cuts] of steps.entries()) {
          const pieces = resolveSectionPieces(cuts);
          writeSectionClip(clip, toRenderSectionPieces(pieces, renderFrame));
          // oxlint-disable-next-line no-await-in-loop -- one renderer draws and reads back each frame in turn.
          const frame = await renderToPixels(scene, camera);
          const removed = meters.map((point) => isSectionRemoved(point, pieces));
          results.push({
            label: `${projection} ${name}, step ${index} (${pieces.length} pieces)`,
            ...compare({ drawn, frame, removed, isTopRowFirst, hasBackdrop: isSurface }),
          });
        }
        relinks.push({
          label: `${projection} ${name}`,
          links: countRelinks() - linksBefore,
          versions: [versionBefore, material.version],
        });
        scene.remove(object, backdrop);
        if (isDrawable(object)) {
          object.geometry.dispose();
        }
      }
    }
  }, setupTimeout);

  afterAll(() => {
    vi.restoreAllMocks();
    for (const resource of disposables.splice(0).reverse()) {
      resource.dispose();
    }
  });

  it('should draw exactly what the cut model keeps, away from each boundary', () => {
    expect(results).toHaveLength(projections.length * 6 * steps.length);
    expect(results.filter(({ hard }) => hard > 0)).toEqual([]);
    // Near a boundary only rasterization may differ, never a whole edge of the cut.
    expect(results.filter(({ boundary, kept, removed }) => boundary > (kept + removed) / 50)).toEqual([]);
    // Every cut removes pixels, and none of the checks is all or nothing.
    for (const result of results.filter(({ label }) => !label.endsWith('(0 pieces)'))) {
      expect(result.removed, result.label).toBeGreaterThan(0);
      expect(result.kept, result.label).toBeGreaterThan(0);
    }
  });

  it('should let the backdrop show through every removed part of a surface', () => {
    expect(results.filter(({ occluding }) => occluding > 0)).toEqual([]);
  });

  it('should never relink as the cuts go from none to one to three pieces and back', () => {
    expect(relinks).toHaveLength(projections.length * 6);
    expect(relinks.filter(({ links, versions }) => links > 0 || versions[0] !== versions[1])).toEqual([]);
  });

  it('should compile and draw the clip without a shader or pipeline error', () => {
    expect(errors).toEqual([]);
  });
});

type Frame = Readonly<{ red: (row: number, column: number) => number; blue: (row: number, column: number) => number }>;

/** Rows as read back; WebGPU pads each row but the last to 256 bytes, WebGL packs them. */
const createFrame = (pixels: ArrayLike<number>): Frame => {
  const stride = (pixels.length - size * 4) / (size - 1);
  const channel = (offset: number) => (row: number, column: number) => pixels[row * stride + column * 4 + offset] ?? 0;
  return { red: channel(0), blue: channel(2) };
};

const isDrawable = (object: THREE.Object3D): object is THREE.Mesh | THREE.Line | THREE.Points =>
  object instanceof THREE.Mesh || object instanceof THREE.Line || object instanceof THREE.Points;

/** Every WebGPU render pipeline is built through this backend method, which three's typings omit. */
const hasPipelineBuilds = (
  backend: Backend,
): backend is Backend & { createRenderPipeline: (...args: never[]) => unknown } =>
  'createRenderPipeline' in backend && typeof backend.createRenderPipeline === 'function';

/**
 * Renders into an offscreen target and reads it back, and counts relinks: WebGL program links or WebGPU render
 * pipeline builds.
 */
const createFrameReader = (
  renderer: Awaited<ReturnType<typeof createRenderer>>,
  disposables: Array<{ dispose: () => void }>,
): Readonly<{
  renderToPixels: (scene: THREE.Scene, camera: THREE.Camera) => Promise<Frame>;
  relinks: () => number;
}> => {
  if (renderer instanceof THREE.WebGLRenderer) {
    const target = new THREE.WebGLRenderTarget(size, size);
    disposables.push(target);
    const links = vi.spyOn(renderer.getContext(), 'linkProgram');
    return {
      async renderToPixels(scene, camera) {
        renderer.setRenderTarget(target);
        renderer.render(scene, camera);
        renderer.setRenderTarget(null);
        const pixels = new Uint8Array(size * size * 4);
        renderer.readRenderTargetPixels(target, 0, 0, size, size, pixels);
        return createFrame(pixels);
      },
      relinks: () => links.mock.calls.length,
    };
  }
  // A WebGPU renderer falls back to WebGL 2 without an adapter; that would not be WebGPU evidence.
  if (!('isWebGPUBackend' in renderer.backend) || !hasPipelineBuilds(renderer.backend)) {
    throw new Error(
      'No WebGPU adapter, so three fell back to WebGL 2. Launch Chromium with one, for example --use-webgpu-adapter=swiftshader.',
    );
  }
  const target = new THREE.RenderTarget(size, size);
  disposables.push(target);
  const pipelines = vi.spyOn(renderer.backend, 'createRenderPipeline');
  return {
    async renderToPixels(scene, camera) {
      renderer.setRenderTarget(target);
      renderer.render(scene, camera);
      renderer.setRenderTarget(null);
      return createFrame(await renderer.readRenderTargetPixelsAsync(target, 0, 0, size, size));
    },
    relinks: () => pipelines.mock.calls.length,
  };
};

const compare = ({
  drawn,
  frame,
  removed,
  isTopRowFirst,
  hasBackdrop,
}: Readonly<{
  drawn: Frame;
  frame: Frame;
  removed: readonly boolean[];
  isTopRowFirst: boolean;
  hasBackdrop: boolean;
}>): Omit<StepResult, 'label'> => {
  const counts = { hard: 0, boundary: 0, occluding: 0, kept: 0, removed: 0 };
  const isNearBoundary = (row: number, column: number): boolean => {
    for (let y = Math.max(0, row - boundaryBand); y <= Math.min(size - 1, row + boundaryBand); y++) {
      for (let x = Math.max(0, column - boundaryBand); x <= Math.min(size - 1, column + boundaryBand); x++) {
        if (removed[y * size + x] !== removed[row * size + column]) {
          return true;
        }
      }
    }
    return false;
  };
  for (let row = 0; row < size; row++) {
    const bufferRow = isTopRowFirst ? row : size - 1 - row;
    for (let column = 0; column < size; column++) {
      // Every family draws with red; the backdrop and the background have none.
      if (drawn.red(bufferRow, column) <= 24) {
        continue;
      }
      const isRemoved = removed[row * size + column]!;
      counts[isRemoved ? 'removed' : 'kept']++;
      const isShown = frame.red(bufferRow, column) > 24;
      const isNear = isNearBoundary(row, column);
      if (isShown === isRemoved) {
        counts[isNear ? 'boundary' : 'hard']++;
      } else if (hasBackdrop && isRemoved && !isNear && frame.blue(bufferRow, column) <= 24) {
        counts.occluding++;
      }
    }
  }
  return counts;
};
