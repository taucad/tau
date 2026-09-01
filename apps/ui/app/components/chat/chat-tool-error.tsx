import { Clock, Unplug, WifiOff, TriangleAlert, CircleStop, SearchX, OctagonAlert } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import type { ToolExecutionError } from '@taucad/chat';
import { getToolErrorTitle, getToolErrorDescription, parseToolErrorText } from '@taucad/chat/utils';
import {
  ChatToolCard,
  ChatToolCardHeader,
  ChatToolCardIcon,
  ChatToolCardTitle,
  ChatToolCardContent,
} from '#components/chat/chat-tool-card.js';
import { ChatToolDescription } from '#components/chat/chat-tool-text.js';
import { ChatToolLabel } from '#components/chat/chat-tool-label.js';
import { CodeBlockContent, Pre } from '#components/code/code-block.js';

/** Verb used when {@link parseToolErrorText} cannot parse the error payload. */
const unparseableErrorVerb = 'Attempted';

type ChatToolErrorProps = {
  /** Raw error text from the tool invocation's output-error state */
  readonly errorText: string;
  /** Leading icon for this tool row */
  readonly icon: LucideIcon;
  /**
   * User-facing noun for what was attempted (e.g. `file read`, `web search`).
   * Owned by the caller — pairs with {@link getToolErrorTitle} in both branches.
   */
  readonly noun: string;
  readonly className?: string;
};

const errorIcons = {
  // eslint-disable-next-line @typescript-eslint/naming-convention -- error code
  TOOL_EXECUTION_TIMEOUT: Clock,
  // eslint-disable-next-line @typescript-eslint/naming-convention -- error code
  CLIENT_DISCONNECTED: Unplug,
  // eslint-disable-next-line @typescript-eslint/naming-convention -- error code
  NO_CLIENT_CONNECTION: WifiOff,
  // eslint-disable-next-line @typescript-eslint/naming-convention -- error code
  TOOL_INPUT_VALIDATION_FAILED: TriangleAlert,
  // eslint-disable-next-line @typescript-eslint/naming-convention -- error code
  TOOL_OUTPUT_VALIDATION_FAILED: TriangleAlert,
  // eslint-disable-next-line @typescript-eslint/naming-convention -- error code
  TOOL_EXECUTION_ERROR: TriangleAlert,
  // eslint-disable-next-line @typescript-eslint/naming-convention -- error code
  USER_INTERRUPTED: CircleStop,
  // eslint-disable-next-line @typescript-eslint/naming-convention -- error code
  STREAM_ERROR: OctagonAlert,
  // eslint-disable-next-line @typescript-eslint/naming-convention -- error code
  TOOL_NO_RESULTS: SearchX,
} as const;

type ToolErrorHeaderProps = {
  readonly icon: LucideIcon;
  readonly verb: string;
  readonly noun: string;
};

function ToolErrorHeader({ icon, verb, noun }: ToolErrorHeaderProps): React.JSX.Element {
  return (
    <ChatToolCardHeader>
      <ChatToolCardIcon icon={icon} />
      <ChatToolCardTitle>
        <ChatToolLabel verb={verb}>
          <ChatToolDescription>{noun}</ChatToolDescription>
        </ChatToolLabel>
      </ChatToolCardTitle>
    </ChatToolCardHeader>
  );
}

/**
 * Unified error display component for tool execution errors.
 *
 * Always renders an expandable {@link ChatToolCard} (`variant='minimal'`):
 * the header carries a soft verb + caller-owned noun via
 * {@link ChatToolLabel}/{@link ChatToolDescription}, and the body holds the
 * actual error message (plus validation details and raw output, when
 * present). The same header shape is used for parsed and unparseable
 * `errorText`.
 */
export function ChatToolError({ errorText, icon, noun, className }: ChatToolErrorProps): React.JSX.Element {
  const error = parseToolErrorText(errorText);

  if (!error) {
    return (
      <ChatToolCard variant='minimal' status='error' isDefaultOpen={false} className={className}>
        <ToolErrorHeader icon={icon} verb={unparseableErrorVerb} noun={noun} />
        <ChatToolCardContent>
          <div className='space-y-2 px-2 py-2 text-xs'>
            <CodeBlockContent>
              <Pre className='max-h-40 overflow-auto text-xs'>{errorText}</Pre>
            </CodeBlockContent>
          </div>
        </ChatToolCardContent>
      </ChatToolCard>
    );
  }

  return <StructuredToolErrorBody error={error} noun={noun} className={className} />;
}

type StructuredToolErrorBodyProps = {
  readonly error: ToolExecutionError;
  readonly noun: string;
  readonly className?: string;
};

function StructuredToolErrorBody({ error, noun, className }: StructuredToolErrorBodyProps): React.JSX.Element {
  const headerIcon = errorIcons[error.errorCode];
  const verb = getToolErrorTitle(error.errorCode);
  const description = error.message || getToolErrorDescription(error.errorCode);

  const hasValidationDetails =
    (error.errorCode === 'TOOL_INPUT_VALIDATION_FAILED' || error.errorCode === 'TOOL_OUTPUT_VALIDATION_FAILED') &&
    (error.validationErrors.length > 0 || error.rawOutput !== undefined);

  const isMuted = error.errorCode === 'USER_INTERRUPTED' || error.errorCode === 'TOOL_NO_RESULTS';
  const cardStatus = isMuted ? 'warning' : 'error';

  return (
    <ChatToolCard variant='minimal' status={cardStatus} isDefaultOpen={false} className={className}>
      <ToolErrorHeader icon={headerIcon} verb={verb} noun={noun} />
      <ChatToolCardContent>
        <div className='space-y-2 px-2 py-2 text-xs'>
          {description ? <p className='text-muted-foreground'>{description}</p> : undefined}
          {hasValidationDetails && error.validationErrors.length > 0 ? (
            <div className='space-y-1'>
              <div className='text-xs font-medium text-muted-foreground'>Validation errors:</div>
              <ul className='space-y-0.5 text-xs text-muted-foreground'>
                {error.validationErrors.map((validationError, index) => (
                  // oxlint-disable-next-line react/no-array-index-key -- ensure uniqueness for same path errors.
                  <li key={`${validationError.path}-${index}`}>
                    <code className='text-muted-foreground'>{validationError.path || 'root'}</code>:{' '}
                    {validationError.message}
                  </li>
                ))}
              </ul>
            </div>
          ) : undefined}
          {hasValidationDetails && error.rawOutput !== undefined ? (
            <details className='text-xs'>
              <summary className='cursor-pointer text-muted-foreground hover:text-foreground'>Raw Output</summary>
              <CodeBlockContent className='mt-2'>
                <Pre language='json' className='max-h-40 overflow-auto text-xs'>
                  {JSON.stringify(error.rawOutput, null, 2)}
                </Pre>
              </CodeBlockContent>
            </details>
          ) : undefined}
        </div>
      </ChatToolCardContent>
    </ChatToolCard>
  );
}
