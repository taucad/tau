// @vitest-environment node
/* eslint-disable @typescript-eslint/naming-convention -- circuit JSON field names are snake_case. */
/**
 * Call-count regression tests for the tscircuit kernel's presentation board, the copper and
 * silkscreen geometry every 3D render and GLB export builds (cad-performance-policy Rule 3;
 * wasm-kernel-call-batching-policy-blueprint P3).
 *
 * The board is built with `@tscircuit/manifold-2d`. The tests spy on the `CrossSection` calls
 * Tau's board code makes and count them for traces of growing length. Board regions are already
 * one extrusion each; trace and text strokes are still built segment by segment, so those counts
 * are pinned at today's numbers until the strokes are built as one cross-section per layer.
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
  it('should record per-segment calls for copper traces', async () => {
    const counts = {
      bare: await measureBoard(boardWithTrace(1).slice(0, 1)),
      short: await measureBoard(boardWithTrace(2)),
      long: await measureBoard(boardWithTrace(8)),
    };

    // Blueprint A12 (WP7, charter B6): each trace segment is a hull of two translated circles,
    // about five calls a segment. B6 builds every capsule's contour in JavaScript and makes one
    // `new CrossSection(contours, 'Positive')` per layer, so these stop growing with the segments.
    // The bare board's outline is one translated region.
    expect(counts).toEqual({
      bare: { 'CrossSection.circle': 0, 'CrossSection.hull': 0, 'CrossSection.union': 0, 'CrossSection.translate': 1 },
      short: { 'CrossSection.circle': 4, 'CrossSection.hull': 2, 'CrossSection.union': 2, 'CrossSection.translate': 5 },
      long: {
        'CrossSection.circle': 16,
        'CrossSection.hull': 8,
        'CrossSection.union': 2,
        'CrossSection.translate': 17,
      },
    });
  });

  it('should record per-stroke calls for silkscreen text', async () => {
    const counts = {
      short: await measureBoard(boardWithText('R1')),
      long: await measureBoard(boardWithText('R1234567')),
    };

    // Blueprint A12 (WP7, charter B6): each glyph stroke is a capsule like a trace segment, and a
    // union of its own.
    expect(counts).toEqual({
      short: {
        'CrossSection.circle': 34,
        'CrossSection.hull': 17,
        'CrossSection.union': 19,
        'CrossSection.translate': 35,
      },
      long: {
        'CrossSection.circle': 228,
        'CrossSection.hull': 114,
        'CrossSection.union': 116,
        'CrossSection.translate': 229,
      },
    });
  });
});
