/**
 * Toolpath rendering: one `LineSegments` for the whole program, revealed
 * through its draw range, plus a short fresh-filament trail.
 *
 * The program's `positions` buffer uploads as-is (two vertices per segment);
 * colours are baked once per segment kind and height, and only the active
 * layer's range is recoloured when the layer changes. Nothing here allocates
 * inside the frame loop.
 *
 * @module
 */

import * as THREE from 'three';
import { segmentAtTime, toolpathSegmentKinds } from '@taucad/slicer/toolpath';
import type { ToolpathProgram, ToolpathSegmentKind } from '@taucad/slicer/toolpath';
import { printerToolpath } from '#components/printer/printer-colors.constants.js';
import { layerAtTime } from '#components/printer/printer-playback.js';

/** Tint per segment kind. */
export type ToolpathPalette = Readonly<Record<ToolpathSegmentKind, THREE.Color>> &
  Readonly<{ muted: THREE.Color; trail: THREE.Color }>;

/** Segments the trail keeps lit behind the nozzle. */
export const trailSegmentCount = 32;
/** How far back the trail looks for extruding segments before giving up. */
const trailLookback = 512;
/** How far lower layers drift toward the muted tint at the plate. */
const depthFade = 0.35;
/** How far the active layer brightens toward the highlight tint. */
const activeBrighten = 0.3;

/** Build the palette for one filament colour and theme. */
export const createToolpathPalette = (filament: string, theme: 'light' | 'dark'): ToolpathPalette => {
  const outer = new THREE.Color(filament);
  const travel = new THREE.Color(printerToolpath.travel[theme]);
  return {
    'outer-wall': outer,
    'inner-wall': outer.clone().offsetHSL(0, -0.08, -0.1),
    infill: outer.clone().offsetHSL(0, -0.3, -0.18),
    support: new THREE.Color(printerToolpath.support),
    skirt: new THREE.Color(printerToolpath.skirt),
    brim: new THREE.Color(printerToolpath.brim),
    purge: new THREE.Color(printerToolpath.purge),
    travel,
    retract: travel,
    wipe: travel,
    unknown: new THREE.Color(printerToolpath.unknown),
    muted: new THREE.Color(printerToolpath.muted[theme]),
    trail: outer.clone().lerp(new THREE.Color(printerToolpath.highlight), 0.55),
  };
};

/** Renderer-owned toolpath objects; `dispose` releases everything allocated here. */
export type ToolpathReveal = {
  readonly lines: THREE.LineSegments<THREE.BufferGeometry, THREE.LineBasicMaterial>;
  readonly trail: THREE.LineSegments<THREE.BufferGeometry, THREE.LineBasicMaterial>;
  readonly baseColors: Float32Array;
  readonly colors: THREE.BufferAttribute;
  readonly trailPositions: THREE.BufferAttribute;
  activeLayer: number;
  readonly dispose: () => void;
};

const kindOf = (program: Pick<ToolpathProgram, 'kinds'>, segment: number): ToolpathSegmentKind =>
  toolpathSegmentKinds[program.kinds[segment]!] ?? 'unknown';

/** Allocate the toolpath objects for one program. */
export const createToolpathReveal = (program: ToolpathProgram, palette: ToolpathPalette): ToolpathReveal => {
  const vertexCount = program.segmentCount * 2;
  const baseColors = new Float32Array(vertexCount * 3);
  // Fade by layer rather than Z: end sequences lift the head far above the last printed layer.
  const topLayer = Math.max(1, program.layerTable.length - 1);
  const color = new THREE.Color();
  for (let segment = 0; segment < program.segmentCount; segment += 1) {
    const height = Math.min(1, program.layers[segment]! / topLayer);
    color.copy(palette[kindOf(program, segment)]).lerp(palette.muted, depthFade * (1 - height));
    color.toArray(baseColors, segment * 6);
    color.toArray(baseColors, segment * 6 + 3);
  }
  const colors = new THREE.BufferAttribute(new Float32Array(baseColors), 3);
  colors.setUsage(THREE.DynamicDrawUsage);
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(program.positions, 3));
  geometry.setAttribute('color', colors);
  geometry.setDrawRange(0, 0);
  const lines = new THREE.LineSegments(geometry, new THREE.LineBasicMaterial({ vertexColors: true }));
  lines.frustumCulled = false;

  const trailPositions = new THREE.BufferAttribute(new Float32Array(trailSegmentCount * 6), 3);
  trailPositions.setUsage(THREE.DynamicDrawUsage);
  const trailGeometry = new THREE.BufferGeometry();
  trailGeometry.setAttribute('position', trailPositions);
  trailGeometry.setDrawRange(0, 0);
  const trail = new THREE.LineSegments(
    trailGeometry,
    new THREE.LineBasicMaterial({ color: palette.trail, transparent: true, opacity: 0.95, depthWrite: false }),
  );
  trail.frustumCulled = false;
  trail.renderOrder = 1;

  return {
    lines,
    trail,
    baseColors,
    colors,
    trailPositions,
    activeLayer: -1,
    dispose: () => {
      geometry.dispose();
      lines.material.dispose();
      trailGeometry.dispose();
      trail.material.dispose();
    },
  };
};

const recolorLayer = (
  reveal: ToolpathReveal,
  program: ToolpathProgram,
  { layer, brighten }: Readonly<{ layer: number; brighten: number }>,
): void => {
  const window = program.layerTable[layer];
  if (!window || window.segmentCount === 0) {
    return;
  }
  const start = window.firstSegment * 6;
  const length = window.segmentCount * 6;
  const target = reveal.colors.array as Float32Array;
  const color = new THREE.Color();
  const highlight = new THREE.Color(printerToolpath.highlight);
  for (let offset = start; offset < start + length; offset += 3) {
    color.fromArray(reveal.baseColors, offset);
    if (brighten > 0) {
      color.lerp(highlight, brighten);
    }
    color.toArray(target, offset);
  }
  reveal.colors.addUpdateRange(start, length);
  reveal.colors.needsUpdate = true;
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

/**
 * Reveal the program up to one time: completed segments through the draw
 * range, the active layer brightened, and the trail rebuilt behind the head.
 *
 * @returns The active segment and layer indices.
 */
export const updateToolpathReveal = ({
  reveal,
  program,
  time,
  head,
}: Readonly<{
  reveal: ToolpathReveal;
  program: ToolpathProgram;
  time: number;
  /** Receives the nozzle position at `time`. */
  head: THREE.Vector3;
}>): Readonly<{ segment: number; layer: number }> => {
  const segment = headPositionAt(program, time, head);
  // `times` is float32, so the last end can round above the float64 duration; the end draws everything.
  const completed =
    time >= program.duration ? program.segmentCount : Math.min(program.segmentCount, Math.max(0, segment));
  reveal.lines.geometry.setDrawRange(0, completed * 2);

  const layer = layerAtTime(program, time);
  if (layer !== reveal.activeLayer) {
    reveal.colors.clearUpdateRanges();
    recolorLayer(reveal, program, { layer: reveal.activeLayer, brighten: 0 });
    recolorLayer(reveal, program, { layer, brighten: activeBrighten });
    reveal.activeLayer = layer;
  }

  const trail = reveal.trailPositions.array as Float32Array;
  let count = 0;
  if (segment >= 0 && segment < program.segmentCount && program.extrusion[segment]! > 0) {
    const offset = segment * 6;
    trail[0] = program.positions[offset]!;
    trail[1] = program.positions[offset + 1]!;
    trail[2] = program.positions[offset + 2]!;
    trail[3] = head.x;
    trail[4] = head.y;
    trail[5] = head.z;
    count = 1;
  }
  const floor = Math.max(0, completed - trailLookback);
  for (let index = completed - 1; index >= floor && count < trailSegmentCount; index -= 1) {
    if (program.extrusion[index]! <= 0) {
      continue;
    }
    trail.set(program.positions.subarray(index * 6, index * 6 + 6), count * 6);
    count += 1;
  }
  reveal.trail.geometry.setDrawRange(0, count * 2);
  reveal.trailPositions.clearUpdateRanges();
  reveal.trailPositions.addUpdateRange(0, count * 6);
  reveal.trailPositions.needsUpdate = true;
  return { segment, layer };
};
