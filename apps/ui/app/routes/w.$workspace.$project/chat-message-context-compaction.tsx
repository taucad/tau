import { AlertTriangle, Archive, RotateCcw } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import type { ContextCompactionData } from '@taucad/chat';
import { FileLink } from '#components/files/file-link.js';
import {
  ChatToolCard,
  ChatToolCardHeader,
  ChatToolCardIcon,
  ChatToolCardTitle,
} from '#components/chat/chat-tool-card.js';
import { ChatToolDescription } from '#components/chat/chat-tool-text.js';
import { ChatToolLabel } from '#components/chat/chat-tool-label.js';
import { HoverCard, HoverCardContent, HoverCardTrigger } from '#components/ui/hover-card.js';
import { formatNumberAbbreviation } from '#utils/number.utils.js';

type CompactionView = {
  icon: LucideIcon;
  tone?: 'success' | 'warning' | 'destructive';
  cardStatus: 'ready' | 'warning' | 'error';
  verb: string;
  description: string;
  title: string;
};

function getCompactionView(data: ContextCompactionData): CompactionView {
  switch (data.status ?? 'compacted') {
    case 'failed':
      return {
        icon: AlertTriangle,
        tone: 'destructive',
        cardStatus: 'error',
        verb: 'Compaction blocked',
        description: 'provider dispatch',
        title: 'Context compaction blocked',
      };
    case 'overflow_retry_succeeded':
      return {
        icon: RotateCcw,
        tone: 'warning',
        cardStatus: 'warning',
        verb: 'Trimmed',
        description: 'chat context after overflow',
        title: 'Overflow retry',
      };
    case 'skipped':
      return {
        icon: Archive,
        cardStatus: 'ready',
        verb: 'Skipped',
        description: 'chat context compaction',
        title: 'Context compaction skipped',
      };
    case 'compacted':
    default:
      return {
        icon: Archive,
        tone: 'success',
        cardStatus: 'ready',
        verb: 'Summarized',
        description: 'chat context',
        title: 'Context compaction',
      };
  }
}

function formatTriggerReason(reason: ContextCompactionData['triggerReason']): string | undefined {
  switch (reason) {
    case 'estimate':
      return 'Estimated budget';
    case 'previous_usage':
      return 'Previous provider usage';
    case 'overflow':
      return 'Provider overflow';
    case 'none':
    case undefined:
      return undefined;
    default:
      return undefined;
  }
}

function formatFailureKind(kind: ContextCompactionData['compactionFailureKind']): string | undefined {
  switch (kind) {
    case 'morph_transport_error':
      return 'Morph transport error';
    case 'morph_http_error':
      return 'Morph HTTP error';
    case 'morph_contract_error':
      return 'Morph response contract error';
    case 'transcript_commit_failed':
      return 'Transcript commit failed';
    case 'context_overflow_retry_failed':
      return 'Overflow retry failed';
    case 'unexpected_error':
      return 'Unexpected implementation error';
    case undefined:
      return undefined;
    default:
      return undefined;
  }
}

function formatFailureDisposition(disposition: ContextCompactionData['failureDisposition']): string | undefined {
  switch (disposition) {
    case 'blocked_before_provider':
      return 'Blocked before provider dispatch';
    case undefined:
      return undefined;
    default:
      return undefined;
  }
}

/**
 * Renders a "Chat context summarized." line inline in the message stream,
 * styled consistently with other tool rows (see chat-message-tool-read-file).
 * Shows compression details on hover via HoverCard.
 */
export function ChatMessageContextCompaction({ data }: { readonly data: ContextCompactionData }): React.JSX.Element {
  const view = getCompactionView(data);
  const reductionPercent = Math.max(0, (1 - data.compressionRatio) * 100).toFixed(0);
  const triggerReason = formatTriggerReason(data.triggerReason);
  const failureKind = formatFailureKind(data.compactionFailureKind);
  const failureDisposition = formatFailureDisposition(data.failureDisposition);
  const isFailed = data.status === 'failed';

  return (
    <HoverCard openDelay={100} closeDelay={100}>
      <HoverCardTrigger asChild>
        <div className='cursor-help'>
          <ChatToolCard variant='minimal' status={view.cardStatus} isCollapsible={false}>
            <ChatToolCardHeader>
              <ChatToolCardIcon icon={view.icon} tone={view.tone} />
              <ChatToolCardTitle>
                <ChatToolLabel verb={view.verb}>
                  <ChatToolDescription>{view.description}</ChatToolDescription>
                </ChatToolLabel>
              </ChatToolCardTitle>
            </ChatToolCardHeader>
          </ChatToolCard>
        </div>
      </HoverCardTrigger>
      <HoverCardContent className='w-auto p-3'>
        <div className='flex flex-col gap-1.5 text-xs'>
          <p className='font-medium'>{view.title}</p>
          <div className='grid grid-cols-[auto_1fr] gap-x-3 gap-y-0.5'>
            {triggerReason ? (
              <>
                <span className='text-muted-foreground'>Trigger</span>
                <span>{triggerReason}</span>
              </>
            ) : null}
            {data.estimatedInputTokens ? (
              <>
                <span className='text-muted-foreground'>Estimate</span>
                <span className='font-mono'>{formatNumberAbbreviation(data.estimatedInputTokens)} tokens</span>
              </>
            ) : null}
            {failureKind ? (
              <>
                <span className='text-muted-foreground'>Failure</span>
                <span>{failureKind}</span>
              </>
            ) : null}
            {failureDisposition ? (
              <>
                <span className='text-muted-foreground'>Disposition</span>
                <span>{failureDisposition}</span>
              </>
            ) : null}
            {data.debugId ? (
              <>
                <span className='text-muted-foreground'>Debug ID</span>
                <span className='font-mono'>{data.debugId}</span>
              </>
            ) : null}
            {data.providerNativeReplayMetadataPresent !== undefined ? (
              <>
                <span className='text-muted-foreground'>Replay metadata</span>
                <span>{data.providerNativeReplayMetadataPresent ? 'Present' : 'Missing'}</span>
              </>
            ) : null}
            {data.missingFunctionCallSignatureCount !== undefined ? (
              <>
                <span className='text-muted-foreground'>Missing signatures</span>
                <span className='font-mono'>{data.missingFunctionCallSignatureCount}</span>
              </>
            ) : null}
            <span className='text-muted-foreground'>Before</span>
            <span className='font-mono'>{formatNumberAbbreviation(data.tokensBeforeCompaction)} tokens</span>
            <span className='text-muted-foreground'>After</span>
            <span className='font-mono'>{formatNumberAbbreviation(data.tokensAfterCompaction)} tokens</span>
            {isFailed ? null : (
              <>
                <span className='text-muted-foreground'>Reduction</span>
                <span className='font-mono'>{reductionPercent}%</span>
              </>
            )}
            <span className='text-muted-foreground'>Messages evicted</span>
            <span className='font-mono'>{data.messagesEvicted}</span>
          </div>
          {data.transcriptFilePath ? (
            <p className='mt-1 text-muted-foreground'>
              Transcript{' '}
              <FileLink path={data.transcriptFilePath} className='font-mono text-[10px] text-muted-foreground'>
                {data.transcriptFilePath}
              </FileLink>
            </p>
          ) : null}
        </div>
      </HoverCardContent>
    </HoverCard>
  );
}
