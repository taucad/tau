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
  child.stdio[startBarrierDescriptor]?.destroy();
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

/**
 * Create one terminal launch's unpredictable gate. Whatever the PTY printed before the start marker, including any
 * echo of the gate if the wrapper had not yet turned echo off, is never forwarded.
 *
 * @returns The gate's environment, its single write and the output filter.
 */
export const createTerminalStartGate = (): TerminalStartGate => {
  const token = randomUUID().replaceAll('-', '');
  const marker = new TextEncoder().encode(startMarker);
  let opened = false;
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
    environment: { [gateVariable]: token },
    open: (write) => {
      if (opened) {
        throw new Error('The terminal start gate is already open.');
      }
      opened = true;
      write(`${token}\n`);
    },
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
        pending = joined.slice(Math.max(0, joined.length - marker.length + 1));
        return undefined;
      }
      started = true;
      pending = new Uint8Array(0);
      const rest = joined.slice(index + marker.length);
      return rest.length === 0 ? undefined : rest;
    },
  };
};
