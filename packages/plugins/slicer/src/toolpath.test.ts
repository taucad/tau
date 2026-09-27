import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import { parseGcode, segmentAtTime, ToolpathParseError, toolpathSegmentKinds } from '#toolpath.js';
import type { ToolpathProgram } from '#toolpath.js';

const fixtures = join(dirname(fileURLToPath(import.meta.url)), '__fixtures__');
const readFixture = (name: string): Uint8Array<ArrayBuffer> => Uint8Array.from(readFileSync(join(fixtures, name)));

const kindCounts = (program: ToolpathProgram): Record<string, number> => {
  const counts: Record<string, number> = {};
  for (const kind of program.kinds) {
    const name = toolpathSegmentKinds[kind]!;
    counts[name] = (counts[name] ?? 0) + 1;
  }
  return counts;
};

const linearSegmentAtTime = (program: ToolpathProgram, time: number): number => {
  if (program.segmentCount === 0 || time < program.times[0]!) {
    return -1;
  }
  for (let index = 0; index < program.segmentCount; index += 1) {
    if (time < program.times[index * 2 + 1]!) {
      return index;
    }
  }
  return program.segmentCount;
};

const segmentEnds = (program: ToolpathProgram): Array<[number, number, number]> => {
  const ends: Array<[number, number, number]> = [];
  for (let index = 0; index < program.segmentCount; index += 1) {
    ends.push([
      program.positions[index * 6 + 3]!,
      program.positions[index * 6 + 4]!,
      program.positions[index * 6 + 5]!,
    ]);
  }
  return ends;
};

const segmentLengths = (program: ToolpathProgram): number[] =>
  segmentEnds(program).map(([x, y, z], index) =>
    Math.hypot(
      x - program.positions[index * 6]!,
      y - program.positions[index * 6 + 1]!,
      z - program.positions[index * 6 + 2]!,
    ),
  );

const expectMonotonicTimes = (program: ToolpathProgram): void => {
  let previousEnd = 0;
  for (let index = 0; index < program.segmentCount; index += 1) {
    const start = program.times[index * 2]!;
    const end = program.times[index * 2 + 1]!;
    expect(start).toBeGreaterThanOrEqual(previousEnd);
    expect(end).toBeGreaterThanOrEqual(start);
    previousEnd = end;
  }
  // Segment times are Float32; the program clock is double.
  expect(program.duration).toBeGreaterThanOrEqual(previousEnd - 1e-3);
};

const expectBinarySearchMatchesLinearScan = (program: ToolpathProgram): void => {
  const probes = [
    -1,
    0,
    program.duration / 3,
    program.duration / 2,
    program.duration - 1e-3,
    program.duration,
    program.duration + 1,
  ];
  for (let index = 0; index < program.segmentCount; index += Math.max(1, Math.floor(program.segmentCount / 97))) {
    probes.push(program.times[index * 2]!, (program.times[index * 2]! + program.times[index * 2 + 1]!) / 2);
  }
  for (const time of probes) {
    expect(segmentAtTime(program, time)).toBe(linearSegmentAtTime(program, time));
  }
};

describe('parseGcode', () => {
  describe('S-L1 ST fixture', () => {
    const program = parseGcode(readFixture('st.gcode'));

    it('should record the source digest and parser identity', () => {
      expect(program.source).toEqual({
        digest: 'sha256:0967e63c5dab107b89d9d0ce4215de99b65b731c962bbced32b1bb8986e4ac50',
        parser: { id: 'tau.slicer.toolpath', version: '2' },
      });
      expect(program.version).toBe(1);
      expect(program.units).toBe('mm');
    });

    it('should start from an unknown pose because the program never homes', () => {
      expect(program.initialPosition).toBe('unknown');
    });

    it('should count every executable record into the coverage classes', () => {
      expect(program.coverage).toEqual({ records: 2847, known: 2847, vendor: 0, unknown: 0, complete: true });
    });

    it('should emit one segment per known-origin motion or extruder-only move', () => {
      // 1,292 XYZ moves without E minus the three before the first full pose, 760 extruding XY moves that
      // carry no ;TYPE: annotation, and 780 E-only moves minus the one issued while the pose was unknown.
      expect(program.segmentCount).toBe(1289 + 760 + 779);
      expect(kindCounts(program)).toEqual({ travel: 1289, unknown: 760, retract: 779 });
      expect(program.positions).toHaveLength(program.segmentCount * 6);
      expect(program.times).toHaveLength(program.segmentCount * 2);
    });

    it('should recover the source bounds and layers', () => {
      expect(program.bounds.min.map((value) => Number(value.toFixed(3)))).toEqual([87.79, 87.79, 0.2]);
      expect(program.bounds.max.map((value) => Number(value.toFixed(3)))).toEqual([102.21, 102.21, 10.2]);
      expect(program.layerTable).toHaveLength(49);
      expect(program.layerTable[0]).toMatchObject({ index: 0, z: 0.2, firstSegment: 0 });
      expect(program.layerTable.at(-1)).toMatchObject({ index: 48, z: 9.8 });
      expect(program.layerTable.reduce((total, layer) => total + layer.segmentCount, 0)).toBe(program.segmentCount);
      expect(program.layers[program.segmentCount - 1]).toBe(48);
    });

    it('should total the net filament, matching the engine footer, and produce monotonic times', () => {
      expect(program.filamentLength).toBeCloseTo(183.05, 2);
      expectMonotonicTimes(program);
      expect(program.duration).toBeCloseTo(program.times[program.segmentCount * 2 - 1]!, 3);
      expect(program.duration).toBeGreaterThan(30);
      expect(program.duration).toBeLessThan(600);
    });

    it('should classify temperatures, fans and layer changes as events', () => {
      const kinds = program.events.map((event) => event.kind);
      expect(kinds.filter((kind) => kind === 'bed-temperature')).toHaveLength(3);
      expect(kinds.filter((kind) => kind === 'nozzle-temperature')).toHaveLength(3);
      expect(kinds.filter((kind) => kind === 'fan')).toHaveLength(5);
      expect(kinds.filter((kind) => kind === 'layer-change')).toHaveLength(49);
      expect(program.events[0]).toEqual({ time: 0, kind: 'bed-temperature', value: 60 });
    });

    it('should locate segments by time with the same answer as a linear scan', () => {
      expectBinarySearchMatchesLinearScan(program);
    });
  });

  describe('S-L1 MT fixture', () => {
    it('should refuse the program at its first extruder motion because the preamble follows the layers', () => {
      let error: unknown;
      try {
        parseGcode(readFixture('mt.gcode'));
        expect.fail('should have thrown');
      } catch (error_) {
        error = error_;
      }
      expect(error).toBeInstanceOf(ToolpathParseError);
      expect(error).toMatchObject({
        name: 'ToolpathParseError',
        code: 'TOOLPATH_UNINITIALIZED_MOTION',
        record: 5,
        message: 'Record 5 moves the extruder before any nozzle temperature was commanded.',
      });
    });
  });

  describe('Bambu-style vendor excerpt', () => {
    const program = parseGcode(readFixture('bambu-vendor-excerpt.gcode'));

    it('should be homed because G28 precedes every motion', () => {
      expect(program.initialPosition).toBe('homed');
    });

    it('should expose the opening M73 remaining time as the slicer estimate', () => {
      expect(program.headerEstimate).toEqual({ seconds: 720, source: 'm73' });
    });

    it('should retain vendor records, count the unknown one and never treat comments as executables', () => {
      // 61 executable lines: 24 vendor-family records, one unknown (M9999), the rest known.
      expect(program.coverage).toEqual({ records: 61, known: 36, vendor: 24, unknown: 1, complete: false });
      const vendor = program.events.filter((event) => event.kind === 'vendor').map((event) => event.record);
      expect(vendor).toContain('M970 Q1 A10 B10 C130 K0');
      expect(vendor).toContain('M1002 judge_flag build_plate_detect_flag');
      expect(vendor).toContain('M622.1 S1');
      expect(vendor).toContain('M201.2 K1.0');
      expect(vendor).toContain('M400 U1');
      expect(vendor).toHaveLength(24);
    });

    it('should linearise the helical full-circle G3 and the quarter G3 arc', () => {
      const kinds = kindCounts(program);
      // Two layers of annotated work: 1 outer-wall line + G3 quarter arc (steps) + 1 wall line, one wipe, one infill line.
      expect(kinds['outer-wall']).toBeGreaterThan(3);
      expect(kinds['infill']).toBe(1);
      expect(kinds['wipe']).toBe(1);
      // The start-sequence purge line carries no annotation, so it is the excerpt's one unknown extrusion.
      expect(kinds['unknown']).toBe(1);
      // The G3 full circle with P1 climbs from Z0.4 to Z0.8 around (235.149, 5.87), radius ≈1.217, so X stays inside [233.9, 236.4].
      const ends = segmentEnds(program);
      // Float32 stores 0.4 slightly high, so the Z0.4 approach move is excluded by a margin.
      const circle = ends.filter((end, index) => end[2] > 0.41 && end[2] <= 0.8 && program.kinds[index] === 0);
      expect(circle.length).toBeGreaterThanOrEqual(4);
      for (const [x] of circle) {
        expect(x).toBeGreaterThan(233.9);
        expect(x).toBeLessThan(236.4);
      }
      // The quarter arc lands exactly on its endpoint.
      expect(ends.some(([x, y]) => Math.abs(x - 130) < 1e-4 && Math.abs(y - 110) < 1e-4)).toBe(true);
    });

    it('should raise pauses, tool changes, chamber and fan events in program order', () => {
      const events = program.events.filter((event) => event.kind !== 'vendor' && event.kind !== 'layer-change');
      expect(events.map((event) => `${event.kind}:${event.value ?? ''}`)).toEqual([
        'bed-temperature:55',
        'nozzle-temperature:220',
        'bed-temperature:55',
        'nozzle-temperature:220',
        'chamber-temperature:35',
        'fan:0',
        'fan:70',
        'pause:',
        'tool-change:255',
        'pause:',
        'nozzle-temperature:0',
        'bed-temperature:0',
        'fan:0',
      ]);
      // The purge and helix before the first ;LAYER_CHANGE belong to that first annotated layer.
      expect(program.layerTable.map((layer) => layer.z)).toEqual([0.2, 0.4]);
      expect(program.layerTable[0]).toMatchObject({ index: 0, firstSegment: 0 });
      expect(program.tools[program.segmentCount - 1]).toBe(0);
    });

    it('should mark the start sequence before the first ;LAYER_CHANGE as the preamble', () => {
      const { preambleSegmentCount } = program;
      const unknownIndex = program.kinds.indexOf(toolpathSegmentKinds.indexOf('unknown'));
      expect(unknownIndex).toBeGreaterThanOrEqual(0);
      expect(unknownIndex).toBeLessThan(preambleSegmentCount);
      const printed = [...program.kinds.keys()].filter((index) =>
        ['outer-wall', 'infill'].includes(toolpathSegmentKinds[program.kinds[index]!]!),
      );
      expect(Math.min(...printed)).toBeGreaterThanOrEqual(preambleSegmentCount);
      // The first segment after the annotation is the layer's own `G1 Z0.2` approach.
      expect(program.positions[preambleSegmentCount * 6 + 5]).toBeCloseTo(0.2, 5);
    });

    it('should honour the G4 dwell in the clock', () => {
      const lastEnd = program.times[program.segmentCount * 2 - 1]!;
      expect(program.duration - lastEnd).toBeCloseTo(2, 5);
      expectMonotonicTimes(program);
    });
  });

  describe('limits and refusals', () => {
    it('should refuse sources over the byte limit before decoding', () => {
      expect(() => parseGcode(new Uint8Array(65), { maximumBytes: 64 })).toThrow(
        new ToolpathParseError(
          'TOOLPATH_SOURCE_TOO_LARGE',
          'G-code source is 65 bytes; the parser accepts at most 64.',
        ),
      );
    });

    it('should refuse sources over the record limit', () => {
      expect(() => parseGcode('G90\nM83\nG28\nG1 X1 F100\n', { maximumRecords: 3 })).toThrow(
        expect.objectContaining({ code: 'TOOLPATH_RECORD_LIMIT', record: 4 }),
      );
    });

    it('should refuse cold extrusion, inch units, malformed words and far coordinates', () => {
      expect(() => parseGcode('G90\nM83\nG28\nG1 X1 E1 F100\n')).toThrow(
        expect.objectContaining({ code: 'TOOLPATH_UNINITIALIZED_MOTION', record: 4 }),
      );
      expect(() => parseGcode('G90\nG20\nG28\n')).toThrow(
        expect.objectContaining({ code: 'TOOLPATH_INVALID_RECORD', record: 2 }),
      );
      expect(() => parseGcode('G90\nM83\nG28\nG1 X1 F100 Qz\n')).toThrow(
        expect.objectContaining({ code: 'TOOLPATH_INVALID_RECORD', record: 4 }),
      );
      expect(() => parseGcode('G90\nM83\nG28\nG1 X20000 F100\n')).toThrow(
        expect.objectContaining({ code: 'TOOLPATH_INVALID_RECORD', record: 4 }),
      );
    });

    it('should apply the firmware defaults of absolute positioning and absolute extrusion', () => {
      // The real X1C start sequence lifts Z before G90 and purges with absolute E before M83.
      const program = parseGcode(
        'G0 Z20 F9000\nG28\nM109 S205\nG1 X10 F3000\nG1 X20 E15\nG1 X30 E30\nM83\nG1 X40 E0.5\n',
      );
      expect(program.initialPosition).toBe('homed');
      expect([...program.extrusion]).toEqual([0, 15, 15, 0.5]);
      expect([...program.positions.subarray(0, 6)]).toEqual([0, 0, 0, 10, 0, 0]);
    });

    it('should read Bambu Studio annotation spellings', () => {
      const program = parseGcode(
        'G90\nM83\nG28\nM104 S220\n; CHANGE_LAYER\n; Z_HEIGHT: 0.2\n; FEATURE: Outer wall\nG1 X10 F3000\nG1 X20 E1\n; CHANGE_LAYER\n; Z_HEIGHT: 0.4\n; FEATURE: Sparse infill\nG1 X30 E1\n',
      );
      expect(program.layerTable.map((layer) => layer.z)).toEqual([0.2, 0.4]);
      expect([...program.kinds].map((kind) => toolpathSegmentKinds[kind])).toEqual(['travel', 'outer-wall', 'infill']);
    });

    it('should sweep clockwise arcs the long way when the words demand it and honour R arcs', () => {
      const long = parseGcode('G90\nM83\nG28\nG1 X120 Y100 F3000\nG2 X130 Y110 I0 J10\n');
      // Clockwise from the bottom of the circle to its right-hand point is a 270° arc of radius 10.
      expect(
        segmentLengths(long)
          .slice(1)
          .reduce((total, length) => total + length, 0),
      ).toBeCloseTo((3 * Math.PI * 10) / 2, 1);
      expect([...long.positions.subarray(long.segmentCount * 6 - 3)]).toEqual([130, 110, 0]);
      for (const [x, y] of segmentEnds(long).slice(1)) {
        expect(Math.hypot(x - 120, y - 110)).toBeCloseTo(10, 3);
      }
      // A positive R selects the short (90°) arc; clockwise from the origin to (10, 10) it bulges up and left.
      const short = parseGcode('G90\nM83\nG28\nG2 X10 Y10 R10 F3000\n');
      expect(segmentLengths(short).reduce((total, length) => total + length, 0)).toBeCloseTo((Math.PI * 10) / 2, 1);
      for (const [x, y] of segmentEnds(short)) {
        expect(Math.hypot(x - 10, y)).toBeCloseTo(10, 3);
        expect(x).toBeGreaterThanOrEqual(-1e-6);
        expect(x).toBeLessThanOrEqual(10 + 1e-6);
        expect(y).toBeGreaterThanOrEqual(-1e-6);
        expect(y).toBeLessThanOrEqual(10 + 1e-6);
      }
      expect(() => parseGcode('G90\nM83\nG28\nG2 X10 Y10 R1 F3000\n')).toThrow(
        expect.objectContaining({ code: 'TOOLPATH_INVALID_RECORD', record: 4 }),
      );
    });

    it('should apply absolute and relative extrusion with G92 resets', () => {
      const program = parseGcode(
        'G90\nM82\nG28\nM104 S200\nG1 X10 E2 F600\nG92 E0\nG1 X20 E1.5\nM83\nG1 X30 E-0.5\nG91\nG1 X5 E0.25\n',
      );
      expect([...program.extrusion]).toEqual([2, 1.5, -0.5, 0.25]);
      expect(program.filamentLength).toBeCloseTo(3.25, 6);
      expect([...program.positions.subarray(18, 24)]).toEqual([30, 0, 0, 35, 0, 0]);
      expect(program.initialPosition).toBe('homed');
    });

    it('should accept valueless flag words and home only the axes a G28 names', () => {
      const program = parseGcode(
        [
          'G90',
          'M83',
          'M104 S220',
          'G28',
          'G1 X50 Y40 Z5 F6000',
          'G28 X',
          'G1 Y60',
          'G28 Z P0 T300',
          'G1 X10',
          'M221 S',
          'M221 Z0',
          'M221 R',
          'G29 A X118 Y118 I20 J20',
          'M17 S',
          'G1 X20 Y',
          '',
        ].join('\n'),
      );
      expect(segmentEnds(program)).toEqual([
        [50, 40, 5],
        [0, 60, 5],
        [10, 60, 0],
        [20, 60, 0],
      ]);
      // `G28 X` keeps Y and Z; `G28 Z P0 T300` keeps X and Y; a valueless axis word on a move carries no target.
      expect([...program.positions.subarray(6, 9)]).toEqual([0, 40, 5]);
      expect([...program.positions.subarray(12, 15)]).toEqual([0, 60, 0]);
      expect(program.coverage).toEqual({ records: 15, known: 14, vendor: 1, unknown: 0, complete: true });
      expect(program.events.filter((event) => event.kind === 'vendor').map((event) => event.record)).toEqual(['M17 S']);
    });

    it('should retain dotted vendor subcommands and accept a settings save with a flag', () => {
      const program = parseGcode('M970.3 Q1 A7 B30 H15\nM980.3 A70 J0.02\nM1002.1 S1\nM500 R\nM500\n');
      expect(program.coverage).toEqual({ records: 5, known: 2, vendor: 3, unknown: 0, complete: true });
    });

    it('should neither extrude nor refuse a cold nozzle for a valueless E word', () => {
      const program = parseGcode('G28\nG1 X10 E F600\n');
      expect([...program.extrusion]).toEqual([0]);
      expect(program.filamentLength).toBe(0);
    });

    it('should read the Bambu header estimate in preference to the first M73 remaining time', () => {
      const header = parseGcode(
        [
          '; HEADER_BLOCK_START',
          '; model printing time: 50m 1s; total estimated time: 1h 2m 3s',
          '; HEADER_BLOCK_END',
          '; CONFIG_BLOCK_START',
          '; note = total estimated time: 9m 9s',
          '; CONFIG_BLOCK_END',
          'M73 P0 R61',
          'G28',
          'G1 X10 F600',
          '',
        ].join('\n'),
      );
      expect(header.headerEstimate).toEqual({ seconds: 3723, source: 'bambu-header' });
      expect(
        parseGcode('; HEADER_BLOCK_START\n; total estimated time: 1d 0h 0m 2s\n; HEADER_BLOCK_END\n'),
      ).toHaveProperty('headerEstimate', { seconds: 86_402, source: 'bambu-header' });
      // A comment outside the header block is configuration text, not an estimate.
      expect(parseGcode('; total estimated time: 9m 9s\nM73 P0 R12\nM73 P50 R6\n').headerEstimate).toEqual({
        seconds: 720,
        source: 'm73',
      });
      expect(parseGcode('M73 P0\nG28\n').headerEstimate).toBeUndefined();
    });

    it('should return an empty program for comments only', () => {
      const program = parseGcode('; nothing\n\n; still nothing');
      expect(program.segmentCount).toBe(0);
      expect(program.coverage).toEqual({ records: 0, known: 0, vendor: 0, unknown: 0, complete: true });
      expect(program.bounds).toEqual({ min: [0, 0, 0], max: [0, 0, 0] });
      expect(segmentAtTime(program, 0)).toBe(-1);
    });

    it('should mark no preamble when the source annotates no layers', () => {
      expect(parseGcode('G28\nG1 X10 F600\n').preambleSegmentCount).toBe(0);
    });
  });
});
