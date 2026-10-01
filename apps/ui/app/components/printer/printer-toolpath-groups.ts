import { toolpathSegmentKinds } from '@taucad/slicer/toolpath';
import type { ToolpathProgram, ToolpathSegmentKind } from '@taucad/slicer/toolpath';

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
  infill: 'infill',
  bridge: 'infill',
  ironing: 'infill',
  'support-interface': 'support',
  support: 'support',
  skirt: 'skirt-brim',
  brim: 'skirt-brim',
  // Purge lines, flushes and the prime tower prepare the nozzle; they are not the part.
  purge: 'preparation',
  unknown: 'other',
};
const kindGroupIndex = toolpathSegmentKinds.map((kind) => toolpathGroups.indexOf(kindGroup[kind]));
const preparationGroup = toolpathGroups.indexOf('preparation');
export const movingGroups: ReadonlySet<number> = new Set([
  toolpathGroups.indexOf('travel'),
  toolpathGroups.indexOf('wipe'),
]);

/** The group of every segment, and how many segments each group holds. */
export type ToolpathGrouping = Readonly<{
  /** Index into {@link toolpathGroups} per segment. */
  groupOf: Uint8Array<ArrayBuffer>;
  /** Segments per group, in {@link toolpathGroups} order. */
  counts: readonly number[];
  /** Prepared diagnostic line indices; empty for deposition groups. */
  lineIndices: ReadonlyArray<Uint32Array<ArrayBuffer>>;
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
  const lineIndices = counts.map((count, group) => new Uint32Array(movingGroups.has(group) ? count * 2 : 0));
  const offsets = counts.map(() => 0);
  for (let segment = 0; segment < program.segmentCount; segment += 1) {
    const group = groupOf[segment]!;
    if (movingGroups.has(group)) {
      const offset = offsets[group]!;
      lineIndices[group]![offset] = segment * 2;
      lineIndices[group]![offset + 1] = segment * 2 + 1;
      offsets[group] = offset + 2;
    }
  }
  return { groupOf, counts, lineIndices };
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
