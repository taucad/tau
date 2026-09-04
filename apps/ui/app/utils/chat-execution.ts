import type { CadAgentExecution } from '@taucad/chat';

type TauExecution = Extract<CadAgentExecution, { readonly kind: 'tau' }>;

/**
 * Rebuild a Tau execution around a different model.
 *
 * Client-only sibling properties (today: the revision mode) ride on the
 * execution object and must survive the swap — rebuilding from a literal is
 * what once reset a "New branch" selection on every model change. The retired
 * `placement` property is the one exception: persisted executions still carry
 * `placement: 'browser-host'` from before the browser host became the only Tau
 * placement, and they must parse — so it is read and dropped here rather than
 * rejected or propagated onto the strict turn wire.
 *
 * A non-Tau execution becomes a Tau one, unchanged from the pre-cutover
 * behaviour: picking a Tau model is how a Paseo chat switches back to Tau.
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
    ...carried
  } = execution as TauExecution & { readonly placement?: unknown };
  const next: TauExecution = { ...carried, kind: 'tau', model };
  return next;
};
