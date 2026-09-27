import { describe, expect, it, vi } from 'vitest';
import { segmentAtTime } from '@taucad/slicer/toolpath';
import {
  advancePlayback,
  createExtrusionPrefix,
  createPlaybackStore,
  eventValueAt,
  extrudedLengthAt,
  formatDuration,
  layerAtTime,
  layerStartTime,
  liveTime,
  maxSpeedRunSeconds,
  speedFactor,
  stepSegmentTime,
} from '#components/printer/printer-playback.js';
import type { PlaybackState } from '#components/printer/printer-playback.js';
import { fixtureProgram } from '#components/printer/testing/toolpath-fixture.js';

const program = fixtureProgram({ layers: 12 });
const playing: PlaybackState = { time: 0, speed: 1, isPlaying: true, isLive: false };

describe('printer playback arithmetic', () => {
  it('should parse a fixture with layers, duration and segments to reason about', () => {
    expect(program.layerTable).toHaveLength(12);
    expect(program.segmentCount).toBeGreaterThan(100);
    expect(program.duration).toBeGreaterThan(10);
  });

  it('should advance by wall-clock seconds times the speed', () => {
    expect(advancePlayback(playing, program, 0.5).time).toBeCloseTo(0.5, 6);
    expect(advancePlayback({ ...playing, speed: 10 }, program, 0.5).time).toBeCloseTo(5, 6);
    expect(advancePlayback({ ...playing, speed: 100 }, program, 0.01).time).toBeCloseTo(1, 6);
  });

  it('should replay the whole run in ten seconds at max speed', () => {
    expect(speedFactor('max', program.duration)).toBeCloseTo(program.duration / maxSpeedRunSeconds, 6);
    const state = advancePlayback({ ...playing, speed: 'max' }, program, maxSpeedRunSeconds);
    expect(state.time).toBe(program.duration);
    expect(state.isPlaying).toBe(false);
  });

  it('should clamp at the end of the run and stop playing', () => {
    const state = advancePlayback({ ...playing, time: program.duration - 0.1 }, program, 5);
    expect(state).toEqual({ ...playing, time: program.duration, isPlaying: false });
  });

  it('should not move while paused or live', () => {
    const paused = { ...playing, isPlaying: false };
    expect(advancePlayback(paused, program, 1)).toBe(paused);
    const live = { ...playing, isLive: true };
    expect(advancePlayback(live, program, 1)).toBe(live);
  });

  it('should locate layers by time and jump to their start', () => {
    const third = program.layerTable[2]!;
    expect(layerAtTime(program, third.startTime)).toBe(2);
    expect(layerAtTime(program, (third.startTime + third.endTime) / 2)).toBe(2);
    expect(layerAtTime(program, -1)).toBe(-1);
    expect(layerAtTime(program, program.duration + 1)).toBe(11);
    expect(layerStartTime(program, 2)).toBe(third.startTime);
    expect(layerStartTime(program, 99)).toBe(program.layerTable[11]!.startTime);
    expect(layerStartTime(program, -5)).toBe(program.layerTable[0]!.startTime);
  });

  it('should step to neighbouring segment starts', () => {
    const start = program.times[10]!;
    expect(stepSegmentTime(program, start, 1)).toBe(program.times[12]);
    expect(stepSegmentTime(program, start, -1)).toBe(program.times[8]);
    const midway = (program.times[10]! + program.times[11]!) / 2;
    expect(stepSegmentTime(program, midway, -1)).toBe(start);
    expect(stepSegmentTime(program, 0, -1)).toBe(0);
    expect(stepSegmentTime(program, program.duration, 1)).toBe(program.duration);
  });

  it('should map live layer and progress onto program time', () => {
    const layer = program.layerTable[4]!;
    expect(liveTime(program, { currentLayer: 5, totalLayers: 12 })).toBe(layer.startTime);
    const inside = (layer.startTime + layer.endTime) / 2;
    expect(
      liveTime(program, { currentLayer: 5, totalLayers: 12, progress: (inside / program.duration) * 100 }),
    ).toBeCloseTo(inside, 6);
    expect(liveTime(program, { currentLayer: 5, totalLayers: 12, progress: 0 })).toBe(layer.startTime);
    expect(liveTime(program, { progress: 50 })).toBeCloseTo(program.duration / 2, 6);
    expect(liveTime(program, { currentLayer: 0 })).toBe(0);
    expect(liveTime(program, {})).toBeUndefined();
  });

  it('should scale a different reported layer count proportionally', () => {
    expect(liveTime(program, { currentLayer: 13, totalLayers: 24 })).toBe(program.layerTable[6]!.startTime);
    expect(liveTime(program, { currentLayer: 200, totalLayers: 24 })).toBe(program.layerTable[11]!.startTime);
  });

  it('should read events and filament at a time', () => {
    expect(eventValueAt(program.events, 'nozzle-temperature', 0)).toBe(220);
    expect(eventValueAt(program.events, 'bed-temperature', program.duration)).toBe(0);
    expect(eventValueAt(program.events, 'chamber-temperature', program.duration)).toBeUndefined();
    const prefix = createExtrusionPrefix(program);
    expect(prefix).toHaveLength(program.segmentCount + 1);
    expect(extrudedLengthAt(prefix, program, 0)).toBe(0);
    expect(extrudedLengthAt(prefix, program, program.duration)).toBeCloseTo(program.filamentLength, 3);
    const completed = segmentAtTime(program, program.duration / 2);
    expect(extrudedLengthAt(prefix, program, program.duration / 2)).toBe(prefix[completed]);
  });

  it('should format durations as h:mm:ss', () => {
    expect(formatDuration(0)).toBe('0:00:00');
    expect(formatDuration(59.4)).toBe('0:00:59');
    expect(formatDuration(3661)).toBe('1:01:01');
  });
});

describe('createPlaybackStore', () => {
  it('should publish whole seconds and layer only when they change', () => {
    const store = createPlaybackStore(program, { isPlaying: true });
    const listener = vi.fn();
    store.subscribe(listener);
    const first = store.getSnapshot();
    store.advance(0.25);
    expect(listener).not.toHaveBeenCalled();
    expect(store.getSnapshot()).toBe(first);
    expect(store.getTime()).toBeCloseTo(0.25, 6);
    store.advance(0.8);
    expect(listener).toHaveBeenCalledOnce();
    expect(store.getSnapshot().time).toBe(1);
    expect(store.getSnapshot().layer).toBe(layerAtTime(program, 1.05));
  });

  it('should bump the revision on seeks so identical seconds still notify', () => {
    const store = createPlaybackStore(program);
    const listener = vi.fn();
    store.subscribe(listener);
    store.seek(0.2);
    store.seek(0.4);
    expect(listener).toHaveBeenCalledTimes(2);
    expect(store.getSnapshot().time).toBe(0);
    expect(store.getTime()).toBeCloseTo(0.4, 6);
  });

  it('should restart from the end when played again', () => {
    const store = createPlaybackStore(program);
    store.seek(program.duration);
    store.play();
    expect(store.getSnapshot()).toMatchObject({ time: 0, isPlaying: true });
    store.pause();
    expect(store.getSnapshot().isPlaying).toBe(false);
    store.toggle();
    expect(store.getSnapshot().isPlaying).toBe(true);
  });

  it('should jump to layers, step segments and reset', () => {
    const store = createPlaybackStore(program, { isPlaying: true });
    store.seekLayer(3);
    expect(store.getTime()).toBe(program.layerTable[3]!.startTime);
    store.step(1);
    expect(store.getSnapshot().isPlaying).toBe(false);
    expect(store.getTime()).toBe(stepSegmentTime(program, program.layerTable[3]!.startTime, 1));
    store.reset();
    // The purge line before the first LAYER_CHANGE is the parser's implicit layer 0, so t = 0 is inside it.
    expect(store.getSnapshot()).toMatchObject({ time: 0, isPlaying: false, layer: layerAtTime(program, 0) });
    expect(layerAtTime(program, 0)).toBe(0);
  });

  it('should follow the machine in live mode and ignore scrubbing', () => {
    const store = createPlaybackStore(program, { isPlaying: true });
    store.setLive(true);
    expect(store.getSnapshot()).toMatchObject({ isLive: true, isPlaying: false });
    store.followLive({ currentLayer: 7, totalLayers: 12 });
    expect(store.getTime()).toBe(program.layerTable[6]!.startTime);
    store.seek(0);
    store.seekLayer(0);
    store.step(-1);
    store.play();
    store.advance(5);
    expect(store.getTime()).toBe(program.layerTable[6]!.startTime);
    store.setLive(false);
    store.seek(1);
    expect(store.getTime()).toBe(1);
  });

  it('should stop notifying an unsubscribed listener', () => {
    const store = createPlaybackStore(program);
    const listener = vi.fn();
    const unsubscribe = store.subscribe(listener);
    unsubscribe();
    store.seek(3);
    expect(listener).not.toHaveBeenCalled();
  });
});
