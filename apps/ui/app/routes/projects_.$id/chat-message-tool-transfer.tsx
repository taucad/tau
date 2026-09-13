import type { ToolUIPart } from 'ai';
import { getToolName } from 'ai';
import { Compass, BookOpen, Users, ArrowRight, CornerDownLeft, LoaderCircle, Check } from 'lucide-react';
import { isToolExecutionError } from '@taucad/chat/utils';
import { AnimatedShinyText } from '#components/magicui/animated-shiny-text.js';
import { useChatSelector } from '#hooks/use-chat.js';
import { cn } from '#utils/ui.utils.js';
import { toolName } from '@taucad/chat/constants';
import { ChatToolError } from '#components/chat/chat-tool-error.js';
import { ChatToolLabel } from '#components/chat/chat-tool-label.js';

const snakeToSentenceCase = (string_: string): string =>
  string_.replaceAll('_', ' ').replace(/^\w/, (c) => c.toUpperCase());

export const transferToStartingWith = `transfer_to_`;
export const transferBackStartingWith = `transfer_back_to_`;

type AgentType = 'cad_expert' | 'research_expert' | 'supervisor' | 'unknown';

function getAgentIcon(agent: AgentType): React.JSX.Element {
  switch (agent) {
    case 'cad_expert': {
      return <Compass className='size-3.5' />;
    }

    case 'research_expert': {
      return <BookOpen className='size-3.5' />;
    }

    case 'supervisor': {
      return <Users className='size-3.5' />;
    }

    default: {
      return <Users className='size-3.5' />;
    }
  }
}

function getAgentLabel(agent: AgentType): string {
  switch (agent) {
    case 'cad_expert': {
      return 'CAD Expert';
    }

    case 'research_expert': {
      return 'Research Expert';
    }

    case 'supervisor': {
      return 'Supervisor';
    }

    default: {
      return snakeToSentenceCase(agent);
    }
  }
}

function getTransferErrorNoun(transferToolName: string): string {
  switch (transferToolName) {
    case toolName.transferToCadExpert: {
      return 'CAD expert handoff';
    }

    case toolName.transferToResearchExpert: {
      return 'research handoff';
    }

    case toolName.transferBackToSupervisor: {
      return 'supervisor return';
    }

    default: {
      return 'agent handoff';
    }
  }
}

function getAgentAccentColor(agent: AgentType): string {
  switch (agent) {
    case 'cad_expert': {
      return 'text-primary';
    }

    case 'research_expert': {
      return 'text-feature';
    }

    case 'supervisor': {
      return 'text-success';
    }

    default: {
      return 'text-muted-foreground';
    }
  }
}

export function ChatMessageToolTransfer({ part }: { readonly part: ToolUIPart }): React.JSX.Element {
  const toolName = getToolName(part);
  const chatStatus = useChatSelector((state) => state.status);

  let destination: string | undefined;
  let isTransferBack = false;

  if (toolName.startsWith(transferBackStartingWith)) {
    destination = toolName.slice(transferBackStartingWith.length);
    isTransferBack = true;
  } else if (toolName.startsWith(transferToStartingWith)) {
    destination = toolName.slice(transferToStartingWith.length);
  }

  if (!destination) {
    throw new Error(`Invalid tool name ${toolName}`);
  }

  const agentType = destination as AgentType;
  const agentLabel = getAgentLabel(agentType);
  const agentAccent = getAgentAccentColor(agentType);

  const isStreaming = chatStatus === 'streaming' && ['input-streaming', 'input-available'].includes(part.state);
  const isComplete = part.state === 'output-available';

  if (part.state === 'approval-requested' || part.state === 'approval-responded' || part.state === 'output-denied') {
    throw new Error(`Unexpected ${toolName} state: ${part.state}`);
  }

  if (part.state === 'output-available' && isToolExecutionError(part.output)) {
    return (
      <ChatToolError
        errorText={JSON.stringify(part.output)}
        icon={isTransferBack ? CornerDownLeft : ArrowRight}
        noun={getTransferErrorNoun(toolName)}
      />
    );
  }

  // This component has unique agent-specific styling, so we keep it custom
  // but follow the inline badge pattern
  return (
    <div
      className={cn(
        'flex items-center gap-1 rounded-md border px-2 py-1 text-xs',
        'bg-neutral/10 transition-all duration-300',
        isStreaming && 'border-primary/30',
      )}
    >
      {/* Direction indicator */}
      <div className={cn('flex items-center gap-1.5', isStreaming ? 'text-primary' : 'text-muted-foreground')}>
        {isStreaming ? (
          <LoaderCircle className='size-3 animate-spin' />
        ) : isComplete ? (
          <Check className='size-3 text-muted-foreground' />
        ) : isTransferBack ? (
          <CornerDownLeft className='size-3' />
        ) : (
          <ArrowRight className='size-3' />
        )}
      </div>

      {/* Action text — uses ChatToolLabel for verb-style typography parity with other tool rows. */}
      <ChatToolLabel verb={isTransferBack ? 'Returning to' : 'Consulting'} />

      {/* Agent badge — kept as a custom inline element so the agent identity (icon + accent color) survives. */}
      <div className={cn('flex items-center gap-1.5 rounded-sm px-1.5 py-0.5', 'bg-neutral/20', agentAccent)}>
        {getAgentIcon(agentType)}
        {isStreaming ? (
          <AnimatedShinyText className='font-medium'>{agentLabel}</AnimatedShinyText>
        ) : (
          <span className='font-medium'>{agentLabel}</span>
        )}
      </div>
    </div>
  );
}
