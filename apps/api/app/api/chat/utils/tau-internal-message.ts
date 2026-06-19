import { HumanMessage } from '@langchain/core/messages';
import type { BaseMessage } from '@langchain/core/messages';

export type TauInternalMessageKind =
  | 'client-memory'
  | 'compaction-summary'
  | 'interrupt-recovery'
  | 'recent-skills'
  | 'safeguard'
  | 'snapshot-context'
  | 'token-usage';

export type TauInternalMetadata = {
  readonly kind: TauInternalMessageKind;
  readonly anchorId?: string;
  readonly revision?: string;
  readonly pruning?: 'replace-by-id' | 'preserve-until-compaction';
};

export type CreateTauInternalHumanMessageInput = {
  readonly id: string;
  readonly content: HumanMessage['content'];
  readonly kind: TauInternalMessageKind;
  readonly metadata?: Omit<TauInternalMetadata, 'kind'>;
  readonly additionalKwargs?: Record<string, unknown>;
};

const tauInternalKey = 'tau_internal';
const internalLcSources = new Set(['compaction', 'recent_skills']);

export function createTauInternalHumanMessage(input: CreateTauInternalHumanMessageInput): HumanMessage {
  return new HumanMessage({
    id: input.id,
    content: input.content,
    // eslint-disable-next-line @typescript-eslint/naming-convention -- LangChain metadata is snake_case.
    additional_kwargs: withTauInternalMetadata(input.additionalKwargs, {
      kind: input.kind,
      ...input.metadata,
    }),
  });
}

export function withTauInternalMetadata(
  additionalKwargs: Record<string, unknown> | undefined,
  metadata: TauInternalMetadata,
): Record<string, unknown> {
  return {
    ...additionalKwargs,
    [tauInternalKey]: metadata,
  };
}

export function getTauInternalMetadata(message: BaseMessage): TauInternalMetadata | undefined {
  const metadata = messageAdditionalKwargs(message)[tauInternalKey];
  if (!isRecord(metadata) || typeof metadata['kind'] !== 'string') {
    return undefined;
  }
  return metadata as TauInternalMetadata;
}

export function isTauInternalMessage(message: BaseMessage): boolean {
  if (getTauInternalMetadata(message)) {
    return true;
  }

  const source = messageAdditionalKwargs(message)['lc_source'];
  return typeof source === 'string' && internalLcSources.has(source);
}

export function isTauInternalKind(message: BaseMessage, kind: TauInternalMessageKind): boolean {
  const metadata = getTauInternalMetadata(message);
  if (metadata?.kind === kind) {
    return true;
  }

  const source = messageAdditionalKwargs(message)['lc_source'];
  return (
    (kind === 'compaction-summary' && source === 'compaction') ||
    (kind === 'recent-skills' && source === 'recent_skills')
  );
}

function messageAdditionalKwargs(message: BaseMessage): Record<string, unknown> {
  const record = message as {
    additional_kwargs?: Record<string, unknown>;
    kwargs?: { additional_kwargs?: Record<string, unknown> };
    lc_kwargs?: { additional_kwargs?: Record<string, unknown> };
  };
  return record.additional_kwargs ?? record.kwargs?.additional_kwargs ?? record.lc_kwargs?.additional_kwargs ?? {};
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
