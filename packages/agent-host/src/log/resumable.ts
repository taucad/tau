import { util as zodUtility } from 'zod';
import type { RunFailureDetail } from '#log/event-types.js';
import { externalAgentStopCodes } from '#wire/external-agent.schema.js';
import { isResumable } from '#wire/refusals.js';
import type { RefusalCode } from '#wire/refusals.js';

/*
 * A code is resumable when its registry entry's retry class is `resume` or `reauth` (D11, D21). A model call that
 * failed — refused before it was funded, or dropped in its stream — leaves the turn's history whole, because the
 * session settles what it started; compaction failures re-enter start-of-turn compaction; `RUN_ABANDONED` is written
 * only for a run whose host is gone. `resumable-failure-codes.json` is the same set for `ChatLog.tla`, kept equal by
 * `wire/refusals.test.ts`.
 */

/**
 * Whether an external agent's own stop leaves the turn continuable.
 *
 * An external turn stops on its provider's terms, not on a code Tau can rule:
 * the same `EXTERNAL_AGENT_LIMIT_REACHED` is a rate limit that clears in a
 * minute, a quota that clears at a stated hour, or a context ceiling only a new
 * session clears. The agent says which in `failure.actions`:
 *
 * - `retry` — the agent's own word that trying again can work.
 * - no actions at all on a `limit` — nothing helps *now*; what clears a quota
 *   is time, so the surface holds Resume until the reported reset and then
 *   continues the same vendor session.
 * - any other action (`new_session`, `login`) — that action has to happen
 *   first, and no resume can stand in for it.
 *
 * @param failure - The terminal record, as the runner attached its details.
 * @returns `true` when continuing the agent's own session is the recovery.
 */
const externalStopIsResumable = (failure: RunFailureDetail): boolean => {
  if (!externalAgentStopCodes.some((code) => code === failure.code)) {
    return false;
  }
  const stop = zodUtility.isObject(failure.details) ? failure.details['failure'] : undefined;
  const actions = zodUtility.isObject(stop) ? stop['actions'] : undefined;
  if (!Array.isArray(actions)) {
    return false;
  }
  return (
    actions.includes('retry') || (actions.length === 0 && zodUtility.isObject(stop) && stop['category'] === 'limit')
  );
};

/**
 * Whether a failed run's terminal record can be resumed at its blocked step.
 *
 * Reads the whole record and the run's kind, not just the code. `RUN_ABANDONED` — the host's record that the run's
 * driver is gone: a close, a crash, a restart while an external agent waited on approval — resumes either kind. A Tau
 * run otherwise resumes on a registry-resumable code; an external run on the agent's own resumable stop, by the actions
 * it reported. Those are exactly the failures the ACP runner continues (`stopRecorded`), so a gateway code on an
 * external run offers no Resume the runner would refuse. `ChatLedger.lean`'s `failRests` models this.
 *
 * @param failure - `RunFailureDetail` from the run's terminal record.
 * @param kind - Who drove the run.
 * @returns `true` when `resume` will continue this run rather than replay it.
 * @public
 */
export const isResumableRunFailure = (
  failure: RunFailureDetail | undefined,
  kind: 'tau' | 'external' = 'tau',
): boolean => {
  if (failure?.code === undefined) {
    return false;
  }
  if (failure.code === ('RUN_ABANDONED' satisfies RefusalCode)) {
    return true;
  }
  return kind === 'external' ? externalStopIsResumable(failure) : isResumable(failure.code);
};

/**
 * Whether an intentional Stop retained a committed turn for continuation.
 *
 * @param run - The durable run ledger entry.
 * @returns True only for a committed user stop, including a dispatched external prompt.
 * @public
 */
export const isUserStoppedRun = (
  run:
    | Readonly<{
        lifecycle?: string;
        failure?: RunFailureDetail;
        committed: boolean;
        kind: 'tau' | 'external';
        externalPrompted?: boolean;
      }>
    | undefined,
): boolean =>
  run?.lifecycle === 'cancelled' &&
  run.failure?.code === 'USER_STOPPED' &&
  run.committed &&
  (run.kind === 'tau' || run.externalPrompted === true);

/**
 * Whether `continue` resumes this run rather than replaying it: a deliberate Stop that kept its committed turn, or a
 * resumable failure.
 *
 * The one rule every surface asks — the host's resume gate, the ledger's reopen predicate, the turn host's admission,
 * the composer's Resume and the error card — so no surface offers a Resume another refuses. `ChatLedger.lean`'s
 * `rests` models it (`t4_user_stop_reopens`).
 *
 * @param run - The durable run ledger entry.
 * @returns `true` when the run's last attempt ended in a state `resume` continues.
 * @public
 */
export const isResumableRun = (
  run: (Parameters<typeof isUserStoppedRun>[0] & Readonly<{ failure?: RunFailureDetail }>) | undefined,
): boolean => isUserStoppedRun(run) || (run?.lifecycle === 'failed' && isResumableRunFailure(run.failure, run.kind));
