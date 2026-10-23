import type { CadAgentExecution, TauAgentHostId } from '@taucad/chat';

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

/** Host ids of a loopback daemon reached by URL (rung 5) start with this, followed by its origin. @public */
export const loopbackHostIdPrefix = 'loopback:';

/**
 * Whether a host id names a place only on the device that chose it.
 *
 * `desktop` (this computer's in-process launcher), `origin` (the daemon that
 * served this page) and a `loopback:` daemon (admitted per tab) each name a
 * host relative to the reading device. A paired device id from
 * `GET /v1/agents` names one machine every signed-in device can reach.
 *
 * @param hostId - The host id to classify.
 * @returns Whether it means something only on the device that wrote it.
 * @public
 */
export const isDeviceRelativeHostId = (hostId: string): boolean =>
  hostId === 'desktop' || hostId === 'origin' || hostId.startsWith(loopbackHostIdPrefix);

/**
 * The execution as a synced chat record keeps it: the chat's intent, without
 * this device's placement.
 *
 * A Tau execution's device-relative `hostId` is dropped, because absent is
 * what "local placement" reads as on every device; a paired device id stays.
 * An external agent keeps its host, which is the machine its CLI is on.
 *
 * @param execution - The execution to persist, or `undefined`.
 * @returns The same execution without a device-relative Tau placement.
 * @public
 */
export const portableExecutionOf = <Execution extends CadAgentExecution | undefined>(
  execution: Execution,
): Execution => {
  if (execution?.kind !== 'tau' || execution.hostId === undefined || !isDeviceRelativeHostId(execution.hostId)) {
    return execution;
  }
  const { hostId: _hostId, ...portable } = execution;
  return portable as Execution;
};

/**
 * The placement a device keeps for one chat in its composer record, or
 * `undefined` when the chat takes the device's default.
 *
 * Only `origin` and a `loopback:` daemon are kept: neither is ever a device's
 * default placement. `desktop` is local placement wherever it is read (the
 * in-process launcher on Tau Desktop, the page's worker elsewhere), so it
 * needs no record; a paired device and an external agent live in the chat.
 *
 * @param execution - The execution the person chose for the chat on this device.
 * @returns The host id to keep for the chat on this device, if any.
 * @public
 */
export const chatPlacementOf = (execution: CadAgentExecution | undefined): TauAgentHostId | undefined =>
  execution?.kind === 'tau' &&
  execution.hostId !== undefined &&
  execution.hostId !== 'desktop' &&
  isDeviceRelativeHostId(execution.hostId)
    ? execution.hostId
    : undefined;

/**
 * Put this device's own placement for one chat back onto its stored execution.
 *
 * Only a Tau execution with no portable host takes it; a paired device and an
 * external agent keep the host the chat names.
 *
 * @param execution - The chat's stored, portable execution.
 * @param placement - This device's placement for the chat, from its composer record.
 * @returns The execution this device runs the chat on.
 * @public
 */
export const withChatPlacement = (
  execution: CadAgentExecution | undefined,
  placement: TauAgentHostId | undefined,
): CadAgentExecution | undefined =>
  placement === undefined || execution?.kind !== 'tau' || execution.hostId !== undefined
    ? execution
    : { ...execution, hostId: placement };
