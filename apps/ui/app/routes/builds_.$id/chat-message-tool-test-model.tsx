import { FlaskConical, X, Lightbulb, Check, Box } from 'lucide-react';
import type { ToolInvocation, TestFailure, TestPass } from '@taucad/chat';
import { toolName } from '@taucad/chat/constants';
import { useChatSelector } from '#hooks/use-chat.js';
import {
  ChatToolCard,
  ChatToolCardHeader,
  ChatToolCardIcon,
  ChatToolCardTitle,
  ChatToolCardContent,
} from '#components/chat/chat-tool-card.js';
import { ChatToolAction, ChatToolDescription } from '#components/chat/chat-tool-text.js';
import { RequirementIndicator } from '#components/chat/requirement-indicator.js';
import { ChatToolError } from '#components/chat/chat-tool-error.js';
import { FileLink } from '#components/files/file-link.js';

/**
 * Renders a single test pass (just the requirement description)
 */
function TestPassItem({ pass, index }: { readonly pass: TestPass; readonly index: number }): React.JSX.Element {
  return (
    <div className="flex items-start gap-2 text-xs">
      <div className="mt-0.5 shrink-0">
        <Check className="size-3.5 text-success" />
      </div>
      <div className="text-muted-foreground">
        {index + 1}. {pass.requirement}
      </div>
    </div>
  );
}

/**
 * Renders a single test failure with reason and suggestion
 */
function TestFailureItem({
  failure,
  index,
}: {
  readonly failure: TestFailure;
  readonly index: number;
}): React.JSX.Element {
  return (
    <div className="flex items-start gap-2 text-xs">
      <div className="mt-0.5 shrink-0">
        <X className="size-3.5 text-destructive" />
      </div>
      <div className="flex-1">
        <div className="text-foreground">
          {index + 1}. {failure.requirement}
        </div>
        <div className="mt-1 space-y-1.5">
          <div className="text-muted-foreground">{failure.reason}</div>
          <div className="text-warning-foreground flex items-start gap-1.5 rounded-md bg-warning/10 p-2">
            <Lightbulb className="mt-0.5 size-3 shrink-0 text-warning" />
            <span className="text-[11px] leading-relaxed">{failure.suggestion}</span>
          </div>
        </div>
      </div>
    </div>
  );
}

function GeometryArtifactBadge({ artifactPath }: { readonly artifactPath: string }): React.JSX.Element {
  return (
    <FileLink asChild path={artifactPath}>
      <div className="flex cursor-pointer items-center gap-1.5 rounded-md border border-border/50 bg-muted/30 px-2 py-1 text-[11px] text-muted-foreground transition-colors hover:border-border hover:bg-muted/50 hover:text-foreground">
        <Box className="size-3 shrink-0" />
        <span className="truncate">{artifactPath}</span>
      </div>
    </FileLink>
  );
}

export function ChatMessageToolTestModel({
  part,
}: {
  readonly part: ToolInvocation<typeof toolName.testModel>;
}): React.JSX.Element {
  const chatStatus = useChatSelector((state) => state.status);
  const isLoading = chatStatus === 'streaming' && ['input-streaming', 'input-available'].includes(part.state);

  switch (part.state) {
    case 'input-streaming':
    case 'input-available': {
      return (
        <ChatToolCard key="loading" variant="minimal" status="loading" isDefaultOpen={false}>
          <ChatToolCardHeader>
            <ChatToolCardIcon icon={FlaskConical} />
            <ChatToolCardTitle>
              <ChatToolAction>Running</ChatToolAction> <ChatToolDescription>tests...</ChatToolDescription>
            </ChatToolCardTitle>
          </ChatToolCardHeader>
        </ChatToolCard>
      );
    }

    case 'output-available': {
      const { output: result } = part;
      const { failures = [], passes = [], geometryArtifactPath } = result;
      const passedCount = passes.length;
      const failedCount = failures.length;

      // All tests passed - show passes in collapsible content
      if (failures.length === 0) {
        return (
          <ChatToolCard key="output" variant="minimal" status={isLoading ? 'loading' : 'ready'} isDefaultOpen={false}>
            <ChatToolCardHeader>
              <ChatToolCardIcon icon={FlaskConical} />
              <ChatToolCardTitle>
                <ChatToolAction>All tests passed</ChatToolAction>
              </ChatToolCardTitle>
              <RequirementIndicator failedCount={0} passedCount={passedCount} />
            </ChatToolCardHeader>
            <ChatToolCardContent forceMount>
              <div className="space-y-1 border-l border-foreground/20 py-1 pl-4">
                {passes.map((pass, index) => {
                  const key = `${pass.id}-${index}`;

                  return <TestPassItem key={key} pass={pass} index={index} />;
                })}
              </div>
              {geometryArtifactPath ? <GeometryArtifactBadge artifactPath={geometryArtifactPath} /> : undefined}
            </ChatToolCardContent>
          </ChatToolCard>
        );
      }

      // Some tests failed - show failures first, then passes
      return (
        <ChatToolCard key="output" variant="card" status={isLoading ? 'loading' : 'ready'}>
          <ChatToolCardHeader>
            <ChatToolCardIcon icon={FlaskConical} />
            <ChatToolCardTitle>Test Results</ChatToolCardTitle>
            <RequirementIndicator failedCount={failedCount} passedCount={passedCount} />
          </ChatToolCardHeader>
          <ChatToolCardContent forceMount>
            <div className="space-y-2 p-2">
              {failures.map((failure, index) => {
                const key = `${failure.id}-${index}`;

                return <TestFailureItem key={key} failure={failure} index={index} />;
              })}
              {passes.length > 0 && (
                <div className="mt-3 space-y-1 border-t pt-2">
                  {passes.map((pass, index) => {
                    const key = `${pass.id}-${index}`;

                    return <TestPassItem key={key} pass={pass} index={index} />;
                  })}
                </div>
              )}
              {geometryArtifactPath ? <GeometryArtifactBadge artifactPath={geometryArtifactPath} /> : undefined}
            </div>
          </ChatToolCardContent>
        </ChatToolCard>
      );
    }

    case 'output-error': {
      return <ChatToolError errorText={part.errorText} fallbackIcon={FlaskConical} fallbackTitle="Test run failed" />;
    }

    case 'approval-requested':
    case 'approval-responded':
    case 'output-denied': {
      throw new Error(`Unexpected ${toolName.testModel} state: ${part.state}`);
    }
  }
}
