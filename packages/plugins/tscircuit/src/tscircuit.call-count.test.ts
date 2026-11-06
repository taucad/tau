// @vitest-environment node
/* eslint-disable @typescript-eslint/naming-convention -- circuit JSON field names are snake_case. */
/**
 * Call-count regression tests for the tscircuit kernel's presentation board, the copper and
 * silkscreen geometry every 3D render and GLB export builds (cad-performance-policy Rule 3;
 * wasm-kernel-call-batching-policy-blueprint P3).
 *
 * The board is built with `@tscircuit/manifold-2d`. The tests spy on the `CrossSection` calls
 * Tau's board code makes and count them for traces of growing length. Board regions are one
 * extrusion each, and trace and text strokes are capsule contours built in JavaScript and filled as
 * one cross-section per side and layer, so the counts do not grow with the segments.
 */
import { Document } from '@gltf-transform/core';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { MockInstance } from 'vitest';
import { getManifoldModule } from '@tscircuit/manifold-2d';
import { buildPresentationBoard } from '#board-geometry.js';

type Counts = Record<string, number>;

/** A 40 x 10 mm board with one top trace of `segments` straight segments. */
const boardWithTrace = (segments: number): Array<{ type: string } & Record<string, unknown>> => [
  { type: 'pcb_board', pcb_board_id: 'b', center: { x: 0, y: 0 }, width: 40, height: 10, thickness: 1.6 },
  {
    type: 'pcb_trace',
    route: Array.from({ length: segments + 1 }, (_, index) => ({
      route_type: 'wire',
      x: -15 + (30 * index) / segments,
      y: index % 2 === 0 ? -2 : 2,
      width: 0.3,
      layer: 'top',
    })),
  },
];

/** The same board with silkscreen text instead of a trace. */
const boardWithText = (text: string): Array<{ type: string } & Record<string, unknown>> => [
  { type: 'pcb_board', pcb_board_id: 'b', center: { x: 0, y: 0 }, width: 40, height: 10, thickness: 1.6 },
  { type: 'pcb_silkscreen_text', layer: 'top', text, font_size: 1, anchor_position: { x: 0, y: 0 } },
];

afterEach(() => {
  vi.restoreAllMocks();
});

/**
 * Count the `CrossSection` calls one board build makes.
 * @param circuitJson - The circuit to build.
 * @returns Calls per member.
 */
const measureBoard = async (circuitJson: ReadonlyArray<{ type: string }>): Promise<Counts> => {
  const m = await getManifoldModule();
  const probe = m.CrossSection.square([1, 1]);
  const prototype = Object.getPrototypeOf(probe) as typeof probe;
  probe.delete();
  const spies: Record<string, MockInstance> = {
    'CrossSection.circle': vi.spyOn(m.CrossSection, 'circle'),
    'CrossSection.hull': vi.spyOn(m.CrossSection, 'hull'),
    'CrossSection.union': vi.spyOn(m.CrossSection, 'union'),
    'CrossSection.translate': vi.spyOn(prototype, 'translate'),
  };
  try {
    expect(await buildPresentationBoard(new Document(), circuitJson)).toBeDefined();
    return Object.fromEntries(Object.entries(spies).map(([name, spy]) => [name, spy.mock.calls.length]));
  } finally {
    vi.restoreAllMocks();
  }
};

describe('tscircuit presentation board call counts', () => {
  it('should make the same calls for copper traces of any length', async () => {
    const counts = {
      bare: await measureBoard(boardWithTrace(1).slice(0, 1)),
      short: await measureBoard(boardWithTrace(2)),
      long: await measureBoard(boardWithTrace(8)),
    };

    // Blueprint A12 (WP7, charter B6): one `CrossSection.circle` read gives the capsules their
    // vertices, and the copper layer is one union. The bare board's outline is one translated region.
    expect(counts).toEqual({
      bare: { 'CrossSection.circle': 0, 'CrossSection.hull': 0, 'CrossSection.union': 0, 'CrossSection.translate': 1 },
      short: { 'CrossSection.circle': 1, 'CrossSection.hull': 0, 'CrossSection.union': 1, 'CrossSection.translate': 1 },
      long: { 'CrossSection.circle': 1, 'CrossSection.hull': 0, 'CrossSection.union': 1, 'CrossSection.translate': 1 },
    });
  });

  it('should make the same calls for silkscreen text of any length', async () => {
    const counts = {
      short: await measureBoard(boardWithText('R1')),
      long: await measureBoard(boardWithText('R1234567')),
    };

    // Blueprint A12 (WP7, charter B6): glyph strokes are capsules like trace segments, filled with
    // the rest of the layer's silkscreen.
    expect(counts).toEqual({
      short: { 'CrossSection.circle': 1, 'CrossSection.hull': 0, 'CrossSection.union': 1, 'CrossSection.translate': 1 },
      long: { 'CrossSection.circle': 1, 'CrossSection.hull': 0, 'CrossSection.union': 1, 'CrossSection.translate': 1 },
    });
  });

  it('should free every cross-section and solid it derives while building a board', async () => {
    const m = await getManifoldModule();
    const probe = m.CrossSection.square([1, 1]);
    const prototype = Object.getPrototypeOf(probe) as typeof probe;
    const solidProbe = probe.extrude(1);
    const solidPrototype = Object.getPrototypeOf(solidProbe) as typeof solidProbe;
    solidProbe.delete();
    probe.delete();
    const spies: MockInstance[] = [
      ...(['circle', 'square', 'hull', 'union'] as const).map((name) => vi.spyOn(m.CrossSection, name)),
      ...(['translate', 'rotate', 'offset', 'subtract', 'intersect', 'extrude'] as const).map((name) =>
        vi.spyOn(prototype, name),
      ),
      vi.spyOn(solidPrototype, 'translate'),
    ];
    const circuitJson = [
      ...boardWithTrace(4),
      { type: 'pcb_silkscreen_text', layer: 'bottom', text: 'U1', font_size: 1, anchor_position: { x: 0, y: 3 } },
      { type: 'pcb_smtpad', shape: 'rect', layer: 'top', x: -15, y: -2, width: 1, height: 0.6, corner_radius: 0.1 },
      { type: 'pcb_plated_hole', shape: 'circle', x: 15, y: 2, hole_diameter: 0.8, outer_diameter: 1.4 },
      { type: 'pcb_via', x: 0, y: 0, outer_diameter: 0.6, hole_diameter: 0.3 },
      { type: 'pcb_silkscreen_circle', layer: 'top', center: { x: 10, y: -3 }, radius: 1, stroke_width: 0.1 },
      { type: 'pcb_silkscreen_rect', layer: 'top', center: { x: -10, y: 3 }, width: 2, height: 1, stroke_width: 0.1 },
    ];
    try {
      expect(await buildPresentationBoard(new Document(), circuitJson)).toBeDefined();
      const handles = spies.flatMap((spy) =>
        spy.mock.results.map((result) => result.value as { isDeleted(): boolean }),
      );
      expect(handles.length).toBeGreaterThan(0);
      expect(handles.filter((handle) => !handle.isDeleted())).toEqual([]);
    } finally {
      vi.restoreAllMocks();
    }
  });
});
