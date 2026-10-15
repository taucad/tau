/**
 * Keep the computer awake while a program streams to a machine (Q-streamed-host). A Tau host feeds a streamed
 * program line by line for its whole run, so a computer that sleeps leaves the machine waiting mid-run with its
 * spindle or heaters on. Both hosts use this one policy: the desktop holds Electron's `powerSaveBlocker`, and
 * `tau serve --machines` holds {@link platformKeepAwakeBlocker}. Closing a laptop's lid still sleeps it.
 *
 * @module
 */

import { spawn } from 'node:child_process';

/**
 * Lets go of one hold. Calling it more than once does nothing more.
 * @public
 */
export type KeepAwakeRelease = () => void;

/**
 * What holds the computer awake: Electron's `powerSaveBlocker`, a platform command, or a stub.
 * @public
 */
export type KeepAwakeBlocker = Readonly<{
  /** Start holding the computer awake. */
  hold(): KeepAwakeRelease;
}>;

/**
 * Options for {@link keepAwakeWhileStreaming}.
 * @public
 */
export type KeepAwakeWhileStreamingOptions = Readonly<{
  /**
   * The machines a streamed run feeds now, e.g. `NodeMachineHost.streamingMachines`. Must only read: it is asked
   * every interval.
   */
  streamingMachines: () => Promise<readonly unknown[]>;
  blocker: KeepAwakeBlocker;
  /** How often to ask, in milliseconds. Defaults to 20 s, inside the shortest idle-sleep timer an OS offers (one minute). */
  intervalMilliseconds?: number;
  log: (level: 'info' | 'error', event: string, detail?: unknown) => void;
}>;

/**
 * Hold the blocker while any streamed run is running, and release it when none is. An unanswered question keeps what
 * is held: unknown is not "none".
 *
 * ponytail: polls a read-only answer, so a run is held awake within one interval of starting (well inside any
 * idle-sleep timer) and released within one of ending; push from the host on job start and end if that lag matters.
 *
 * @param options - Where to ask, the blocker and the interval.
 * @returns Stop asking and release the blocker.
 * @public
 */
export const keepAwakeWhileStreaming = (options: KeepAwakeWhileStreamingOptions): (() => void) => {
  let release: KeepAwakeRelease | undefined;
  let stopped = false;
  let checking: Promise<void> | undefined;
  const letGo = (): void => {
    if (release !== undefined) {
      release();
      release = undefined;
      options.log('info', 'keep-awake', { held: false });
    }
  };
  const check = async (): Promise<void> => {
    try {
      const streaming = await options.streamingMachines();
      if (stopped) {
        return;
      }
      if (streaming.length === 0) {
        letGo();
      } else if (release === undefined) {
        release = options.blocker.hold();
        options.log('info', 'keep-awake', { held: true, machines: streaming });
      }
    } catch (error) {
      options.log('error', 'keep-awake-unknown', error);
    } finally {
      checking = undefined;
    }
  };
  const timer = setInterval(() => {
    /* One question at a time; a slow answer skips the next tick rather than piling up. */
    checking ??= check();
  }, options.intervalMilliseconds ?? 20_000);
  timer.unref();
  return () => {
    stopped = true;
    clearInterval(timer);
    letGo();
  };
};

const why = 'A program is streaming to a machine';

/**
 * The blocker of a Node host without Electron. On macOS it runs `caffeinate -i -w <pid>`; on Linux
 * `systemd-inhibit --what=idle:sleep` around `tail --pid=<pid>`. Elsewhere, or when that command cannot run, nothing
 * holds the computer awake, and `warn` says so once, at the first hold. The command is killed on release and when this
 * process exits; it also waits on this process's id, so a host that is killed outright never leaves the computer held.
 *
 * @param input - `warn`: where the one-time warning goes, e.g. the daemon's log. `platform`: defaults to this process's.
 * @returns The blocker.
 * @public
 */
export const platformKeepAwakeBlocker = (
  input: Readonly<{ platform?: NodeJS.Platform; warn(message: string): void }>,
): KeepAwakeBlocker => {
  const platform = input.platform ?? process.platform;
  const pid = String(process.pid);
  const command: readonly [string, ...string[]] | undefined =
    platform === 'darwin'
      ? ['caffeinate', '-i', '-w', pid]
      : platform === 'linux'
        ? [
            'systemd-inhibit',
            '--what=idle:sleep',
            '--who=Tau',
            `--why=${why}`,
            'tail',
            `--pid=${pid}`,
            '-f',
            '/dev/null',
          ]
        : undefined;
  let warned = false;
  const warnOnce = (reason: string): void => {
    if (!warned) {
      warned = true;
      input.warn(
        `${why}, but Tau cannot keep this computer awake (${reason}). Keep it from sleeping until the run ends, or the machine is left waiting mid-run.`,
      );
    }
  };
  return Object.freeze({
    hold() {
      if (command === undefined) {
        warnOnce(`no keep-awake command on ${platform}`);
        return () => undefined;
      }
      const [executable, ...args] = command;
      const child = spawn(executable, args, { stdio: 'ignore' });
      child.once('error', (error) => {
        warnOnce(`${executable}: ${error.message}`);
      });
      const kill = (): void => {
        child.kill();
      };
      process.once('exit', kill);
      return () => {
        process.off('exit', kill);
        kill();
      };
    },
  });
};
