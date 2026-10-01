/**
 * Toolpath rendering: one `LineSegments` per filter group, each revealed
 * through its draw range, plus a short fresh-filament trail.
 *
 * The program's `positions` buffer uploads as-is (two vertices per segment)
 * and every group shares it and one colour buffer; a group owns only an index
 * buffer of its segments in program order, so hiding a group is one
 * `visible` flag and revealing it is one binary search per frame. Colours are
 * baked once per segment from its tool's filament, its kind and its height,
 * and only the active layer's range is recoloured when the layer changes.
 * Nothing here allocates inside the frame loop.
 *
 * @module
 */

import * as THREE from 'three';
import { segmentAtTime, toolpathSegmentKinds } from '@taucad/slicer/toolpath';
import type { ToolpathProgram, ToolpathSegmentKind } from '@taucad/slicer/toolpath';
import { printerToolpath } from '#components/printer/printer-colors.constants.js';
import { layerAtTime } from '#components/printer/printer-playback.js';

/** What the G-code filter shows and hides; every segment belongs to exactly one group. */
export const toolpathGroups = [
  'preparation',
  'walls',
  'infill',
  'support',
  'skirt-brim',
  'other',
  'wipe',
  'travel',
] as const;

/** One filter group. */
export type ToolpathGroup = (typeof toolpathGroups)[number];

/** The filter's name for each group. */
export const toolpathGroupLabels: Readonly<Record<ToolpathGroup, string>> = {
  preparation: 'Preparation',
  walls: 'Walls',
  infill: 'Infill',
  support: 'Support',
  'skirt-brim': 'Skirt and brim',
  other: 'Other extrusion',
  wipe: 'Wipes',
  travel: 'Travel',
};

/** The segment kind whose tint stands for each group in the filter's legend. */
export const toolpathGroupSwatchKind: Readonly<Record<ToolpathGroup, ToolpathSegmentKind>> = {
  preparation: 'purge',
  walls: 'outer-wall',
  infill: 'infill',
  support: 'support',
  'skirt-brim': 'skirt',
  other: 'unknown',
  wipe: 'wipe',
  travel: 'travel',
};

/** Moves that lay down no filament start hidden. */
export const defaultHiddenToolpathGroups: ReadonlySet<ToolpathGroup> = new Set(['travel', 'wipe']);

const kindGroup: Readonly<Record<ToolpathSegmentKind, ToolpathGroup>> = {
  travel: 'travel',
  // Zero-length extruder moves draw nothing; they ride with travel.
  retract: 'travel',
  wipe: 'wipe',
  'outer-wall': 'walls',
  'inner-wall': 'walls',
  // The parser folds top and bottom surfaces, bridges and ironing into infill.
  infill: 'infill',
  support: 'support',
  skirt: 'skirt-brim',
  brim: 'skirt-brim',
  // Purge lines, flushes and the prime tower prepare the nozzle; they are not the part.
  purge: 'preparation',
  unknown: 'other',
};
const kindGroupIndex = toolpathSegmentKinds.map((kind) => toolpathGroups.indexOf(kindGroup[kind]));
const preparationGroup = toolpathGroups.indexOf('preparation');
const movingGroups: ReadonlySet<number> = new Set([toolpathGroups.indexOf('travel'), toolpathGroups.indexOf('wipe')]);

/** The group of every segment, and how many segments each group holds. */
export type ToolpathGrouping = Readonly<{
  /** Index into {@link toolpathGroups} per segment. */
  groupOf: Uint8Array<ArrayBuffer>;
  /** Segments per group, in {@link toolpathGroups} order. */
  counts: readonly number[];
}>;

/**
 * Sort every segment into one filter group. Extrusion in the start sequence
 * (before the first layer annotation) is preparation whatever its label; its
 * moves stay travel and wipes.
 *
 * @param program - Kinds, segment count and preamble length.
 * @returns The group per segment and the group sizes.
 */
export const groupToolpath = (
  program: Pick<ToolpathProgram, 'segmentCount' | 'kinds' | 'preambleSegmentCount'>,
): ToolpathGrouping => {
  const groupOf = new Uint8Array(program.segmentCount);
  const counts = toolpathGroups.map(() => 0);
  for (let segment = 0; segment < program.segmentCount; segment += 1) {
    const group = kindGroupIndex[program.kinds[segment]!] ?? kindGroupIndex.at(-1)!;
    const resolved = segment < program.preambleSegmentCount && !movingGroups.has(group) ? preparationGroup : group;
    groupOf[segment] = resolved;
    counts[resolved]! += 1;
  }
  return { groupOf, counts };
};

/**
 * The tools that lay down filament, ascending: the filaments the program prints with, its preparation included.
 *
 * @param program - Segment count, extrusion and tool per segment.
 * @returns Each extruding tool once.
 */
export const extrudingTools = (
  program: Pick<ToolpathProgram, 'segmentCount' | 'extrusion' | 'tools'>,
): readonly number[] => {
  // One flag per value the tools column can hold.
  const extruding = new Uint8Array(256);
  for (let segment = 0; segment < program.segmentCount; segment += 1) {
    if (program.extrusion[segment]! > 0) {
      extruding[program.tools[segment]!] = 1;
    }
  }
  return [...extruding.keys()].filter((tool) => extruding[tool] === 1);
};

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

/** Renderer-owned toolpath objects; `dispose` releases everything allocated here. */
export type ToolpathReveal = {
  /** Holds one `LineSegments` per non-empty group. */
  readonly lines: THREE.Group;
  /** Per {@link toolpathGroups} entry; `undefined` for a group the program never uses. */
  readonly groupLines: ReadonlyArray<THREE.LineSegments<THREE.BufferGeometry, THREE.LineBasicMaterial> | undefined>;
  readonly groupOf: Uint8Array<ArrayBuffer>;
  readonly trail: THREE.LineSegments<THREE.BufferGeometry, THREE.LineBasicMaterial>;
  /** The trail's tint per tool, from each palette. */
  readonly trailColors: readonly THREE.Color[];
  readonly baseColors: Float32Array;
  readonly colors: THREE.BufferAttribute;
  readonly trailPositions: THREE.BufferAttribute;
  activeLayer: number;
  readonly dispose: () => void;
};

const kindOf = (program: Pick<ToolpathProgram, 'kinds'>, segment: number): ToolpathSegmentKind =>
  toolpathSegmentKinds[program.kinds[segment]!] ?? 'unknown';

/**
 * Allocate the toolpath objects for one program. `palettes` holds one per tool: entry *i* tints the
 * segments tool `T<i>` prints, and a tool past its end takes the first.
 */
export const createToolpathReveal = (
  program: ToolpathProgram,
  palettes: readonly ToolpathPalette[],
  { groupOf, counts }: ToolpathGrouping = groupToolpath(program),
): ToolpathReveal => {
  const vertexCount = program.segmentCount * 2;
  const baseColors = new Float32Array(vertexCount * 3);
  // Fade by layer rather than Z: end sequences lift the head far above the last printed layer.
  const topLayer = Math.max(1, program.layerTable.length - 1);
  const color = new THREE.Color();
  for (let segment = 0; segment < program.segmentCount; segment += 1) {
    const palette = palettes[program.tools[segment]!] ?? palettes[0]!;
    if (groupOf[segment] === preparationGroup) {
      // Preparation keeps its one tint: faded toward the muted shade, it sinks into the plate.
      color.copy(palette.purge);
    } else {
      const height = Math.min(1, program.layers[segment]! / topLayer);
      color.copy(palette[kindOf(program, segment)]).lerp(palette.muted, depthFade * (1 - height));
    }
    color.toArray(baseColors, segment * 6);
    color.toArray(baseColors, segment * 6 + 3);
  }
  const colors = new THREE.BufferAttribute(new Float32Array(baseColors), 3);
  colors.setUsage(THREE.DynamicDrawUsage);
  const position = new THREE.BufferAttribute(program.positions, 3);
  const material = new THREE.LineBasicMaterial({ vertexColors: true });
  const indices = counts.map((count) => new Uint32Array(count * 2));
  const filled = counts.map(() => 0);
  for (let segment = 0; segment < program.segmentCount; segment += 1) {
    const group = groupOf[segment]!;
    indices[group]![filled[group]!] = segment * 2;
    indices[group]![filled[group]! + 1] = segment * 2 + 1;
    filled[group]! += 2;
  }
  const lines = new THREE.Group();
  const groupLines = indices.map((index) => {
    if (index.length === 0) {
      return undefined;
    }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', position);
    geometry.setAttribute('color', colors);
    geometry.setIndex(new THREE.BufferAttribute(index, 1));
    geometry.setDrawRange(0, 0);
    const object = new THREE.LineSegments(geometry, material);
    object.frustumCulled = false;
    lines.add(object);
    return object;
  });

  const trailPositions = new THREE.BufferAttribute(new Float32Array(trailSegmentCount * 6), 3);
  trailPositions.setUsage(THREE.DynamicDrawUsage);
  const trailGeometry = new THREE.BufferGeometry();
  trailGeometry.setAttribute('position', trailPositions);
  trailGeometry.setDrawRange(0, 0);
  const trailColors = palettes.map((palette) => palette.trail);
  const trail = new THREE.LineSegments(
    trailGeometry,
    new THREE.LineBasicMaterial({ color: trailColors[0], transparent: true, opacity: 0.95, depthWrite: false }),
  );
  trail.frustumCulled = false;
  trail.renderOrder = 1;

  return {
    lines,
    groupLines,
    groupOf,
    trail,
    trailColors,
    baseColors,
    colors,
    trailPositions,
    activeLayer: -1,
    dispose: () => {
      for (const object of groupLines) {
        object?.geometry.dispose();
      }
      material.dispose();
      trailGeometry.dispose();
      trail.material.dispose();
    },
  };
};

/** Show every group except the hidden ones; the next reveal skips hidden segments in the trail too. */
export const setToolpathVisibility = (reveal: ToolpathReveal, hidden: ReadonlySet<ToolpathGroup>): void => {
  for (const [group, object] of reveal.groupLines.entries()) {
    if (object) {
      object.visible = !hidden.has(toolpathGroups[group]!);
    }
  }
};

const isShown = (reveal: ToolpathReveal, segment: number): boolean =>
  reveal.groupLines[reveal.groupOf[segment]!]?.visible === true;

/** How many entries of an ascending index buffer fall below a vertex. */
const verticesBefore = (index: ArrayLike<number>, vertex: number): number => {
  let low = 0;
  let high = index.length;
  while (low < high) {
    const middle = Math.floor((low + high) / 2);
    if (index[middle]! < vertex) {
      low = middle + 1;
    } else {
      high = middle;
    }
  }
  return low;
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
    // Preparation shares layer 0 but stays its tint: brightened, it fades into the lifted plate.
    if (brighten > 0 && reveal.groupOf[Math.floor(offset / 6)] !== preparationGroup) {
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
  for (const object of reveal.groupLines) {
    if (object) {
      object.geometry.setDrawRange(0, verticesBefore(object.geometry.index!.array, completed * 2));
    }
  }

  const layer = layerAtTime(program, time);
  if (layer !== reveal.activeLayer) {
    reveal.colors.clearUpdateRanges();
    recolorLayer(reveal, program, { layer: reveal.activeLayer, brighten: 0 });
    recolorLayer(reveal, program, { layer, brighten: activeBrighten });
    reveal.activeLayer = layer;
  }

  // ponytail: the trail takes the filament at the head; just after a tool change its tail over the last
  // filament's segments takes it too, until they scroll out. Per-vertex trail colours if that ever shows.
  const headTool = program.tools[Math.min(Math.max(segment, 0), program.segmentCount - 1)] ?? 0;
  reveal.trail.material.color.copy(reveal.trailColors[headTool] ?? reveal.trailColors[0]!);
  const trail = reveal.trailPositions.array as Float32Array;
  let count = 0;
  if (segment >= 0 && segment < program.segmentCount && program.extrusion[segment]! > 0 && isShown(reveal, segment)) {
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
    if (program.extrusion[index]! <= 0 || !isShown(reveal, index)) {
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
