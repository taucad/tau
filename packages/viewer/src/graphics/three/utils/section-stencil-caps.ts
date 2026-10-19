/* oxlint-disable eslint/no-bitwise -- Stencil references and masks are bit fields. */
import * as THREE from 'three';
import type { ResolvedGraphicsBackend } from '#graphics/graphics-settings.js';
import { isSameSectionHalfSpace, resolveSectionFaces, resolveSectionTrimmingPieces } from '#graphics/section-cuts.js';
import type { SectionFace, SectionHalfSpace, SectionPiece } from '#graphics/section-cuts.js';
import { createSectionCapOutlineNodeMaterial } from '#graphics/three/materials/section-cap-outline.node.js';
import {
  createSectionCapOutlineFaces,
  createSectionCapOutlineMaterial,
  writeSectionCapOutlineCamera,
  writeSectionCapOutlineFaces,
} from '#graphics/three/materials/section-cap-outline.material.js';
import type { SectionCapOutlineFaces } from '#graphics/three/materials/section-cap-outline.material.js';
import { createSectionClip, installSectionClip, writeSectionClip } from '#graphics/three/materials/section-clip.js';
import type { SectionClip } from '#graphics/three/materials/section-clip.js';
import {
  applySectionCapStencilPass,
  createSectionStencilMaterial,
} from '#graphics/three/materials/section-stencil.material.js';
import type { SectionStencilPass } from '#graphics/three/materials/section-stencil.material.js';
import {
  createVertexColoredStripedMaterialForBackend,
  setVertexColoredStripedMaterialStripes,
} from '#graphics/three/materials/striped-material.js';
import type { StripedCapStripes } from '#graphics/three/materials/striped-material.js';
import { sectionCapOpenChainColor, sectionCapOpenChainWidthScale } from '#graphics/three/overlay-colors.constants.js';
import { getBvhGeometryBounds } from '#graphics/three/utils/bvh-cache.js';
import { resolveSectionCapStyle } from '#graphics/three/utils/section-cap-style.js';
import type { SectionLoopCapSource } from '#graphics/three/utils/section-loop-caps.js';

/** One source to cap: the meshes that bound it, as drawn, and how its cut faces look. */
export type SectionStencilCapSource = Readonly<{
  key: string;
  /** Overlap is shown only between sources of different owners. */
  ownerKey: string;
  /** The meshes the source shows: counted for an exact cap, and outlined either way. */
  meshes: readonly THREE.Mesh[];
  /**
   * Set for a source that is not a closed solid: its cap is counted from the fans over the closed loops each face's
   * slice found instead of from its meshes, and its open chains are outlined in the open-chain colour.
   */
  loops?: SectionLoopCapSource;
  /** The cap's tint, emphasis included. */
  tintHex: number;
  /** The outline colour where the cut meets the source's surfaces. */
  edgeHex: number;
}>;

export type SectionStencilCapFrame = Readonly<{
  camera: THREE.Camera;
  /** The removed pieces, in render space. */
  pieces: readonly SectionPiece[];
  sources: readonly SectionStencilCapSource[];
  stripes: StripedCapStripes;
  /** The outline width, and the height of the viewport it is drawn into, in device pixels. */
  outlineWidthPixels: number;
  viewportHeightPixels: number;
}>;

/** What one frame drew: counts that depend on the number of pieces and meshes, never on triangles. */
export type SectionStencilCapStats = {
  pieceCount: number;
  /** Pieces seen from their removed side, so with a cap to draw. */
  drawnPieceCount: number;
  /** Per drawn piece, the sources whose bounds cross its exit region, summed. */
  crossingSourceCount: number;
  /** Per drawn piece, the sources tested for overlap with an earlier owner, summed. */
  overlapCandidateSourceCount: number;
  outlineSourceCount: number;
  /** Per drawn piece, the crossing sources capped from their per-loop slices, summed. */
  loopSourceCount: number;
  /** Draws of open-chain outlines. */
  openChainDrawCount: number;
  /** Mesh draws of the sources' own geometry and per-loop slices: stencil counts and outlines. */
  meshDrawCount: number;
  /** Draws of cap polygons: caps, marks and clears. */
  polygonDrawCount: number;
  submitMilliseconds: number;
};

/** The part of a renderer the caps draw with; both backends have it. */
export type SectionStencilCapRenderer = {
  autoClear: boolean;
  render: (scene: THREE.Object3D, camera: THREE.Camera) => unknown;
};

export type SectionStencilCaps = Readonly<{
  /**
   * Draws the caps of `frame` over what the renderer's target holds, testing against its depth: call it after the
   * model's pass, with that pass's depth in the target, which needs a stencil. Each piece zeroes the stencil where it
   * reads it before drawing, so whatever the target held there does not matter.
   */
  render: (renderer: SectionStencilCapRenderer, frame: SectionStencilCapFrame) => SectionStencilCapStats;
  /** The pass's own scene, for inspection. */
  scene: THREE.Scene;
  dispose: () => void;
}>;

// ---------------------------------------------------------------------------
// Geometry on a cut plane
// ---------------------------------------------------------------------------

const maxPolygonVertices = 8;
const boxCorners = Array.from({ length: 8 }, () => new THREE.Vector3());
const boxEdges = [
  [0, 1],
  [2, 3],
  [4, 5],
  [6, 7],
  [0, 2],
  [1, 3],
  [4, 6],
  [5, 7],
  [0, 4],
  [1, 5],
  [2, 6],
  [3, 7],
] as const;
const cornerDistances = new Float64Array(8);
const _normal = new THREE.Vector3();
const _u = new THREE.Vector3();
const _v = new THREE.Vector3();
const _centroid = new THREE.Vector3();
const _scratch = new THREE.Vector3();

const signedDistance = ({ normal, constant }: SectionHalfSpace, point: THREE.Vector3): number =>
  normal[0] * point.x + normal[1] * point.y + normal[2] * point.z - constant;

/** Two unit axes in the plane of `normal`, the same for every plane with that normal, so stripes line up. */
export const writeSectionPlaneAxes = (
  normal: readonly [number, number, number],
  u: THREE.Vector3,
  v: THREE.Vector3,
): void => {
  _normal.set(normal[0], normal[1], normal[2]);
  const arbitrary = Math.abs(normal[2]) < 0.9 ? _scratch.set(0, 0, 1) : _scratch.set(0, 1, 0);
  u.crossVectors(_normal, arbitrary).normalize();
  v.crossVectors(_normal, u);
};

/** The smallest and largest signed distance of `box` from `halfSpace`'s plane. */
const boxDistanceRange = (box: THREE.Box3, halfSpace: SectionHalfSpace): readonly [number, number] => {
  const [nx, ny, nz] = halfSpace.normal;
  const centre = (nx * (box.min.x + box.max.x) + ny * (box.min.y + box.max.y) + nz * (box.min.z + box.max.z)) / 2;
  const radius =
    (Math.abs(nx) * (box.max.x - box.min.x) +
      Math.abs(ny) * (box.max.y - box.min.y) +
      Math.abs(nz) * (box.max.z - box.min.z)) /
    2;
  return [centre - radius - halfSpace.constant, centre + radius - halfSpace.constant];
};

/**
 * Whether a closed solid inside `box` can show a cap of the region removed where every half-space holds a point:
 * only when the box meets the region and is not wholly inside it. A solid wholly kept or wholly removed counts zero
 * at every pixel. Conservative for two half-spaces.
 */
export const boxCrossesSectionRegion = (box: THREE.Box3, region: readonly SectionHalfSpace[]): boolean => {
  let isInside = true;
  for (const halfSpace of region) {
    const [low, high] = boxDistanceRange(box, halfSpace);
    if (high <= 0) {
      return false;
    }
    if (low <= 0) {
      isInside = false;
    }
  }
  return !isInside;
};

/**
 * The polygon where the plane of `plane` meets `box`, clipped to the points every bound holds, in order around it.
 * Writes at most {@link maxPolygonVertices} points into `out` and returns how many; fewer than three is no polygon.
 */
// oxlint-disable-next-line max-params -- The plane, box, bounds and output buffer are distinct inputs of the hot clip.
export const writeSectionPlanePolygon = (
  plane: SectionHalfSpace,
  box: THREE.Box3,
  bounds: readonly SectionHalfSpace[],
  out: THREE.Vector3[],
): number => {
  for (let index = 0; index < 8; index++) {
    const corner = boxCorners[index]!.set(
      index & 1 ? box.max.x : box.min.x,
      index & 2 ? box.max.y : box.min.y,
      index & 4 ? box.max.z : box.min.z,
    );
    cornerDistances[index] = signedDistance(plane, corner);
  }
  let count = 0;
  for (const [start, end] of boxEdges) {
    const startDistance = cornerDistances[start]!;
    const endDistance = cornerDistances[end]!;
    if ((startDistance < 0 && endDistance < 0) || (startDistance > 0 && endDistance > 0)) {
      continue;
    }
    const span = startDistance - endDistance;
    const t = span === 0 ? 0 : startDistance / span;
    const point = (out[count] ??= new THREE.Vector3()).lerpVectors(boxCorners[start]!, boxCorners[end]!, t);
    // A corner on the plane ends three edges; keep it once.
    let isRepeat = false;
    for (let other = 0; other < count; other++) {
      if (out[other]!.distanceToSquared(point) <= 1e-24) {
        isRepeat = true;
        break;
      }
    }
    if (!isRepeat) {
      count++;
    }
  }
  if (count < 3) {
    return 0;
  }
  // Order the points by angle around their centroid, in the plane.
  writeSectionPlaneAxes(plane.normal, _u, _v);
  _centroid.set(0, 0, 0);
  for (let index = 0; index < count; index++) {
    _centroid.add(out[index]!);
  }
  _centroid.divideScalar(count);
  const angles = new Map<THREE.Vector3, number>();
  for (let index = 0; index < count; index++) {
    _scratch.subVectors(out[index]!, _centroid);
    angles.set(out[index]!, Math.atan2(_scratch.dot(_v), _scratch.dot(_u)));
  }
  const ordered = out.slice(0, count).sort((left, right) => angles.get(left)! - angles.get(right)!);
  for (let index = 0; index < count; index++) {
    out[index] = ordered[index]!;
  }
  for (const bound of bounds) {
    count = clipPolygon(out, count, bound);
    if (count < 3) {
      return 0;
    }
  }
  return count;
};

const clipInput: THREE.Vector3[] = Array.from({ length: maxPolygonVertices + 1 }, () => new THREE.Vector3());

/** Keeps the part of a convex polygon where `bound` holds (`distance ≥ 0`), in place. */
const clipPolygon = (points: THREE.Vector3[], count: number, bound: SectionHalfSpace): number => {
  for (let index = 0; index < count; index++) {
    clipInput[index]!.copy(points[index]!);
  }
  let written = 0;
  for (let index = 0; index < count; index++) {
    const current = clipInput[index]!;
    const next = clipInput[(index + 1) % count]!;
    const currentDistance = signedDistance(bound, current);
    const nextDistance = signedDistance(bound, next);
    if (currentDistance >= 0) {
      points[written++]!.copy(current);
    }
    if (currentDistance >= 0 !== nextDistance >= 0 && written < maxPolygonVertices) {
      points[written++]!.lerpVectors(current, next, currentDistance / (currentDistance - nextDistance));
    }
    if (written >= maxPolygonVertices) {
      break;
    }
  }
  return written;
};

// ---------------------------------------------------------------------------
// Pooled draw objects
// ---------------------------------------------------------------------------

type PolygonStyle = Readonly<{
  base: readonly [number, number, number];
  stripe: readonly [number, number, number];
  axis: readonly [number, number];
}>;

const neutralStyle: PolygonStyle = { base: [1, 1, 1], stripe: [1, 1, 1], axis: [0, 1] };

const createPolygonGeometry = (): THREE.BufferGeometry => {
  const geometry = new THREE.BufferGeometry();
  const attribute = (itemSize: number): THREE.BufferAttribute =>
    new THREE.BufferAttribute(new Float32Array(maxPolygonVertices * itemSize), itemSize).setUsage(
      THREE.DynamicDrawUsage,
    );
  geometry.setAttribute('position', attribute(3));
  geometry.setAttribute('aPlaneUv', attribute(2));
  geometry.setAttribute('aCapBaseColor', attribute(3));
  geometry.setAttribute('aCapStripeColor', attribute(3));
  geometry.setAttribute('aCapStripeAxis', attribute(2));
  // A fan: the polygon is convex.
  const indices: number[] = [];
  for (let index = 1; index < maxPolygonVertices - 1; index++) {
    indices.push(0, index, index + 1);
  }
  geometry.setIndex(indices);
  return geometry;
};

// oxlint-disable-next-line max-params -- A pooled geometry write takes its points, count, normal and style apart.
const writePolygonGeometry = (
  geometry: THREE.BufferGeometry,
  points: readonly THREE.Vector3[],
  count: number,
  normal: readonly [number, number, number],
  style: PolygonStyle,
): void => {
  writeSectionPlaneAxes(normal, _u, _v);
  const position = geometry.getAttribute('position') as THREE.BufferAttribute;
  const planeUv = geometry.getAttribute('aPlaneUv') as THREE.BufferAttribute;
  const base = geometry.getAttribute('aCapBaseColor') as THREE.BufferAttribute;
  const stripe = geometry.getAttribute('aCapStripeColor') as THREE.BufferAttribute;
  const axis = geometry.getAttribute('aCapStripeAxis') as THREE.BufferAttribute;
  for (let index = 0; index < count; index++) {
    const point = points[index]!;
    position.setXYZ(index, point.x, point.y, point.z);
    planeUv.setXY(index, point.dot(_u), point.dot(_v));
    base.setXYZ(index, style.base[0], style.base[1], style.base[2]);
    stripe.setXYZ(index, style.stripe[0], style.stripe[1], style.stripe[2]);
    axis.setXY(index, style.axis[0], style.axis[1]);
  }
  for (const attribute of [position, planeUv, base, stripe, axis]) {
    attribute.clearUpdateRanges();
    attribute.addUpdateRange(0, count * attribute.itemSize);
    attribute.needsUpdate = true;
  }
  geometry.setDrawRange(0, (count - 2) * 3);
};

const createDrawObject = (geometry: THREE.BufferGeometry): THREE.Mesh => {
  const mesh = new THREE.Mesh(geometry);
  mesh.matrixAutoUpdate = false;
  mesh.matrixWorldAutoUpdate = false;
  mesh.frustumCulled = false;
  mesh.visible = false;
  return mesh;
};

// ---------------------------------------------------------------------------
// The pass
// ---------------------------------------------------------------------------

type CapSlot = { clip: SectionClip; material: THREE.Material };
type CountSlot = { clip: SectionClip; back: THREE.Material; front: THREE.Material };
type FillSlot = { clip: SectionClip; material: THREE.Material };

type SourceBox = Readonly<{ source: SectionStencilCapSource; box: THREE.Box3 }>;

/** Bounds grown by this share of their diagonal, so a cap polygon covers every pixel of the solid's cut. */
const boundsMargin = 1e-3;

const writeSourceBox = (source: SectionStencilCapSource, box: THREE.Box3, scratch: THREE.Box3): THREE.Box3 => {
  box.makeEmpty();
  for (const mesh of source.meshes) {
    box.union(scratch.copy(getBvhGeometryBounds(mesh.geometry)).applyMatrix4(mesh.matrixWorld));
  }
  if (!box.isEmpty()) {
    box.expandByScalar(Math.max(box.min.distanceTo(box.max) * boundsMargin, 1e-9));
  }
  return box;
};

/** The pieces that remove what lies outside a face's bounds, so a fan on its plane counts only inside the face. */
const outsideFaceBounds = (face: SectionFace): SectionPiece[] =>
  face.bounds.map(({ normal, constant }) => ({
    cutId: face.cutId,
    halfSpaces: [{ normal: [-normal[0], -normal[1], -normal[2]], constant: -constant }],
    faces: [],
  }));

const isOrthographic = (camera: THREE.Camera): boolean =>
  (camera as Partial<THREE.OrthographicCamera>).isOrthographicCamera === true;

/**
 * The half-spaces of `piece` a camera ray leaves it through: for a perspective camera, those whose removed side holds
 * the eye; for an orthographic one, those its parallel rays run out of.
 */
export const resolveSectionExitHalfSpaces = (camera: THREE.Camera, piece: SectionPiece): SectionHalfSpace[] => {
  if (isOrthographic(camera)) {
    camera.getWorldDirection(_scratch);
    return piece.halfSpaces.filter(
      ({ normal }) => normal[0] * _scratch.x + normal[1] * _scratch.y + normal[2] * _scratch.z < 0,
    );
  }
  _scratch.setFromMatrixPosition(camera.matrixWorld);
  return piece.halfSpaces.filter((halfSpace) => signedDistance(halfSpace, _scratch) > 0);
};

/**
 * The stencil section caps of one viewer and backend.
 *
 * For each piece seen from its removed side, every closed source whose bounds cross the piece's exit region counts its
 * surfaces behind the exit face into the stencil (back faces up, front faces down, clipped to the exit region alone),
 * so a pixel's count is non-zero exactly where its cap point lies inside the solid. A source that is not a closed solid
 * counts the fans over the closed loops its per-loop slice found on each face instead, even-odd, so it caps what closes
 * at the plane and leaves the rest open; its open chains are outlined in the open-chain colour. The cap is then drawn there in the
 * source's tint, trimmed to what the other cuts leave. Overlap marks where a later owner's solid also holds a point an
 * earlier owner's did, and the overlap colour is drawn over the visible caps there. An outline follows each face over
 * the sources' kept surfaces. Main-thread work per frame grows with pieces and meshes, never with triangles.
 */
export const createSectionStencilCaps = (backend: ResolvedGraphicsBackend): SectionStencilCaps => {
  const scene = new THREE.Scene();
  scene.matrixWorldAutoUpdate = false;
  const ownedMaterials: THREE.Material[] = [];
  const meshPool: THREE.Mesh[] = [];
  const polygonPool: THREE.Mesh[] = [];
  const emptyGeometry = new THREE.BufferGeometry();
  let meshesUsed = 0;
  let polygonsUsed = 0;

  const countSlots: CountSlot[] = [];
  const fillSlots: FillSlot[] = [];
  const capSlots: CapSlot[] = [];
  const outlineFaces = createSectionCapOutlineFaces();
  /** The same faces as {@link outlineFaces}, at the open chains' wider line. */
  const openChainFaces = createSectionCapOutlineFaces();
  const outlineClip = createSectionClip(backend);
  const outlineMaterials = new Map<number, THREE.Material>();
  let openChainMaterial: THREE.Material | undefined;
  const stencilMaterials = new Map<SectionStencilPass, THREE.Material>();
  let overlapCapMaterial: THREE.Material | undefined;
  let stripes: StripedCapStripes | undefined;

  const own = <T extends THREE.Material>(material: T): T => {
    ownedMaterials.push(material);
    return material;
  };

  const stencilMaterial = (
    pass: Exclude<SectionStencilPass, 'cap' | 'overlap-cap' | 'count-back' | 'count-front' | 'count-parity'>,
  ) => {
    let material = stencilMaterials.get(pass);
    if (!material) {
      material = own(createSectionStencilMaterial(backend, pass));
      stencilMaterials.set(pass, material);
    }
    return material;
  };

  const countSlot = (index: number): CountSlot => {
    let slot = countSlots[index];
    if (!slot) {
      const clip = createSectionClip(backend);
      const back = own(createSectionStencilMaterial(backend, 'count-back'));
      const front = own(createSectionStencilMaterial(backend, 'count-front'));
      installSectionClip(back, clip);
      installSectionClip(front, clip);
      slot = { clip, back, front };
      countSlots[index] = slot;
    }
    return slot;
  };

  const fillSlot = (index: number): FillSlot => {
    let slot = fillSlots[index];
    if (!slot) {
      const clip = createSectionClip(backend);
      const material = own(createSectionStencilMaterial(backend, 'count-parity'));
      installSectionClip(material, clip);
      slot = { clip, material };
      fillSlots[index] = slot;
    }
    return slot;
  };

  const capMaterial = (pass: 'cap' | 'overlap-cap'): THREE.Material => {
    const material = own(createVertexColoredStripedMaterialForBackend(backend));
    applySectionCapStencilPass(material, backend, pass);
    if (stripes) {
      setVertexColoredStripedMaterialStripes(material, stripes);
    }
    return material;
  };

  const capSlot = (index: number): CapSlot => {
    let slot = capSlots[index];
    if (!slot) {
      const clip = createSectionClip(backend);
      const material = capMaterial('cap');
      installSectionClip(material, clip);
      slot = { clip, material };
      capSlots[index] = slot;
    }
    return slot;
  };

  const createOutlineMaterial = (faces: SectionCapOutlineFaces, color: number): THREE.Material => {
    const material = own(
      backend === 'webgpu'
        ? createSectionCapOutlineNodeMaterial(faces, color)
        : createSectionCapOutlineMaterial(faces, color),
    );
    installSectionClip(material, outlineClip);
    return material;
  };

  const outlineMaterial = (color: number): THREE.Material => {
    let material = outlineMaterials.get(color);
    if (!material) {
      material = createOutlineMaterial(outlineFaces, color);
      outlineMaterials.set(color, material);
    }
    return material;
  };

  // oxlint-disable-next-line max-params -- Each pooled draw names its geometry, material, matrix and order.
  const takeMesh = (geometry: THREE.BufferGeometry, material: THREE.Material, matrix: THREE.Matrix4, order: number) => {
    let mesh = meshPool[meshesUsed];
    if (!mesh) {
      mesh = createDrawObject(emptyGeometry);
      meshPool.push(mesh);
      scene.add(mesh);
    }
    meshesUsed++;
    mesh.geometry = geometry;
    mesh.material = material;
    mesh.matrix.copy(matrix);
    mesh.matrixWorld.copy(matrix);
    mesh.renderOrder = order;
    mesh.visible = true;
  };

  const polygonPoints: THREE.Vector3[] = Array.from({ length: maxPolygonVertices }, () => new THREE.Vector3());
  const identity = new THREE.Matrix4();

  /** Draws `plane ∩ box ∩ bounds` with `material`; false when they do not meet. */
  // oxlint-disable-next-line max-params -- Each pooled polygon names its plane, box, bounds, material, order and style.
  const takePolygon = (
    plane: SectionHalfSpace,
    box: THREE.Box3,
    bounds: readonly SectionHalfSpace[],
    material: THREE.Material,
    order: number,
    style: PolygonStyle = neutralStyle,
  ): boolean => {
    const count = writeSectionPlanePolygon(plane, box, bounds, polygonPoints);
    if (count < 3) {
      return false;
    }
    let mesh = polygonPool[polygonsUsed];
    if (!mesh) {
      mesh = createDrawObject(createPolygonGeometry());
      polygonPool.push(mesh);
      scene.add(mesh);
    }
    polygonsUsed++;
    writePolygonGeometry(mesh.geometry, polygonPoints, count, plane.normal, style);
    mesh.material = material;
    mesh.matrix.copy(identity);
    mesh.matrixWorld.copy(identity);
    mesh.renderOrder = order;
    mesh.visible = true;
    return true;
  };

  const sourceBoxes: THREE.Box3[] = [];
  const unionBox = new THREE.Box3();
  const boxScratch = new THREE.Box3();

  const render = (renderer: SectionStencilCapRenderer, frame: SectionStencilCapFrame): SectionStencilCapStats => {
    const startedAt = performance.now();
    const stats: SectionStencilCapStats = {
      pieceCount: frame.pieces.length,
      drawnPieceCount: 0,
      crossingSourceCount: 0,
      overlapCandidateSourceCount: 0,
      outlineSourceCount: 0,
      loopSourceCount: 0,
      openChainDrawCount: 0,
      meshDrawCount: 0,
      polygonDrawCount: 0,
      submitMilliseconds: 0,
    };
    meshesUsed = 0;
    polygonsUsed = 0;
    if (
      stripes?.stripeFrequency !== frame.stripes.stripeFrequency ||
      stripes.stripeWidth !== frame.stripes.stripeWidth
    ) {
      stripes = frame.stripes;
      for (const material of [...capSlots.map(({ material }) => material), overlapCapMaterial]) {
        if (material) {
          setVertexColoredStripedMaterialStripes(material, stripes);
        }
      }
    }

    const boxes: SourceBox[] = frame.sources.flatMap((source, index) => {
      const box = writeSourceBox(source, (sourceBoxes[index] ??= new THREE.Box3()), boxScratch);
      return box.isEmpty() ? [] : [{ source, box }];
    });
    let order = 0;

    for (const [pieceIndex, piece] of frame.pieces.entries()) {
      const exit = resolveSectionExitHalfSpaces(frame.camera, piece);
      if (exit.length === 0) {
        continue;
      }
      const crossing = boxes.filter(({ box }) => boxCrossesSectionRegion(box, exit));
      if (crossing.length === 0) {
        continue;
      }
      const faces = piece.faces
        .map((face, faceIndex) => ({ face, slot: pieceIndex * 2 + faceIndex }))
        .filter(({ face }) => exit.some((halfSpace) => isSameSectionHalfSpace(halfSpace, face.plane)));
      stats.drawnPieceCount++;
      stats.crossingSourceCount += crossing.length;

      unionBox.makeEmpty();
      for (const { box } of crossing) {
        unionBox.union(box);
      }
      // Grown once more, so the clear covers every pixel a source's own polygon rasterizes on a shared edge.
      unionBox.expandByScalar(unionBox.min.distanceTo(unionBox.max) * boundsMargin);
      // Every stencil read of this piece falls on its exit planes within the crossing bounds: zero them first, so
      // nothing the frame or an earlier piece left there counts.
      const clearOrder = order++;
      for (const halfSpace of exit) {
        takePolygon(halfSpace, unionBox, [], stencilMaterial('clear-all'), clearOrder);
      }

      const counts = countSlot(pieceIndex);
      writeSectionClip(counts.clip, [{ cutId: piece.cutId, halfSpaces: exit, faces: [] }]);
      for (const { face, slot } of faces) {
        writeSectionClip(
          capSlot(slot).clip,
          resolveSectionTrimmingPieces({ plane: face.plane, faces: [face] }, frame.pieces),
        );
        if (crossing.some(({ source }) => source.loops)) {
          writeSectionClip(fillSlot(slot).clip, outsideFaceBounds(face));
        }
      }

      // Owners in the order their first source appears; overlap is tested between owners only.
      const owners = new Map<string, SourceBox[]>();
      for (const entry of crossing) {
        const group = owners.get(entry.source.ownerKey) ?? [];
        group.push(entry);
        owners.set(entry.source.ownerKey, group);
      }
      const groups = [...owners.values()];
      const meetsAny = (entry: SourceBox, others: readonly SourceBox[][]): boolean =>
        others.some((group) => group.some(({ box }) => box.intersectsBox(entry.box)));
      let hasMarks = false;

      for (const [groupIndex, group] of groups.entries()) {
        const earlier = groups.slice(0, groupIndex);
        for (const entry of group) {
          const countOrder = order++;
          const { loops } = entry.source;
          if (loops) {
            stats.loopSourceCount++;
            for (const { slot } of faces) {
              const geometry = loops.bySlot.get(slot);
              if (geometry && geometry.closedLoopCount > 0) {
                takeMesh(geometry.fill, fillSlot(slot).material, loops.matrix, countOrder);
              }
            }
          } else {
            for (const mesh of entry.source.meshes) {
              takeMesh(mesh.geometry, counts.back, mesh.matrixWorld, countOrder);
              takeMesh(mesh.geometry, counts.front, mesh.matrixWorld, countOrder);
            }
          }
          if (meetsAny(entry, earlier)) {
            stats.overlapCandidateSourceCount++;
            const markOrder = order++;
            for (const { face } of faces) {
              hasMarks =
                takePolygon(face.plane, entry.box, face.bounds, stencilMaterial('mark-overlap'), markOrder) || hasMarks;
            }
          }
          const capOrder = order++;
          const style = resolveSectionCapStyle({
            tintHex: entry.source.tintHex,
            stripeFrequency: frame.stripes.stripeFrequency,
            stripeWidth: frame.stripes.stripeWidth,
          });
          for (const { face, slot } of faces) {
            takePolygon(face.plane, entry.box, face.bounds, capSlot(slot).material, capOrder, {
              base: style.normalBaseColor,
              stripe: style.normalStripeColor,
              axis: style.normalStripeAxis,
            });
          }
          const clearCountOrder = order++;
          for (const halfSpace of exit) {
            takePolygon(halfSpace, entry.box, [], stencilMaterial('clear-count'), clearCountOrder);
          }
        }
        if (groups.slice(groupIndex + 1).some((later) => later.some((entry) => meetsAny(entry, [group])))) {
          const promoteOrder = order++;
          for (const entry of group) {
            for (const { face } of faces) {
              takePolygon(face.plane, entry.box, face.bounds, stencilMaterial('promote-owner'), promoteOrder);
            }
          }
        }
      }

      if (hasMarks) {
        overlapCapMaterial ??= capMaterial('overlap-cap');
        const style = resolveSectionCapStyle({
          tintHex: 0,
          stripeFrequency: frame.stripes.stripeFrequency,
          stripeWidth: frame.stripes.stripeWidth,
        });
        const overlapOrder = order++;
        for (const { face } of faces) {
          takePolygon(face.plane, unionBox, face.bounds, overlapCapMaterial, overlapOrder, {
            base: style.overlapBaseColor,
            stripe: style.overlapStripeColor,
            axis: style.overlapStripeAxis,
          });
        }
      }
    }

    // The outline follows every face, from either side, over every source a face plane crosses.
    const allFaces: SectionFace[] = resolveSectionFaces(frame.pieces);
    if (allFaces.length > 0) {
      writeSectionCapOutlineFaces(outlineFaces, allFaces, frame.outlineWidthPixels);
      writeSectionCapOutlineCamera(outlineFaces, frame.camera, frame.viewportHeightPixels);
      writeSectionCapOutlineFaces(openChainFaces, allFaces, frame.outlineWidthPixels * sectionCapOpenChainWidthScale);
      writeSectionCapOutlineCamera(openChainFaces, frame.camera, frame.viewportHeightPixels);
      writeSectionClip(outlineClip, frame.pieces);
      const outlineOrder = order++;
      for (const { source, box } of boxes) {
        const isCut = allFaces.some((face) => {
          const [low, high] = boxDistanceRange(box, face.plane);
          return low <= 0 && high >= 0;
        });
        if (!isCut) {
          continue;
        }
        stats.outlineSourceCount++;
        const material = outlineMaterial(source.edgeHex);
        for (const mesh of source.meshes) {
          takeMesh(mesh.geometry, material, mesh.matrixWorld, outlineOrder);
        }
      }
      // Open chains over the ordinary outline, in one colour on every theme and emphasis: the cut there bounds no cap.
      const openChainOrder = order++;
      for (const { source } of boxes) {
        for (const geometry of source.loops?.bySlot.values() ?? []) {
          if (geometry.openChainCount > 0) {
            stats.openChainDrawCount++;
            openChainMaterial ??= createOutlineMaterial(openChainFaces, sectionCapOpenChainColor);
            takeMesh(geometry.open, openChainMaterial, source.loops!.matrix, openChainOrder);
          }
        }
      }
    }

    for (let index = meshesUsed; index < meshPool.length; index++) {
      const mesh = meshPool[index]!;
      mesh.visible = false;
      // Let go of the source's geometry, so a disposed model is not kept alive by the pool.
      mesh.geometry = emptyGeometry;
    }
    for (let index = polygonsUsed; index < polygonPool.length; index++) {
      polygonPool[index]!.visible = false;
    }
    stats.meshDrawCount = meshesUsed;
    stats.polygonDrawCount = polygonsUsed;
    if (meshesUsed + polygonsUsed > 0) {
      const previousAutoClear = renderer.autoClear;
      renderer.autoClear = false;
      try {
        renderer.render(scene, frame.camera);
      } finally {
        renderer.autoClear = previousAutoClear;
      }
    }
    stats.submitMilliseconds = performance.now() - startedAt;
    return stats;
  };

  return {
    render,
    scene,
    dispose() {
      for (const material of ownedMaterials.splice(0)) {
        material.dispose();
      }
      for (const mesh of polygonPool.splice(0)) {
        mesh.geometry.dispose();
      }
      meshPool.length = 0;
      emptyGeometry.dispose();
      countSlots.length = 0;
      fillSlots.length = 0;
      capSlots.length = 0;
      outlineMaterials.clear();
      openChainMaterial = undefined;
      stencilMaterials.clear();
      overlapCapMaterial = undefined;
      scene.clear();
    },
  };
};
