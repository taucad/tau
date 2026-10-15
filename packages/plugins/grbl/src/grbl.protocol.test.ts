import { describe, expect, it } from 'vitest';

import {
  GrblCharacterCounter,
  cleanGcodeLine,
  createGrblLineSplitter,
  grblAlarm,
  grblErrorSentence,
  grblFeedOverrideBytes,
  grblRealtime,
  parseGrblLine,
} from '#grbl.protocol.js';

describe('parseGrblLine', () => {
  it('reads replies, alarms, the welcome line and settings', () => {
    expect(parseGrblLine('ok')).toEqual({ type: 'ok' });
    expect(parseGrblLine('error:20')).toEqual({ type: 'error', code: 20 });
    expect(parseGrblLine('ALARM:1')).toEqual({ type: 'alarm', code: 1 });
    expect(parseGrblLine("Grbl 1.1h ['$' for help]")).toEqual({ type: 'welcome', firmware: 'Grbl', version: '1.1h' });
    expect(parseGrblLine("GrblHAL 1.1f ['$' or '$HELP' for help]")).toMatchObject({ firmware: 'GrblHAL' });
    expect(parseGrblLine('$110=4000.000')).toEqual({ type: 'setting', id: 110, value: 4000 });
  });

  it('reads bracketed feedback', () => {
    expect(parseGrblLine("[MSG:'$H'|'$X' to unlock]")).toEqual({ type: 'message', text: "'$H'|'$X' to unlock" });
    expect(parseGrblLine('[GC:G0 G54 G17 G21 G90 G94 M5 M9 T0 F0 S0]')).toEqual({
      type: 'parser',
      words: ['G0', 'G54', 'G17', 'G21', 'G90', 'G94', 'M5', 'M9', 'T0', 'F0', 'S0'],
    });
    expect(parseGrblLine('[PRB:1.000,2.000,-25.000:1]')).toEqual({
      type: 'probe',
      position: [1, 2, -25],
      isSuccess: true,
    });
    expect(parseGrblLine('[G55:10.000,0.000,-3.500]')).toEqual({ type: 'offset', name: 'G55', values: [10, 0, -3.5] });
    expect(parseGrblLine('[VER:1.1h.20190830:]')).toEqual({ type: 'feedback', key: 'VER', value: '1.1h.20190830:' });
  });

  it('reads status reports in machine-position mode with every optional field', () => {
    expect(
      parseGrblLine(
        '<Hold:0|MPos:1.000,-2.500,3.000|Bf:15,128|FS:1500,18000|Pn:PZ|WCO:0.000,1.000,2.000|Ov:110,50,100|A:SF>',
      ),
    ).toEqual({
      type: 'status',
      status: {
        state: 'Hold',
        substate: 0,
        native: 'Hold:0',
        machine: [1, -2.5, 3],
        buffer: { blocks: 15, bytes: 128 },
        feed: 1500,
        spindle: 18_000,
        pins: 'PZ',
        workOffset: [0, 1, 2],
        overrides: { feed: 110, rapid: 50, spindle: 100 },
        accessories: 'SF',
      },
    });
  });

  it('reads work-position reports and treats Ov without A as every output off', () => {
    const message = parseGrblLine('<Idle|WPos:5.000,6.000,7.000|F:0|Ov:100,100,100>');
    expect(message).toEqual({
      type: 'status',
      status: {
        state: 'Idle',
        native: 'Idle',
        work: [5, 6, 7],
        feed: 0,
        overrides: { feed: 100, rapid: 100, spindle: 100 },
        accessories: '',
      },
    });
  });
});

describe('createGrblLineSplitter', () => {
  it('joins lines split across chunks and drops carriage returns', () => {
    const split = createGrblLineSplitter();
    const encoder = new TextEncoder();
    expect(split(encoder.encode('ok\r\n<Idle|MP'))).toEqual(['ok']);
    expect(split(encoder.encode('os:0,0,0>\r\nerror:'))).toEqual(['<Idle|MPos:0,0,0>']);
    expect(split(encoder.encode('9\r\n'))).toEqual(['error:9']);
  });
});

describe('GrblCharacterCounter', () => {
  it('keeps unacknowledged bytes within the serial buffer and learns a larger one from Bf', () => {
    const counter = new GrblCharacterCounter();
    const line = 'G1X100.000Y100.000Z-1.000F1500'; // 30 characters, 31 with the newline
    for (let index = 0; index < 4; index += 1) {
      expect(counter.fits(line)).toBe(true);
      counter.sent(line);
    }
    expect(counter.used).toBe(124);
    expect(counter.fits(line)).toBe(false);
    counter.acknowledged();
    expect(counter.fits(line)).toBe(true);
    counter.clear();
    expect(counter.pending).toBe(0);
    counter.learn({ state: 'Idle', native: 'Idle', buffer: { blocks: 35, bytes: 1023 } });
    expect(counter.capacity).toBe(1023);
  });
});

describe('overrides and code tables', () => {
  it('steps the feed override by tens, then ones, and resets to 100 % in one byte', () => {
    expect(grblFeedOverrideBytes(100, 123)).toEqual([0x91, 0x91, 0x93, 0x93, 0x93]);
    expect(grblFeedOverrideBytes(150, 80)).toEqual(Array.from({ length: 7 }, () => 0x92));
    expect(grblFeedOverrideBytes(70, 100)).toEqual([grblRealtime.feedReset]);
    expect(grblFeedOverrideBytes(100, 500)).toHaveLength(10);
  });

  it('says what errors and alarms mean, including codes only grblHAL has', () => {
    expect(grblErrorSentence(15)).toMatch(/jog would leave/u);
    expect(grblErrorSentence(79)).toMatch(/error 79/u);
    expect(grblAlarm(1)).toMatchObject({ position: 'lost', isCritical: true });
    expect(grblAlarm(5)).toMatchObject({ position: 'kept', isCritical: false });
    expect(grblAlarm(17)).toMatchObject({ position: 'lost' });
  });

  it('cleans program lines as a sender streams them', () => {
    expect(cleanGcodeLine('g1 x10 (cut) y5 ; finish')).toBe('G1X10Y5');
    expect(cleanGcodeLine('%')).toBe('');
    expect(cleanGcodeLine('(only a comment)')).toBe('');
  });
});
