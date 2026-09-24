import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { segmentAtTime, toolpathSegmentKinds } from '@taucad/slicer/toolpath';
import { printerToolpath } from '#components/printer/printer-colors.constants.js';
import {
  createToolpathPalette,
  createToolpathReveal,
  headPositionAt,
  trailSegmentCount,
  updateToolpathReveal,
} from '#components/printer/printer-toolpath.js';
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
const vertexColor = (colors: ArrayLike<number>, vertex: number): THREE.Color =>
  new THREE.Color().fromArray(colors, vertex * 3);

describe('createToolpathPalette', () => {
  it('should derive wall shades from the filament and keep travel dim', () => {
    expect(palette['outer-wall'].getHexString()).toBe('ff0000');
    expect(palette['inner-wall'].getHSL({ h: 0, s: 0, l: 0 }).l).toBeLessThan(0.5);
    expect(palette.infill.getHSL({ h: 0, s: 0, l: 0 }).s).toBeLessThan(1);
    expect(palette.travel.getHexString()).toBe(printerToolpath.travel.dark.slice(1));
    expect(palette.retract).toBe(palette.travel);
    expect(palette.purge.getHexString()).toBe(printerToolpath.purge.slice(1));
  });
});

describe('createToolpathReveal', () => {
  it('should upload every segment once with nothing drawn', () => {
    const reveal = createToolpathReveal(program, palette);
    try {
      const position = reveal.lines.geometry.getAttribute('position');
      expect(position.count).toBe(program.segmentCount * 2);
      expect(position.array).toBe(program.positions);
      expect(reveal.colors.count).toBe(program.segmentCount * 2);
      expect(reveal.lines.geometry.drawRange).toEqual({ start: 0, count: 0 });
      expect(reveal.trail.geometry.drawRange).toEqual({ start: 0, count: 0 });
      expect(reveal.lines.material.vertexColors).toBe(true);
      expect(reveal.trail.material.transparent).toBe(true);
      expect(reveal.trail.material.depthWrite).toBe(false);
    } finally {
      reveal.dispose();
    }
  });

  it('should tint each segment by kind, fading the lowest layers toward muted', () => {
    const reveal = createToolpathReveal(program, palette);
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
      const purgeColor = vertexColor(reveal.baseColors, purge * 2);
      expect(purgeColor.getHex()).not.toBe(topColor.getHex());
    } finally {
      reveal.dispose();
    }
  });

  it('should keep the lowest layers the filament colour on the light theme, fading toward shade, not white', () => {
    const reveal = createToolpathReveal(program, createToolpathPalette('#ff0000', 'light'));
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

describe('updateToolpathReveal', () => {
  it('should reveal completed segments, brighten the active layer and keep a trail', () => {
    const reveal = createToolpathReveal(program, palette);
    try {
      const head = new THREE.Vector3();
      const layer = program.layerTable[3]!;
      const time = (layer.startTime + layer.endTime) / 2;
      const { segment, layer: activeLayer } = updateToolpathReveal({ reveal, program, time, head });
      expect(segment).toBe(segmentAtTime(program, time));
      expect(activeLayer).toBe(3);
      expect(reveal.lines.geometry.drawRange.count).toBe(segment * 2);

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

  it('should restore the previous layer when the cursor moves on', () => {
    const reveal = createToolpathReveal(program, palette);
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
    const reveal = createToolpathReveal(program, palette);
    try {
      const head = new THREE.Vector3();
      expect(updateToolpathReveal({ reveal, program, time: -1, head }).segment).toBe(-1);
      expect(reveal.lines.geometry.drawRange.count).toBe(0);
      expect(updateToolpathReveal({ reveal, program, time: program.duration + 1, head }).segment).toBe(
        program.segmentCount,
      );
      expect(reveal.lines.geometry.drawRange.count).toBe(program.segmentCount * 2);
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
