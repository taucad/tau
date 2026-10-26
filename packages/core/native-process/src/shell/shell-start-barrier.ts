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
