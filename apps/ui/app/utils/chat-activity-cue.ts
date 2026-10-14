import { unified } from 'unified';
import remarkParse from 'remark-parse';
import { visit } from 'unist-util-visit';
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
  return selectPartActivity(chatStatus === 'submitted' ? [] : parts);
};

const summaryParser = unified().use(remarkParse);

// Parse the entire typed summary for display; Markdown never determines eligibility or section selection.
const summaryDisplayText = (summary: string): string => {
  const text: string[] = [];
  visit(summaryParser.parse(summary), (node) => {
    if (node.type === 'text' || node.type === 'inlineCode' || node.type === 'code') {
      text.push(node.value);
    } else if (node.type === 'paragraph' || node.type === 'heading' || node.type === 'break') {
      text.push(' ');
    }
  });
  return text.join('').trim();
};

const hasReasoningSummary = (part: MyMessagePart): boolean => {
  const summary = part.type === 'reasoning' ? part.providerMetadata?.['common']?.['reasoningSummary'] : undefined;
  return typeof summary === 'string' && summary.trim() !== '';
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
  // Only explicitly typed summaries can supersede commentary; raw thoughts cannot.
  const latestAction = parts.findLast(
    (part) =>
      part.type === 'text' ||
      part.type === 'dynamic-tool' ||
      part.type.startsWith('tool-') ||
      hasReasoningSummary(part),
  );
  if (latestAction?.type === 'reasoning') {
    const summary = latestAction.providerMetadata?.['common']?.['reasoningSummary'];
    if (typeof summary === 'string') {
      const sentence = summaryDisplayText(summary);
      if (sentence !== '') {
        return { kind: 'working', sentence };
      }
    }
  }
  if (
    latestAction?.type === 'text' &&
    latestAction.providerMetadata?.['common']?.['messagePhase'] === 'commentary' &&
    latestAction.text.trim() !== ''
  ) {
    return { kind: 'working', sentence: latestAction.text };
  }
  if (tail?.type === 'reasoning' && tail.state === 'streaming') {
    return { kind: 'working', sentence: 'Thinking…' };
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
