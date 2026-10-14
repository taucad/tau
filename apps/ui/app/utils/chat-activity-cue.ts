import type { MyMessagePart } from '@taucad/chat';
import type { ChatSidebarState } from '#types/chat-sidebar.types.js';
import {
  describeActivity,
  findLastMeaningfulPartIndex,
  isActivityPartActive,
} from '#utils/assistant-message-activity.js';

/** The current activity shown beside the composer. */
export type ChatActivityCue = Readonly<{
  kind: 'working' | 'waiting' | 'reconnecting';
  sentence: string;
}>;

/** Authoritative run state and the latest assistant output. */
export type ChatActivityFacts = Readonly<{
  runState: ChatSidebarState | undefined;
  chatStatus: 'submitted' | 'streaming' | 'ready' | 'error';
  parts?: readonly MyMessagePart[];
}>;

/** Select an honest current action without cycling through invented progress. */
export const selectChatActivityCue = ({
  runState,
  chatStatus,
  parts = [],
}: ChatActivityFacts): ChatActivityCue | undefined => {
  if (runState === 'reconnecting') {
    return { kind: 'reconnecting', sentence: 'Reconnecting…' };
  }
  if (runState === 'approval') {
    return { kind: 'waiting', sentence: 'Waiting for approval' };
  }
  if (runState === 'question') {
    return { kind: 'waiting', sentence: 'Waiting for your answer' };
  }
  // Terminal host state wins over stale streaming parts/status during settlement.
  if (chatStatus !== 'submitted' && (runState === 'done' || runState === 'failed' || runState === 'stopped')) {
    return undefined;
  }
  if (runState === 'queued') {
    return { kind: 'working', sentence: 'Queued…' };
  }
  const isLive =
    runState === 'working' || runState === 'tool' || chatStatus === 'submitted' || chatStatus === 'streaming';
  if (!isLive) {
    return undefined;
  }
  return selectPartActivity(parts);
};

const selectPartActivity = (parts: readonly MyMessagePart[]): ChatActivityCue => {
  const pendingApproval = parts.some((part) => Reflect.get(part, 'state') === 'approval-requested');
  if (pendingApproval) {
    return { kind: 'waiting', sentence: 'Waiting for approval' };
  }
  const tool = parts.findLast(
    (part) => (part.type === 'dynamic-tool' || part.type.startsWith('tool-')) && isActivityPartActive(part),
  );
  if (tool) {
    return { kind: 'working', sentence: describeActivity([tool]) };
  }
  const tail = parts[findLastMeaningfulPartIndex(parts)];
  if (tail?.type === 'reasoning' && tail.state === 'streaming') {
    const thought = tail.text
      .split('\n')
      .findLast((line) => line.trim() !== '')
      ?.replaceAll(/[*#`]/gu, '')
      .trim();
    return { kind: 'working', sentence: thought ? thought.slice(0, 160) : 'Thinking…' };
  }
  if (
    tail?.type === 'text' &&
    tail.state === 'streaming' &&
    tail.providerMetadata?.['common']?.['streamState'] !== 'checkpoint'
  ) {
    return { kind: 'working', sentence: 'Writing response…' };
  }
  return { kind: 'working', sentence: 'Planning next moves…' };
};
