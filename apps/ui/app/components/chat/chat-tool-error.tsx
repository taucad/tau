import { Clock, Unplug, WifiOff, TriangleAlert, CircleStop, SearchX, OctagonAlert } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import type { ToolExecutionError } from '@taucad/chat';
import {
  getToolErrorTitle,
  getToolErrorDescription,
  parseToolErrorEnvelope,
  parseToolErrorText,
} from '@taucad/chat/utils';
import {
  ChatToolCard,
  ChatToolCardHeader,
  ChatToolCardIcon,
  ChatToolCardTitle,
  ChatToolCardContent,
} from '@taucad/chat-ui/components/chat-tool-card';
import { ChatToolDescription } from '@taucad/chat-ui/components/chat-tool-text';
import { ChatToolLabel } from '@taucad/chat-ui/components/chat-tool-label';
import { CodeBlockContent, Pre } from '@taucad/editor-ui/components/code/code-block';

/** Verb used when {@link parseToolErrorText} cannot parse the error payload. */
const unparseableErrorVerb = 'Attempted';

/** Longest reason the closed line carries; the opened card holds the whole message. */
const reasonLimit = 120;

/**
 * One bounded line of a failure's own words for the closed line.
 *
 * A row never opens itself, so "Attempted file read" alone would leave the
 * reader a click away from why. Structured text is left to the opened card.
 */
const reasonOf = (message: unknown): string | undefined => {
  if (typeof message !== 'string') {
    return undefined;
  }
  const line = message.replaceAll(/\s+/gu, ' ').trim();
  if (line === '' || line.startsWith('{') || line.startsWith('[')) {
    return undefined;
  }
  return line.length > reasonLimit ? `${line.slice(0, reasonLimit)}…` : line;
};

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
  readonly isOpen?: boolean;
  readonly onOpenChange?: (open: boolean) => void;
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
  ORPHANED_TOOL_CALL: OctagonAlert,
  // eslint-disable-next-line @typescript-eslint/naming-convention -- error code
  TOOL_NO_RESULTS: SearchX,
} as const;

type ToolErrorHeaderProps = {
  readonly icon: LucideIcon;
  readonly verb: string;
  readonly noun: string;
  /** Why it failed, when the verb does not already say. Shown while closed; the opened card holds it in full. */
  readonly reason?: string;
};

function ToolErrorHeader({ icon, verb, noun, reason }: ToolErrorHeaderProps): React.JSX.Element {
  return (
    <ChatToolCardHeader>
      <ChatToolCardIcon icon={icon} />
      <ChatToolCardTitle>
        <ChatToolLabel verb={verb}>
          <ChatToolDescription>
            {noun}
            {reason === undefined ? undefined : (
              <span className='group-data-[state=open]/chat-tool-trigger:hidden'> · {reason}</span>
            )}
          </ChatToolDescription>
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
 * `errorText`. Where the verb names no cause (a generic execution error, an
 * unrecognised code, plain text) the closed line also carries one bounded line
 * of the failure's own message.
 */
export function ChatToolError({
  errorText,
  icon,
  noun,
  className,
  isOpen,
  onOpenChange,
}: ChatToolErrorProps): React.JSX.Element {
  const error = parseToolErrorText(errorText);

  if (!error) {
    const envelope = parseToolErrorEnvelope(errorText);
    const code = envelope?.errorCode;
    return (
      <ChatToolCard
        variant='minimal'
        status='error'
        isDefaultOpen={false}
        className={className}
        isOpen={isOpen}
        onOpenChange={onOpenChange}
      >
        <ToolErrorHeader
          icon={icon}
          verb={code?.replaceAll('_', ' ').toLowerCase() ?? unparseableErrorVerb}
          noun={noun}
          reason={reasonOf(envelope === undefined ? errorText : envelope.message)}
        />
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

  return (
    <StructuredToolErrorBody
      error={error}
      noun={noun}
      className={className}
      isOpen={isOpen}
      onOpenChange={onOpenChange}
    />
  );
}

type StructuredToolErrorBodyProps = {
  readonly error: ToolExecutionError;
  readonly noun: string;
  readonly className?: string;
  readonly isOpen?: boolean;
  readonly onOpenChange?: (open: boolean) => void;
};

function StructuredToolErrorBody({
  error,
  noun,
  className,
  isOpen,
  onOpenChange,
}: StructuredToolErrorBodyProps): React.JSX.Element {
  const headerIcon = errorIcons[error.errorCode];
  const verb = getToolErrorTitle(error.errorCode);
  const description = error.message || getToolErrorDescription(error.errorCode);

  const hasValidationDetails =
    (error.errorCode === 'TOOL_INPUT_VALIDATION_FAILED' || error.errorCode === 'TOOL_OUTPUT_VALIDATION_FAILED') &&
    (error.validationErrors.length > 0 || error.rawOutput !== undefined);

  const isMuted = error.errorCode === 'USER_INTERRUPTED' || error.errorCode === 'TOOL_NO_RESULTS';
  const cardStatus = isMuted ? 'warning' : 'error';

  return (
    <ChatToolCard
      variant='minimal'
      status={cardStatus}
      isDefaultOpen={false}
      className={className}
      isOpen={isOpen}
      onOpenChange={onOpenChange}
    >
      <ToolErrorHeader
        icon={headerIcon}
        verb={verb}
        noun={noun}
        reason={error.errorCode === 'TOOL_EXECUTION_ERROR' ? reasonOf(error.message) : undefined}
      />
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
              <summary className='text-muted-foreground hover:text-foreground'>Raw Output</summary>
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
