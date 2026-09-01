import { ChevronDown, ChevronRight, RefreshCw } from 'lucide-react';
import { memo, useCallback, useMemo, useState } from 'react';
import { messageRole } from '@taucad/chat/constants';
import type { MyMessagePart, UsageData } from '@taucad/chat';
import { useChatActions, useChatSelector } from '#hooks/use-chat.js';
import { useCadChatClient } from '#chat-clients/use-cad-chat-client.js';
import type { CombinedChatState } from '#hooks/use-chat.js';
import { serializeMessage } from '#utils/chat.utils.js';
import { parseInlineReferences } from '#utils/at-reference.utils.js';
import type { ActivityGroup, AggregatedGroup } from '#utils/assistant-message-activity.js';
import {
  groupAssistantParts,
  partitionActivityRuns,
  findLastMeaningfulPartIndex,
  shouldWrapRun,
} from '#utils/assistant-message-activity.js';
import { AtReferenceChip } from '#components/chat/at-reference-chip.js';
import { ContextChip } from '#components/chat/context-chip.js';
import { ChatActivityGroup } from '#components/chat/chat-activity-group.js';
import { ChatActivitySection } from '#components/chat/chat-activity-section.js';
import { defaultSkills } from '#components/chat/tiptap/slash-command-suggestion.js';
import { ChatMessageReasoning } from '#routes/projects_.$id/chat-message-reasoning.js';
import { ChatMessageDataUsage } from '#routes/projects_.$id/chat-message-data-usage.js';
import { ChatMessageContextCompaction } from '#routes/projects_.$id/chat-message-context-compaction.js';
import { ChatMessageText } from '#routes/projects_.$id/chat-message-text.js';
import { Tooltip, TooltipTrigger, TooltipContent } from '#components/ui/tooltip.js';
import { CopyButton } from '#components/copy-button.js';
import { Button } from '#components/ui/button.js';
import { cn } from '#utils/ui.utils.js';
import { menuItemVariants, menuSubTriggerOpenClass } from '#components/ui/menu.variants.js';
import { When } from '#components/ui/utils/when.js';
import { ChatTextarea } from '#components/chat/chat-textarea.js';
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuLabel,
} from '#components/ui/dropdown-menu.js';
import { ChatModelSelector } from '#components/chat/chat-model-selector.js';
import { ChatMessageToolWebSearch } from '#routes/projects_.$id/chat-message-tool-web-search.js';
import { ChatMessageToolWebBrowser } from '#routes/projects_.$id/chat-message-tool-web-browser.js';
import { ChatMessageToolFileEdit } from '#routes/projects_.$id/chat-message-tool-edit-file.js';
import { ChatMessageToolTestModel } from '#routes/projects_.$id/chat-message-tool-test-model.js';
import { ChatMessageToolEditTests } from '#routes/projects_.$id/chat-message-tool-edit-tests.js';
import { ChatMessageToolReadFile } from '#routes/projects_.$id/chat-message-tool-read-file.js';
import { ChatMessageToolListDirectory } from '#routes/projects_.$id/chat-message-tool-list-directory.js';
import { ChatMessageToolCreateFile } from '#routes/projects_.$id/chat-message-tool-create-file.js';
import { ChatMessageToolDeleteFile } from '#routes/projects_.$id/chat-message-tool-delete-file.js';
import { ChatMessageToolGrep } from '#routes/projects_.$id/chat-message-tool-grep.js';
import { ChatMessageToolGlobSearch } from '#routes/projects_.$id/chat-message-tool-glob-search.js';
import { ChatMessageToolGetKernelResult } from '#routes/projects_.$id/chat-message-tool-get-kernel-result.js';
import { ChatMessageToolScreenshot } from '#routes/projects_.$id/chat-message-tool-screenshot.js';
import { ChatMessageToolExportGeometry } from '#routes/projects_.$id/chat-message-tool-export-geometry.js';
import { ChatMessagePartUnknown } from '#routes/projects_.$id/chat-message-tool-unknown.js';
import { ChatMessageToolTransfer } from '#routes/projects_.$id/chat-message-tool-transfer.js';
import { ChatMessageFile } from '#routes/projects_.$id/chat-message-file.js';
import { ChatMessagePlanning } from '#routes/projects_.$id/chat-message-planning.js';
import { ChatStreamingStopButton } from '#components/chat/chat-textarea-submit-button.js';
import { cancelChatStreamKeyCombination } from '#components/chat/chat-textarea-types.js';
import { formatKeyCombination } from '#utils/keys.utils.js';

const knownSkillIds = new Set(defaultSkills.map((s) => s.id));

/**
 * Split a line into chunks of `maxLen` characters without breaking `@path` or `/command` references.
 * When a split point falls inside a reference, the chunk extends to include the full reference.
 */
function splitLinePreservingReferences(line: string, maxLength: number, out: string[]): void {
  const segments = parseInlineReferences(line);
  let currentChunk = '';

  for (const segment of segments) {
    const isAtomic = segment.type !== 'text';
    const text =
      segment.type === 'text'
        ? segment.value
        : segment.type === 'atReference'
          ? `@${segment.path}`
          : `/${segment.commandId}`;

    if (currentChunk.length + text.length <= maxLength) {
      currentChunk += text;
    } else if (isAtomic) {
      if (currentChunk.length > 0) {
        out.push(currentChunk);
        currentChunk = '';
      }
      currentChunk = text;
    } else {
      let remaining = text;
      while (remaining.length > 0) {
        const space = maxLength - currentChunk.length;
        if (space <= 0) {
          out.push(currentChunk);
          currentChunk = '';
          continue;
        }
        currentChunk += remaining.slice(0, space);
        remaining = remaining.slice(space);
        if (currentChunk.length >= maxLength) {
          out.push(currentChunk);
          currentChunk = '';
        }
      }
    }
  }

  if (currentChunk.length > 0) {
    out.push(currentChunk);
  }
}

function segmentKey(segment: ReturnType<typeof parseInlineReferences>[number], index: number): string {
  if (segment.type === 'atReference') {
    return `at-${segment.path}`;
  }
  if (segment.type === 'slashCommand') {
    return `slash-${segment.commandId}`;
  }
  return `text-${index}`;
}

function TextWithAtReferences({ text }: { readonly text: string }): React.JSX.Element {
  const segments = parseInlineReferences(text);
  const hasReferences = segments.some((s) => s.type !== 'text');

  if (!hasReferences) {
    return <span>{text}</span>;
  }

  return (
    <>
      {segments.map((segment, i) => {
        const key = segmentKey(segment, i);
        if (segment.type === 'text') {
          return <span key={key}>{segment.value}</span>;
        }
        if (segment.type === 'atReference') {
          return <AtReferenceChip key={key} data-at-reference={segment.path} />;
        }
        if (knownSkillIds.has(segment.commandId)) {
          return <ContextChip key={key} label={`/${segment.commandId}`} chipType='skill' />;
        }
        return <span key={key}>{`/${segment.commandId}`}</span>;
      })}
    </>
  );
}

type PartRenderContext = {
  readonly messageId: string;
  readonly lastMeaningfulIndex: number;
  readonly isLastGroup: boolean;
  readonly isActiveGroup: boolean;
  readonly isMessageActive: boolean;
};

// oxlint-disable-next-line complexity -- Part type dispatch requires many branches
function renderAssistantPart(
  part: MyMessagePart,
  index: number,
  context: PartRenderContext,
): React.JSX.Element | undefined {
  const { messageId, lastMeaningfulIndex, isMessageActive } = context;

  switch (part.type) {
    case 'text': {
      return <ChatMessageText key={`${messageId}-message-part-${index}`} part={part} />;
    }

    case 'reasoning': {
      return (
        <ChatMessageReasoning
          key={`${messageId}-message-part-${index}`}
          part={part}
          hasContent={index < lastMeaningfulIndex}
          isMessageActive={isMessageActive}
        />
      );
    }

    case 'step-start':
    case 'file':
    case 'data-usage':
    case 'data-context-usage': {
      return undefined;
    }

    case 'dynamic-tool': {
      return <ChatMessagePartUnknown key={part.toolCallId} part={part} />;
    }

    case 'source-url': {
      throw new Error('Source URL rendering is not implemented');
    }

    case 'source-document': {
      throw new Error('Source document rendering is not implemented');
    }

    case 'tool-web_search': {
      return <ChatMessageToolWebSearch key={part.toolCallId} part={part} />;
    }

    case 'tool-web_browser': {
      return <ChatMessageToolWebBrowser key={part.toolCallId} part={part} />;
    }

    case 'tool-edit_file': {
      return <ChatMessageToolFileEdit key={part.toolCallId} part={part} />;
    }

    case 'tool-test_model': {
      return <ChatMessageToolTestModel key={part.toolCallId} part={part} />;
    }

    case 'tool-edit_tests': {
      return <ChatMessageToolEditTests key={part.toolCallId} part={part} />;
    }

    case 'tool-transfer_to_cad_expert':
    case 'tool-transfer_to_research_expert':
    case 'tool-transfer_back_to_supervisor': {
      return <ChatMessageToolTransfer key={part.toolCallId} part={part} />;
    }

    case 'tool-read_file': {
      return <ChatMessageToolReadFile key={part.toolCallId} part={part} />;
    }

    case 'tool-list_directory': {
      return <ChatMessageToolListDirectory key={part.toolCallId} part={part} />;
    }

    case 'tool-create_file': {
      return <ChatMessageToolCreateFile key={part.toolCallId} part={part} />;
    }

    case 'tool-delete_file': {
      return <ChatMessageToolDeleteFile key={part.toolCallId} part={part} />;
    }

    case 'tool-grep': {
      return <ChatMessageToolGrep key={part.toolCallId} part={part} />;
    }

    case 'tool-glob_search': {
      return <ChatMessageToolGlobSearch key={part.toolCallId} part={part} />;
    }

    case 'tool-get_kernel_result': {
      return <ChatMessageToolGetKernelResult key={part.toolCallId} part={part} />;
    }

    case 'tool-screenshot': {
      return <ChatMessageToolScreenshot key={part.toolCallId} part={part} />;
    }

    case 'tool-export_geometry': {
      return <ChatMessageToolExportGeometry key={part.toolCallId} part={part} />;
    }

    case 'data-context-compaction': {
      return <ChatMessageContextCompaction key={`${messageId}-compaction-${index}`} data={part.data} />;
    }

    default: {
      const unknownPart: never = part;
      return <ChatMessagePartUnknown key={String(unknownPart)} part={unknownPart} />;
    }
  }
}

function renderActivityGroup(
  group: ActivityGroup,
  groupIndex: number,
  context: PartRenderContext,
): React.JSX.Element | undefined {
  if (group.kind === 'singleton') {
    return renderAssistantPart(group.part, group.partIndex, context);
  }

  return (
    <ChatActivityGroup
      key={`${context.messageId}-group-${groupIndex}`}
      summaryVerbPast={group.summaryVerbPast}
      summaryVerbActive={group.summaryVerbActive}
      summaryDetail={group.summaryDetail}
      isActive={context.isActiveGroup}
    >
      {group.parts.map((part, i) => renderAssistantPart(part, group.partIndices[i]!, context))}
    </ChatActivityGroup>
  );
}

function getGroupKeyPartIndex(group: ActivityGroup): number {
  return group.kind === 'singleton' ? group.partIndex : (group.partIndices[0] ?? 0);
}

function composeRunSummary(aggregated: readonly AggregatedGroup[]): {
  verb: string;
  verbActive: string;
  detail: string;
} {
  if (aggregated.length === 0) {
    return { verb: 'Activity', verbActive: 'Working', detail: '' };
  }

  const firstVerb = aggregated[0]!.summaryVerbPast;
  const firstVerbActive = aggregated[0]!.summaryVerbActive;
  const allSameVerb = aggregated.every((group) => group.summaryVerbPast === firstVerb);
  const allSameVerbActive = aggregated.every((group) => group.summaryVerbActive === firstVerbActive);
  if (allSameVerb) {
    return {
      verb: firstVerb,
      verbActive: allSameVerbActive ? firstVerbActive : '',
      detail: aggregated.map((group) => group.summaryDetail).join(', '),
    };
  }

  return {
    verb: '',
    verbActive: allSameVerbActive ? firstVerbActive : '',
    detail: aggregated.map((group) => group.summary).join(', '),
  };
}

function AssistantParts({
  parts,
  messageId,
}: {
  readonly parts: readonly MyMessagePart[];
  readonly messageId: string;
}): React.JSX.Element {
  const groups = useMemo(() => groupAssistantParts(parts), [parts]);
  const runs = useMemo(() => partitionActivityRuns(groups), [groups]);
  const lastMeaningfulIndex = useMemo(() => findLastMeaningfulPartIndex(parts), [parts]);
  const lastGroupIndex = groups.length - 1;
  const isMessageActive = useChatSelector(
    (state) => state.messageOrder.at(-1) === messageId && state.status === 'streaming',
  );

  const renderContextForGroup = useCallback(
    (absoluteIndex: number): PartRenderContext => {
      const isLastGroup = absoluteIndex === lastGroupIndex;
      return {
        messageId,
        lastMeaningfulIndex,
        isLastGroup,
        isActiveGroup: isLastGroup && isMessageActive,
        isMessageActive,
      };
    },
    [messageId, lastMeaningfulIndex, lastGroupIndex, isMessageActive],
  );

  return (
    <>
      {runs.map((run, runIndex) => {
        const isLastRun = runIndex === runs.length - 1;

        if (run.kind === 'standalone') {
          return renderActivityGroup(run.group, run.groupIndex, renderContextForGroup(run.groupIndex));
        }

        if (!shouldWrapRun(run)) {
          return run.groups.map((group, j) => {
            const absoluteIndex = run.startIndex + j;
            return renderActivityGroup(group, absoluteIndex, renderContextForGroup(absoluteIndex));
          });
        }

        const aggregatedInRun = run.groups.filter((group): group is AggregatedGroup => group.kind === 'aggregated');
        const summary = composeRunSummary(aggregatedInRun);
        const sectionKey = `${messageId}-section-${getGroupKeyPartIndex(run.groups[0]!)}`;
        return (
          <ChatActivitySection
            key={sectionKey}
            summaryVerbPast={summary.verb}
            summaryVerbActive={summary.verbActive}
            summaryDetail={summary.detail}
            hasDownstreamText={!isLastRun}
            isLast={isLastRun}
            isActive={isLastRun && isMessageActive}
          >
            {run.groups.map((group, j) => {
              const absoluteIndex = run.startIndex + j;
              return renderActivityGroup(group, absoluteIndex, renderContextForGroup(absoluteIndex));
            })}
          </ChatActivitySection>
        );
      })}
    </>
  );
}

type ChatMessageProperties = {
  readonly messageId: string;
};

function selectLastUserMessageId(state: CombinedChatState): string | undefined {
  for (let index = state.messages.length - 1; index >= 0; index--) {
    const entry = state.messages[index];
    if (entry?.role === messageRole.user) {
      return entry.id;
    }
  }

  return undefined;
}

// oxlint-disable-next-line complexity -- split render paths for user collapse/edit vs assistant tools would churn without UX benefit
export const ChatMessage = memo(function ({ messageId }: ChatMessageProperties): React.JSX.Element {
  const userMessageCollapseRowThreshold = 8;
  const userMessageCollapseCharacterThreshold = 900;

  const message = useChatSelector((state) => state.messagesById.get(messageId));
  const displayMessage = useChatSelector((state) => state.messageEdits[messageId] ?? state.messagesById.get(messageId));
  const fileParts = useChatSelector(
    (state) => state.messagesById.get(messageId)?.parts.filter((part) => part.type === 'file') ?? [],
  );
  const usageParts = useChatSelector((state) => {
    const message_ = state.messageEdits[messageId] ?? state.messagesById.get(messageId);
    if (!message_) {
      return [];
    }

    const usageDataParts: UsageData[] = [];
    for (const part of message_.parts) {
      if (part.type === 'data-usage') {
        usageDataParts.push(part.data);
      }
    }

    return usageDataParts;
  });
  const { startEditingMessage, exitEditMode, stop } = useChatActions();
  const cadChat = useCadChatClient();
  const chatStatus = useChatSelector((state) => state.status);
  const lastUserMessageId = useChatSelector(selectLastUserMessageId);
  const formattedCancelKeyCombination = formatKeyCombination(cancelChatStreamKeyCombination);
  const [isEditing, setIsEditing] = useState(false);

  const isUser = message?.role === messageRole.user;
  const showUserBubbleStopShortcut =
    isUser &&
    !isEditing &&
    lastUserMessageId === messageId &&
    (chatStatus === 'streaming' || chatStatus === 'submitted');
  const isCollapsedUserMessage = isUser && !isEditing;

  const collapsedUserRows = useMemo(() => {
    if (!isCollapsedUserMessage || !displayMessage || fileParts.length > 0) {
      return [];
    }

    const rows: string[] = [];
    for (const part of displayMessage.parts) {
      if (part.type !== 'text') {
        continue;
      }

      const normalizedText = part.text.replaceAll('\r\n', '\n');
      for (const line of normalizedText.split('\n')) {
        if (line.length === 0) {
          rows.push('');
          continue;
        }

        splitLinePreservingReferences(line, 220, rows);
      }
    }

    return rows.length > 0 ? rows : [''];
  }, [displayMessage, fileParts.length, isCollapsedUserMessage]);

  const collapsedUserCharacterCount = useMemo(() => {
    if (!isCollapsedUserMessage || !displayMessage || fileParts.length > 0) {
      return 0;
    }

    let characterCount = 0;
    for (const part of displayMessage.parts) {
      if (part.type === 'text') {
        characterCount += part.text.length;
      }
    }

    return characterCount;
  }, [displayMessage, fileParts.length, isCollapsedUserMessage]);

  const shouldCollapseUserMessage =
    isCollapsedUserMessage &&
    (collapsedUserRows.length > userMessageCollapseRowThreshold ||
      collapsedUserCharacterCount > userMessageCollapseCharacterThreshold);
  const shouldRenderCollapsedUserRows = shouldCollapseUserMessage && fileParts.length === 0;

  const collapsedUserRowsWithStableKeys = useMemo(() => {
    if (!displayMessage) {
      return [];
    }

    let sliceStartOffsetInVirtualText = 0;
    return collapsedUserRows.map((row) => {
      const rowKeyPrefix = `${displayMessage.id}:${sliceStartOffsetInVirtualText}`;
      sliceStartOffsetInVirtualText += row.length + 1;
      return { keyPrefix: rowKeyPrefix, row };
    });
  }, [collapsedUserRows, displayMessage]);

  if (!message || !displayMessage) {
    return <div>Message not found</div>;
  }

  const handleEditClick = () => {
    if (!isUser) {
      return;
    }

    if (!isEditing) {
      startEditingMessage(messageId);
    }

    setIsEditing((previous) => !previous);
  };

  return (
    <article
      className={cn(
        'group/chat-message flex w-full flex-row items-start',
        isUser && 'items-end gap-2 space-x-reverse',
        // No `position: sticky` on user messages. Every sticky scoping we
        // tried — every TG, past TGs only, live TG only — produced a
        // multi-hundred-px viewport jump on the first wheel-up from the
        // scroll-bottom of a multi-turn chat. Root cause is a layout-
        // reconciliation cascade between sticky stuck/unstuck transitions
        // and outer chat-history Virtuoso's measurement/anchor path. The
        // live (last) TurnGroup is still pinned to viewport top via
        // `min-h-(--chat-live-turn-min-h)` on the TG and
        // `scrollToIndex(LAST, align: 'start')` on submit (chat-history.tsx).
        // Past user messages scroll out of view naturally — accepted UX
        // trade-off until we have a non-sticky pinning mechanism.
      )}
    >
      <div
        className={cn(
          'flex flex-col space-y-2 min-w-0',
          'w-full',
          // Vary left margin for user and assistant messages to achieve visual
          // differentiation. Right side is intentionally flush — the parent
          // ChatScroller reserves a fixed scrollbar gutter, so dropping the
          // right margin here lets bubbles use that space when the scrollbar
          // is hidden, and the gutter doubles as the right margin when shown.
          isUser ? 'mx-2' : 'mx-4',
        )}
      >
        <When shouldRender={isUser ? isEditing : false}>
          <ChatTextarea
            mode='edit'
            className='rounded-sm'
            onSubmit={async (event) => {
              // R10/t17: edit-message routes through the cad chat-client so
              // the wire body's `agent` block is composed from the live
              // `useCadAgentConfig` snapshot — no model/metadata stamping
              // on the persisted user row.
              cadChat.edit(messageId, { text: event.content, imageUrls: event.imageUrls });
              exitEditMode();
              setIsEditing(false);
            }}
            onEscapePressed={() => {
              exitEditMode();
              setIsEditing(false);
            }}
            onBlur={() => {
              exitEditMode();
              setIsEditing(false);
            }}
          />
        </When>
        <When shouldRender={!isEditing}>
          {/* Matches focused-edit ChatTextarea natural max (max-h-48 editor + mb-10 toolbar room + 2px border = 14.625rem). Keep in sync so click-to-edit does not jump. */}
          <div
            className={cn(
              'flex flex-col gap-0 min-w-0',
              isUser && 'cursor-pointer rounded-sm border bg-background px-3 py-1 hover:border-primary',
              shouldRenderCollapsedUserRows && 'max-h-58.5 overflow-hidden',
              fileParts.length > 0 && 'pt-3',
              showUserBubbleStopShortcut && 'relative',
            )}
            onClick={handleEditClick}
          >
            {fileParts.length > 0 ? (
              <div className='flex flex-row gap-2'>
                {fileParts.map((part) => (
                  <ChatMessageFile key={part.url} part={part} />
                ))}
              </div>
            ) : null}
            {shouldRenderCollapsedUserRows ? (
              <div className='flex flex-col gap-1 pr-1'>
                {collapsedUserRowsWithStableKeys.map(({ keyPrefix, row }) => (
                  <p
                    key={`${keyPrefix}:${row.slice(0, 120)}`}
                    className='text-sm leading-relaxed wrap-break-word whitespace-pre-wrap text-foreground/90'
                  >
                    <TextWithAtReferences text={row} />
                  </p>
                ))}
              </div>
            ) : (
              <AssistantParts parts={displayMessage.parts} messageId={displayMessage.id} />
            )}
            {showUserBubbleStopShortcut ? (
              <div
                className={cn(
                  'absolute right-1 bottom-1 z-10 transition-opacity duration-150',
                  'pointer-events-none opacity-0',
                  'group-hover/chat-message:pointer-events-auto group-hover/chat-message:opacity-100',
                  'group-focus-within/chat-message:pointer-events-auto group-focus-within/chat-message:opacity-100',
                )}
              >
                <ChatStreamingStopButton
                  variant='compact'
                  formattedCancelKeyCombination={formattedCancelKeyCombination}
                  onCancel={stop}
                />
              </div>
            ) : null}
          </div>
        </When>
        <ChatMessagePlanning messageId={messageId} className='-my-1' />
        <When shouldRender={!isUser}>
          <div className='mt-1 flex flex-row items-start justify-start text-muted-foreground'>
            <CopyButton
              tooltipContentProperties={{ side: 'bottom' }}
              size='icon'
              getText={() => serializeMessage(displayMessage)}
              tooltip='Copy message'
              className='size-7'
            />
            <Tooltip>
              <DropdownMenu modal={false}>
                <TooltipTrigger asChild>
                  <DropdownMenuTrigger asChild>
                    <Button size='xs' variant='ghost' className='h-7 gap-1 has-[>svg]:px-1.5'>
                      <RefreshCw className='size-4' />
                      <ChevronDown className='size-4' />
                    </Button>
                  </DropdownMenuTrigger>
                </TooltipTrigger>
                <DropdownMenuContent align='start' side='top' className='min-w-50'>
                  <DropdownMenuLabel>Switch model</DropdownMenuLabel>
                  <ChatModelSelector
                    popoverProperties={{ side: 'right', align: 'start' }}
                    className='h-fit w-full'
                    onSelect={(modelId) => {
                      cadChat.retry(messageId, modelId);
                    }}
                  >
                    {({ selectedModel }) => (
                      <button
                        type='button'
                        className={cn(
                          menuItemVariants(),
                          menuSubTriggerOpenClass,
                          'group w-full hover:bg-neutral/30 hover:text-foreground',
                        )}
                      >
                        <span>{selectedModel.name}</span>
                        <ChevronRight className='ml-auto size-3.5 text-muted-foreground transition-transform duration-200 ease-in-out group-data-[state=open]:rotate-90' />
                      </button>
                    )}
                  </ChatModelSelector>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem
                    className='flex justify-between'
                    onClick={() => {
                      cadChat.retry(messageId);
                    }}
                  >
                    <p>Try again</p>
                    <RefreshCw className='text-muted-foreground' />
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
              <TooltipContent side='bottom'>Switch model</TooltipContent>
            </Tooltip>
            <div className='flex flex-row items-center justify-end gap-1'>
              {usageParts.length > 0 ? <ChatMessageDataUsage usageParts={usageParts} /> : null}
            </div>
          </div>
        </When>
      </div>
    </article>
  );
});
