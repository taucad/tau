import { util as zodUtility } from 'zod';
import { externalAgentStopCodes } from '#launchers/node/agent-wire.js';
import resumableFailureCodes from '#log/resumable-failure-codes.json' with { type: 'json' };
import type { RunFailureDetail } from '#log/event-types.js';

/**
 * Failure codes whose run can be continued at the step it stopped on.
 *
 * A model call that failed — refused before it was funded, or dropped in the
 * middle of its stream — leaves the turn's history whole, and the only thing
 * missing is that one call. It is whole because the session settles what it
 * started: a tool the stream dispatched mid-response (`prestartTool`) records
 * its real result before the run is marked failed, so a resume continues from
 * the work that happened rather than re-applying it. Compaction failures also
 * retain the failed turn and re-enter start-of-turn compaction after their
 * synthesized marker is rewound. `RUN_ABANDONED` is written only for a run whose
 * host is gone; `UNAUTHENTICATED` clears by signing in again. Failures that
 * cannot improve on retry, such as lost leadership or a model absent from the
 * catalog, are dispatched afresh.
 *
 * One JSON list, read by this predicate, `ChatLog.tla` and the Lean tables; W4's registry takes it over as the codes
 * of retry class `resume` (D11).
 */
const resumableCodes: ReadonlySet<string> = new Set<string>(resumableFailureCodes);

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
 * Reads the whole record, not just its code: an external agent's stop is
 * resumable or not by the actions the agent itself reported.
 *
 * @param failure - `RunFailureDetail` from the run's terminal record.
 * @returns `true` when `resume` will continue this run rather than replay it.
 * @public
 */
export const isResumableRunFailure = (failure: RunFailureDetail | undefined): boolean =>
  failure?.code !== undefined && (resumableCodes.has(failure.code) || externalStopIsResumable(failure));
