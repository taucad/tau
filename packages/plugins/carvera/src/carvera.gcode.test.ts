import { describe, expect, it } from 'vitest';

import { summarizeCarveraProgram } from '#carvera.gcode.js';

describe('summarizeCarveraProgram', () => {
  it('should report reach, tools, speeds, offsets, uses and time', () => {
    const program = [
      '%',
      '(pocket)',
      'G90 G21 G54',
      'T1 M6',
      'S10000 M3',
      'G0 X0 Y0 Z5',
      'G1 Z-1 F300 ; plunge',
      'G1 X60 F1200',
      'G1 Y40',
      'G2 X0 Y40 I-30 J0',
      'G53 G0 Z-3',
      'G10 L20 P1 X0',
      'T3 M6',
      'M8',
      'G38.2 Z-10 F100',
      'G91 G1 X-5 F600',
      'M600',
      'M5 M30',
    ].join('\n');
    const summary = summarizeCarveraProgram(program);
    expect(summary).toMatchObject({
      lines: 17,
      extents: { x: { min: -5, max: 60 }, y: { min: 0, max: 40 }, z: { min: -1, max: 5 } },
      tools: [1, 3],
      spindleSpeed: { min: 10_000, max: 10_000 },
      maximumFeed: 1200,
      workOffsets: ['G54'],
      longLines: [],
    });
    expect([...summary.uses].sort()).toEqual(['coolant', 'probing', 'program-stop', 'tool-change']);
    // The first rapid has no known start; then a 6 mm plunge at 300, 60 + 40 + 60 mm (the arc as its chord) at 1200
    // and 5 mm at 600.
    expect(summary.estimatedDuration).toBe(Math.round((6 / 300 + 160 / 1200 + 5 / 600) * 60_000));
  });

  it('should flag lines the machine would skip and convert inches', () => {
    const summary = summarizeCarveraProgram(`G20\nG0 X1 Y2\n(${'x'.repeat(130)})\n`);
    expect(summary.longLines).toEqual([3]);
    expect(summary.extents['x']).toEqual({ min: 25.4, max: 25.4 });
  });
});
