import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { segmentAtTime, toolpathSegmentKinds } from '@taucad/slicer/toolpath';
import { printerToolpath } from '#components/printer/printer-colors.constants.js';
import { x1cPlates } from '#components/printer/printer-plates.js';
import {
  createToolpathPalette,
  createToolpathReveal,
  extrudingTools,
  groupToolpath,
  headPositionAt,
  setToolpathVisibility,
  toolpathGroups,
  trailSegmentCount,
  updateToolpathReveal,
} from '#components/printer/printer-toolpath.js';
import type { ToolpathReveal } from '#components/printer/printer-toolpath.js';
import { fixtureProgram } from '#components/printer/testing/toolpath-fixture.js';

const program = fixtureProgram({ layers: 6 });
const palette = createToolpathPalette('#ff0000', 'dark');
const kindAt = (segment: number): string => toolpathSegmentKinds[program.kinds[segment]!]!;
/** First segment of one kind inside a layer; each layer opens with a Z move and a travel before its walls. */
const firstOfKind = (layer: number, kind: string): number => {
  const window = program.layerTable[layer]!;
  for (let segment = window.firstSegment; segment < window.firstSegment + window.segmentCount; segment += 1) {
    if (kindAt(segment) === kind) {
      return segment;
    }
  }
  throw new Error(`Layer ${layer} has no ${kind} segment`);
};
/** Vertices every visible group draws. */
const drawnVertices = (reveal: ToolpathReveal): number =>
  reveal.groupLines.reduce((total, object) => total + (object?.visible ? object.geometry.drawRange.count : 0), 0);
const vertexColor = (colors: ArrayLike<number>, vertex: number): THREE.Color =>
  new THREE.Color().fromArray(colors, vertex * 3);
/** WCAG 2 relative luminance, from the colour's linear sRGB components. */
const luminance = (color: THREE.Color): number => {
  const { r, g, b } = color.getRGB({ r: 0, g: 0, b: 0 }, THREE.LinearSRGBColorSpace);
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};
/** WCAG 2 contrast ratio between two colours. */
const contrast = (first: THREE.Color, second: THREE.Color): number => {
  const [one, other] = [luminance(first), luminance(second)];
  return (Math.max(one, other) + 0.05) / (Math.min(one, other) + 0.05);
};

describe('createToolpathPalette', () => {
  it('should derive wall shades from the filament and keep travel dim', () => {
    expect(palette['outer-wall'].getHexString()).toBe('ff0000');
    expect(palette['inner-wall'].getHSL({ h: 0, s: 0, l: 0 }).l).toBeLessThan(0.5);
    expect(palette.infill.getHSL({ h: 0, s: 0, l: 0 }).s).toBeLessThan(1);
    expect(palette.travel.getHexString()).toBe(printerToolpath.travel.dark.slice(1));
    expect(palette.retract).toBe(palette.travel);
    expect(palette.purge.getHexString()).toBe(printerToolpath.preparation.slice(1));
  });

  it('should keep the preparation at 3:1 non-text contrast against every plate surface as the viewer draws it', () => {
    expect(x1cPlates.map(({ id }) => id)).toEqual(
      expect.arrayContaining(['cool', 'engineering', 'high-temperature', 'textured-pei']),
    );
    for (const theme of ['light', 'dark'] as const) {
      for (const plate of x1cPlates) {
        const preparation = createToolpathPalette('#ff0000', theme, plate.color).purge;
        const surface = new THREE.Color(plate.color);
        expect(contrast(preparation, surface), `${plate.label}, ${theme}`).toBeGreaterThanOrEqual(3);
      }
    }
  });
});

describe('createToolpathReveal', () => {
  it('should upload every segment once with nothing drawn', () => {
    const reveal = createToolpathReveal(program, [palette]);
    try {
      const groups = reveal.groupLines.filter((object) => object !== undefined);
      // The fixture has a purge line, walls, infill and travel; each group shares the one upload.
      expect(groups).toHaveLength(4);
      const position = groups[0]!.geometry.getAttribute('position');
      expect(position.count).toBe(program.segmentCount * 2);
      expect(position.array).toBe(program.positions);
      for (const object of groups) {
        expect(object.geometry.getAttribute('position')).toBe(position);
        expect(object.geometry.getAttribute('color')).toBe(reveal.colors);
        expect(object.material.vertexColors).toBe(true);
      }
      expect(groups.reduce((total, object) => total + object.geometry.index!.count, 0)).toBe(program.segmentCount * 2);
      expect(reveal.colors.count).toBe(program.segmentCount * 2);
      expect(drawnVertices(reveal)).toBe(0);
      expect(reveal.trail.geometry.drawRange).toEqual({ start: 0, count: 0 });
      expect(reveal.trail.material.transparent).toBe(true);
      expect(reveal.trail.material.depthWrite).toBe(false);
    } finally {
      reveal.dispose();
    }
  });

  it('should tint each segment by kind, fading the lowest layers toward muted but not the preparation', () => {
    const reveal = createToolpathReveal(program, [palette]);
    try {
      const purge = program.kinds.indexOf(toolpathSegmentKinds.indexOf('purge'));
      const topOuter = firstOfKind(5, 'outer-wall');
      const topColor = vertexColor(reveal.baseColors, topOuter * 2);
      expect(topColor.r).toBeGreaterThan(0.95);
      expect(topColor.g).toBeLessThan(0.05);
      const bottomOuter = firstOfKind(0, 'outer-wall');
      const bottomColor = vertexColor(reveal.baseColors, bottomOuter * 2);
      expect(bottomColor.r).toBeLessThan(topColor.r);
      expect(bottomColor.g).toBeGreaterThan(topColor.g);
      // The purge line lies on layer 0, where a fade would be deepest; it keeps its tint exactly.
      expect(program.layers[purge]).toBe(0);
      expect(vertexColor(reveal.baseColors, purge * 2).getHex()).toBe(palette.purge.getHex());
      expect(vertexColor(reveal.baseColors, purge * 2 + 1).getHex()).toBe(palette.purge.getHex());
    } finally {
      reveal.dispose();
    }
  });

  it('should keep the lowest layers the filament colour on the light theme, fading toward shade, not white', () => {
    const reveal = createToolpathReveal(program, [createToolpathPalette('#ff0000', 'light')]);
    try {
      const bottom = vertexColor(reveal.baseColors, firstOfKind(0, 'outer-wall') * 2);
      // Fading toward a light tint turned the whole print pink on the dark plate.
      expect(bottom.r).toBeGreaterThan(bottom.g * 4);
      expect(bottom.r).toBeGreaterThan(bottom.b * 4);
    } finally {
      reveal.dispose();
    }
  });
});

describe('colour by tool', () => {
  const twoTools = fixtureProgram({ layers: 6, tools: [0, 1] });
  const blue = createToolpathPalette('#0000ff', 'dark');
  /** Middle of the first extruding segment one tool prints. */
  const timeIn = (tool: number): number => {
    const segment = twoTools.tools.findIndex((each, index) => each === tool && twoTools.extrusion[index]! > 0);
    return (twoTools.times[segment * 2]! + twoTools.times[segment * 2 + 1]!) / 2;
  };

  it("should draw each segment in its tool's filament, as a one-colour reveal of that filament would", () => {
    expect(extrudingTools(twoTools)).toEqual([0, 1]);
    const [both, reds, blues] = [[palette, blue], [palette], [blue]].map((palettes) =>
      createToolpathReveal(twoTools, palettes),
    );
    try {
      // A tool past the palettes takes the first, so `reds` and `blues` each draw everything in one filament.
      const expected = new Float32Array(both!.baseColors.length);
      for (let segment = 0; segment < twoTools.segmentCount; segment += 1) {
        const source = twoTools.tools[segment] === 1 ? blues! : reds!;
        expected.set(source.baseColors.subarray(segment * 6, segment * 6 + 6), segment * 6);
      }
      expect(both!.baseColors).toEqual(expected);
      expect(both!.baseColors).not.toEqual(reds!.baseColors);
    } finally {
      for (const reveal of [both, reds, blues]) {
        reveal!.dispose();
      }
    }
  });

  it('should give the trail the filament at the head', () => {
    const reveal = createToolpathReveal(twoTools, [palette, blue]);
    try {
      const head = new THREE.Vector3();
      updateToolpathReveal({ reveal, program: twoTools, time: timeIn(1), head });
      expect(reveal.trail.material.color.equals(blue.trail)).toBe(true);
      updateToolpathReveal({ reveal, program: twoTools, time: timeIn(0), head });
      expect(reveal.trail.material.color.equals(palette.trail)).toBe(true);
    } finally {
      reveal.dispose();
    }
  });
});

describe('updateToolpathReveal', () => {
  it('should reveal completed segments, brighten the active layer and keep a trail', () => {
    const reveal = createToolpathReveal(program, [palette]);
    try {
      const head = new THREE.Vector3();
      const layer = program.layerTable[3]!;
      const time = (layer.startTime + layer.endTime) / 2;
      const { segment, layer: activeLayer } = updateToolpathReveal({ reveal, program, time, head });
      expect(segment).toBe(segmentAtTime(program, time));
      expect(activeLayer).toBe(3);
      expect(drawnVertices(reveal)).toBe(segment * 2);

      const activeVertex = layer.firstSegment * 2;
      const base = vertexColor(reveal.baseColors, activeVertex);
      const shown = vertexColor(reveal.colors.array, activeVertex);
      expect(shown.g).toBeGreaterThan(base.g);
      const belowVertex = program.layerTable[2]!.firstSegment * 2;
      expect(vertexColor(reveal.colors.array, belowVertex).getHex()).toBe(
        vertexColor(reveal.baseColors, belowVertex).getHex(),
      );

      const trailCount = reveal.trail.geometry.drawRange.count / 2;
      expect(trailCount).toBeGreaterThan(0);
      expect(trailCount).toBeLessThanOrEqual(trailSegmentCount);
      expect(head.z).toBeCloseTo(layer.z, 6);
    } finally {
      reveal.dispose();
    }
  });

  it('should keep the preparation its tint while its layer is active and the walls beside it brighten', () => {
    const reveal = createToolpathReveal(program, [palette]);
    try {
      const head = new THREE.Vector3();
      const first = program.layerTable[0]!;
      expect(updateToolpathReveal({ reveal, program, time: (first.startTime + first.endTime) / 2, head }).layer).toBe(
        0,
      );
      const purgeVertex = program.kinds.indexOf(toolpathSegmentKinds.indexOf('purge')) * 2;
      expect(vertexColor(reveal.colors.array, purgeVertex).getHex()).toBe(palette.purge.getHex());
      const wallVertex = firstOfKind(0, 'outer-wall') * 2;
      expect(vertexColor(reveal.colors.array, wallVertex).g).toBeGreaterThan(
        vertexColor(reveal.baseColors, wallVertex).g,
      );
    } finally {
      reveal.dispose();
    }
  });

  it('should restore the previous layer when the cursor moves on', () => {
    const reveal = createToolpathReveal(program, [palette]);
    try {
      const head = new THREE.Vector3();
      updateToolpathReveal({ reveal, program, time: program.layerTable[1]!.startTime + 0.01, head });
      const vertex = program.layerTable[1]!.firstSegment * 2;
      expect(vertexColor(reveal.colors.array, vertex).getHex()).not.toBe(
        vertexColor(reveal.baseColors, vertex).getHex(),
      );
      updateToolpathReveal({ reveal, program, time: program.layerTable[4]!.startTime + 0.01, head });
      expect(vertexColor(reveal.colors.array, vertex).getHex()).toBe(vertexColor(reveal.baseColors, vertex).getHex());
      expect(reveal.activeLayer).toBe(4);
    } finally {
      reveal.dispose();
    }
  });

  it('should draw everything after the run and nothing before it', () => {
    const reveal = createToolpathReveal(program, [palette]);
    try {
      const head = new THREE.Vector3();
      expect(updateToolpathReveal({ reveal, program, time: -1, head }).segment).toBe(-1);
      expect(drawnVertices(reveal)).toBe(0);
      expect(updateToolpathReveal({ reveal, program, time: program.duration + 1, head }).segment).toBe(
        program.segmentCount,
      );
      expect(drawnVertices(reveal)).toBe(program.segmentCount * 2);
      const last = (program.segmentCount - 1) * 6;
      expect(head.toArray()).toEqual([
        program.positions[last + 3],
        program.positions[last + 4],
        program.positions[last + 5],
      ]);
    } finally {
      reveal.dispose();
    }
  });
});

describe('groupToolpath', () => {
  it('should put the start sequence in preparation, keep its moves travel, and sort the layers by kind', () => {
    const { groupOf, counts } = groupToolpath(program);
    const groupAt = (segment: number): string => toolpathGroups[groupOf[segment]!]!;
    expect(program.preambleSegmentCount).toBeGreaterThan(0);
    const preamble = Array.from({ length: program.preambleSegmentCount }, (_, segment) => groupAt(segment));
    expect(new Set(preamble)).toEqual(new Set(['travel', 'preparation']));
    expect(groupAt(firstOfKind(2, 'outer-wall'))).toBe('walls');
    expect(groupAt(firstOfKind(2, 'inner-wall'))).toBe('walls');
    expect(groupAt(firstOfKind(2, 'infill'))).toBe('infill');
    expect(counts.reduce((total, count) => total + count, 0)).toBe(program.segmentCount);
    expect(counts[toolpathGroups.indexOf('support')]).toBe(0);
  });

  it('should make unlabelled extrusion before the first layer preparation, not other', () => {
    const unlabelled = fixtureProgram({ layers: 2 });
    const kinds = Uint8Array.from(unlabelled.kinds, (kind, segment) =>
      segment < unlabelled.preambleSegmentCount && kind !== 0 ? toolpathSegmentKinds.indexOf('unknown') : kind,
    );
    const { groupOf } = groupToolpath({ ...unlabelled, kinds });
    const purge = unlabelled.kinds.indexOf(toolpathSegmentKinds.indexOf('purge'));
    expect(toolpathGroups[groupOf[purge]!]).toBe('preparation');
  });
});

describe('setToolpathVisibility', () => {
  it('should stop drawing hidden groups and keep them out of the trail', () => {
    const reveal = createToolpathReveal(program, [palette]);
    try {
      const head = new THREE.Vector3();
      const layer = program.layerTable[3]!;
      const time = (layer.startTime + layer.endTime) / 2;
      updateToolpathReveal({ reveal, program, time, head });
      const everything = drawnVertices(reveal);
      setToolpathVisibility(reveal, new Set(['preparation', 'travel', 'walls', 'wipe']));
      updateToolpathReveal({ reveal, program, time, head });
      const infillOnly = drawnVertices(reveal);
      expect(infillOnly).toBeGreaterThan(0);
      expect(infillOnly).toBeLessThan(everything);
      const walls = reveal.groupLines[toolpathGroups.indexOf('walls')]!;
      expect(walls.visible).toBe(false);
      // Hidden groups keep their draw range, so showing them again is one flag.
      expect(walls.geometry.drawRange.count).toBeGreaterThan(0);
      const trail = reveal.trailPositions.array;
      for (let vertex = 0; vertex < reveal.trail.geometry.drawRange.count; vertex += 2) {
        const start = [trail[vertex * 3], trail[vertex * 3 + 1]];
        // Infill runs diagonally inside the square; the walls' corners never appear in the trail.
        expect(start).not.toEqual([108, 108]);
      }
      setToolpathVisibility(reveal, new Set());
      expect(drawnVertices(reveal)).toBe(everything);
    } finally {
      reveal.dispose();
    }
  });
});

describe('headPositionAt', () => {
  it('should interpolate inside the active segment', () => {
    const head = new THREE.Vector3();
    const segment = program.layerTable[2]!.firstSegment + 1;
    const start = program.times[segment * 2]!;
    const end = program.times[segment * 2 + 1]!;
    expect(headPositionAt(program, (start + end) / 2, head)).toBe(segment);
    const offset = segment * 6;
    expect(head.x).toBeCloseTo((program.positions[offset]! + program.positions[offset + 3]!) / 2, 3);
    expect(head.y).toBeCloseTo((program.positions[offset + 1]! + program.positions[offset + 4]!) / 2, 3);
  });
});
