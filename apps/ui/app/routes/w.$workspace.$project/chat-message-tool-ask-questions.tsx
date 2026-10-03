import { CircleCheck, MessageCircleQuestionMark, XCircle } from 'lucide-react';
import type { DynamicToolUIPart } from 'ai';
import type { ToolInvocation } from '@taucad/chat';
import { toolName } from '@taucad/chat/constants';
import { isRecord } from '@taucad/utils/schema';
import { cn } from '@taucad/ui/utils/cn';
import {
  ChatToolCard,
  ChatToolCardContent,
  ChatToolCardHeader,
  ChatToolCardIcon,
  ChatToolCardList,
  ChatToolCardListItem,
  ChatToolCardTitle,
} from '#components/chat/chat-tool-card.js';
import { ChatToolDescription } from '#components/chat/chat-tool-text.js';
import { ChatToolLabel } from '#components/chat/chat-tool-label.js';
import { ChatToolError } from '#components/chat/chat-tool-error.js';
import { ChatQuestionCard } from '#components/chat/chat-question-queue.js';
import { findAskForCall, useOptionalChatQuestions } from '#components/chat/chat-questions-context.js';
import { ChatMessageToolExternal } from '#routes/w.$workspace.$project/chat-message-tool-external.js';

type AskQuestionsInvocation = ToolInvocation<typeof toolName.askQuestions>;

function AskingCard(): React.JSX.Element {
  return (
    <ChatToolCard variant='minimal' status='loading' isCollapsible={false}>
      <ChatToolCardHeader>
        <ChatToolCardIcon icon={MessageCircleQuestionMark} />
        <ChatToolCardTitle>
          <ChatToolLabel verb='Asking'>
            <ChatToolDescription>you…</ChatToolDescription>
          </ChatToolLabel>
        </ChatToolCardTitle>
      </ChatToolCardHeader>
    </ChatToolCard>
  );
}

/**
 * The transcript's card for one `ask_questions` call, native or through Tau's MCP endpoint.
 *
 * While the record holds the ask, the live question card stands in the
 * transcript — answerable, and hidden from the composer tray while visible.
 * Without a record (an older chat, another device) the call's own answer is
 * the history.
 *
 * @param props - The tool part this message carries.
 * @param props.part - The `ask_questions` invocation, in whatever state it is in.
 * @returns The card.
 */
export function ChatMessageToolAskQuestions({ part }: { readonly part: AskQuestionsInvocation }): React.JSX.Element {
  const questions = useOptionalChatQuestions();
  const ask =
    part.state === 'input-streaming' || questions === undefined
      ? undefined
      : findAskForCall(questions.asks, { callId: part.toolCallId, questions: part.input?.questions });

  switch (part.state) {
    case 'input-streaming':
    case 'input-available': {
      return ask === undefined ? <AskingCard /> : <ChatQuestionCard shouldReportOnScreen ask={ask} className='my-1' />;
    }

    case 'output-available': {
      if (ask !== undefined) {
        return <ChatQuestionCard shouldReportOnScreen ask={ask} className='my-1' />;
      }
      const { output, input } = part;
      return (
        <ChatToolCard variant='minimal' status='ready' isDefaultOpen={false}>
          <ChatToolCardHeader>
            <ChatToolCardIcon icon={MessageCircleQuestionMark} />
            <ChatToolCardTitle>
              <ChatToolLabel verb={output.status === 'defaulted' ? 'Went with' : 'Answered'}>
                <ChatToolDescription>{output.answers.map((answer) => answer.answer).join(', ')}</ChatToolDescription>
              </ChatToolLabel>
            </ChatToolCardTitle>
          </ChatToolCardHeader>
          <ChatToolCardContent>
            <ChatToolCardList maxHeight='max-h-48'>
              {output.answers.map((answer) => (
                <ChatToolCardListItem
                  key={answer.id}
                  icon={CircleCheck}
                  iconClassName={cn(answer.source === 'person' && 'text-success')}
                >
                  {input.questions.find((question) => question.id === answer.id)?.question ?? answer.id} —{' '}
                  {answer.answer}
                  {answer.source === 'recommended' ? ' (recommended)' : ''}
                </ChatToolCardListItem>
              ))}
            </ChatToolCardList>
          </ChatToolCardContent>
        </ChatToolCard>
      );
    }

    case 'output-error': {
      return <ChatToolError errorText={part.errorText} icon={XCircle} noun='question' />;
    }

    case 'approval-requested':
    case 'approval-responded':
    case 'output-denied': {
      throw new Error(`Unexpected ${toolName.askQuestions} state: ${part.state}`);
    }
  }
}

/**
 * An external agent's tool call, shown as its question card when it asked the person through Tau.
 *
 * Codex's `request_user_input` and Claude's `AskUserQuestion` reach Tau as
 * form elicitations naming their tool call; the record keeps that id.
 *
 * @param props - The external tool part.
 * @param props.part - The dynamic tool part.
 * @returns The question card, or the generic external card.
 */
export function ChatMessageToolExternalOrQuestion({ part }: { readonly part: DynamicToolUIPart }): React.JSX.Element {
  const questions = useOptionalChatQuestions();
  /* The transcript mints its own call id; the agent's own id rides in the call facts. */
  const tau = isRecord(part.toolMetadata?.['tau']) ? part.toolMetadata['tau'] : undefined;
  const acpCallId = typeof tau?.['toolCallId'] === 'string' ? tau['toolCallId'] : undefined;
  const ask =
    acpCallId === undefined
      ? undefined
      : questions?.asks.find((candidate) => candidate.source === 'acp' && candidate.callId === acpCallId);
  return ask === undefined ? (
    <ChatMessageToolExternal part={part} />
  ) : (
    <ChatQuestionCard shouldReportOnScreen ask={ask} className='my-1' />
  );
}
