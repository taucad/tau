/**
 * Keep the computer awake while a program streams to a machine (Q-streamed-host). This app feeds a streamed program
 * line by line for its whole run, so a computer that sleeps leaves the machine waiting mid-cut with its spindle on.
 * macOS still sleeps when the lid closes; the Print pane tells the person so.
 *
 * ponytail: polls the utility's read-only answer, so a run is held awake within one interval of starting (well inside
 * any idle-sleep timer) and released within one of ending; push a frame from the utility on job start and end if
 * that lag ever matters.
 *
 * @module
 */

import type { PowerSaveBlocker } from 'electron';

/** Options for {@link keepAwakeWhileStreaming}. */
export type KeepAwakeOptions = Readonly<{
  /** The machines a streamed run feeds now. Must only read: it is asked every interval. */
  streamingMachines: () => Promise<readonly string[]>;
  /** Electron's `powerSaveBlocker`, or a stub. */
  blocker: Pick<PowerSaveBlocker, 'start' | 'stop'>;
  /** How often to ask. Milliseconds. */
  intervalMilliseconds: number;
  log: (level: 'info' | 'error', event: string, detail?: unknown) => void;
}>;

/**
 * Hold `prevent-app-suspension` while any streamed run is running, and release it when none is. An unanswered
 * question keeps what is held: unknown is not "none".
 *
 * @param options - Where to ask, the blocker and the interval.
 * @returns Stop asking and release the blocker.
 */
export const keepAwakeWhileStreaming = (options: KeepAwakeOptions): (() => void) => {
  let held: number | undefined;
  let stopped = false;
  let checking: Promise<void> | undefined;
  const release = (): void => {
    if (held !== undefined) {
      options.blocker.stop(held);
      held = undefined;
      options.log('info', 'main.keep-awake', { held: false });
    }
  };
  const check = async (): Promise<void> => {
    try {
      const streaming = await options.streamingMachines();
      if (stopped) {
        return;
      }
      if (streaming.length === 0) {
        release();
      } else if (held === undefined) {
        held = options.blocker.start('prevent-app-suspension');
        options.log('info', 'main.keep-awake', { held: true, machines: streaming });
      }
    } catch (error) {
      options.log('error', 'main.keep-awake-unknown', error);
    } finally {
      checking = undefined;
    }
  };
  const timer = setInterval(() => {
    /* One question at a time; a slow answer skips the next tick rather than piling up. */
    checking ??= check();
  }, options.intervalMilliseconds);
  timer.unref();
  return () => {
    stopped = true;
    clearInterval(timer);
    release();
  };
};
