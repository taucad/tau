import * as THREE from 'three';
import { Line2 } from 'three/addons/lines/Line2.js';
import { LineGeometry } from 'three/addons/lines/LineGeometry.js';
import { LineMaterial } from 'three/addons/lines/LineMaterial.js';
import { Line2 as Line2WebGpu } from 'three/addons/lines/webgpu/Line2.js';
import { toRenderPoint } from '@taucad/spatial';
import type { RenderFrame, SpatialBounds } from '@taucad/spatial';
import {
  maxSectionSweep,
  minSectionSweep,
  sectionAxisIndices,
  sectionPlaneAxes,
} from '#components/geometry/graphics/section-cuts.js';
import type {
  SectionAxis,
  SectionCut,
  SectionCutPatch,
  SectionVector,
} from '#components/geometry/graphics/section-cuts.js';
import { Line2NodeMaterial } from '#components/geometry/graphics/three/materials/line2.material.js';
import { matcapMaterial } from '#components/geometry/graphics/three/materials/matcap-material.js';
import { createRafCoalescer } from '#components/geometry/graphics/three/utils/raf-coalescer.js';
import { viewportRenderTiers } from '#components/geometry/graphics/three/utils/render-order.utils.js';
import { sceneTag, sceneTagData } from '#components/geometry/graphics/three/utils/scene-tags.js';
import type { ResolvedGraphicsBackend } from '#constants/editor.constants.js';

/*
 * In-scene section handles: a plane cut's push-pull arrow, a revolution cut's sweep knobs and band, and each cut's
 * outline and fan. Grips are matcap solids; a cut's outline and fan stay faint until the cut is hovered, here or in
 * its chip, or dragged.
 *
 * Grip sizes are screen pixels: `layout` rescales them every changed frame, so a handle reads the same at any zoom.
 * Everything persists across updates. A drag step writes transforms and fixed-size buffers in place, so it links no
 * program and uploads no texture; a drawing is rebuilt only when its cut's kind, plane or axis, or its selection,
 * changes. Grip geometry is shared by every drawing and never disposed; a drawing disposes exactly what it allocated.
 */

export type SectionHandleState = 'static' | 'hover' | 'active';

export type SectionHandleTarget = Readonly<{
  /** `select` is an unselected revolution's fan, which selects its cut; the rest drag the selected cut. */
  kind: 'plane' | 'sweep-start' | 'sweep-end' | 'sweep-band' | 'select';
  cutId: string;
}>;

export type SectionHandle = Readonly<{
  target: SectionHandleTarget;
  /** Meshes the pointer can hit, including invisible proxies. */
  hits: readonly THREE.Object3D[];
  /** Render units: the arrow's origin on its axis, or a point on the fan's plane. Moves in place with the cut. */
  anchor: THREE.Vector3;
  setState: (state: SectionHandleState) => void;
}>;

/** A cut's outline and fan: faint at rest, raised while the cut is hovered or dragged. */
export type SectionChrome = Readonly<{ cutId: string; setState: (state: SectionHandleState) => void }>;

/* Axis colours as the view cube and the section chips use them. */
/* oxlint-disable tau-lint/no-hardcoded-color -- Three.js axis colours */
export const sectionAxisColors: Readonly<Record<SectionAxis, number>> = {
  x: 0xef_44_44,
  y: 0x22_c5_5e,
  z: 0x3b_82_f6,
};
const white = new THREE.Color(0xff_ff_ff);
/* oxlint-enable tau-lint/no-hardcoded-color */

const axisVectors: Readonly<Record<SectionAxis, THREE.Vector3>> = {
  x: new THREE.Vector3(1, 0, 0),
  y: new THREE.Vector3(0, 1, 0),
  z: new THREE.Vector3(0, 0, 1),
};

/** Angle zero about each axis, as the cut model defines it. */
const angleZeroVectors: Readonly<Record<SectionAxis, THREE.Vector3>> = {
  x: axisVectors.y,
  y: axisVectors.z,
  z: axisVectors.x,
};

const degrees = 180 / Math.PI;

/** The unit direction `angle` radians about `axis` from its angle zero. */
const directionAt = (axis: SectionAxis, angle: number, target: THREE.Vector3): THREE.Vector3 => {
  const zero = angleZeroVectors[axis];
  return target
    .crossVectors(axisVectors[axis], zero)
    .multiplyScalar(Math.sin(angle))
    .addScaledVector(zero, Math.cos(angle));
};

type Paint = Readonly<{
  material: { readonly color: THREE.Color; opacity: number };
  base: THREE.Color;
  opacity: Readonly<Record<SectionHandleState, number>>;
  tint?: Readonly<Partial<Record<SectionHandleState, number>>>;
}>;

type Halo = Readonly<{ mesh: THREE.Mesh; material: THREE.MeshBasicMaterial }>;

/** One look per state: colour, opacity, scale, halo and press rim move together. */
export const createHandlePainter =
  ({
    paints,
    scaled,
    halo,
    rim,
    scale = { static: 1, hover: 1.12, active: 1.22 },
  }: Readonly<{
    paints: readonly Paint[];
    scaled?: THREE.Object3D;
    halo?: Halo;
    rim?: THREE.Object3D;
    scale?: Readonly<Record<SectionHandleState, number>>;
  }>) =>
  (state: SectionHandleState): void => {
    for (const { material, base, opacity, tint } of paints) {
      material.color.copy(base).lerp(white, tint?.[state] ?? (state === 'hover' ? 0.22 : 0));
      material.opacity = opacity[state];
    }
    scaled?.scale.setScalar(scale[state]);
    if (halo) {
      halo.mesh.visible = state !== 'static';
      halo.material.opacity = state === 'active' ? 0.4 : 0.22;
    }
    if (rim) {
      rim.visible = state === 'active';
    }
  };

/** Records a resource as its drawing's, so the drawing's teardown disposes exactly what it allocated. */
type Own = <T extends { dispose: () => void }>(resource: T) => T;

/** A drawing's allocations, and its parts `layout` sizes in pixels and turns to the camera. */
type Kit = Readonly<{
  own: Own;
  screenGroups: THREE.Object3D[];
  billboards: THREE.Object3D[];
  dispose: () => void;
}>;

const createKit = (): Kit => {
  const resources: Array<{ dispose: () => void }> = [];
  return {
    own: (resource) => {
      resources.push(resource);
      return resource;
    },
    screenGroups: [],
    billboards: [],
    dispose: () => {
      for (const resource of resources) {
        resource.dispose();
      }
    },
  };
};

/** A fill, fan, halo or press rim: behind a grip that stands in front of it, and hiding nothing itself. */
const tintMaterial = (color: number, opacity: number, own: Own): THREE.MeshBasicMaterial =>
  own(
    new THREE.MeshBasicMaterial({
      color,
      opacity,
      transparent: true,
      depthTest: true,
      depthWrite: false,
      side: THREE.DoubleSide,
      forceSinglePass: true,
      toneMapped: false,
    }),
  );

/**
 * A grip shaded by the viewer's soft matcap: form without gloss, the same under any lighting. Grips write depth,
 * so a grip's own parts hide one another over the depth their overlay clears.
 */
export const createGripMaterial = (color: number): THREE.MeshMatcapMaterial =>
  new THREE.MeshMatcapMaterial({
    color,
    matcap: matcapMaterial(),
    transparent: true,
    depthTest: true,
    depthWrite: true,
    toneMapped: false,
  });

const gripMesh = (geometry: THREE.BufferGeometry, material: THREE.Material): THREE.Mesh => {
  const mesh = new THREE.Mesh(geometry, material);
  mesh.renderOrder = viewportRenderTiers.sectionControlBody;
  return mesh;
};

// Never drawn, so it never takes a program; shared by every proxy.
const hiddenMaterial = new THREE.MeshBasicMaterial({ visible: false });

/** A larger, invisible hit target around a grip. */
const proxy = (geometry: THREE.BufferGeometry): THREE.Mesh => new THREE.Mesh(geometry, hiddenMaterial);

const ringGeometry = (radius: number, width: number): THREE.RingGeometry =>
  new THREE.RingGeometry(radius, radius + width, 48);

/** Grip geometry in pixels, shared by every drawing: created once, never disposed. */
const grips = {
  shaft: new THREE.CylinderGeometry(2.6, 2.6, 92, 24),
  head: new THREE.ConeGeometry(9.5, 22, 40),
  planeBall: new THREE.SphereGeometry(11, 40, 24),
  planeRim: ringGeometry(12.5, 2.5),
  planeHalo: ringGeometry(17, 5),
  planeHit: new THREE.CylinderGeometry(14, 14, 136, 8),
  knobBall: new THREE.SphereGeometry(9, 36, 20),
  knobRim: ringGeometry(10.5, 2.5),
  knobHalo: ringGeometry(14, 5),
  knobHit: new THREE.SphereGeometry(16, 12, 8),
  /** A plane cut's fill, scaled to its outline. */
  unitPlane: new THREE.PlaneGeometry(1, 1),
};

/** A billboard ring around a grip: the halo for hover and active. */
const halo = (geometry: THREE.BufferGeometry, color: number, kit: Kit): Halo => {
  const material = tintMaterial(color, 0.22, kit.own);
  const mesh = gripMesh(geometry, material);
  mesh.visible = false;
  kit.billboards.push(mesh);
  return { mesh, material };
};

/** The white rim a pressed grip wears. */
const pressRim = (geometry: THREE.BufferGeometry, kit: Kit): THREE.Mesh => {
  const mesh = gripMesh(geometry, tintMaterial(0xff_ff_ff, 0.95, kit.own));
  mesh.visible = false;
  kit.billboards.push(mesh);
  return mesh;
};

/** A group drawn in pixels: `layout` scales it by the world size of one pixel where it stands. */
const screenGroup = (kit: Kit): THREE.Group => {
  const group = new THREE.Group();
  kit.screenGroups.push(group);
  return group;
};

type FatLine = Readonly<{ line: THREE.Mesh; geometry: LineGeometry; material: LineMaterial | Line2NodeMaterial }>;

/**
 * A 1.5 px line with a fixed point count: WebGL `LineMaterial` or Tau's `Line2NodeMaterial`, whose transparent
 * composite matches WebGL's blend. Its buffer is sized once and written in place (`writeLinePoints`).
 */
const fatLine = ({
  backend,
  color,
  pointCount,
  own,
}: Readonly<{ backend: ResolvedGraphicsBackend; color: number; pointCount: number; own: Own }>): FatLine => {
  const geometry = own(new LineGeometry());
  geometry.setPositions(new Float32Array(pointCount * 3));
  const parameters = {
    color,
    linewidth: 1.5,
    opacity: 0,
    transparent: true,
    depthTest: false,
    depthWrite: false,
    toneMapped: false,
  };
  if (backend === 'webgpu') {
    const material = own(new Line2NodeMaterial({ ...parameters, worldUnits: false }));
    return { line: new Line2WebGpu(geometry, material), geometry, material };
  }
  const material = own(new LineMaterial(parameters));
  return { line: new Line2(geometry, material), geometry, material };
};

/** Writes a polyline into a fat line's segments in place; the point count is the one it was sized for. */
const writeLinePoints = (geometry: LineGeometry, points: readonly number[]): void => {
  const segments = geometry.getAttribute('instanceStart');
  if (!(segments instanceof THREE.InterleavedBufferAttribute)) {
    return;
  }
  const { array } = segments.data;
  for (let point = 0; point + 3 < points.length; point += 3) {
    for (let component = 0; component < 6; component++) {
      array[point * 2 + component] = points[point + component] ?? 0;
    }
  }
  segments.data.needsUpdate = true;
  geometry.computeBoundingBox();
  geometry.computeBoundingSphere();
};

const fanSegmentsFor = (sweep: number): number => Math.max(12, Math.ceil(sweep * 20));
const fullTurnFanSegments = fanSegmentsFor(Math.PI * 2);

/** A fan whose buffers hold a full turn's segments (`CircleGeometry`'s layout), so any sweep is written in place. */
const fanGeometry = (own: Own): THREE.BufferGeometry => {
  const index: number[] = [];
  for (let segment = 1; segment <= fullTurnFanSegments; segment++) {
    index.push(segment, segment + 1, 0);
  }
  return own(new THREE.BufferGeometry())
    .setAttribute('position', new THREE.BufferAttribute(new Float32Array((fullTurnFanSegments + 2) * 3), 3))
    .setIndex(index);
};

const writeFan = (
  geometry: THREE.BufferGeometry,
  { radius, start, sweep }: Readonly<{ radius: number; start: number; sweep: number }>,
): void => {
  const segments = fanSegmentsFor(sweep);
  const position = geometry.getAttribute('position');
  position.setXYZ(0, 0, 0, 0);
  for (let segment = 0; segment <= segments; segment++) {
    const angle = start + (segment / segments) * sweep;
    position.setXYZ(segment + 1, radius * Math.cos(angle), radius * Math.sin(angle), 0);
  }
  // Unused vertices sit on the centre, inside the sector, which keeps the bounding sphere that orders
  // transparent draws the sector's own.
  for (let vertex = segments + 2; vertex < position.count; vertex++) {
    position.setXYZ(vertex, 0, 0, 0);
  }
  position.needsUpdate = true;
  geometry.setDrawRange(0, segments * 3);
  geometry.computeBoundingSphere();
};

/** The model box in render units, from the camera's bounds (metres) and the view's render frame. */
type Model = Readonly<{
  key: string;
  renderFrame: RenderFrame;
  box: THREE.Box3;
  /** The box grown by 4% of its diagonal, which a plane's outline follows. */
  grown: THREE.Box3;
  /** The bounds centre in metres, which a plane's arrow stands on. */
  centerMeters: readonly [number, number, number];
}>;

const createModel = (bounds: SpatialBounds, renderFrame: RenderFrame, key: string): Model => {
  const box = new THREE.Box3(
    new THREE.Vector3(...toRenderPoint({ renderFrame, point: bounds.min })),
    new THREE.Vector3(...toRenderPoint({ renderFrame, point: bounds.max })),
  );
  return {
    key,
    renderFrame,
    box,
    grown: box.clone().expandByScalar(box.getSize(new THREE.Vector3()).length() * 0.04),
    centerMeters: [
      (bounds.min[0] + bounds.max[0]) / 2,
      (bounds.min[1] + bounds.max[1]) / 2,
      (bounds.min[2] + bounds.max[2]) / 2,
    ],
  };
};

type Drawing = Readonly<{
  group: THREE.Group;
  handles: readonly SectionHandle[];
  chrome: SectionChrome;
  screenGroups: readonly THREE.Object3D[];
  billboards: readonly THREE.Object3D[];
  /** Moves the drawing to the cut's values and the model, in place. */
  place: (cut: SectionCut, model: Model) => void;
  dispose: () => void;
}>;

const tagDrawing = (group: THREE.Group, handles: readonly SectionHandle[]): void => {
  group.traverse((object) => {
    Object.assign(object.userData, sceneTagData(sceneTag.sectionViewHelper));
  });
  // The e2e bridge finds a handle by this name.
  for (const { target, hits } of handles) {
    for (const hit of hits) {
      hit.name = `${target.kind}:${target.cutId}`;
    }
  }
};

// Scratch for `place`, which runs once per drag step.
const scratchOrigin = new THREE.Vector3();
const scratchCorner = new THREE.Vector3();
const scratchCenter = new THREE.Vector3();
const scratchDirection = new THREE.Vector3();
const scratchBasis = new THREE.Matrix4();

// ---------------------------------------------------------------------------
// Plane: its outline on the model's grown bounds, and a double-headed push-pull arrow
// ---------------------------------------------------------------------------

type PlaneCut = Extract<SectionCut, { kind: 'plane' }>;
type RevolutionCut = Extract<SectionCut, { kind: 'revolution' }>;

type DrawingOptions<Cut extends SectionCut> = Readonly<{
  cut: Cut;
  isSelected: boolean;
  model: Model;
  backend: ResolvedGraphicsBackend;
}>;

const planeDrawing = ({ cut, isSelected, model, backend }: DrawingOptions<PlaneCut>): Drawing => {
  const kit = createKit();
  const { own } = kit;
  const group = new THREE.Group();
  const axis = sectionPlaneAxes[cut.plane];
  const axisIndex = sectionAxisIndices[axis];
  const color = sectionAxisColors[axis];
  const base = new THREE.Color(color);
  const normal = axisVectors[axis];
  // The outline's in-plane axes, as the plane's own basis; both lie along world axes.
  const uAxis = new THREE.Vector3()
    .crossVectors(normal, Math.abs(normal.z) < 0.9 ? axisVectors.z : axisVectors.x)
    .normalize();
  const vAxis = new THREE.Vector3().crossVectors(normal, uAxis);

  const outline = fatLine({ backend, color, pointCount: 5, own });
  const fillMaterial = tintMaterial(color, 0, own);
  const fill = new THREE.Mesh(grips.unitPlane, fillMaterial);
  fill.quaternion.setFromRotationMatrix(scratchBasis.makeBasis(uAxis, vAxis, normal));
  group.add(outline.line, fill);
  const chrome: SectionChrome = {
    cutId: cut.id,
    setState: createHandlePainter({
      paints: [
        { material: outline.material, base, opacity: { static: isSelected ? 0.22 : 0.12, hover: 0.85, active: 1 } },
        { material: fillMaterial, base, opacity: { static: 0, hover: 0.05, active: 0.08 } },
      ],
    }),
  };
  chrome.setState('static');

  // An unselected plane takes no presses: its area covers the model, which orbit and Measure keep. Its chip selects it.
  let arrow: THREE.Group | undefined;
  const handles: SectionHandle[] = [];
  if (isSelected) {
    arrow = screenGroup(kit);
    const body = new THREE.Group();
    const bodyMaterial = own(createGripMaterial(color));
    const headUp = gripMesh(grips.head, bodyMaterial);
    headUp.position.y = 56;
    const headDown = gripMesh(grips.head, bodyMaterial);
    headDown.position.y = -56;
    headDown.rotation.z = Math.PI;
    const ball = gripMesh(grips.planeBall, bodyMaterial);
    const rim = pressRim(grips.planeRim, kit);
    body.add(gripMesh(grips.shaft, bodyMaterial), headUp, headDown, ball, rim);
    const glow = halo(grips.planeHalo, color, kit);
    const hit = proxy(grips.planeHit);
    arrow.add(body, glow.mesh, hit);
    arrow.quaternion.setFromUnitVectors(axisVectors.y, normal);
    group.add(arrow);
    const setArrow = createHandlePainter({
      paints: [
        {
          material: bodyMaterial,
          base,
          opacity: { static: 0.92, hover: 1, active: 1 },
          tint: { hover: 0.18, active: 0.08 },
        },
      ],
      scaled: body,
      halo: glow,
      rim,
    });
    setArrow('static');
    handles.push({
      target: { kind: 'plane', cutId: cut.id },
      hits: [hit, ball],
      anchor: arrow.position,
      setState: setArrow,
    });
  }

  const place = (next: SectionCut, { renderFrame, grown, centerMeters }: Model): void => {
    if (next.kind !== 'plane') {
      return;
    }
    const pointMeters: [number, number, number] = [...centerMeters];
    pointMeters[axisIndex] = next.offset;
    const origin = scratchOrigin.set(...toRenderPoint({ renderFrame, point: pointMeters }));
    const size = grown.getSize(scratchCorner);
    const halfU = Math.abs(size.dot(uAxis)) / 2;
    const halfV = Math.abs(size.dot(vAxis)) / 2;
    const points: number[] = [];
    for (const [u, v] of [
      [-1, -1],
      [1, -1],
      [1, 1],
      [-1, 1],
      [-1, -1],
    ] as const) {
      const corner = scratchCenter
        .copy(origin)
        .addScaledVector(uAxis, u * halfU)
        .addScaledVector(vAxis, v * halfV);
      points.push(corner.x, corner.y, corner.z);
    }
    writeLinePoints(outline.geometry, points);
    fill.position.copy(origin);
    fill.scale.set(halfU * 2, halfV * 2, 1);
    arrow?.position.copy(origin);
  };
  place(cut, model);
  tagDrawing(group, handles);
  return {
    group,
    handles,
    chrome,
    screenGroups: kit.screenGroups,
    billboards: kit.billboards,
    place,
    dispose: () => {
      group.removeFromParent();
      kit.dispose();
    },
  };
};

// ---------------------------------------------------------------------------
// Revolution: a sweep fan past the axis end, a knob at each end of the sweep, and the dashed axis
// ---------------------------------------------------------------------------

const arcSteps = 64;

const revolutionDrawing = ({ cut, isSelected, model, backend }: DrawingOptions<RevolutionCut>): Drawing => {
  const kit = createKit();
  const { own } = kit;
  const group = new THREE.Group();
  const axis = axisVectors[cut.axis];
  const color = sectionAxisColors[cut.axis];
  const base = new THREE.Color(color);

  // The fan lies across the axis; its angle zero is the cut's.
  const zero = angleZeroVectors[cut.axis];
  const fanPlane = new THREE.Group();
  fanPlane.quaternion.setFromRotationMatrix(
    scratchBasis.makeBasis(zero, new THREE.Vector3().crossVectors(axis, zero), axis),
  );
  const fanMaterial = tintMaterial(color, 0, own);
  const fan = new THREE.Mesh(fanGeometry(own), fanMaterial);
  const arc = fatLine({ backend, color, pointCount: arcSteps + 3, own });
  fanPlane.add(fan, arc.line);
  group.add(fanPlane);
  // The axis itself, dashed through the model.
  const axisMaterial = own(
    new THREE.LineDashedMaterial({
      color,
      opacity: 0,
      transparent: true,
      depthTest: false,
      depthWrite: false,
      toneMapped: false,
    }),
  );
  const axisGeometry = own(new THREE.BufferGeometry())
    .setAttribute('position', new THREE.BufferAttribute(new Float32Array(6), 3))
    .setAttribute('lineDistance', new THREE.BufferAttribute(new Float32Array(2), 1));
  group.add(new THREE.Line(axisGeometry, axisMaterial));

  const chrome: SectionChrome = {
    cutId: cut.id,
    setState: createHandlePainter({
      paints: [
        { material: fanMaterial, base, opacity: { static: 0, hover: 0.1, active: 0.16 } },
        { material: arc.material, base, opacity: { static: isSelected ? 0.14 : 0.07, hover: 0.6, active: 0.8 } },
        { material: axisMaterial, base, opacity: { static: isSelected ? 0.1 : 0.05, hover: 0.4, active: 0.5 } },
      ],
    }),
  };
  chrome.setState('static');

  // The band turns the whole cut; an unselected cut's fan selects it. The cut's chrome is its look.
  const band: SectionHandle = {
    target: { kind: isSelected ? 'sweep-band' : 'select', cutId: cut.id },
    hits: [fan],
    anchor: new THREE.Vector3(),
    setState: () => undefined,
  };
  const knob = (kind: 'sweep-start' | 'sweep-end'): SectionHandle => {
    const knobGroup = screenGroup(kit);
    const body = new THREE.Group();
    const material = own(createGripMaterial(color));
    const ball = gripMesh(grips.knobBall, material);
    const rim = pressRim(grips.knobRim, kit);
    body.add(ball, rim);
    const glow = halo(grips.knobHalo, color, kit);
    const hit = proxy(grips.knobHit);
    knobGroup.add(body, glow.mesh, hit);
    group.add(knobGroup);
    const setState = createHandlePainter({
      paints: [{ material, base, opacity: { static: 0.95, hover: 1, active: 1 }, tint: { hover: 0.18, active: 0.08 } }],
      scaled: body,
      halo: glow,
      rim,
    });
    setState('static');
    return { target: { kind, cutId: cut.id }, hits: [hit, ball], anchor: knobGroup.position, setState };
  };
  const handles = isSelected ? [band, knob('sweep-start'), knob('sweep-end')] : [band];

  const place = (next: SectionCut, { renderFrame, box }: Model): void => {
    if (next.kind !== 'revolution') {
      return;
    }
    const origin = scratchOrigin.set(...toRenderPoint({ renderFrame, point: next.origin }));
    let tEnd = -Infinity;
    let reach = 0;
    for (const x of [box.min.x, box.max.x]) {
      for (const y of [box.min.y, box.max.y]) {
        for (const z of [box.min.z, box.max.z]) {
          const corner = scratchCorner.set(x, y, z).sub(origin);
          const along = corner.dot(axis);
          tEnd = Math.max(tEnd, along);
          reach = Math.max(reach, corner.addScaledVector(axis, -along).length());
        }
      }
    }
    const radius = reach * 0.42;
    const center = scratchCenter.copy(origin).addScaledVector(axis, tEnd + reach * 0.06);
    const start = next.start / degrees;
    const sweep = next.sweep / degrees;
    fanPlane.position.copy(center);
    writeFan(fan.geometry, { radius, start, sweep });
    const arcPoints: number[] = [0, 0, 0];
    for (let step = 0; step <= arcSteps; step++) {
      const angle = start + (sweep * step) / arcSteps;
      arcPoints.push(Math.cos(angle) * radius, Math.sin(angle) * radius, 0);
    }
    arcPoints.push(0, 0, 0);
    writeLinePoints(arc.geometry, arcPoints);

    const axisPosition = axisGeometry.getAttribute('position');
    const axisStart = scratchCorner.copy(origin).addScaledVector(axis, -tEnd * 1.2);
    axisPosition.setXYZ(0, axisStart.x, axisStart.y, axisStart.z);
    axisPosition.setXYZ(1, center.x, center.y, center.z);
    axisPosition.needsUpdate = true;
    const lineDistance = axisGeometry.getAttribute('lineDistance');
    lineDistance.setX(1, axisStart.distanceTo(center));
    lineDistance.needsUpdate = true;
    axisGeometry.computeBoundingSphere();
    axisMaterial.dashSize = reach * 0.04;
    axisMaterial.gapSize = reach * 0.03;

    band.anchor.copy(center).addScaledVector(directionAt(next.axis, start + sweep / 2, scratchDirection), radius / 2);
    const [, startKnob, endKnob] = handles;
    startKnob?.anchor.copy(center).addScaledVector(directionAt(next.axis, start, scratchDirection), radius);
    endKnob?.anchor.copy(center).addScaledVector(directionAt(next.axis, start + sweep, scratchDirection), radius);
  };
  place(cut, model);
  tagDrawing(group, handles);
  return {
    group,
    handles,
    chrome,
    screenGroups: kit.screenGroups,
    billboards: kit.billboards,
    place,
    dispose: () => {
      group.removeFromParent();
      kit.dispose();
    },
  };
};

// ---------------------------------------------------------------------------
// Screen scale
// ---------------------------------------------------------------------------

const scratchView = new THREE.Vector3();

/** The world size of one screen pixel at `at`. */
const worldPerPixel = (camera: THREE.Camera, at: THREE.Vector3, heightPx: number): number => {
  if (camera instanceof THREE.OrthographicCamera) {
    return (camera.top - camera.bottom) / camera.zoom / heightPx;
  }
  if (camera instanceof THREE.PerspectiveCamera) {
    const depth = scratchView.copy(at).applyMatrix4(camera.matrixWorldInverse).z;
    return (2 * Math.abs(depth) * Math.tan(camera.fov / degrees / 2)) / camera.zoom / heightPx;
  }
  return 1;
};

// ---------------------------------------------------------------------------
// The section tool's drawing, kept across updates
// ---------------------------------------------------------------------------

export type SectionHandlesUpdate = Readonly<{
  cuts: readonly SectionCut[];
  selectedId: string | undefined;
  /** The model's bounds, metres. */
  bounds: SpatialBounds;
  renderFrame: RenderFrame;
}>;

export type SectionHandles = Readonly<{
  /** Every drawing; mount it in an overlay drawn after a depth clear. */
  root: THREE.Group;
  /** Current handles; a handle keeps its identity while its cut's kind, plane or axis and selection hold. */
  readonly handles: readonly SectionHandle[];
  readonly chromes: readonly SectionChrome[];
  /** Brings the drawings up to date in place, rebuilding only a cut whose kind, plane or axis or selection changed. */
  update: (update: SectionHandlesUpdate) => void;
  /** Paints every handle and chrome for the pointer's hover and press and the hovered cut. */
  paint: (
    states: Readonly<{ hovered?: SectionHandle; active?: SectionHandle; hoveredCutId: string | undefined }>,
  ) => void;
  /** Scales grips to their pixel size and turns their rings to the camera; does nothing while nothing changed. */
  layout: (camera: THREE.Camera, heightPx: number) => void;
  dispose: () => void;
}>;

type Entry = { readonly key: string; cut: SectionCut; readonly drawing: Drawing };

/**
 * One drawing of each kind, never drawn: a selected plane and a selected revolution on a unit model, with their
 * halos and press rims shown. Warm `root` once with the renderer's `compileAsync` and keep it: while its materials
 * live their programs stay compiled, so the drawings built when Section turns on or the selection changes link none.
 */
export const createSectionHandlesWarmup = ({
  backend,
}: Readonly<{ backend: ResolvedGraphicsBackend }>): Readonly<{ root: THREE.Object3D; dispose: () => void }> => {
  const model = createModel(
    { min: [-1, -1, -1], max: [1, 1, 1] },
    { anchorFrameId: 'tau:root', originMeters: [0, 0, 0], metersPerRenderUnit: 1 },
    'warmup',
  );
  const drawings = [
    planeDrawing({
      cut: { id: 'warmup-plane', kind: 'plane', plane: 'xy', offset: 0, isFlipped: false },
      isSelected: true,
      model,
      backend,
    }),
    revolutionDrawing({
      cut: { id: 'warmup-revolution', kind: 'revolution', axis: 'z', origin: [0, 0, 0], start: 0, sweep: 90 },
      isSelected: true,
      model,
      backend,
    }),
  ];
  const root = new THREE.Group();
  for (const drawing of drawings) {
    for (const handle of drawing.handles) {
      handle.setState('active');
    }
    root.add(drawing.group);
  }
  // Hit proxies are never drawn, so compiling them would only waste a program.
  const hitProxies = root.getObjectsByProperty('material', hiddenMaterial);
  for (const hitProxy of hitProxies) {
    hitProxy.removeFromParent();
  }
  return {
    root,
    dispose: () => {
      for (const drawing of drawings) {
        drawing.dispose();
      }
    },
  };
};

/** Everything the section tool draws in the model's space, in render units, updated in place as the cuts change. */
export const createSectionHandles = ({ backend }: Readonly<{ backend: ResolvedGraphicsBackend }>): SectionHandles => {
  const root = new THREE.Group();
  Object.assign(root.userData, sceneTagData(sceneTag.sectionViewHelper));
  let entries = new Map<string, Entry>();
  let model: Model | undefined;
  let applied: Readonly<{ cuts: readonly SectionCut[]; selectedId: string | undefined }> | undefined;
  let handles: readonly SectionHandle[] = [];
  let chromes: readonly SectionChrome[] = [];
  let screenGroups: readonly THREE.Object3D[] = [];
  let billboards: readonly THREE.Object3D[] = [];
  let version = 0;
  const laidOut = new Float64Array(34);
  const cameraQuaternion = new THREE.Quaternion();
  const parentQuaternion = new THREE.Quaternion();

  const isLaidOut = (camera: THREE.Camera, heightPx: number): boolean => {
    const values = [...camera.matrixWorld.elements, ...camera.projectionMatrix.elements, heightPx, version];
    let isSame = true;
    for (const [index, value] of values.entries()) {
      if (laidOut[index] !== value) {
        laidOut[index] = value;
        isSame = false;
      }
    }
    return isSame;
  };

  return {
    root,
    get handles() {
      return handles;
    },
    get chromes() {
      return chromes;
    },
    update({ cuts, selectedId, bounds, renderFrame }) {
      const modelKey = [
        ...bounds.min,
        ...bounds.max,
        ...renderFrame.originMeters,
        renderFrame.metersPerRenderUnit,
      ].join(',');
      const isModelChanged = modelKey !== model?.key;
      if (!isModelChanged && applied?.cuts === cuts && applied.selectedId === selectedId) {
        return;
      }
      applied = { cuts, selectedId };
      if (!model || isModelChanged) {
        model = createModel(bounds, renderFrame, modelKey);
      }
      const next = new Map<string, Entry>();
      for (const cut of cuts) {
        const isSelected = cut.id === selectedId;
        const key = `${cut.kind}:${cut.kind === 'plane' ? cut.plane : cut.axis}:${isSelected}`;
        let entry = entries.get(cut.id);
        if (entry?.key !== key) {
          entry?.drawing.dispose();
          const drawing =
            cut.kind === 'plane'
              ? planeDrawing({ cut, isSelected, model, backend })
              : revolutionDrawing({ cut, isSelected, model, backend });
          root.add(drawing.group);
          entry = { key, cut, drawing };
        } else if (entry.cut !== cut || isModelChanged) {
          entry.drawing.place(cut, model);
          entry.cut = cut;
        }
        next.set(cut.id, entry);
      }
      for (const [id, entry] of entries) {
        if (!next.has(id)) {
          entry.drawing.dispose();
        }
      }
      entries = next;
      const drawings = [...entries.values()].map((entry) => entry.drawing);
      handles = drawings.flatMap((drawing) => drawing.handles);
      chromes = drawings.map((drawing) => drawing.chrome);
      screenGroups = drawings.flatMap((drawing) => drawing.screenGroups);
      billboards = drawings.flatMap((drawing) => drawing.billboards);
      version++;
    },
    paint({ hovered, active, hoveredCutId }) {
      for (const handle of handles) {
        const { kind, cutId } = handle.target;
        const isChipHovered = !active && kind !== 'select' && cutId === hoveredCutId;
        handle.setState(handle === active ? 'active' : handle === hovered || isChipHovered ? 'hover' : 'static');
      }
      for (const chrome of chromes) {
        const isHovered = hovered?.target.cutId === chrome.cutId || hoveredCutId === chrome.cutId;
        chrome.setState(active?.target.cutId === chrome.cutId ? 'active' : !active && isHovered ? 'hover' : 'static');
      }
    },
    layout(camera, heightPx) {
      camera.updateMatrixWorld();
      if (heightPx <= 0 || isLaidOut(camera, heightPx)) {
        return;
      }
      for (const group of screenGroups) {
        group.scale.setScalar(worldPerPixel(camera, group.position, heightPx));
      }
      root.updateMatrixWorld(true);
      camera.getWorldQuaternion(cameraQuaternion);
      for (const ring of billboards) {
        ring.parent?.getWorldQuaternion(parentQuaternion);
        ring.quaternion.copy(parentQuaternion.invert().multiply(cameraQuaternion));
      }
      root.updateMatrixWorld(true);
    },
    dispose() {
      for (const entry of entries.values()) {
        entry.drawing.dispose();
      }
      entries = new Map();
      applied = undefined;
      handles = [];
      chromes = [];
      screenGroups = [];
      billboards = [];
    },
  };
};

// ---------------------------------------------------------------------------
// Drag math
// ---------------------------------------------------------------------------

/** Degrees in [0, 360). */
const wrapDegrees = (angle: number): number => ((angle % 360) + 360) % 360;

/** Snaps to a multiple of 15° within 2°, the way a protractor clicks, and otherwise to a whole degree. */
export const snapSectionAngle = (angle: number): number => {
  const nearest = Math.round(angle / 15) * 15;
  return Math.abs(nearest - angle) < 2 ? nearest : Math.round(angle);
};

const clampSweep = (sweep: number): number => THREE.MathUtils.clamp(sweep, minSectionSweep, maxSectionSweep);

const scratchRayOffset = new THREE.Vector3();
const scratchPlane = new THREE.Plane();
const scratchHit = new THREE.Vector3();
const scratchQuarter = new THREE.Vector3();

/**
 * The drag parameter under a pointer ray (render units): a plane cut's distance along its axis from `anchor`, the
 * arrow's origin at the press, or a revolution cut's angle in degrees on the fan's plane through `anchor`.
 * Undefined when the ray runs along the axis or misses the fan's plane.
 */
export const resolveSectionDragParameter = ({
  ray,
  cut,
  anchor,
  renderFrame,
}: Readonly<{ ray: THREE.Ray; cut: SectionCut; anchor: THREE.Vector3; renderFrame: RenderFrame }>):
  | number
  | undefined => {
  if (cut.kind === 'plane') {
    // The point on the axis line through `anchor` nearest the ray.
    const axis = axisVectors[sectionPlaneAxes[cut.plane]];
    const offset = scratchRayOffset.copy(ray.origin).sub(anchor);
    const alignment = ray.direction.dot(axis);
    const denominator = 1 - alignment * alignment;
    return denominator < 1e-4 ? undefined : (offset.dot(axis) - alignment * offset.dot(ray.direction)) / denominator;
  }
  const axis = axisVectors[cut.axis];
  const hit = ray.intersectPlane(scratchPlane.setFromNormalAndCoplanarPoint(axis, anchor), scratchHit);
  if (!hit) {
    return undefined;
  }
  hit.sub(scratchRayOffset.set(...toRenderPoint({ renderFrame, point: cut.origin })));
  const zero = angleZeroVectors[cut.axis];
  const quarter = scratchQuarter.crossVectors(axis, zero);
  return wrapDegrees(Math.atan2(hit.dot(quarter), hit.dot(zero)) * degrees);
};

/**
 * The patch a drag makes, from the cut as it was at the press. A plane moves by the axis distance dragged, in
 * metres rounded to the millimetre, and stays within the offset field's range; the band turns the cut; the start
 * knob moves the start and keeps the end; the end knob sets the sweep. A knob stops where the sweep leaves the cut
 * model's range before its angle snaps by {@link snapSectionAngle}, so it never jumps across the range.
 */
export const resolveSectionDragPatch = ({
  kind,
  cut,
  startParameter,
  parameter,
  metersPerRenderUnit,
  bounds,
}: Readonly<{
  kind: SectionHandleTarget['kind'];
  cut: SectionCut;
  startParameter: number;
  parameter: number;
  metersPerRenderUnit: number;
  /**
   * The model's bounds centre and radius, metres: a plane stays within the centre ± 2 × radius along its axis. A
   * radius of zero, while the bounds are not known yet, leaves it open.
   */
  bounds?: Readonly<{ center: SectionVector; radius: number }>;
}>): SectionCutPatch | undefined => {
  if (cut.kind === 'plane') {
    if (kind !== 'plane') {
      return undefined;
    }
    const offset = Math.round((cut.offset + (parameter - startParameter) * metersPerRenderUnit) * 1000) / 1000;
    if (!bounds || !(bounds.radius > 0)) {
      return { offset };
    }
    const center = bounds.center[sectionAxisIndices[sectionPlaneAxes[cut.plane]]];
    return { offset: THREE.MathUtils.clamp(offset, center - 2 * bounds.radius, center + 2 * bounds.radius) };
  }
  if (kind === 'sweep-band') {
    return { start: snapSectionAngle(wrapDegrees(cut.start + parameter - startParameter)) };
  }
  if (kind === 'sweep-start') {
    const end = cut.start + cut.sweep;
    const sweepTo = (start: number): number => clampSweep(wrapDegrees(end - start));
    // Clamped again after the snap: a start snapped past the range's edge would move the end.
    const sweep = sweepTo(snapSectionAngle(end - sweepTo(parameter)));
    return { start: wrapDegrees(end - sweep), sweep };
  }
  if (kind === 'sweep-end') {
    return { sweep: snapSectionAngle(clampSweep(wrapDegrees(parameter - cut.start))) };
  }
  return undefined;
};

export type SectionDragSteps = Readonly<{
  /** Applies a frame's first step now; a later step in the same frame waits for its callback, the latest winning. */
  schedule: (step: () => void) => void;
  /** Applies a waiting step now: the drag's release. */
  flush: () => void;
  /** Drops a waiting step: its cut changed under the drag. */
  cancel: () => void;
}>;

/**
 * Sends drag steps at most once per animation frame, the latest winning. A frame's first step applies at once:
 * applied from the frame callback it would miss a frame R3F had already queued and leave the cut a frame behind
 * the pointer.
 */
export const createSectionDragSteps = (): SectionDragSteps => {
  // The step waiting for the frame callback, or 'applied' once the frame's first step went out.
  let frameStep: (() => void) | 'applied' | undefined;
  const takeWaitingStep = (): (() => void) | undefined => {
    const step = frameStep;
    frameStep = undefined;
    return step === 'applied' ? undefined : step;
  };
  const frame = createRafCoalescer<true>(() => {
    takeWaitingStep()?.();
  });
  return {
    schedule(step) {
      if (frameStep !== undefined) {
        frameStep = step;
        return;
      }
      frameStep = 'applied';
      step();
      frame.schedule(true);
    },
    flush() {
      frame.cancel();
      takeWaitingStep()?.();
    },
    cancel() {
      frame.cancel();
      frameStep = undefined;
    },
  };
};
