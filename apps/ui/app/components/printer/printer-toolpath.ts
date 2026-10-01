/** Compact instanced filament and indexed travel, revealed without rebuilding buffers. @module */

import * as THREE from 'three';
import { segmentAtTime, toolpathSegmentKinds } from '@taucad/slicer/toolpath';
import type { ToolpathProgram, ToolpathSegmentKind } from '@taucad/slicer/toolpath';
import { printerToolpath, printerAccent } from '#components/printer/printer-colors.constants.js';
import { createBeadData } from '#components/printer/printer-bead-data.js';
import type { BeadChunk, BeadData } from '#components/printer/printer-bead-data.js';
import {
  createFilamentMaterialForBackend,
  createFilamentUniforms,
  filamentModes,
} from '#components/printer/printer-filament-material.js';
import type { FilamentMode, FilamentUniforms } from '#components/printer/printer-filament-material.js';
import { layerAtTime } from '#components/printer/printer-playback.js';

import { groupToolpath, movingGroups, toolpathGroups } from '#components/printer/printer-toolpath-groups.js';
import type { ToolpathGroup, ToolpathGrouping } from '#components/printer/printer-toolpath-groups.js';
/** Tint per segment kind. */
export type ToolpathPalette = Readonly<Record<ToolpathSegmentKind, THREE.Color>> &
  Readonly<{ muted: THREE.Color; trail: THREE.Color }>;

/** How far the active layer brightens toward the highlight tint. */
const activeBrighten = 0.3;

/** Build the palette for one filament colour and theme. */
export const createToolpathPalette = (
  filament: string,
  theme: 'light' | 'dark',
  plateColor?: string,
): ToolpathPalette => {
  const outer = new THREE.Color(filament);
  const travel = new THREE.Color(printerToolpath.travel[theme]);
  return {
    'outer-wall': outer,
    'inner-wall': outer.clone().offsetHSL(0, -0.08, -0.1),
    infill: outer.clone().offsetHSL(0, -0.3, -0.18),
    support: new THREE.Color(printerToolpath.support),
    'support-interface': new THREE.Color(printerToolpath.support),
    bridge: outer.clone(),
    ironing: outer.clone(),
    skirt: new THREE.Color(printerToolpath.skirt),
    brim: new THREE.Color(printerToolpath.brim),
    purge: new THREE.Color(
      plateColor && new THREE.Color(plateColor).getHSL({ h: 0, s: 0, l: 0 }).l < 0.1
        ? printerToolpath.preparationOnDark
        : printerToolpath.preparation,
    ),
    travel,
    retract: travel,
    wipe: travel,
    unknown: new THREE.Color(printerToolpath.unknown),
    muted: new THREE.Color(printerToolpath.muted[theme]),
    trail: outer.clone().lerp(new THREE.Color(printerToolpath.highlight), 0.55),
  };
};

/** Where the nozzle is at the cursor: inside the current segment or parked at its ends. */
export const headPositionAt = (
  program: Pick<ToolpathProgram, 'positions' | 'times' | 'segmentCount'>,
  time: number,
  target: THREE.Vector3,
): number => {
  const segment = segmentAtTime(program, time);
  if (segment < 0) {
    return segment;
  }
  if (segment >= program.segmentCount) {
    const last = (program.segmentCount - 1) * 6;
    target.set(program.positions[last + 3]!, program.positions[last + 4]!, program.positions[last + 5]!);
    return segment;
  }
  const offset = segment * 6;
  const start = program.times[segment * 2]!;
  const end = program.times[segment * 2 + 1]!;
  const fraction = end > start ? Math.min(1, Math.max(0, (time - start) / (end - start))) : 1;
  target.set(
    program.positions[offset]! + (program.positions[offset + 3]! - program.positions[offset]!) * fraction,
    program.positions[offset + 1]! + (program.positions[offset + 4]! - program.positions[offset + 1]!) * fraction,
    program.positions[offset + 2]! + (program.positions[offset + 5]! - program.positions[offset + 2]!) * fraction,
  );
  return segment;
};

/** One renderer owns GPU resources; CPU instances are immutable and may be shared. */
export type ToolpathReveal = {
  readonly lines: THREE.Group;
  readonly trail: THREE.Group;
  readonly chunks: ReadonlyArray<{ mesh: THREE.Mesh<THREE.InstancedBufferGeometry>; data: BeadChunk }>;
  readonly groupLines: ReadonlyArray<THREE.LineSegments<THREE.BufferGeometry, THREE.LineBasicMaterial> | undefined>;
  readonly active: THREE.Mesh<THREE.InstancedBufferGeometry>;
  readonly uniforms: FilamentUniforms;
  readonly activeUniforms: FilamentUniforms;
  readonly palette: THREE.DataTexture;
  readonly groupOf: Uint8Array<ArrayBuffer>;
  activeLayer: number;
  time: number;
  visibilityGeneration: number;
  appliedVisibilityGeneration: number;
  readonly dispose: () => void;
};

/** Ten profile points include the two ends of each supported flat face. */
const profilePoints: ReadonlyArray<readonly [number, number, number]> = [
  [1, 0, 1],
  [Math.SQRT1_2, Math.SQRT1_2, 1],
  [0, 1, 1],
  [0, 1, -1],
  [-Math.SQRT1_2, Math.SQRT1_2, -1],
  [-1, 0, -1],
  [-Math.SQRT1_2, -Math.SQRT1_2, -1],
  [0, -1, -1],
  [0, -1, 1],
  [Math.SQRT1_2, -Math.SQRT1_2, 1],
];

const createProfile = (): THREE.BufferGeometry => {
  const positions: number[] = [];
  const normals: number[] = [];
  const profiles: number[] = [];
  const indices: number[] = [];
  for (const along of [0, 1]) {
    for (const [cosine, sine, side] of profilePoints) {
      positions.push(cosine, sine, along);
      normals.push(cosine, sine, 0);
      profiles.push(along, cosine, sine, side);
    }
  }
  for (let point = 0; point < profilePoints.length; point += 1) {
    const next = (point + 1) % profilePoints.length;
    indices.push(point, next, point + 10, next, next + 10, point + 10);
  }
  for (const along of [0, 1]) {
    const first = positions.length / 3;
    positions.push(0, 0, along);
    normals.push(0, 0, along === 0 ? -1 : 1);
    profiles.push(along, 0, 0, 0);
    for (const [cosine, sine, side] of profilePoints) {
      positions.push(cosine, sine, along);
      normals.push(0, 0, along === 0 ? -1 : 1);
      profiles.push(along, cosine, sine, side);
    }
    for (let point = 0; point < profilePoints.length; point += 1) {
      const a = first + 1 + point;
      const b = first + 1 + ((point + 1) % profilePoints.length);
      indices.push(first, ...(along === 0 ? [b, a] : [a, b]));
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3));
  geometry.setAttribute('aProfile', new THREE.Float32BufferAttribute(profiles, 4));
  geometry.setIndex(indices);
  return geometry;
};

const createInstanceGeometry = (profile: THREE.BufferGeometry, data: BeadChunk): THREE.InstancedBufferGeometry => {
  const geometry = new THREE.InstancedBufferGeometry();
  for (const [name, attribute] of Object.entries(profile.attributes)) {
    geometry.setAttribute(name, attribute);
  }
  geometry.setIndex(profile.index);
  const positions = new THREE.InstancedInterleavedBuffer(data.positions, 6);
  geometry.setAttribute('aStart', new THREE.InterleavedBufferAttribute(positions, 3, 0));
  geometry.setAttribute('aEnd', new THREE.InterleavedBufferAttribute(positions, 3, 3));
  geometry.setAttribute('aDimensions', new THREE.InstancedBufferAttribute(data.dimensions, 4));
  geometry.setAttribute('aJoins', new THREE.InstancedBufferAttribute(data.joins, 4));
  geometry.setAttribute('aMetrics', new THREE.InstancedBufferAttribute(data.metrics, 2));
  geometry.setAttribute('aRole', new THREE.InstancedBufferAttribute(data.roles, 1));
  geometry.boundingBox = new THREE.Box3(new THREE.Vector3(...data.min), new THREE.Vector3(...data.max));
  geometry.boundingSphere = geometry.boundingBox.getBoundingSphere(new THREE.Sphere());
  geometry.instanceCount = 0;
  return geometry;
};

/** Update only a tiny palette texture; recorded tool colours remain unchanged by role or layer. */
export const setToolpathPalettes = (reveal: ToolpathReveal, palettes: readonly ToolpathPalette[]): void => {
  const array = reveal.palette.image.data;
  if (!array) {
    return;
  }
  for (let tool = 0; tool < 64; tool += 1) {
    const palette = palettes[tool] ?? palettes[0]!;
    for (let row = 0; row < 16; row += 1) {
      const kind = toolpathSegmentKinds[row - 1] ?? 'outer-wall';
      const color = row === 0 ? palette['outer-wall'] : palette[kind];
      const offset = (row * 64 + tool) * 4;
      array[offset] = Math.round(color.r * 255);
      array[offset + 1] = Math.round(color.g * 255);
      array[offset + 2] = Math.round(color.b * 255);
      array[offset + 3] = 255;
    }
  }
  reveal.palette.needsUpdate = true;
};

/** Choose appearance in place, with no geometry or material recreation. */
export const setToolpathAppearance = (
  reveal: ToolpathReveal,
  {
    mode,
    maximum = 1,
    emphasizeLayer: emphasis = false,
  }: Readonly<{ mode: FilamentMode; maximum?: number; emphasizeLayer?: boolean }>,
): void => {
  for (const handles of [reveal.uniforms, reveal.activeUniforms]) {
    handles.mode.value = filamentModes.indexOf(mode);
    handles.maximum.value = maximum;
    handles.emphasis.value = emphasis ? activeBrighten : 0;
  }
};

/** Allocate bounded instanced beads and optional travel/wipe lines for one renderer. */
export const createToolpathReveal = (
  program: ToolpathProgram,
  palettes: readonly ToolpathPalette[],
  options: Readonly<{ grouping?: ToolpathGrouping; backend?: 'webgl' | 'webgpu'; data?: BeadData }> = {},
): ToolpathReveal => {
  if (palettes.length === 0) {
    palettes = [createToolpathPalette(printerAccent, 'dark')];
  }
  const grouping = options.grouping ?? groupToolpath(program);
  const data = options.data ?? createBeadData(program, grouping.groupOf);
  const profile = createProfile();
  const palette = new THREE.DataTexture(new Uint8Array(64 * 16 * 4), 64, 16);
  palette.minFilter = THREE.NearestFilter;
  palette.magFilter = THREE.NearestFilter;
  const uniforms = createFilamentUniforms(palette);
  const activeUniforms = createFilamentUniforms(palette);
  const material = createFilamentMaterialForBackend(options.backend ?? 'webgl', uniforms);
  const activeMaterial = createFilamentMaterialForBackend(options.backend ?? 'webgl', activeUniforms);
  const lines = new THREE.Group();
  const chunks = data.chunks.map((chunk) => {
    const mesh = new THREE.Mesh(createInstanceGeometry(profile, chunk), material);
    lines.add(mesh);
    return { mesh, data: chunk };
  });
  const activeData: BeadChunk = {
    group: 0,
    segments: new Uint32Array(1),
    positions: new Float32Array(6),
    dimensions: new Float32Array(4),
    joins: new Float32Array(4),
    metrics: new Float32Array(2),
    roles: new Uint8Array(1),
    min: [0, 0, 0],
    max: [0, 0, 0],
  };
  const active = new THREE.Mesh(createInstanceGeometry(profile, activeData), activeMaterial);
  active.frustumCulled = false;
  const trail = new THREE.Group();
  trail.add(active);
  const lineMaterial = new THREE.LineBasicMaterial({ color: palettes[0]!.travel, depthWrite: false });
  const position = new THREE.BufferAttribute(program.positions, 3);
  const groupLines = toolpathGroups.map((group, groupIndex) => {
    if (!movingGroups.has(groupIndex) || !grouping.counts[groupIndex]) {
      return undefined;
    }
    const indices = grouping.lineIndices[groupIndex]!;
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', position);
    geometry.setIndex(new THREE.BufferAttribute(indices, 1));
    geometry.setDrawRange(0, 0);
    const object = new THREE.LineSegments(geometry, lineMaterial);
    object.name = group;
    object.frustumCulled = false;
    lines.add(object);
    return object;
  });
  const reveal: ToolpathReveal = {
    lines,
    trail,
    chunks,
    active,
    groupLines,
    uniforms,
    activeUniforms,
    palette,
    groupOf: grouping.groupOf,
    activeLayer: -1,
    time: Number.NaN,
    visibilityGeneration: 0,
    appliedVisibilityGeneration: -1,
    dispose: () => {
      for (const { mesh } of chunks) {
        mesh.geometry.dispose();
      }
      for (const object of groupLines) {
        object?.geometry.dispose();
      }
      active.geometry.dispose();
      profile.dispose();
      material.dispose();
      activeMaterial.dispose();
      lineMaterial.dispose();
      palette.dispose();
    },
  };
  setToolpathPalettes(reveal, palettes);
  return reveal;
};

/** Hiding groups mutates objects and fences unchanged-time reveal work. */
export const setToolpathVisibility = (reveal: ToolpathReveal, hidden: ReadonlySet<ToolpathGroup>): void => {
  for (const { mesh, data } of reveal.chunks) {
    mesh.visible = !hidden.has(toolpathGroups[data.group]!);
  }
  for (const [index, object] of reveal.groupLines.entries()) {
    if (object) {
      object.visible = !hidden.has(toolpathGroups[index]!);
    }
  }
  reveal.visibilityGeneration += 1;
};

const entriesBefore = (indices: ArrayLike<number>, value: number): number => {
  let low = 0;
  let high = indices.length;
  while (low < high) {
    const middle = Math.floor((low + high) / 2);
    if (indices[middle]! < value) {
      low = middle + 1;
    } else {
      high = middle;
    }
  }
  return low;
};

const activeColumns = [
  ['aDimensions', 'dimensions', 4],
  ['aJoins', 'joins', 4],
  ['aMetrics', 'metrics', 2],
  ['aRole', 'roles', 1],
] as const;

/** Draw ranges and one partial, capped bead; backward seeks use the same immutable instance buffers. */
export const updateToolpathReveal = ({
  reveal,
  program,
  time,
  head,
}: Readonly<{ reveal: ToolpathReveal; program: ToolpathProgram; time: number; head: THREE.Vector3 }>): Readonly<{
  segment: number;
  layer: number;
}> => {
  const segment = headPositionAt(program, time, head);
  const layer = layerAtTime(program, time);
  if (reveal.time === time && reveal.appliedVisibilityGeneration === reveal.visibilityGeneration) {
    return { segment, layer };
  }
  reveal.time = time;
  reveal.appliedVisibilityGeneration = reveal.visibilityGeneration;
  reveal.activeLayer = layer;
  reveal.uniforms.layer.value = layer;
  reveal.activeUniforms.layer.value = layer;
  const completed =
    time >= program.duration ? program.segmentCount : Math.min(program.segmentCount, Math.max(0, segment));
  reveal.active.visible = false;
  for (const { mesh, data } of reveal.chunks) {
    const count = entriesBefore(data.segments, completed);
    mesh.geometry.instanceCount = count;
    if (segment < 0 || segment >= program.segmentCount || !mesh.visible || data.segments[count] !== segment) {
      continue;
    }
    const start = program.times[segment * 2]!;
    const end = program.times[segment * 2 + 1]!;
    const fraction = end > start ? (time - start) / (end - start) : 1;
    const begins = program.deposition?.starts[segment] ?? 0;
    if (fraction <= begins) {
      continue;
    }
    const positions = reveal.active.geometry.getAttribute('aStart');
    if (positions instanceof THREE.InterleavedBufferAttribute) {
      for (let i = 0; i < 6; i += 1) {
        positions.data.array[i] = data.positions[count * 6 + i]!;
      }
      positions.data.needsUpdate = true;
    }
    for (const [name, column, size] of activeColumns) {
      const values = data[column];
      const attribute = reveal.active.geometry.getAttribute(name);
      if (attribute instanceof THREE.BufferAttribute) {
        for (let i = 0; i < size; i += 1) {
          attribute.array[i] = values[count * size + i]!;
        }
        attribute.needsUpdate = true;
      }
    }
    reveal.activeUniforms.fraction.value = Math.min(1, (fraction - begins) / (1 - begins));
    reveal.active.geometry.instanceCount = 1;
    reveal.active.visible = true;
  }
  for (const object of reveal.groupLines) {
    if (object) {
      object.geometry.setDrawRange(0, entriesBefore(object.geometry.index!.array, completed * 2));
    }
  }
  return { segment, layer };
};
