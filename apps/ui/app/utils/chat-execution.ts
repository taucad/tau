import type { CadAgentExecution } from '@taucad/chat';

type TauExecution = Extract<CadAgentExecution, { readonly kind: 'tau' }>;

/**
 * Rebuild a Tau execution around a different model.
 *
 * `hostId` must survive the swap — rebuilding from a literal is what once
 * returned a Tau Host chat to this browser on every model change.
 *
 * Two retired properties are read and dropped rather than rejected or carried
 * onto the strict turn wire: `placement: 'browser-host'`, from before the
 * browser host became the only Tau placement, and `revision: 'branch'`, from
 * before the revision mode moved to `ChatExecutionTarget` (V18). Persisted rows
 * still carry them and are not migrated (VI9).
 *
 * A non-Tau execution becomes a Tau one, unchanged from the pre-cutover
 * behaviour: picking a Tau model is how an external chat switches back to Tau.
 *
 * @public
 */
export const withTauExecutionModel = (execution: CadAgentExecution, model: string): CadAgentExecution => {
  if (execution.kind !== 'tau') {
    const converted: TauExecution = { kind: 'tau', model };
    return converted;
  }
  const {
    kind: _kind,
    model: _model,
    placement: _placement,
    revision: _revision,
    ...carried
  } = execution as TauExecution & { readonly placement?: unknown; readonly revision?: unknown };
  const next: TauExecution = { ...carried, kind: 'tau', model };
  return next;
};

/**
 * Rebuild any execution around a different model, keeping its kind.
 *
 * The retry path used to run every model through {@link withTauExecutionModel},
 * which silently converted an external-agent chat to a Tau one: a retry is
 * "answer that turn again", never "and move it to another substrate" (V5).
 * An ACP execution keeps its host and agent and takes the id in its *own*
 * namespace (VI3); a Tau one behaves exactly as before.
 *
 * @param execution - The execution to rebuild.
 * @param model - Model id, in whichever namespace the execution's kind speaks.
 * @returns The same kind of execution, on that model.
 * @public
 */
export const withExecutionModel = (execution: CadAgentExecution, model: string): CadAgentExecution =>
  execution.kind === 'acp' ? { ...execution, model } : withTauExecutionModel(execution, model);
