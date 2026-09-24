/**
 * Simulation time cursor over a toolpath program.
 *
 * Pure functions own the arithmetic; `createPlaybackStore` wraps them in the
 * one mutable cursor the frame loop advances and the DOM controls read. The
 * store publishes a snapshot only when something a control shows has changed
 * (the whole second, the layer, the flags), so a 60 Hz frame loop does not
 * re-render the pane 60 times a second.
 *
 * @module
 */

import { Topic } from '@taucad/events';
import { segmentAtTime } from '@taucad/slicer/toolpath';
import type { ToolpathProgram } from '@taucad/slicer/toolpath';

/** Program seconds per wall-clock second, or `max` for the whole run in {@link maxSpeedRunSeconds}. */
export const playbackSpeeds = [1, 10, 100, 'max'] as const;

/** One playback speed. */
export type PlaybackSpeed = (typeof playbackSpeeds)[number];

/** Seconds. The `max` speed replays any program in this wall-clock time. */
export const maxSpeedRunSeconds = 10;

/** The parts of a program the cursor arithmetic reads. */
export type PlaybackProgram = Pick<ToolpathProgram, 'times' | 'segmentCount' | 'duration' | 'layerTable'>;

/** Cursor state. `time` is program seconds. */
export type PlaybackState = Readonly<{
  time: number;
  speed: PlaybackSpeed;
  isPlaying: boolean;
  /** Following the machine's observed run; scrubbing and speed are inert. */
  isLive: boolean;
}>;

/** The run facts a machine directory entry reports. */
export type LiveRunPosition = Readonly<{ currentLayer?: number; totalLayers?: number; progress?: number }>;

/** Program seconds advanced per wall-clock second at one speed. */
export const speedFactor = (speed: PlaybackSpeed, duration: number): number =>
  speed === 'max' ? Math.max(1, duration / maxSpeedRunSeconds) : speed;

/** Keep a time inside the program. */
export const clampTime = (program: Pick<PlaybackProgram, 'duration'>, time: number): number =>
  Math.min(program.duration, Math.max(0, Number.isFinite(time) ? time : 0));

/** Move the cursor forward by wall-clock seconds; stops at the end of the run. */
export const advancePlayback = (
  state: PlaybackState,
  program: PlaybackProgram,
  deltaSeconds: number,
): PlaybackState => {
  if (!state.isPlaying || state.isLive || deltaSeconds <= 0) {
    return state;
  }
  const time = clampTime(program, state.time + deltaSeconds * speedFactor(state.speed, program.duration));
  return { ...state, time, isPlaying: time < program.duration };
};

/** Index of the layer active at one time; `-1` before the first layer, the last index after the run. */
export const layerAtTime = (program: Pick<PlaybackProgram, 'layerTable'>, time: number): number => {
  const layers = program.layerTable;
  if (layers.length === 0 || time < layers[0]!.startTime) {
    return -1;
  }
  let low = 0;
  let high = layers.length - 1;
  while (low < high) {
    const middle = Math.floor((low + high + 1) / 2);
    if (layers[middle]!.startTime <= time) {
      low = middle;
    } else {
      high = middle - 1;
    }
  }
  return low;
};

/** Start time of one layer, clamped to the table. */
export const layerStartTime = (program: PlaybackProgram, layerIndex: number): number => {
  const layers = program.layerTable;
  if (layers.length === 0) {
    return 0;
  }
  const index = Math.min(layers.length - 1, Math.max(0, Math.trunc(layerIndex)));
  return clampTime(program, layers[index]!.startTime);
};

/** Start time of the previous or next segment relative to the cursor. */
export const stepSegmentTime = (program: PlaybackProgram, time: number, direction: -1 | 1): number => {
  if (program.segmentCount === 0) {
    return 0;
  }
  const current = segmentAtTime(program, time);
  if (direction === 1) {
    const next = current + 1;
    // `times` is float32, so the last end can round above the float64 duration; the end is the end.
    return next >= program.segmentCount || time >= program.duration
      ? program.duration
      : clampTime(program, program.times[next * 2]!);
  }
  if (current <= 0) {
    return 0;
  }
  const index = Math.min(program.segmentCount - 1, current);
  const start = program.times[index * 2]!;
  // Inside a segment, step to its start; at its start, step to the previous one.
  return clampTime(program, time - start > 1e-6 ? start : program.times[(index - 1) * 2]!);
};

/**
 * Map the machine's observed layer and progress onto program time.
 *
 * The layer decides the window; the overall progress places the cursor inside
 * it when both agree, otherwise the window's start wins. Returns `undefined`
 * when the machine reports nothing usable.
 */
export const liveTime = (program: PlaybackProgram, run: LiveRunPosition): number | undefined => {
  const progressTime =
    run.progress === undefined
      ? undefined
      : clampTime(program, (Math.min(100, Math.max(0, run.progress)) / 100) * program.duration);
  const layers = program.layerTable;
  if (run.currentLayer === undefined || layers.length === 0) {
    return progressTime;
  }
  if (run.currentLayer <= 0) {
    return 0;
  }
  const reportedTotal = run.totalLayers !== undefined && run.totalLayers > 0 ? run.totalLayers : layers.length;
  const index = Math.min(
    layers.length - 1,
    reportedTotal === layers.length
      ? run.currentLayer - 1
      : Math.floor(((run.currentLayer - 1) / reportedTotal) * layers.length),
  );
  const layer = layers[index]!;
  const inside = progressTime !== undefined && progressTime >= layer.startTime && progressTime <= layer.endTime;
  return clampTime(program, inside ? progressTime : layer.startTime);
};

/** Value of the last event of one kind at or before a time, if any. */
export const eventValueAt = (
  events: ToolpathProgram['events'],
  kind: ToolpathProgram['events'][number]['kind'],
  time: number,
): number | undefined => {
  let value: number | undefined;
  for (const event of events) {
    if (event.time > time) {
      break;
    }
    if (event.kind === kind && event.value !== undefined) {
      value = event.value;
    }
  }
  return value;
};

/** Running total of filament per segment, so the HUD reads used length in constant time. */
export const createExtrusionPrefix = (program: Pick<ToolpathProgram, 'extrusion' | 'segmentCount'>): Float64Array => {
  const prefix = new Float64Array(program.segmentCount + 1);
  for (let index = 0; index < program.segmentCount; index += 1) {
    prefix[index + 1] = prefix[index]! + program.extrusion[index]!;
  }
  return prefix;
};

/** Millimetres of filament laid down by the completed segments at one time. */
export const extrudedLengthAt = (prefix: Float64Array, program: PlaybackProgram, time: number): number => {
  const completed = Math.min(program.segmentCount, Math.max(0, segmentAtTime(program, time)));
  return prefix[completed]!;
};

/** `h:mm:ss` for a duration in seconds. */
export const formatDuration = (seconds: number): string => {
  const whole = Math.max(0, Math.round(seconds));
  const hours = Math.floor(whole / 3600);
  const minutes = Math.floor((whole % 3600) / 60);
  const rest = whole % 60;
  return `${hours}:${String(minutes).padStart(2, '0')}:${String(rest).padStart(2, '0')}`;
};

/** What the DOM sees: whole seconds plus a revision that every explicit jump bumps. */
export type PlaybackSnapshot = PlaybackState & Readonly<{ layer: number; revision: number }>;

/** The mutable cursor shared by the frame loop and the controls. */
export type PlaybackStore = Readonly<{
  program: PlaybackProgram;
  subscribe: (listener: () => void) => () => void;
  getSnapshot: () => PlaybackSnapshot;
  /** Exact program seconds for the frame loop. */
  getTime: () => number;
  advance: (deltaSeconds: number) => void;
  play: () => void;
  pause: () => void;
  toggle: () => void;
  setSpeed: (speed: PlaybackSpeed) => void;
  seek: (time: number) => void;
  seekLayer: (layerIndex: number) => void;
  step: (direction: -1 | 1) => void;
  setLive: (isLive: boolean) => void;
  followLive: (run: LiveRunPosition) => void;
  reset: () => void;
}>;

const samePublished = (a: PlaybackSnapshot, b: PlaybackSnapshot): boolean =>
  a.time === b.time &&
  a.speed === b.speed &&
  a.isPlaying === b.isPlaying &&
  a.isLive === b.isLive &&
  a.layer === b.layer &&
  a.revision === b.revision;

/** Create the cursor for one program. */
export const createPlaybackStore = (program: PlaybackProgram, initial?: Partial<PlaybackState>): PlaybackStore => {
  let state: PlaybackState = { time: 0, speed: 1, isPlaying: false, isLive: false, ...initial };
  let revision = 0;
  const changes = new Topic<void>({ name: 'PrinterPlayback.changes' });
  let snapshot: PlaybackSnapshot = {
    ...state,
    time: Math.floor(state.time),
    layer: layerAtTime(program, state.time),
    revision,
  };
  const publish = (): void => {
    const next: PlaybackSnapshot = {
      ...state,
      time: Math.floor(state.time),
      layer: layerAtTime(program, state.time),
      revision,
    };
    if (samePublished(snapshot, next)) {
      return;
    }
    snapshot = next;
    changes.emit(undefined);
  };
  const jump = (time: number, patch: Partial<PlaybackState> = {}): void => {
    state = { ...state, ...patch, time: clampTime(program, time) };
    revision += 1;
    publish();
  };
  return {
    program,
    subscribe: (listener) => changes.subscribe(listener),
    getSnapshot: () => snapshot,
    getTime: () => state.time,
    advance: (deltaSeconds) => {
      const next = advancePlayback(state, program, deltaSeconds);
      if (next !== state) {
        state = next;
        publish();
      }
    },
    play: () => {
      if (state.isLive) {
        return;
      }
      // Playing from the end restarts the run.
      state = { ...state, isPlaying: true, time: state.time >= program.duration ? 0 : state.time };
      revision += 1;
      publish();
    },
    pause: () => {
      state = { ...state, isPlaying: false };
      publish();
    },
    toggle: () => {
      if (state.isPlaying) {
        state = { ...state, isPlaying: false };
        publish();
      } else if (!state.isLive) {
        state = { ...state, isPlaying: true, time: state.time >= program.duration ? 0 : state.time };
        revision += 1;
        publish();
      }
    },
    setSpeed: (speed) => {
      state = { ...state, speed };
      publish();
    },
    seek: (time) => {
      if (!state.isLive) {
        jump(time);
      }
    },
    seekLayer: (layerIndex) => {
      if (!state.isLive) {
        jump(layerStartTime(program, layerIndex));
      }
    },
    step: (direction) => {
      if (!state.isLive) {
        jump(stepSegmentTime(program, state.time, direction), { isPlaying: false });
      }
    },
    setLive: (isLive) => {
      state = { ...state, isLive, isPlaying: false };
      revision += 1;
      publish();
    },
    followLive: (run) => {
      if (!state.isLive) {
        return;
      }
      const time = liveTime(program, run);
      if (time !== undefined) {
        jump(time);
      }
    },
    reset: () => {
      jump(0, { isPlaying: false });
    },
  };
};
