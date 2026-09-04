import type { CadAgentExecution } from '@taucad/chat';

/** Where one chat turn writes: the live project folder, or an isolated branch. */
export type ChatRevisionMode = 'local' | 'branch';

type TauExecutionWithRevision = Extract<CadAgentExecution, { readonly kind: 'tau' }> & {
  readonly revision: 'branch';
};

/**
 * Working locally is the default until branch porcelain exists, so the mode
 * rides as an additive property on the Tau execution object — absent means
 * "live tree". Read defensively: the persisted chat row is plain storage, not
 * a validated wire record.
 */
export const getChatRevisionMode = (execution: CadAgentExecution): ChatRevisionMode =>
  execution.kind === 'tau' && (execution as { readonly revision?: unknown }).revision === 'branch' ? 'branch' : 'local';

export const withChatRevisionMode = (execution: CadAgentExecution, mode: ChatRevisionMode): CadAgentExecution => {
  if (execution.kind !== 'tau') {
    return execution;
  }
  // `placement` is the retired pre-cutover property: persisted executions still
  // carry it, it must parse, and it must never reach the strict turn wire.
  const {
    revision: _mode,
    placement: _placement,
    ...rest
  } = execution as Extract<CadAgentExecution, { readonly kind: 'tau' }> & {
    readonly revision?: unknown;
    readonly placement?: unknown;
  };
  if (mode !== 'branch') {
    return rest;
  }
  const branched: TauExecutionWithRevision = { ...rest, revision: 'branch' };
  return branched;
};

/**
 * `tauAgentExecutionSchema` is strict, so every client-only property (the
 * revision mode, and the retired `placement`) must be stripped before an
 * execution reaches the chat-turn wire.
 */
export const withoutChatRevisionMode = (execution: CadAgentExecution): CadAgentExecution =>
  withChatRevisionMode(execution, 'local');
