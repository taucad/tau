import { CheckCircle, XCircle, AlertTriangle, Info } from 'lucide-react';
import type { ToolInvocation } from '@taucad/chat';
import { toolName } from '@taucad/chat/constants';
import type { IssueSeverity, KernelIssue } from '@taucad/runtime';
import {
  ChatToolCard,
  ChatToolCardHeader,
  ChatToolCardIcon,
  ChatToolCardTitle,
  ChatToolCardContent,
  ChatToolCardList,
  ChatToolCardListItem,
} from '#components/chat/chat-tool-card.js';
import { ChatToolDescription } from '#components/chat/chat-tool-text.js';
import { ChatToolLabel } from '#components/chat/chat-tool-label.js';
import { FileLink } from '#components/files/file-link.js';
import { ViewerLink } from '#components/files/viewer-link.js';
import { MarkdownViewer } from '#components/markdown/markdown-viewer.js';
import { ChatToolError } from '#components/chat/chat-tool-error.js';

/**
 * Maps issue severity to appropriate icon component.
 */
function getSeverityIcon(severity: IssueSeverity): typeof AlertTriangle {
  switch (severity) {
    case 'error': {
      return XCircle;
    }

    case 'warning': {
      return AlertTriangle;
    }

    case 'info': {
      return Info;
    }
  }
}

/**
 * Maps issue severity to appropriate icon color class.
 *
 * Only `error` is colored (red) so the eye is drawn to real failures.
 * Warnings and info stay muted — the icon shape (AlertTriangle / Info) is
 * enough to convey severity without competing with destructive states.
 */
function getSeverityIconClass(severity: IssueSeverity): string {
  switch (severity) {
    case 'error': {
      return 'text-destructive';
    }

    case 'warning':
    case 'info': {
      return 'text-muted-foreground';
    }
  }
}

type IssueCounts = {
  readonly errorCount: number;
  readonly warningCount: number;
  readonly infoCount: number;
  readonly hasErrors: boolean;
};

/**
 * Counts kernel issues by severity. Title copy is composed at the call site so
 * the filename can render as an inline {@link ViewerLink}.
 */
function getIssueCounts(issues: KernelIssue[]): IssueCounts {
  let errorCount = 0;
  let warningCount = 0;
  let infoCount = 0;

  for (const issue of issues) {
    if (issue.severity === 'error') {
      errorCount++;
    } else if (issue.severity === 'warning') {
      warningCount++;
    } else {
      infoCount++;
    }
  }

  return {
    errorCount,
    warningCount,
    infoCount,
    hasErrors: errorCount > 0,
  };
}

function FilenameLink({ targetFile }: { readonly targetFile: string }): React.JSX.Element {
  return <ViewerLink path={targetFile}>{targetFile}</ViewerLink>;
}

export function ChatMessageToolGetKernelResult({
  part,
}: {
  readonly part: ToolInvocation<typeof toolName.getKernelResult>;
}): React.JSX.Element {
  switch (part.state) {
    case 'input-streaming': {
      const targetFile = part.input?.targetFile;

      return (
        <ChatToolCard variant='minimal' status='loading' isDefaultOpen={false}>
          <ChatToolCardHeader>
            <ChatToolCardIcon icon={CheckCircle} />
            <ChatToolCardTitle>
              <ChatToolLabel verb='Compiling'>
                {targetFile ? (
                  <ChatToolDescription>
                    <FilenameLink targetFile={targetFile} />
                    ...
                  </ChatToolDescription>
                ) : (
                  <ChatToolDescription>...</ChatToolDescription>
                )}
              </ChatToolLabel>
            </ChatToolCardTitle>
          </ChatToolCardHeader>
        </ChatToolCard>
      );
    }

    case 'input-available': {
      const { targetFile } = part.input;

      return (
        <ChatToolCard variant='minimal' status='loading' isDefaultOpen={false}>
          <ChatToolCardHeader>
            <ChatToolCardIcon icon={CheckCircle} />
            <ChatToolCardTitle>
              <ChatToolLabel verb='Compiling'>
                <ChatToolDescription>
                  <FilenameLink targetFile={targetFile} />
                  ...
                </ChatToolDescription>
              </ChatToolLabel>
            </ChatToolCardTitle>
          </ChatToolCardHeader>
        </ChatToolCard>
      );
    }

    case 'output-available': {
      const { output } = part;
      const { targetFile } = part.input;
      const { status, kernelIssues } = output;

      const hasIssues = kernelIssues && kernelIssues.length > 0;

      // Success state with no issues - use minimal card with neutral icon
      // (success states deliberately stay muted so only failures draw the eye).
      if (status === 'ready' && !hasIssues) {
        return (
          <ChatToolCard variant='minimal' status='ready' isCollapsible={false}>
            <ChatToolCardHeader>
              <ChatToolCardIcon icon={CheckCircle} />
              <ChatToolCardTitle>
                <ChatToolLabel verb='Compiled'>
                  <ChatToolDescription>
                    <FilenameLink targetFile={targetFile} />
                  </ChatToolDescription>
                </ChatToolLabel>
              </ChatToolCardTitle>
            </ChatToolCardHeader>
          </ChatToolCard>
        );
      }

      // Has issues - determine severity for styling
      const counts = hasIssues
        ? getIssueCounts(kernelIssues)
        : { errorCount: 0, warningCount: 0, infoCount: 0, hasErrors: false };
      const { hasErrors, warningCount } = counts;
      const headerIcon = hasErrors ? XCircle : AlertTriangle;
      // Only failures get a colored leading icon. Warnings render the
      // AlertTriangle shape (which is enough to convey severity) without a
      // tone so the success/warning headers don't visually compete with real
      // failures.
      const headerIconTone = hasErrors ? 'destructive' : undefined;
      const borderClass = hasErrors ? 'border-destructive/30' : 'border-warning/30';
      const cardStatus = hasErrors ? 'error' : 'warning';

      const titleLabel = ((): React.ReactNode => {
        if (hasErrors) {
          return (
            <ChatToolLabel verb='Failed to compile'>
              <ChatToolDescription>
                <FilenameLink targetFile={targetFile} />
              </ChatToolDescription>
            </ChatToolLabel>
          );
        }

        const warningSuffix = `with ${warningCount} ${warningCount === 1 ? 'warning' : 'warnings'}`;
        return (
          <ChatToolLabel verb='Compiled'>
            <ChatToolDescription>
              <FilenameLink targetFile={targetFile} /> {warningSuffix}
            </ChatToolDescription>
          </ChatToolLabel>
        );
      })();

      return (
        <ChatToolCard isCookieDefaultOpen variant='minimal' status={cardStatus} isDefaultOpen={false}>
          <ChatToolCardHeader>
            <ChatToolCardIcon icon={headerIcon} tone={headerIconTone} />
            <ChatToolCardTitle>{titleLabel}</ChatToolCardTitle>
          </ChatToolCardHeader>
          {hasIssues ? (
            <ChatToolCardContent>
              <ChatToolCardList maxHeight='max-h-48' className={borderClass}>
                {kernelIssues.map((issue, index) => {
                  const { location, severity } = issue;
                  const key = `${location?.startLineNumber ?? index}-${issue.message}`;
                  const issueIcon = getSeverityIcon(severity);
                  const issueIconClass = getSeverityIconClass(severity);

                  return (
                    <ChatToolCardListItem key={key} icon={issueIcon} iconClassName={issueIconClass}>
                      <span className='flex min-w-0 flex-1 flex-col items-start gap-0.5 @xs:flex-row @xs:gap-1'>
                        {location ? (
                          <FileLink
                            asChild
                            path={location.fileName}
                            lineNumber={location.startLineNumber}
                            column={location.startColumn}
                            className='min-w-0 truncate font-mono text-xs text-muted-foreground/70 hover:text-foreground'
                          >
                            <span>
                              {location.fileName}:{location.startLineNumber}:{location.startColumn}
                            </span>
                          </FileLink>
                        ) : undefined}
                        <MarkdownViewer className='inline w-auto min-w-0 font-mono text-xs wrap-break-word text-inherit'>
                          {issue.message}
                        </MarkdownViewer>
                      </span>
                    </ChatToolCardListItem>
                  );
                })}
              </ChatToolCardList>
            </ChatToolCardContent>
          ) : undefined}
        </ChatToolCard>
      );
    }

    case 'output-error': {
      return <ChatToolError errorText={part.errorText} icon={XCircle} noun='kernel compile' />;
    }

    case 'approval-requested':
    case 'approval-responded':
    case 'output-denied': {
      throw new Error(`Unexpected ${toolName.getKernelResult} state: ${part.state}`);
    }
  }
}
