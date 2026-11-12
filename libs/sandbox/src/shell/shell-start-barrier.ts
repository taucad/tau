/**
 * The start barrier between registering a shell launch and admitting its workload (blueprint I7; ShellCustody
 * SpawnBlocked, PersistRegistration and Start).
 *
 * A staged child is a fixed trusted `/bin/sh` program that blocks reading descriptor 3. It runs no workload code, so
 * its process identity can be durably registered while it waits. Only an exact `start` line from the owner of the
 * other end lets it close descriptor 3 and `exec` the workload vector in place, keeping the registered process id.
 * End of file, any other line or a read error exits with {@link startBarrierRefusedCode} without executing anything:
 * an owner that dies or abandons the launch before opening can never become an unowned workload.
 */
import type { ChildProcess } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import type { Writable } from 'node:stream';

/** The exit status of a staged child whose barrier closed without opening. */
export const startBarrierRefusedCode = 125;

/** The descriptor a staged child reads its single start line from. */
export const startBarrierDescriptor = 3;

const script = `IFS= read -r gate <&${startBarrierDescriptor} || exit ${startBarrierRefusedCode}; [ "$gate" = start ] || exit ${startBarrierRefusedCode}; exec ${startBarrierDescriptor}<&-; exec "$@"`;

/**
 * Wrap a workload vector so it runs only after {@link openStartBarrier}. Spawn the result with descriptor 3 as a pipe
 * (`stdio[3] = 'pipe'`); the workload never inherits it.
 *
 * @param argv - The complete workload vector, executable first; never reinterpreted.
 * @returns The staged vector, executable first.
 */
export const stagedStartArguments = (argv: readonly string[]): readonly string[] => {
  if (argv.length === 0 || argv[0]!.length === 0) {
    throw new Error('A staged launch needs a workload executable.');
  }
  return ['/bin/sh', '-c', script, 'tau-start-barrier', ...argv];
};

const gateOf = (child: ChildProcess): Writable => {
  const gate = child.stdio[startBarrierDescriptor];
  if (gate === null || gate === undefined || !('write' in gate) || !gate.writable) {
    throw new Error('The staged launch has no open start barrier.');
  }
  return gate;
};

/**
 * Admit the workload. Call only after the launch's registration is durable and its custody owner acknowledged it.
 *
 * @param child - A child spawned from {@link stagedStartArguments}.
 * @returns Resolves once the start line has been handed to the operating system.
 */
export const openStartBarrier = async (child: ChildProcess): Promise<void> => {
  const gate = gateOf(child);
  /*
   * The caller's own failure is the rejection below; this one is for afterwards. An opened barrier is a pipe into a
   * process the host may still cancel or kill, and a reset pipe with no error listener is an uncaught exception in
   * whatever process launched the shell — the barrier has nothing left to carry by then, so there is nothing to
   * recover.
   */
  gate.on('error', () => undefined);
  await new Promise<void>((resolve, reject) => {
    gate.once('error', reject);
    gate.end('start\n', () => {
      gate.off('error', reject);
      resolve();
    });
  });
};

/**
 * Refuse the workload: the staged child exits without executing it.
 *
 * @param child - A child spawned from {@link stagedStartArguments}.
 */
export const abandonStartBarrier = (child: ChildProcess): void => {
  const gate = child.stdio[startBarrierDescriptor];
  /* Same reason as above: refusing the workload tears the pipe down, and the teardown must not raise. */
  gate?.on('error', () => undefined);
  gate?.destroy();
};

/**
 * The environment variable that carries one terminal launch's gate to its staged wrapper only. The wrapper unsets it
 * before executing the workload.
 */
const gateVariable = 'TAU_START_GATE';

/** Printed by the wrapper once the gate matched, after echo is restored; nothing before it reaches the person. */
const startMarker = '\u001B]7770;tau-start\u0007';

const terminalScript = [
  `saved=$(/bin/stty -g) || exit ${startBarrierRefusedCode}`,
  `/bin/stty -echo || exit ${startBarrierRefusedCode}`,
  'IFS= read -r gate',
  'status=$?',
  `/bin/stty "$saved" || exit ${startBarrierRefusedCode}`,
  `[ "$status" -eq 0 ] || exit ${startBarrierRefusedCode}`,
  `[ -n "$${gateVariable}" ] || exit ${startBarrierRefusedCode}`,
  `[ "$gate" = "$${gateVariable}" ] || exit ${startBarrierRefusedCode}`,
  `unset ${gateVariable}`,
  String.raw`printf '\033]7770;tau-start\007'`,
  'exec "$@"',
].join('; ');

/**
 * Wrap a terminal workload vector so it runs only after {@link TerminalStartGate.open}. node-pty cannot hand a child a
 * descriptor 3, so the gate travels over the PTY itself: the fixed trusted `/bin/sh` turns echo off, reads exactly one
 * line, restores the terminal and executes only when that line equals its launch's gate. A closed PTY (the owner died)
 * or any other line exits with {@link startBarrierRefusedCode} without executing anything.
 *
 * @param argv - The complete workload vector, executable first; never reinterpreted.
 * @returns The staged vector, executable first. Spawn it with {@link TerminalStartGate.environment} added.
 */
export const stagedTerminalStartArguments = (argv: readonly string[]): readonly string[] => {
  if (argv.length === 0 || argv[0]!.length === 0) {
    throw new Error('A staged launch needs a workload executable.');
  }
  return ['/bin/sh', '-c', terminalScript, 'tau-start-barrier', ...argv];
};

/** One terminal launch's start gate. */
export type TerminalStartGate = Readonly<{
  /** Add to the staged wrapper's environment only. */
  environment: Readonly<Record<typeof gateVariable, string>>;
  /** Write the gate line, the only bytes the host may write before the workload runs. Call once. */
  open: (write: (line: string) => void) => void;
  /** Pass terminal output through: everything up to and including the wrapper's start marker is dropped. */
  pass: (chunk: Uint8Array<ArrayBuffer>) => Uint8Array<ArrayBuffer> | undefined;
}>;

/** A filter that drops a stream's bytes up to and including the first occurrence of one marker. */
type MarkerFilter = Readonly<{
  /** Pass a chunk through: `undefined` until the marker, then whatever followed it, then every chunk unchanged. */
  pass: (chunk: Uint8Array<ArrayBuffer>) => Uint8Array<ArrayBuffer> | undefined;
  /** Whether the marker has been seen. */
  seen: () => boolean;
  /** The bytes held back because they could still begin the marker. */
  pending: () => Uint8Array<ArrayBuffer>;
}>;

/**
 * Drop everything up to and including `marker`, across any chunk boundaries.
 *
 * @param marker - The bytes that end the dropped prefix.
 * @param discard - Receives each dropped run of bytes before the marker, in order.
 * @returns The filter.
 */
const createMarkerFilter = (
  marker: Uint8Array<ArrayBuffer>,
  discard: (bytes: Uint8Array<ArrayBuffer>) => void = () => undefined,
): MarkerFilter => {
  let started = false;
  let pending = new Uint8Array(0);
  const indexOf = (bytes: Uint8Array<ArrayBuffer>): number => {
    for (let index = 0; index + marker.length <= bytes.length; index += 1) {
      if (marker.every((byte, offset) => bytes[index + offset] === byte)) {
        return index;
      }
    }
    return -1;
  };
  return {
    seen: () => started,
    pending: () => pending,
    pass: (chunk) => {
      if (started) {
        return chunk;
      }
      const joined = new Uint8Array(pending.length + chunk.length);
      joined.set(pending);
      joined.set(chunk, pending.length);
      const index = indexOf(joined);
      if (index === -1) {
        /* Keep only what could still begin the marker; everything else predates the workload. */
        const keep = Math.max(0, joined.length - marker.length + 1);
        discard(joined.slice(0, keep));
        pending = joined.slice(keep);
        return undefined;
      }
      discard(joined.slice(0, index));
      started = true;
      pending = new Uint8Array(0);
      const rest = joined.slice(index + marker.length);
      return rest.length === 0 ? undefined : rest;
    },
  };
};

/**
 * Create one terminal launch's unpredictable gate. Whatever the PTY printed before the start marker, including any
 * echo of the gate if the wrapper had not yet turned echo off, is never forwarded.
 *
 * @returns The gate's environment, its single write and the output filter.
 */
export const createTerminalStartGate = (): TerminalStartGate => {
  const token = randomUUID().replaceAll('-', '');
  const filter = createMarkerFilter(new TextEncoder().encode(startMarker));
  let opened = false;
  return {
    environment: { [gateVariable]: token },
    open: (write) => {
      if (opened) {
        throw new Error('The terminal start gate is already open.');
      }
      opened = true;
      write(`${token}\n`);
    },
    pass: filter.pass,
  };
};

/**
 * Whether a Linux launch's workload began: `started` once its announcement was read; `not-started` when the stream that
 * carries it reached end of file without it, which proves the workload never executed; `unknown` when the stream closed
 * any other way or the host stopped waiting, which proves nothing.
 *
 * @public
 */
export type LaunchAnnouncementAnswer = 'started' | 'not-started' | 'unknown';

/** How much of what preceded a missing announcement is kept to explain it, in bytes. */
const preambleBytes = 2048;

/**
 * One Linux launch's start announcement (blueprint I7).
 *
 * The start barrier proves the host admitted the launch; it cannot prove the sandbox then came up. Bubblewrap builds
 * its mounts only after the barrier opened, and when that fails (a protected file removed between the profile and its
 * bind, or a namespace the kernel refuses) it prints its error and exits 1 without running anything, which would
 * otherwise read as the workload's own exit status. So the command inside the sandbox prints an unpredictable marker,
 * then `exec`s the workload only if that print succeeded. The marker precedes the workload on the same stream, so a
 * stream that reaches end of file without it proves the workload never executed, and nothing the workload prints can
 * make a launch look unstarted: workload output only ever arrives once the answer is already `started`.
 *
 * @public
 */
export type LaunchAnnouncement = Readonly<{
  /**
   * Shell text the in-sandbox `/bin/sh` runs before the workload, joined to its `exec` with `&&`. It spells the
   * marker's control bytes as `printf` escapes, so the command text itself never contains the marker.
   */
  command: string;
  /** Pass the carrying stream's output: everything up to and including the marker is dropped. */
  pass: (chunk: Uint8Array<ArrayBuffer>) => Uint8Array<ArrayBuffer> | undefined;
  /**
   * The carrying stream ended. `endOfFile` only for a true end of file (every writer closed, or `EIO` from a PTY master
   * whose every slave descriptor closed), never for a stream the host destroyed.
   */
  end: (endOfFile: boolean) => void;
  /** Settles once with the answer; see {@link LaunchAnnouncementAnswer}. */
  answer: Promise<LaunchAnnouncementAnswer>;
  /** Stop waiting: an unanswered announcement answers `unknown`. */
  abandon: () => void;
  /** The last bytes the stream carried before the marker or its end, as text: the sandbox's own diagnostics. */
  preamble: () => string;
}>;

/**
 * Create one Linux launch's announcement.
 *
 * @param descriptor - The in-sandbox descriptor that carries it: 2 (standard error, where bubblewrap reports) for
 *   pipes, 1 for a terminal, whose PTY carries every stream.
 * @returns The announcement.
 */
export const createLaunchAnnouncement = (descriptor: 1 | 2): LaunchAnnouncement => {
  const nonce = randomUUID().replaceAll('-', '');
  let preamble = new Uint8Array(0);
  const filter = createMarkerFilter(new TextEncoder().encode(`\u001B]7771;tau-launch;${nonce}\u0007`), (bytes) => {
    const joined = new Uint8Array(preamble.length + bytes.length);
    joined.set(preamble);
    joined.set(bytes, preamble.length);
    preamble = joined.slice(-preambleBytes);
  });
  const answered = Promise.withResolvers<LaunchAnnouncementAnswer>();
  return {
    command: String.raw`printf '\033]7771;tau-launch;${nonce}\007'${descriptor === 2 ? ' >&2' : ''}`,
    pass: (chunk) => {
      const passed = filter.pass(chunk);
      if (filter.seen()) {
        answered.resolve('started');
      }
      return passed;
    },
    end: (endOfFile) => {
      answered.resolve(filter.seen() ? 'started' : endOfFile ? 'not-started' : 'unknown');
    },
    answer: answered.promise,
    abandon: () => {
      answered.resolve('unknown');
    },
    preamble: () => {
      const pending = filter.seen() ? new Uint8Array(0) : filter.pending();
      const joined = new Uint8Array(preamble.length + pending.length);
      joined.set(preamble);
      joined.set(pending, preamble.length);
      return new TextDecoder().decode(joined.slice(-preambleBytes)).trim();
    },
  };
};
