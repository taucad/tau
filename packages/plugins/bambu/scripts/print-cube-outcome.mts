/**
 * The print-cube stage's reading of one machine snapshot. A module of its own, without the operator script's
 * hashbang, so the unit tests can import it.
 */
import type { MachineRun } from '@taucad/runtime/machine';

/**
 * What one read says of the qualification's own run. A Bambu printer keeps reporting the run it ended (FINISH, or
 * FAILED with 0500-400E after a cancel) until the next one starts, so the end is the run's state, never its absence.
 *
 * @param run - The run the machine reports, if any.
 * @param runId - The qualification's run: the start receipt's, else the first live run seen after the start.
 * @returns `waiting` while the machine does not report that run, `printing` while it runs, then how it ended.
 */
export const printCubeOutcome = (
  run: Pick<MachineRun, 'runId' | 'state'> | undefined,
  runId: string | undefined,
): 'waiting' | 'printing' | 'completed' | 'cancelled' | 'failed' => {
  if (run === undefined || runId === undefined || run.runId !== runId) {
    return 'waiting';
  }
  return run.state === 'completed' || run.state === 'cancelled' || run.state === 'failed' ? run.state : 'printing';
};
