import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { toolpathSegmentKinds } from '@taucad/slicer/toolpath';
import { printerToolpath } from '#components/printer/printer-colors.constants.js';
import { x1cPlates } from '#components/printer/printer-plates.js';
import {
  createToolpathPalette,
  createToolpathReveal,
  headPositionAt,
  setToolpathVisibility,
  setToolpathAppearance,
  setToolpathPalettes,
  updateToolpathReveal,
} from '#components/printer/printer-toolpath.js';
import { groupToolpath, toolpathGroups } from '#components/printer/printer-toolpath-groups.js';
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

describe('instanced filament reveal', () => {
  it('should use one shared capped profile, no extrusion lines, and reuse buffers through seeks and appearance changes', () => {
    const reveal = createToolpathReveal(program, [palette]);
    try {
      expect(reveal.chunks.length).toBeGreaterThan(0);
      const first = reveal.chunks[0]!.mesh.geometry;
      for (const { mesh } of reveal.chunks) {
        expect(mesh.geometry.getAttribute('aProfile')).toBe(first.getAttribute('aProfile'));
        expect(mesh.geometry.instanceCount).toBe(0);
      }
      expect(reveal.groupLines.filter(Boolean)).toHaveLength(1);
      expect(reveal.groupLines[toolpathGroups.indexOf('walls')]).toBeUndefined();
      const head = new THREE.Vector3();
      updateToolpathReveal({ reveal, program, time: program.duration, head });
      expect(reveal.chunks.reduce((sum, { mesh }) => sum + mesh.geometry.instanceCount, 0)).toBe(
        program.deposition!.widths.filter((width) => width > 0).length,
      );
      const segment = firstOfKind(3, 'outer-wall');
      const time = (program.times[segment * 2]! + program.times[segment * 2 + 1]!) / 2;
      updateToolpathReveal({ reveal, program, time, head });
      expect(reveal.active.visible).toBe(true);
      expect(reveal.activeUniforms.fraction.value).toBeCloseTo(0.5);
      const buffers = reveal.chunks.map(({ mesh }) => mesh.geometry.getAttribute('aDimensions'));
      setToolpathPalettes(reveal, [createToolpathPalette('#0000ff', 'light')]);
      setToolpathAppearance(reveal, { mode: 'flow', maximum: 20, emphasizeLayer: true });
      expect(reveal.uniforms.mode.value).toBe(4);
      expect(reveal.uniforms.maximum.value).toBe(20);
      expect(reveal.chunks.map(({ mesh }) => mesh.geometry.getAttribute('aDimensions'))).toEqual(buffers);
      setToolpathVisibility(reveal, new Set(['walls']));
      updateToolpathReveal({ reveal, program, time, head });
      expect(reveal.active.visible).toBe(false);
      expect(
        reveal.chunks
          .filter(({ data }) => data.group === toolpathGroups.indexOf('walls'))
          .every(({ mesh }) => !mesh.visible),
      ).toBe(true);
      updateToolpathReveal({ reveal, program, time: -1, head });
      expect(reveal.chunks.every(({ mesh }) => mesh.geometry.instanceCount === 0)).toBe(true);
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
