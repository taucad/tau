import { describe, expect, it } from 'vitest';

import {
  carveraCommand,
  carveraFrameType,
  carveraHalt,
  carveraText,
  createCarveraFrameDecoder,
  encodeCarveraFrame,
  escapeCarveraPath,
  formatCarveraDiagnose,
  formatCarveraStatus,
  parseCarveraBroadcast,
  parseCarveraDiagnose,
  parseCarveraStatus,
  unescapeCarveraPath,
} from '#carvera.protocol.js';

const encoder = new TextEncoder();

describe('frames', () => {
  it('should encode the header, length, type, CRC-16/CCITT and footer', () => {
    // CRC-16/CCITT (XModem, check value 0x31C3) of 00 04 A1 3F is 0x3533.
    expect([...encodeCarveraFrame(carveraFrameType.realtime, encoder.encode('?'))]).toEqual([
      0x86, 0x68, 0x00, 0x04, 0xa1, 0x3f, 0x35, 0x33, 0x55, 0xaa,
    ]);
  });

  it('should decode frames split across chunks and joined in one', () => {
    const decoder = createCarveraFrameDecoder();
    const bytes = new Uint8Array([
      ...carveraCommand('$H'),
      ...encodeCarveraFrame(carveraFrameType.text, encoder.encode('ok\n')),
    ]);
    const first = decoder.push(bytes.subarray(0, 7));
    const rest = decoder.push(bytes.subarray(7));
    expect(first).toEqual([]);
    expect(rest.map((frame) => [frame.type, carveraText(frame.payload)])).toEqual([
      [carveraFrameType.command, '$H\n'],
      [carveraFrameType.text, 'ok\n'],
    ]);
  });

  it('should drop a frame with a bad CRC and resynchronise on the next header', () => {
    const decoder = createCarveraFrameDecoder();
    const corrupt = carveraCommand('M3 S10000');
    corrupt[6] = 0xff - corrupt[6]!;
    const frames = decoder.push(new Uint8Array([0x00, 0x13, ...corrupt, ...carveraCommand('M5')]));
    expect(frames.map((frame) => carveraText(frame.payload))).toEqual(['M5\n']);
  });
});

describe('status', () => {
  it('should parse every field of a stock status line', () => {
    const status = parseCarveraStatus(
      '<Run|MPos:-120.5000,-80.2500,-30.0000,0.0000,0.0000|WPos:128.0000,95.0000,5.0000,0.0000,0.0000|F:800.0,800.0,100|S:10000,10000,100,0,31.5,0,0,0,0|T:1,-2.150|W:3.92|P:42,17,63|A:2|O:0.042|C:1,4,0,1>',
    );
    expect(status).toEqual({
      state: 'Run',
      machine: { x: -120.5, y: -80.25, z: -30 },
      work: { x: 128, y: 95, z: 5 },
      feed: { current: 800, requested: 800, override: 100 },
      spindle: { current: 10_000, target: 10_000, override: 100, vacuumFollows: false, temperature: 31.5 },
      tool: { active: 1, lengthOffset: -2.15 },
      probeVolts: 3.92,
      playing: { line: 42, percent: 17, elapsed: 63 },
      atc: 2,
      levelling: 0.042,
      model: { model: 1, functions: 4, inches: false, absolute: true },
    });
  });

  it('should convert an inch-mode report to millimetres', () => {
    const status = parseCarveraStatus(
      '<Idle|MPos:-1.0000,-2.0000,-0.5000,0,0|WPos:1.0000,0,0,0,0|F:0,10,100|T:-1,0|H:13|C:1,4,1,1>',
    );
    expect(status?.machine).toEqual({ x: -25.4, y: -50.8, z: -12.7 });
    expect(status?.feed.requested).toBeCloseTo(254);
    expect(status?.halt).toBe(13);
    expect(status?.tool.active).toBe(-1);
  });

  it('should drop a garbled field whole and keep its defaults', () => {
    const status = parseCarveraStatus(
      '<Run|MPos:-1.0000,-2.0000,-3.0000,0,0|WPos:1.0000,2.0000,3.0000,0,0|F:800.0,x,100|T:1?,0|P:4,5,6|C:1,4,0,1>',
    );
    expect(status?.feed).toEqual({ current: 0, requested: 0, override: 100 });
    expect(status?.tool.active).toBe(-1);
    expect(status?.playing).toEqual({ line: 4, percent: 5, elapsed: 6 });
    expect(parseCarveraStatus('<Idle|MPos:-1.0000,nan,-3.0000,0,0|WPos:1,2,3,0,0|C:1,4,0,1>')).toBeUndefined();
  });

  it('should round-trip the simulator half', () => {
    const line =
      '<Pause|MPos:-1.0000,-2.0000,-3.0000,0.0000,0.0000|WPos:4.0000,5.0000,6.0000,0.0000,0.0000|F:0.0,1000.0,100|S:9000,9000,100,0,30.0,0,0,0,0|T:3,1.250|P:9,50,12|C:1,4,0,1>';
    expect(formatCarveraStatus(parseCarveraStatus(line)!)).toBe(line);
  });

  it('should refuse a line that is not a status', () => {
    expect(parseCarveraStatus('ok')).toBeUndefined();
    expect(parseCarveraStatus('<Dancing|MPos:0,0,0|WPos:0,0,0>')).toBeUndefined();
  });
});

describe('diagnose', () => {
  it('should read switches, the cover, the probe inputs and the emergency stop', () => {
    expect(parseCarveraDiagnose('{S:0,0|L:0,0|V:1,100|F:0,0|G:1|T:0|R:0|C:0|E:1,0,0,0,0,1|P:0,1|A:0,0|I:0}')).toEqual({
      light: true,
      vacuum: true,
      air: false,
      coverClosed: true,
      probeTriggered: false,
      toolSetterTriggered: true,
      estopPressed: false,
      limits: ['x'],
    });
  });

  it('should round-trip the simulator half', () => {
    const diagnose = {
      light: false,
      vacuum: false,
      air: true,
      coverClosed: false,
      probeTriggered: true,
      toolSetterTriggered: false,
      estopPressed: true,
      limits: [],
    };
    expect(parseCarveraDiagnose(formatCarveraDiagnose(diagnose))).toEqual(diagnose);
  });
});

describe('halts', () => {
  it('should map each range to its recovery', () => {
    expect(carveraHalt(1).recovery).toBe('unlock');
    expect(carveraHalt(13)).toEqual({
      label: 'Emergency stop pressed',
      person: 'Twist the emergency stop to release it.',
      recovery: 'unlock',
    });
    expect(carveraHalt(15).recovery).toBe('home');
    expect(carveraHalt(22).recovery).toBe('reset');
    expect(carveraHalt(41).recovery).toBe('power-cycle');
  });
});

describe('discovery', () => {
  it('should parse the broadcast and its busy flag', () => {
    expect(parseCarveraBroadcast(encoder.encode('Carvera_01,192.168.1.50,2222,1'))).toEqual({
      name: 'Carvera_01',
      address: '192.168.1.50',
      port: 2222,
      busy: true,
    });
  });

  it('should refuse a malformed broadcast', () => {
    expect(parseCarveraBroadcast(encoder.encode('Carvera,not-an-ip,2222,0'))).toBeUndefined();
    expect(parseCarveraBroadcast(encoder.encode('Carvera,10.0.0.2,2222'))).toBeUndefined();
  });
});

describe('paths', () => {
  it('should escape the characters the console splits on', () => {
    const path = '/sd/gcodes/my part?!.nc';
    expect(escapeCarveraPath(path)).toBe('/sd/gcodes/my\u0001part\u0002\u0004.nc');
    expect(unescapeCarveraPath(escapeCarveraPath(path))).toBe(path);
  });
});
