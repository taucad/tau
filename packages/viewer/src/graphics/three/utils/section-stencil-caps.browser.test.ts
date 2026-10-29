import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import * as THREE from 'three';
import { WebGPUBackend } from 'three/webgpu';
import { resolveSectionFaces, resolveSectionPieces } from '#graphics/section-cuts.js';
import type { SectionCut, SectionHalfSpace, SectionPiece } from '#graphics/section-cuts.js';
import { applyGltfSurfaceDepthBias } from '#graphics/three/materials/gltf-surface-depth-bias.js';
import { createSectionClip, installSectionClip, writeSectionClip } from '#graphics/three/materials/section-clip.js';
import { createRenderer } from '#graphics/three/renderer.js';
import { sectionCapOpenChainColor, sectionCapOpenChainWidthScale } from '#graphics/three/overlay-colors.constants.js';
import { sliceSectionLoops } from '#graphics/three/utils/section-loop-slice.js';
import type { SectionLoopCapGeometry } from '#graphics/three/utils/section-loop-caps.js';
import { createSectionStencilCaps } from '#graphics/three/utils/section-stencil-caps.js';
import type {
  SectionStencilCapFrame,
  SectionStencilCapSource,
  SectionStencilCapStats,
} from '#graphics/three/utils/section-stencil-caps.js';

/**
 * The stencil caps on a real GPU, on both backends, against geometry worked out per pixel on the CPU.
 *
 * The fixture follows the heavy planetary overlap fixture: a ring, a sun, four planets that each cross the ring, and
 * two crossed bars through the sun and into the ring, as four owners. Each pixel's expected cap is found by casting
 * its ray through the removed piece: past what the cut keeps in front, the point where the ray leaves the piece is
 * capped in an owner's colour when one owner's solids hold it, in the overlap colour when two owners' do, and not at
 * all otherwise. Solids of one owner never overlap each other.
 */

const size = 128;
/** Pixels this close to a change in the expected colour may differ: rasterization, tessellation and the outline. */
const boundaryBand = 2;
const setupTimeout = 240_000;
/** Away from the world origin, so the plane coordinates the stripes read are large, as in a placed model. */
const centre = new THREE.Vector3(40, -25, 6);

type Owner = 'ring' | 'sun' | 'planets' | 'bars';
type Expected = Owner | 'overlap' | 'none' | 'skip';

/** Primary channels only, so each colour reads back unmistakably, stripes off. */
const ownerTints: Readonly<Record<Owner, number>> = {
  ring: 0x00_ff_00,
  sun: 0x00_00_ff,
  planets: 0x00_ff_ff,
  bars: 0xff_00_ff,
};
const noStripes = { stripeFrequency: 1e6, stripeWidth: 0 } as const;

type Solid = Readonly<{
  owner: Owner;
  geometry: THREE.BufferGeometry;
  matrix: THREE.Matrix4;
  /** Whether the exact solid holds a local point; the tessellation lies within a hundredth of it. */
  containsLocal: (point: THREE.Vector3) => boolean;
}>;

const placed = (position: THREE.Vector3, rotation: THREE.Euler): THREE.Matrix4 =>
  new THREE.Matrix4().compose(position, new THREE.Quaternion().setFromEuler(rotation), new THREE.Vector3(1, 1, 1));

// oxlint-disable-next-line max-params -- A fixture box names its owner, extents, position and angle.
const box = (
  owner: Owner,
  extents: readonly [number, number, number],
  position: THREE.Vector3,
  angle: number,
): Solid => ({
  owner,
  geometry: new THREE.BoxGeometry(...extents),
  matrix: placed(position, new THREE.Euler(0, 0, angle)),
  containsLocal: (point) =>
    Math.abs(point.x) < extents[0] / 2 && Math.abs(point.y) < extents[1] / 2 && Math.abs(point.z) < extents[2] / 2,
});

const createFixture = (): Solid[] => {
  const ringRadius = 3;
  const tubeRadius = 0.8;
  const sunRadius = 1.4;
  const sunHeight = 4;
  return [
    {
      owner: 'ring',
      geometry: new THREE.TorusGeometry(ringRadius, tubeRadius, 48, 192),
      matrix: placed(centre, new THREE.Euler()),
      containsLocal: (point) => (Math.hypot(point.x, point.y) - ringRadius) ** 2 + point.z ** 2 < tubeRadius ** 2,
    },
    {
      owner: 'sun',
      geometry: new THREE.CylinderGeometry(sunRadius, sunRadius, sunHeight, 96),
      matrix: placed(centre, new THREE.Euler(Math.PI / 2, 0, 0)),
      containsLocal: (point) => point.x ** 2 + point.z ** 2 < sunRadius ** 2 && Math.abs(point.y) < sunHeight / 2,
    },
    ...[0, 1, 2, 3].map((index) => {
      const angle = (index * Math.PI) / 2;
      const position = centre.clone().add(new THREE.Vector3(Math.cos(angle), Math.sin(angle), 0).multiplyScalar(3));
      return box('planets', [1.8, 1.2, 3], position, angle + index * 0.3);
    }),
    box('bars', [5, 0.6, 2.4], centre, Math.PI / 4),
    box('bars', [5, 0.6, 2.4], centre, (3 * Math.PI) / 4),
  ];
};

type Scenario = Readonly<{ label: string; pieces: SectionPiece[]; camera: () => THREE.Camera }>;

const planeCut: SectionCut = { id: 'plane', kind: 'plane', plane: 'xy', offset: centre.z + 0.3, isFlipped: false };
const cutawayStart = 20;
const cutawaySweep = 120;
const cutaway: SectionCut = {
  id: 'cutaway',
  kind: 'revolution',
  axis: 'z',
  origin: [centre.x + 0.2, centre.y - 0.1, centre.z],
  start: cutawayStart,
  sweep: cutawaySweep,
};

const halfExtent = 6;
const lookFrom = (offset: THREE.Vector3, projection: 'orthographic' | 'perspective'): THREE.Camera => {
  const distance = offset.length();
  const camera =
    projection === 'orthographic'
      ? new THREE.OrthographicCamera(-halfExtent, halfExtent, halfExtent, -halfExtent, 0.1, 200)
      : new THREE.PerspectiveCamera(THREE.MathUtils.radToDeg(2 * Math.atan(halfExtent / distance)), 1, 0.1, 200);
  camera.position.copy(centre).add(offset);
  camera.up.set(0, 0, 1);
  camera.lookAt(centre);
  camera.updateMatrixWorld();
  return camera;
};

/** Down onto the plane cut, and from inside the cutaway's wedge so both of its faces show. */
const wedgeDirection = THREE.MathUtils.degToRad(cutawayStart + cutawaySweep / 2);
const scenarios: readonly Scenario[] = [
  {
    label: 'plane, perspective',
    pieces: resolveSectionPieces([planeCut]),
    camera: () => lookFrom(new THREE.Vector3(2, -4, 16), 'perspective'),
  },
  {
    label: 'plane, orthographic',
    pieces: resolveSectionPieces([planeCut]),
    camera: () => lookFrom(new THREE.Vector3(-3, -5, 16), 'orthographic'),
  },
  {
    label: 'cutaway, perspective',
    pieces: resolveSectionPieces([cutaway]),
    camera: () =>
      lookFrom(new THREE.Vector3(Math.cos(wedgeDirection) * 14, Math.sin(wedgeDirection) * 14, 9), 'perspective'),
  },
];

const signed = ({ normal, constant }: SectionHalfSpace, point: THREE.Vector3): number =>
  normal[0] * point.x + normal[1] * point.y + normal[2] * point.z - constant;

/** What each pixel should show, rows from the top. */
const expectPixels = (camera: THREE.Camera, pieces: readonly SectionPiece[], solids: readonly Solid[]): Expected[] => {
  const inverses = solids.map(({ matrix }) => matrix.clone().invert());
  const local = new THREE.Vector3();
  const owners = (point: THREE.Vector3): Set<Owner> => {
    const found = new Set<Owner>();
    for (const [index, solid] of solids.entries()) {
      if (solid.containsLocal(local.copy(point).applyMatrix4(inverses[index]!))) {
        found.add(solid.owner);
      }
    }
    return found;
  };
  const raycaster = new THREE.Raycaster();
  const point = new THREE.Vector3();
  return Array.from({ length: size * size }, (_unused, index) => {
    const column = index % size;
    const row = Math.floor(index / size);
    raycaster.setFromCamera(new THREE.Vector2(((column + 0.5) / size) * 2 - 1, 1 - ((row + 0.5) / size) * 2), camera);
    const { origin, direction } = raycaster.ray;
    // Each scenario has one cut, so its pieces are disjoint: the ray leaves the removed volume through one of them.
    let entry = Infinity;
    let exit = -Infinity;
    let exitPlane: SectionHalfSpace | undefined;
    let exitPiece: SectionPiece | undefined;
    for (const piece of pieces) {
      let low = 0;
      let high = Infinity;
      let highPlane: SectionHalfSpace | undefined;
      for (const halfSpace of piece.halfSpaces) {
        const start = signed(halfSpace, origin);
        const rate =
          halfSpace.normal[0] * direction.x + halfSpace.normal[1] * direction.y + halfSpace.normal[2] * direction.z;
        if (rate === 0) {
          if (start <= 0) {
            low = Infinity;
          }
          continue;
        }
        const crossing = -start / rate;
        if (rate > 0) {
          low = Math.max(low, crossing);
        } else if (crossing < high) {
          high = crossing;
          highPlane = halfSpace;
        }
      }
      if (low < high && high > exit) {
        entry = low;
        exit = high;
        exitPlane = highPlane;
        exitPiece = piece;
      }
    }
    if (!exitPlane || !exitPiece || !Number.isFinite(exit)) {
      return 'none';
    }
    // Whatever the cut keeps in front of the removed volume hides the cap.
    for (let t = 0.2; t < entry; t += 0.02) {
      if (owners(point.copy(origin).addScaledVector(direction, t)).size > 0) {
        return 'skip';
      }
    }
    const face = exitPiece.faces.find(({ plane }) => plane === exitPlane);
    if (!face) {
      return 'skip';
    }
    const holders = owners(point.copy(origin).addScaledVector(direction, exit));
    return holders.size > 1 ? 'overlap' : holders.size === 1 ? [...holders][0]! : 'none';
  });
};

type Frame = Readonly<{ pixel: (row: number, column: number) => readonly [number, number, number] }>;

const createFrame = (pixels: ArrayLike<number>, isTopRowFirst: boolean): Frame => {
  const stride = (pixels.length - size * 4) / (size - 1);
  return {
    pixel(row, column) {
      const offset = (isTopRowFirst ? row : size - 1 - row) * stride + column * 4;
      return [pixels[offset] ?? 0, pixels[offset + 1] ?? 0, pixels[offset + 2] ?? 0];
    },
  };
};

const classify = ([red, green, blue]: readonly [number, number, number]): Expected | 'outline' => {
  const key = `${red > 100 ? 1 : 0}${green > 100 ? 1 : 0}${blue > 100 ? 1 : 0}`;
  const classes: Record<string, Expected | 'outline'> = {
    '010': 'ring',
    '001': 'sun',
    '011': 'planets',
    '101': 'bars',
    '100': 'overlap',
    '111': 'outline',
    '000': 'none',
  };
  return classes[key] ?? 'skip';
};

type ScenarioResult = Readonly<{
  label: string;
  /** Pixels showing the wrong colour away from every change in the expected one. */
  hard: Array<Readonly<{ row: number; column: number; expected: Expected; drawn: string }>>;
  /** Overlap pixels expected, and drawn where expected, away from boundaries. */
  overlapExpected: number;
  overlapDrawn: number;
  /** Cap pixels expected away from boundaries, overlap included. */
  capExpected: number;
  /** Outline pixels, and those over a surface further than {@link outlineReach} pixels from every face. */
  outlinePixels: number;
  strayOutlinePixels: number;
  stats: SectionStencilCapStats;
}>;

type TimingResult = Readonly<{ triangles: number; medianMilliseconds: number; stats: SectionStencilCapStats }>;

describe.each(['webgl', 'webgpu'] as const)('section stencil caps on %s', (backend) => {
  const results: ScenarioResult[] = [];
  const timings: TimingResult[] = [];
  const errors: unknown[][] = [];
  const disposables: Array<{ dispose: () => void }> = [];

  beforeAll(async () => {
    vi.spyOn(console, 'error').mockImplementation((...data: unknown[]) => {
      errors.push(data);
    });
    const canvas = document.createElement('canvas');
    canvas.width = size;
    canvas.height = size;
    const renderer = await createRenderer('viewport', backend, canvas);
    disposables.push(renderer);
    const renderFrame = createFrameRenderer(renderer, disposables);

    // Readback row order differs per backend: a quad over the top half tells which row comes first.
    const calibration = new THREE.Scene();
    const topHalf = new THREE.Mesh(new THREE.PlaneGeometry(2, 1), new THREE.MeshBasicMaterial({ color: 0xff_ff_ff }));
    topHalf.position.set(0, 0.5, 0);
    calibration.add(topHalf);
    const calibrationCamera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, 10);
    calibrationCamera.position.set(0, 0, 5);
    calibrationCamera.updateMatrixWorld();
    const calibrated = await renderFrame(calibration, calibrationCamera, () => undefined);
    const isTopRowFirst = (calibrated[0] ?? 0) > 128;
    disposables.push(topHalf.geometry, topHalf.material);

    const clip = createSectionClip(backend);
    const surface = new THREE.MeshBasicMaterial({ color: 0x40_40_40, side: THREE.DoubleSide });
    applyGltfSurfaceDepthBias(surface, backend);
    installSectionClip(surface, clip);
    disposables.push(surface);
    const caps = createSectionStencilCaps(backend);
    disposables.push(caps);

    const buildScene = (solids: readonly Solid[]) => {
      const scene = new THREE.Scene();
      scene.background = new THREE.Color(0x00_00_00);
      const meshes = solids.map(({ geometry, matrix }) => {
        const mesh = new THREE.Mesh(geometry, surface);
        mesh.matrixAutoUpdate = false;
        mesh.matrix.copy(matrix);
        scene.add(mesh);
        disposables.push(geometry);
        return mesh;
      });
      scene.updateMatrixWorld(true);
      const sources: SectionStencilCapSource[] = solids.map((solid, index) => ({
        key: `${solid.owner}-${index}`,
        ownerKey: solid.owner,
        meshes: [meshes[index]!],
        tintHex: ownerTints[solid.owner],
        edgeHex: 0xff_ff_ff,
      }));
      return { scene, sources };
    };

    const solids = createFixture();
    const { scene, sources } = buildScene(solids);
    for (const scenario of scenarios) {
      const camera = scenario.camera();
      const expected = expectPixels(camera, scenario.pieces, solids);
      writeSectionClip(clip, scenario.pieces);
      const frameStats: SectionStencilCapStats[] = [];
      const draw = async (outlineWidthPixels: number): Promise<Frame> => {
        const frame: SectionStencilCapFrame = {
          camera,
          pieces: scenario.pieces,
          sources,
          stripes: noStripes,
          outlineWidthPixels,
          viewportHeightPixels: size,
        };
        const pixels = await renderFrame(scene, camera, () => {
          frameStats.push(caps.render(renderer, frame));
        });
        return createFrame(pixels, isTopRowFirst);
      };
      // The caps alone first, then with the outline, which follows every cut edge, overlapping ones included.
      // oxlint-disable-next-line no-await-in-loop -- one renderer draws and reads back each frame in turn.
      const capsOnly = await draw(0);
      // oxlint-disable-next-line no-await-in-loop -- one renderer draws and reads back each frame in turn.
      const outlined = await draw(1);
      const rayCamera = scenario.camera();
      results.push({
        label: scenario.label,
        ...compare(expected, capsOnly),
        // A fresh camera: rendering re-projects one for its backend, which the ray caster does not follow.
        ...compareOutline(outlined, (row, column) => outlineDistance(rayCamera, scene, scenario.pieces, row, column)),
        stats: frameStats.at(-1)!,
      });
    }

    // Main-thread cost against triangle count: one closed sphere per owner, cut through, coarse and then fine.
    for (const segments of [
      [24, 12],
      [768, 384],
    ] as const) {
      const spheres: Solid[] = (['ring', 'sun', 'planets', 'bars'] as const).map((owner, index) => ({
        owner,
        geometry: new THREE.SphereGeometry(1.6, ...segments),
        matrix: placed(
          centre.clone().add(new THREE.Vector3((index % 2) * 2 - 1, Math.floor(index / 2) * 2 - 1, 0)),
          new THREE.Euler(),
        ),
        containsLocal: (point) => point.length() < 1.6,
      }));
      const timed = buildScene(spheres);
      const camera = scenarios[0]!.camera();
      const { pieces } = scenarios[0]!;
      writeSectionClip(clip, pieces);
      const samples: number[] = [];
      const frameStats: SectionStencilCapStats[] = [];
      for (let index = 0; index < 24; index++) {
        // oxlint-disable-next-line no-await-in-loop -- one renderer draws and reads back each frame in turn.
        await renderFrame(timed.scene, camera, () => {
          const startedAt = performance.now();
          const stats = caps.render(renderer, {
            camera,
            pieces,
            sources: timed.sources,
            stripes: noStripes,
            outlineWidthPixels: 1,
            viewportHeightPixels: size,
          });
          samples.push(performance.now() - startedAt);
          frameStats.push(stats);
        });
      }
      const settled = samples.slice(4).toSorted((left, right) => left - right);
      timings.push({
        triangles: spheres.reduce((total, { geometry }) => total + (geometry.index?.count ?? 0) / 3, 0),
        medianMilliseconds: settled[Math.floor(settled.length / 2)]!,
        stats: frameStats.at(-1)!,
      });
    }
  }, setupTimeout);

  afterAll(() => {
    vi.restoreAllMocks();
    for (const resource of disposables.splice(0).reverse()) {
      resource.dispose();
    }
  });

  it('should cap each owner where its solids hold the cut, and nowhere else', () => {
    expect(results).toHaveLength(scenarios.length);
    for (const result of results) {
      expect(result.capExpected, `${result.label} caps part of the view`).toBeGreaterThan(size * 4);
      expect(result.hard.slice(0, 8), result.label).toEqual([]);
    }
  });

  it('should show overlap on exactly the pixels where two owners overlap', () => {
    for (const result of results) {
      expect(result.overlapExpected, `${result.label} has overlap`).toBeGreaterThan(size);
      expect(result.overlapDrawn, result.label).toBe(result.overlapExpected);
    }
  });

  it('should outline the cut edges, beside the caps', () => {
    for (const result of results) {
      expect(result.outlinePixels, `${result.label} has an outline`).toBeGreaterThan(size);
      expect(result.strayOutlinePixels, result.label).toBe(0);
    }
  });

  it('should spend main-thread time on pieces and meshes, not triangles', () => {
    const [coarse, fine] = timings;
    expect(fine!.triangles).toBeGreaterThan(coarse!.triangles * 500);
    // The same draws, whatever the tessellation.
    expect(fine!.stats.meshDrawCount).toBe(coarse!.stats.meshDrawCount);
    expect(fine!.stats.polygonDrawCount).toBe(coarse!.stats.polygonDrawCount);
    console.info(
      `[section-stencil-caps] ${backend}: ${timings
        .map(({ triangles, medianMilliseconds }) => `${triangles} triangles ${medianMilliseconds.toFixed(3)} ms`)
        .join(
          ', ',
        )}; ${results.map(({ label, overlapExpected, overlapDrawn, outlinePixels }) => `${label} overlap ${overlapDrawn}/${overlapExpected}, outline ${outlinePixels}`).join(', ')}`,
    );
    expect(fine!.medianMilliseconds).toBeLessThan(Math.max(coarse!.medianMilliseconds * 3, 2));
  });

  it('should compile and draw every pass without a shader or pipeline error', () => {
    expect(errors).toEqual([]);
  });
});

/**
 * How far from a face, in screen pixels, the surface under an outline pixel may lie: the line width, a pixel of
 * rasterization, and the tessellation.
 */
const outlineReach = 2.5;

/**
 * How far the surface nearest a face under a pixel lies from it, in screen pixels along the surface, at any point of the pixel: the plane
 * distance over its change between this pixel and the next, on the surface's tangent plane. Every surface the ray
 * crosses counts, removed ones and walls seen from inside too: a pixel on the edge of a cut may sample the surface on
 * either side, and a wall seen through the cut draws its line on the cap's rim.
 */
// oxlint-disable-next-line max-params -- The probe names its camera, scene, pieces and pixel.
const outlineDistance = (
  camera: THREE.Camera,
  scene: THREE.Scene,
  pieces: readonly SectionPiece[],
  row: number,
  column: number,
): number =>
  // The pixel's centre and corners: at a silhouette the surface rasterized at the centre may end just short of it.
  Math.min(
    ...[
      [0, 0],
      [-0.5, -0.5],
      [-0.5, 0.5],
      [0.5, -0.5],
      [0.5, 0.5],
    ].map(([down, across]) => surfaceDistance(camera, scene, pieces, row + down!, column + across!)),
  );

// oxlint-disable-next-line max-params -- The probe names its camera, scene, pieces and point on the screen.
const surfaceDistance = (
  camera: THREE.Camera,
  scene: THREE.Scene,
  pieces: readonly SectionPiece[],
  row: number,
  column: number,
): number => {
  const rayAt = (pixelRow: number, pixelColumn: number): THREE.Ray => {
    const raycaster = new THREE.Raycaster();
    raycaster.setFromCamera(
      new THREE.Vector2(((pixelColumn + 0.5) / size) * 2 - 1, 1 - ((pixelRow + 0.5) / size) * 2),
      camera,
    );
    return raycaster.ray;
  };
  const ray = rayAt(row, column);
  const neighbours = [rayAt(row, column + 1), rayAt(row + 1, column)];
  const raycaster = new THREE.Raycaster(ray.origin, ray.direction);
  const pixelWorld = (distance: number): number =>
    camera instanceof THREE.PerspectiveCamera
      ? (2 * distance * Math.tan(THREE.MathUtils.degToRad(camera.fov) / 2)) / size
      : (2 * halfExtent) / size;
  const distances = intersectBothSides(raycaster, scene).flatMap((hit) => {
    const normal = hit.face!.normal.clone().transformDirection(hit.object.matrixWorld);
    const tangent = new THREE.Plane().setFromNormalAndCoplanarPoint(normal, hit.point);
    const steps = neighbours.map((neighbour) => neighbour.intersectPlane(tangent, new THREE.Vector3()));
    return pieces.flatMap(({ faces }) =>
      faces
        .filter(({ bounds }) =>
          bounds.every((bound) => signed(bound, hit.point) >= -pixelWorld(hit.distance) * outlineReach),
        )
        .map(({ plane }) => {
          const slope = Math.hypot(...steps.map((step) => (step ? signed(plane, step) - signed(plane, hit.point) : 0)));
          return slope > 0 ? Math.abs(signed(plane, hit.point)) / slope : Number.POSITIVE_INFINITY;
        }),
    );
  });
  return Math.min(...distances);
};

/** Every hit along the ray, back faces included, whatever side the scene's materials draw. */
const intersectBothSides = (raycaster: THREE.Raycaster, scene: THREE.Scene): THREE.Intersection[] => {
  const sides = new Map<{ side: THREE.Side }, THREE.Side>();
  for (const child of scene.children) {
    const material: unknown = child instanceof THREE.Mesh ? child.material : undefined;
    if (material instanceof THREE.Material) {
      sides.set(material, material.side);
      material.side = THREE.DoubleSide;
    }
  }
  try {
    return raycaster.intersectObjects(scene.children, false);
  } finally {
    for (const [material, side] of sides) {
      material.side = side;
    }
  }
};

const compareOutline = (
  outlined: Frame,
  distance: (row: number, column: number) => number,
): Pick<ScenarioResult, 'outlinePixels' | 'strayOutlinePixels'> => {
  let outlinePixels = 0;
  let strayOutlinePixels = 0;
  for (let row = 0; row < size; row++) {
    for (let column = 0; column < size; column++) {
      if (classify(outlined.pixel(row, column)) !== 'outline') {
        continue;
      }
      outlinePixels++;
      if (distance(row, column) > outlineReach) {
        strayOutlinePixels++;
      }
    }
  }
  return { outlinePixels, strayOutlinePixels };
};

const compare = (
  expected: readonly Expected[],
  frame: Frame,
): Pick<ScenarioResult, 'hard' | 'overlapExpected' | 'overlapDrawn' | 'capExpected'> => {
  const hard: ScenarioResult['hard'] = [];
  let overlapExpected = 0;
  let overlapDrawn = 0;
  let capExpected = 0;
  const isNearChange = (row: number, column: number): boolean => {
    const own = expected[row * size + column];
    for (let y = Math.max(0, row - boundaryBand); y <= Math.min(size - 1, row + boundaryBand); y++) {
      for (let x = Math.max(0, column - boundaryBand); x <= Math.min(size - 1, column + boundaryBand); x++) {
        if (expected[y * size + x] !== own) {
          return true;
        }
      }
    }
    return false;
  };
  for (let row = 0; row < size; row++) {
    for (let column = 0; column < size; column++) {
      const want = expected[row * size + column]!;
      if (want === 'skip' || isNearChange(row, column)) {
        continue;
      }
      const drawn = classify(frame.pixel(row, column));
      if (want !== 'none') {
        capExpected++;
      }
      if (want === 'overlap') {
        overlapExpected++;
        if (drawn === 'overlap') {
          overlapDrawn++;
        }
      }
      if (drawn !== want) {
        hard.push({ row, column, expected: want, drawn: `${drawn} ${frame.pixel(row, column).join(',')}` });
      }
    }
  }
  return { hard, overlapExpected, overlapDrawn, capExpected };
};

/**
 * Renders a scene into an offscreen target with a stencil, fills the stencil with ones, as a frame's other passes
 * might leave it, runs `after` into the same target, and reads it back.
 */
const createFrameRenderer = (
  renderer: Awaited<ReturnType<typeof createRenderer>>,
  disposables: Array<{ dispose: () => void }>,
): ((scene: THREE.Scene, camera: THREE.Camera, after: () => void) => Promise<ArrayLike<number>>) => {
  const dirty = new THREE.Scene();
  const fill = new THREE.Mesh(
    new THREE.PlaneGeometry(2, 2),
    new THREE.MeshBasicMaterial({
      colorWrite: false,
      depthTest: false,
      depthWrite: false,
      stencilWrite: true,
      stencilFunc: THREE.AlwaysStencilFunc,
      stencilRef: 0xff,
      // eslint-disable-next-line @typescript-eslint/naming-convention -- Three's material parameter name.
      stencilZPass: THREE.ReplaceStencilOp,
    }),
  );
  fill.frustumCulled = false;
  dirty.add(fill);
  const dirtyCamera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 2);
  dirtyCamera.position.set(0, 0, 1);
  dirtyCamera.updateMatrixWorld();
  disposables.push(fill.geometry, fill.material);
  const dirtyStencil = (): void => {
    const previousAutoClear = renderer.autoClear;
    renderer.autoClear = false;
    renderer.render(dirty, dirtyCamera);
    renderer.autoClear = previousAutoClear;
  };
  if (renderer instanceof THREE.WebGLRenderer) {
    const target = new THREE.WebGLRenderTarget(size, size, { depthBuffer: true, stencilBuffer: true });
    disposables.push(target);
    return async (scene, camera, after) => {
      renderer.setRenderTarget(target);
      renderer.render(scene, camera);
      dirtyStencil();
      after();
      renderer.setRenderTarget(null);
      const pixels = new Uint8Array(size * size * 4);
      renderer.readRenderTargetPixels(target, 0, 0, size, size, pixels);
      return pixels;
    };
  }
  if (!(renderer.backend instanceof WebGPUBackend)) {
    throw new Error(
      'No WebGPU adapter, so three fell back to WebGL 2. Launch Chromium with one, for example --use-webgpu-adapter=swiftshader.',
    );
  }
  const target = new THREE.RenderTarget(size, size, { depthBuffer: true, stencilBuffer: true });
  disposables.push(target);
  return async (scene, camera, after) => {
    renderer.setRenderTarget(target);
    renderer.render(scene, camera);
    dirtyStencil();
    after();
    renderer.setRenderTarget(null);
    return renderer.readRenderTargetPixelsAsync(target, 0, 0, size, size);
  };
};

/**
 * A box cut through by one plane, from two sides: facing the cap, and from the kept side, where the cut walls meet the
 * plane at a shallow angle. Along every visible cut edge the outline must be unbroken and antialiased like a model
 * edge, at the line widths a 1x and a 2x screen draw.
 */
const outlineBoxExtents = [4, 6, 3] as const;
const outlineBoxMatrix = placed(centre, new THREE.Euler(0, 0, 0.35));
const outlineCut: SectionCut = { id: 'outline', kind: 'plane', plane: 'xz', offset: centre.y + 0.4, isFlipped: false };
/** Below this a sample is a gap in the line. */
const inkedThreshold = 0.4;
/** Partly covered pixels sit between these. */
const partialInk = [0.15, 0.85] as const;

type OutlineView = Readonly<{ label: string; camera: () => THREE.Camera }>;

/** The cut plane's corners on the box, in order around it. */
const outlineCutCorners = (plane: SectionHalfSpace): THREE.Vector3[] => {
  const [ex, ey, ez] = outlineBoxExtents.map((extent) => extent / 2) as [number, number, number];
  const corners = [-1, 1].flatMap((x) =>
    [-1, 1].flatMap((y) =>
      [-1, 1].map((z) => new THREE.Vector3(x * ex, y * ey, z * ez).applyMatrix4(outlineBoxMatrix)),
    ),
  );
  const points: THREE.Vector3[] = [];
  for (const [i, a] of corners.entries()) {
    for (const b of corners.slice(i + 1)) {
      // Box edges join corners that differ along one local axis.
      const differing = [a, b].map((corner) => corner.clone().applyMatrix4(outlineBoxMatrix.clone().invert()));
      const axes = ['x', 'y', 'z'].filter(
        (axis) => Math.abs(differing[0]![axis as 'x'] - differing[1]![axis as 'x']) > 1e-6,
      );
      if (axes.length !== 1) {
        continue;
      }
      const da = signed(plane, a);
      const db = signed(plane, b);
      if (da * db < 0) {
        points.push(a.clone().lerp(b, da / (da - db)));
      }
    }
  }
  const middle = new THREE.Vector3();
  for (const point of points) {
    middle.add(point);
  }
  middle.divideScalar(points.length);
  const normal = new THREE.Vector3(...plane.normal);
  const u = points[0]!.clone().sub(middle).normalize();
  const v = normal.clone().cross(u);
  return points.toSorted(
    (left, right) =>
      Math.atan2(left.clone().sub(middle).dot(v), left.clone().sub(middle).dot(u)) -
      Math.atan2(right.clone().sub(middle).dot(v), right.clone().sub(middle).dot(u)),
  );
};

type OutlineEdgeResult = Readonly<{
  label: string;
  samples: number;
  gaps: number;
  partialPixels: number;
  inkedPixels: number;
}>;

describe.each(['webgl', 'webgpu'] as const)('section cap outline on %s', (backend) => {
  const results: OutlineEdgeResult[] = [];
  const disposables: Array<{ dispose: () => void }> = [];

  beforeAll(async () => {
    const canvas = document.createElement('canvas');
    canvas.width = size;
    canvas.height = size;
    const renderer = await createRenderer('viewport', backend, canvas);
    disposables.push(renderer);
    const renderFrame = createFrameRenderer(renderer, disposables);
    const calibration = new THREE.Scene();
    const topHalf = new THREE.Mesh(new THREE.PlaneGeometry(2, 1), new THREE.MeshBasicMaterial({ color: 0xff_ff_ff }));
    topHalf.position.set(0, 0.5, 0);
    calibration.add(topHalf);
    const calibrationCamera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, 10);
    calibrationCamera.position.set(0, 0, 5);
    calibrationCamera.updateMatrixWorld();
    const calibrated = await renderFrame(calibration, calibrationCamera, () => undefined);
    const isTopRowFirst = (calibrated[0] ?? 0) > 128;
    disposables.push(topHalf.geometry, topHalf.material);

    const pieces = resolveSectionPieces([outlineCut]);
    const [face] = resolveSectionFaces(pieces);
    const { plane } = face!;
    const removedSide = new THREE.Vector3(...plane.normal);
    const clip = createSectionClip(backend);
    writeSectionClip(clip, pieces);
    const surface = new THREE.MeshBasicMaterial({ color: 0x40_40_40, side: THREE.DoubleSide });
    applyGltfSurfaceDepthBias(surface, backend);
    installSectionClip(surface, clip);
    const geometry = new THREE.BoxGeometry(...outlineBoxExtents);
    const mesh = new THREE.Mesh(geometry, surface);
    mesh.matrixAutoUpdate = false;
    mesh.matrix.copy(outlineBoxMatrix);
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x00_00_00);
    scene.add(mesh);
    scene.updateMatrixWorld(true);
    const caps = createSectionStencilCaps(backend);
    disposables.push(surface, geometry, caps);
    const sources: SectionStencilCapSource[] = [
      { key: 'box', ownerKey: 'box', meshes: [mesh], tintHex: 0x00_ff_00, edgeHex: 0xff_ff_ff },
    ];
    const corners = outlineCutCorners(plane);

    const views: readonly OutlineView[] = [
      {
        label: 'facing the cap',
        camera: () =>
          lookFrom(
            removedSide
              .clone()
              .multiplyScalar(11)
              .add(new THREE.Vector3(5, 0, 6)),
            'perspective',
          ),
      },
      {
        label: 'from the kept side',
        camera: () =>
          lookFrom(
            removedSide
              .clone()
              .multiplyScalar(-9)
              .add(new THREE.Vector3(7, 0, 8)),
            'perspective',
          ),
      },
    ];
    for (const view of views) {
      for (const width of [1, 2]) {
        const camera = view.camera();
        // oxlint-disable-next-line no-await-in-loop -- one renderer draws and reads back each frame in turn.
        const pixels = await renderFrame(scene, camera, () => {
          caps.render(renderer, {
            camera,
            pieces,
            sources,
            stripes: noStripes,
            outlineWidthPixels: width,
            viewportHeightPixels: size,
          });
        });
        const frame = createFrame(pixels, isTopRowFirst);
        // White ink over the grey surface, the green cap or the black background.
        const ink = (row: number, column: number): number => {
          if (row < 0 || column < 0 || row >= size || column >= size) {
            return 0;
          }
          const [red, , blue] = frame.pixel(row, column);
          return Math.max(0, Math.min(1, (Math.min(red, blue) - 0x40) / (0xff - 0x40)));
        };
        const touched = new Set<number>();
        // The most ink in the 3 × 3 pixels around a point on the screen: the line may straddle a pixel boundary.
        const inkAround = (at: THREE.Vector2): number => {
          let best = 0;
          for (let dy = -1; dy <= 1; dy++) {
            for (let dx = -1; dx <= 1; dx++) {
              const row = Math.round(at.y) + dy;
              const column = Math.round(at.x) + dx;
              best = Math.max(best, ink(row, column));
              touched.add(row * size + column);
            }
          }
          return best;
        };
        const rayCamera = view.camera();
        const raycaster = new THREE.Raycaster();
        const eye = new THREE.Vector3().setFromMatrixPosition(rayCamera.matrixWorld);
        const isVisible = (point: THREE.Vector3): boolean => {
          raycaster.set(eye, point.clone().sub(eye).normalize());
          const distance = point.distanceTo(eye);
          const kept = raycaster.intersectObject(mesh, false).find((hit) => signed(plane, hit.point) <= 1e-4);
          return !kept || kept.distance >= distance - 0.02;
        };
        let samples = 0;
        let gaps = 0;
        for (const [index, start] of corners.entries()) {
          const end = corners[(index + 1) % corners.length]!;
          const project = (point: THREE.Vector3): THREE.Vector2 => {
            const ndc = point.clone().project(rayCamera);
            return new THREE.Vector2(((ndc.x + 1) / 2) * size - 0.5, ((1 - ndc.y) / 2) * size - 0.5);
          };
          const from = project(start);
          const to = project(end);
          const steps = Math.ceil(from.distanceTo(to) * 2);
          // Skip the corners, where two edges and the silhouette meet.
          for (let step = 4; step <= steps - 4; step++) {
            const t = step / steps;
            const isGap = isVisible(start.clone().lerp(end, t))
              ? inkAround(from.clone().lerp(to, t)) < inkedThreshold
              : undefined;
            samples += isGap === undefined ? 0 : 1;
            gaps += isGap === true ? 1 : 0;
          }
        }
        let partialPixels = 0;
        let inkedPixels = 0;
        for (const key of touched) {
          const value = ink(Math.floor(key / size), key % size);
          if (value > 0) {
            inkedPixels++;
          }
          if (value > partialInk[0] && value < partialInk[1]) {
            partialPixels++;
          }
        }
        results.push({ label: `${view.label}, ${width} px`, samples, gaps, partialPixels, inkedPixels });
      }
    }
  }, setupTimeout);

  afterAll(() => {
    for (const resource of disposables.splice(0).reverse()) {
      resource.dispose();
    }
  });

  it('should draw an unbroken line along every visible cut edge', () => {
    expect(results).toHaveLength(4);
    for (const { label, samples, gaps } of results) {
      expect(samples, `${label} sees the cut edges`).toBeGreaterThan(size / 2);
      expect(gaps, `${label}: ${gaps} of ${samples} samples have no line`).toBeLessThanOrEqual(samples * 0.02);
    }
  });

  it('should antialias the line, as model edges are, rather than cut it off at whole pixels', () => {
    for (const { label, partialPixels, inkedPixels } of results) {
      expect(partialPixels, `${label}: ${partialPixels} of ${inkedPixels} inked pixels partly covered`).toBeGreaterThan(
        inkedPixels * 0.15,
      );
    }
  });
});

/**
 * Per-loop caps on a real GPU: a hollow box (a cube with a cubic cavity) and an open box (a cube without its +x face),
 * each capped from the loops a slice finds, counted even-odd with the stencil's invert operation. Seen from above, the
 * hollow box's cap fills the wall between its two loops and not the cavity; the open box closes no loop, so it shows
 * no cap at all, only its open chain in the open-chain colour.
 */
const hollowAt = centre.clone().add(new THREE.Vector3(-2.5, 0, 0));
const openAt = centre.clone().add(new THREE.Vector3(2.5, 0, 0));
const hollowTint = 0x00_ff_00;
const loopView = new THREE.Vector3(-3, -5, 16);
const openTint = 0x00_00_ff;

const loopFixture = (): Array<Readonly<{ key: string; tint: number; geometry: THREE.BufferGeometry }>> => {
  const cavity = new THREE.BoxGeometry(1, 1, 1).scale(-1, 1, 1);
  const hollow = new THREE.BoxGeometry(3, 3, 3);
  const hollowIndex = hollow.getIndex()!.array.length;
  const merged = new THREE.BufferGeometry();
  const positions = [...hollow.getAttribute('position').array, ...cavity.getAttribute('position').array];
  const offset = hollow.getAttribute('position').count;
  merged.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  merged.setIndex([...hollow.getIndex()!.array, ...[...cavity.getIndex()!.array].map((vertex) => vertex + offset)]);
  expect(merged.getIndex()!.count).toBe(hollowIndex * 2);
  const open = new THREE.BoxGeometry(3, 3, 3);
  open.setIndex([...open.getIndex()!.array].slice(6));
  return [
    { key: 'hollow', tint: hollowTint, geometry: merged.translate(hollowAt.x, hollowAt.y, hollowAt.z) },
    { key: 'open', tint: openTint, geometry: open.translate(openAt.x, openAt.y, openAt.z) },
  ];
};

describe.each(['webgl', 'webgpu'] as const)('per-loop section caps on %s', (backend) => {
  const errors: unknown[][] = [];
  const disposables: Array<{ dispose: () => void }> = [];
  let frame: Frame | undefined;
  let camera: THREE.Camera | undefined;
  let counts: Array<Readonly<{ key: string; closedLoopCount: number; openChainCount: number }>> = [];

  beforeAll(async () => {
    vi.spyOn(console, 'error').mockImplementation((...data: unknown[]) => {
      errors.push(data);
    });
    const canvas = document.createElement('canvas');
    canvas.width = size;
    canvas.height = size;
    const renderer = await createRenderer('viewport', backend, canvas);
    disposables.push(renderer);
    const renderFrame = createFrameRenderer(renderer, disposables);
    const calibration = new THREE.Scene();
    const topHalf = new THREE.Mesh(new THREE.PlaneGeometry(2, 1), new THREE.MeshBasicMaterial({ color: 0xff_ff_ff }));
    topHalf.position.set(0, 0.5, 0);
    calibration.add(topHalf);
    const calibrationCamera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, 10);
    calibrationCamera.position.set(0, 0, 5);
    calibrationCamera.updateMatrixWorld();
    const calibrated = await renderFrame(calibration, calibrationCamera, () => undefined);
    const isTopRowFirst = (calibrated[0] ?? 0) > 128;
    disposables.push(topHalf.geometry, topHalf.material);

    const pieces = resolveSectionPieces([planeCut]);
    const [face] = pieces[0]!.faces;
    const clip = createSectionClip(backend);
    writeSectionClip(clip, pieces);
    const surface = new THREE.MeshBasicMaterial({ color: 0x40_40_40, side: THREE.DoubleSide });
    applyGltfSurfaceDepthBias(surface, backend);
    installSectionClip(surface, clip);
    const caps = createSectionStencilCaps(backend);
    disposables.push(surface, caps);
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x00_00_00);
    const sources: SectionStencilCapSource[] = loopFixture().map(({ key, tint, geometry }) => {
      const mesh = new THREE.Mesh(geometry, surface);
      scene.add(mesh);
      const flat = geometry.toNonIndexed();
      const slice = sliceSectionLoops({
        triangles: Float64Array.from(flat.getAttribute('position').array),
        plane: [face!.plane.normal[0], face!.plane.normal[1], face!.plane.normal[2], face!.plane.constant],
        weldTolerance: 1e-9,
      });
      const fill = new THREE.BufferGeometry().setAttribute('position', new THREE.BufferAttribute(slice.fill, 3));
      const open = new THREE.BufferGeometry().setAttribute(
        'position',
        new THREE.BufferAttribute(slice.openTriangles, 3),
      );
      disposables.push(geometry, flat, fill, open);
      const capGeometry: SectionLoopCapGeometry = {
        fill,
        open,
        closedLoopCount: slice.closedLoops.length,
        openChainCount: slice.openChains.length,
      };
      counts.push({ key, closedLoopCount: capGeometry.closedLoopCount, openChainCount: capGeometry.openChainCount });
      return {
        key,
        ownerKey: key,
        meshes: [mesh],
        tintHex: tint,
        edgeHex: 0xff_ff_ff,
        loops: { matrix: new THREE.Matrix4(), bySlot: new Map([[0, capGeometry]]) },
      };
    });
    scene.updateMatrixWorld(true);
    // Tilted, so the open box's walls face the camera enough to draw their outline band.
    camera = lookFrom(loopView, 'orthographic');
    const pixels = await renderFrame(scene, camera, () => {
      caps.render(renderer, {
        camera: camera!,
        pieces,
        sources,
        stripes: noStripes,
        outlineWidthPixels: 1.5,
        viewportHeightPixels: size,
      });
    });
    frame = createFrame(pixels, isTopRowFirst);
  }, setupTimeout);

  afterAll(() => {
    vi.restoreAllMocks();
    for (const resource of disposables.splice(0).reverse()) {
      resource.dispose();
    }
    counts = [];
  });

  /** Where a pixel's ray meets the cut plane, in the plane's x and y. */
  const rayCamera = lookFrom(loopView, 'orthographic');
  const onPlane = (row: number, column: number): THREE.Vector2 => {
    const raycaster = new THREE.Raycaster();
    // A fresh camera: rendering re-projects one for its backend, which the ray caster does not follow.
    raycaster.setFromCamera(
      new THREE.Vector2(((column + 0.5) / size) * 2 - 1, 1 - ((row + 0.5) / size) * 2),
      rayCamera,
    );
    const point = raycaster.ray.intersectPlane(
      new THREE.Plane(new THREE.Vector3(0, 0, 1), -planeCut.offset),
      new THREE.Vector3(),
    )!;
    return new THREE.Vector2(point.x, point.y);
  };
  /** The largest of the x and y offsets of a point from a centre. */
  const reach = (point: THREE.Vector2, at: THREE.Vector3): number =>
    Math.max(Math.abs(point.x - at.x), Math.abs(point.y - at.y));
  const pixelWorld = (2 * halfExtent) / size;
  const margin = pixelWorld * 2.5;

  it('should find one closed loop pair in the hollow box and one open chain in the open box', () => {
    expect(counts).toEqual([
      { key: 'hollow', closedLoopCount: 2, openChainCount: 0 },
      { key: 'open', closedLoopCount: 0, openChainCount: 1 },
    ]);
  });

  it('should fill the hollow wall even-odd, leave its cavity open, and never cap the open box', () => {
    const wrong: string[] = [];
    let wall = 0;
    for (let row = 0; row < size; row++) {
      for (let column = 0; column < size; column++) {
        const point = onPlane(row, column);
        const hollowReach = reach(point, hollowAt);
        const [red, green, blue] = frame!.pixel(row, column);
        const isGreen = green > 150 && red < 100 && blue < 100;
        const isBlue = blue > 150 && red < 100 && green < 100;
        if (isBlue) {
          wrong.push(`open cap at ${row},${column}`);
        }
        if (hollowReach < 1.5 - margin && hollowReach > 0.5 + margin) {
          wall++;
          if (!isGreen) {
            wrong.push(`wall ${row},${column}: ${red},${green},${blue}`);
          }
        } else if ((hollowReach < 0.5 - margin || hollowReach > 1.5 + margin) && isGreen) {
          wrong.push(`cap outside the wall ${row},${column}`);
        }
      }
    }
    expect(wall).toBeGreaterThan(size * 2);
    expect(wrong.slice(0, 8)).toEqual([]);
  });

  // The open-chain band is one-sided, 1.5 * widthScale device pixels wide.
  // Project its three exact cut segments; a world-axis margin based on the
  // ordinary 1.5-pixel outline underestimates that band on a tilted cut plane.
  const chainCorners = [
    [1.5, -1.5],
    [-1.5, -1.5],
    [-1.5, 1.5],
    [1.5, 1.5],
  ].map(([x, y]) => {
    const point = new THREE.Vector3(openAt.x + x!, openAt.y + y!, planeCut.offset).project(rayCamera);
    return new THREE.Vector2(((point.x + 1) * size) / 2, ((1 - point.y) * size) / 2);
  });
  const chainDistance = (row: number, column: number): number => {
    const pixel = new THREE.Vector2(column + 0.5, row + 0.5);
    return Math.min(
      ...chainCorners.slice(1).map((end, index) => {
        const start = chainCorners[index]!;
        const direction = end.clone().sub(start);
        const along = THREE.MathUtils.clamp(pixel.clone().sub(start).dot(direction) / direction.lengthSq(), 0, 1);
        return pixel.distanceTo(start.clone().addScaledVector(direction, along));
      }),
    );
  };

  it('should outline the open chain in the open-chain colour, beside the open box only', () => {
    // #DD003F reads back as strong red, no green and a little blue; nothing else in the scene is red.
    expect(sectionCapOpenChainColor).toBe(0xdd_00_3f);
    let chainPixels = 0;
    const stray: string[] = [];
    for (let row = 0; row < size; row++) {
      for (let column = 0; column < size; column++) {
        const [red, green, blue] = frame!.pixel(row, column);
        if (red > 150 && green < 60 && blue < 120) {
          chainPixels++;
          if (chainDistance(row, column) > 1.5 * sectionCapOpenChainWidthScale + 0.5) {
            stray.push(`${row},${column}: ${chainDistance(row, column)}px from cut`);
          }
        }
      }
    }
    // Three walls of 3 units at about 0.09 units a pixel, the far one partly behind the near.
    expect(chainPixels).toBeGreaterThan(size / 2);
    expect(stray.slice(0, 8)).toEqual([]);
  });

  it('should compile and draw every per-loop pass without a shader or pipeline error', () => {
    expect(errors).toEqual([]);
  });
});
