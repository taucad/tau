import { useSelector } from '@xstate/react';
import { useCallback } from 'react';
import { Sparkles } from 'lucide-react';
import type { KernelProvider, KernelStackFrame } from '@taucad/types';
import { languageFromKernel } from '@taucad/types/constants';
import { messageRole, messageStatus } from '@taucad/chat/constants';
import { Button } from '#components/ui/button.js';
import { useChatActions } from '#hooks/use-chat.js';
import { cookieName } from '#constants/cookie.constants.js';
import { useBuild } from '#hooks/use-build.js';
import { useCookie } from '#hooks/use-cookie.js';
import { cn } from '#utils/ui.utils.js';
import { createMessage } from '#utils/chat.utils.js';
import { decodeTextFile } from '#utils/filesystem.utils.js';
import { useModels } from '#hooks/use-models.js';
import { defaultChatModel } from '#constants/chat.constants.js';
import { useFileManager } from '#hooks/use-file-manager.js';

function StackFrame({ frame, index }: { readonly frame: KernelStackFrame; readonly index: number }): React.JSX.Element {
  const fileName = frame.fileName ?? '<unknown>';

  return (
    <div className="flex min-w-0 items-center gap-2 font-mono text-[0.625rem]">
      <span className="w-3 shrink-0 text-right text-muted-foreground">{index + 1}</span>
      <span className="shrink-0 text-muted-foreground">|</span>
      <span className="shrink-0 text-foreground">{frame.functionName ?? '<anonymous>'}</span>
      <div className="flex min-w-0">
        <span className="shrink-0 text-muted-foreground">(</span>
        <span className="min-w-0 truncate text-muted-foreground" dir="rtl" title={fileName}>
          {fileName}
        </span>
        {frame.lineNumber !== undefined && frame.columnNumber !== undefined ? (
          <span className="shrink-0 text-muted-foreground">
            :{frame.lineNumber}:{frame.columnNumber}
          </span>
        ) : null}
        <span className="shrink-0 text-muted-foreground">)</span>
      </div>
    </div>
  );
}

function ErrorStackTrace({
  message,
  startLineNumber,
  startColumn,
  stackFrames,
  onFixWithAi,
}: {
  readonly message: string;
  readonly startLineNumber?: number;
  readonly startColumn?: number;
  readonly stackFrames?: KernelStackFrame[];
  readonly onFixWithAi?: () => void;
}): React.JSX.Element {
  return (
    <div className="flex flex-col gap-2 rounded-md border border-destructive/20 bg-destructive/5 p-3 text-xs">
      {/* Error message */}
      <div className="flex items-center justify-between gap-2">
        <div className="font-medium text-destructive">
          {message}
          {startLineNumber ? (
            <span className="ml-1 font-normal text-muted-foreground">
              (Line {startLineNumber}:{startColumn})
            </span>
          ) : null}
        </div>
        {onFixWithAi ? (
          <Button
            size="sm"
            variant="outline"
            className="h-6 gap-1.5 border-destructive/30 bg-background/50 text-[0.6875rem] hover:border-destructive/50 hover:bg-background/80"
            onClick={onFixWithAi}
          >
            <Sparkles className="size-3" />
            Fix with AI
          </Button>
        ) : null}
      </div>

      {/* Stack trace */}
      {stackFrames && stackFrames.length > 0 ? (
        <div className="space-y-1">
          <div className="mb-1 font-medium text-muted-foreground">Stack trace:</div>
          <div className="space-y-0.5 rounded border bg-background/50 p-2">
            {stackFrames.map((frame, index) => (
              <StackFrame key={frame.functionName} frame={frame} index={index} />
            ))}
          </div>
        </div>
      ) : null}
    </div>
  );
}

export function ChatStackTrace({ className, ...props }: React.HTMLAttributes<HTMLDivElement>): React.ReactNode {
  const { getMainFilename, cadRef } = useBuild();
  const fileManager = useFileManager();
  const error = useSelector(cadRef, (state) => state.context.kernelError);
  const { sendMessage } = useChatActions();
  const { selectedModel } = useModels();
  const [, setIsChatOpen] = useCookie(cookieName.chatOpHistory, true);
  const [kernel] = useCookie<KernelProvider>(cookieName.cadKernel, 'openscad');

  const handleFixWithAi = useCallback(async () => {
    if (!error) {
      return;
    }

    // Get the current code and build context
    const mainFilePath = await getMainFilename();
    const fileContent = await fileManager.readFile(mainFilePath);

    const code = decodeTextFile(fileContent);

    // Get the code around the error line for context
    let codeContext = '';
    if (code && error.startLineNumber) {
      const lines = code.split('\n');
      const startLine = Math.max(0, error.startLineNumber - 3);
      const endLine = Math.min(lines.length, error.startLineNumber + 3);
      const contextLines = lines.slice(startLine, endLine);
      codeContext = contextLines
        .map((line, index) => {
          const lineNumber = startLine + index + 1;
          const marker = lineNumber === error.startLineNumber ? '> ' : '  ';
          return `${marker}${lineNumber} | ${line}`;
        })
        .join('\n');
    }

    // Build comprehensive error prompt following best practices
    // Include: error type, location, stack trace, code context, and specific request
    const stackTraceText = error.stackFrames
      ?.map(
        (frame, index) =>
          `  ${index + 1}. ${frame.functionName ?? '<anonymous>'} (${frame.fileName ?? '<unknown>'}:${frame.lineNumber}:${frame.columnNumber})`,
      )
      .join('\n');

    const errorPrompt = `I'm getting an error in my ${kernel} code and need help fixing it.

**Error Details:**
- **Message:** ${error.message}
- **Location:** Line ${error.startLineNumber}, Column ${error.startColumn}
- **File:** ${mainFilePath}

${stackTraceText ? `**Stack Trace:**\n${stackTraceText}\n` : ''}
${
  codeContext
    ? `**Code Context:**
\`\`\`
${codeContext}
\`\`\`
`
    : ''
}
${
  code
    ? `**Full Code:**
\`\`\`${languageFromKernel[kernel]}
${code}
\`\`\`
`
    : ''
}

Please analyze the error and fix the code. Focus on:
1. Identifying the root cause of the error
2. Providing a corrected version of the code
3. Explaining what was wrong and why the fix works

Please update the code to resolve this error.`;

    // Open the chat panel
    setIsChatOpen(true);

    // Append the error fixing message to the current chat
    const message = createMessage({
      content: errorPrompt,
      role: messageRole.user,
      metadata: {
        model: selectedModel?.id ?? defaultChatModel,
        status: messageStatus.pending,
        kernel,
      },
    });

    sendMessage(message);
  }, [error, getMainFilename, fileManager, kernel, setIsChatOpen, selectedModel?.id, sendMessage]);

  if (!error) {
    return null;
  }

  return (
    <div {...props} className={cn(className)}>
      <ErrorStackTrace
        message={error.message}
        startLineNumber={error.startLineNumber}
        startColumn={error.startColumn}
        stackFrames={error.stackFrames}
        onFixWithAi={handleFixWithAi}
      />
    </div>
  );
}
