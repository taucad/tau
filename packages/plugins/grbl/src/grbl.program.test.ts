import { describe, expect, it } from 'vitest';

import { readGrblProgram } from '#grbl.program.js';
import { grblDemoProgram, grblSimulatorDefaults } from '#grbl.simulator.js';

describe('readGrblProgram', () => {
  it('summarizes extents, tools, speeds, feeds, offsets and the pauses a program asks for', () => {
    const program = readGrblProgram(
      [
        '%',
        '(sign)',
        'G21 G90 G55',
        'T1 M6',
        'S12000 M3',
        'G0 X0 Y0 Z5',
        'G1 Z-2 F300',
        'G1 X50 F1500',
        'M0',
        'T3 M6',
        'S18000 M3',
        'G38.2 Z-10 F75',
        'M8',
        'M30',
        '%',
      ].join('\n'),
      'sign.gcode',
    );
    expect(program.summary).toMatchObject({
      name: 'sign.gcode',
      facts: {
        process: 'milling',
        lines: 12,
        extents: { x: { min: 0, max: 50 }, y: { min: 0, max: 0 }, z: { min: -10, max: 5 } },
        tools: [{ number: 1 }, { number: 3 }],
        spindleSpeed: { min: 12_000, max: 18_000 },
        maximumFeed: 1500,
        workOffsets: ['G55'],
        uses: ['coolant', 'probing', 'program-stop', 'tool-change'],
      },
    });
    expect(program.toolChanges).toEqual([
      { line: 4, tool: 1 },
      { line: 10, tool: 3 },
    ]);
    expect(program.refused).toEqual([]);
    expect(program.summary.estimatedDuration).toBeGreaterThan(0);
  });

  it('includes the extremes an arc sweeps through, not only its end points', () => {
    const program = readGrblProgram('G90 G17\nG0 X10 Y0\nG3 X-10 Y0 I-10 J0 F1000', 'arc');
    expect(program.summary.facts.extents).toMatchObject({ x: { min: -10, max: 10 }, y: { min: 0, max: 10 } });
    const clockwise = readGrblProgram('G90 G17\nG0 X10 Y0\nG2 X-10 Y0 I-10 J0 F1000', 'arc');
    expect(clockwise.summary.facts.extents['y']).toEqual({ min: -10, max: 0 });
  });

  it('converts inches, follows incremental moves and keeps G53 moves in machine coordinates', () => {
    const program = readGrblProgram('G20 G90\nG0 X1 Y1\nG91\nG1 X1 F10\nG90 G53 G0 Z-5', 'inch');
    expect(program.summary.facts.extents['x']).toEqual({ min: 25.4, max: 50.8 });
    expect(program.summary.facts.maximumFeed).toBeCloseTo(254);
    expect(program.machineExtents).toEqual({ z: { min: -127, max: -127 } });
  });

  it('lists the lines Grbl would refuse', () => {
    const program = readGrblProgram(`G41 D1\nG81 X1 Y1 Z-1 R1\nM98 P100\nG1 X${'1'.repeat(90)}`, 'bad');
    expect(program.refused.map((refusal) => refusal.line)).toEqual([1, 2, 3, 4]);
    expect(program.refused[0]?.reason).toBe('Grbl does not run G41.');
  });

  it('keeps the demonstration program to about a minute at the simulator speed', () => {
    const { summary } = readGrblProgram(grblDemoProgram(), 'demo');
    expect(summary.estimatedDuration! / grblSimulatorDefaults.speed).toBeGreaterThan(40_000);
    expect(summary.estimatedDuration! / grblSimulatorDefaults.speed).toBeLessThan(90_000);
  });
});
