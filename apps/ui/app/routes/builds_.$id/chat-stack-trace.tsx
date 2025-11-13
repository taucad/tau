import { useSelector } from '@xstate/react';
import type { KernelStackFrame } from '@taucad/types';
import { useBuild } from '#hooks/use-build.js';
import { cn } from '#utils/ui.utils.js';

function StackFrame({ frame, index }: { readonly frame: KernelStackFrame; readonly index: number }): React.JSX.Element {
  const fileName = frame.fileName ?? '<unknown>';

  return (
    <div className="flex min-w-0 items-center gap-2 font-mono text-[0.625rem]">
      <span className="w-3 flex-shrink-0 text-right text-muted-foreground">{index + 1}</span>
      <span className="flex-shrink-0 text-muted-foreground">|</span>
      <span className="flex-shrink-0 text-foreground">{frame.functionName ?? '<anonymous>'}</span>
      <div className="flex min-w-0">
        <span className="flex-shrink-0 text-muted-foreground">(</span>
        <span className="min-w-0 truncate text-muted-foreground" dir="rtl" title={fileName}>
          {fileName}
        </span>
        {frame.lineNumber !== undefined && frame.columnNumber !== undefined ? (
          <span className="flex-shrink-0 text-muted-foreground">
            :{frame.lineNumber}:{frame.columnNumber}
          </span>
        ) : null}
        <span className="flex-shrink-0 text-muted-foreground">)</span>
      </div>
    </div>
  );
}

function ErrorStackTrace({
  message,
  startLineNumber,
  startColumn,
  stackFrames,
}: {
  readonly message: string;
  readonly startLineNumber?: number;
  readonly startColumn?: number;
  readonly stackFrames?: KernelStackFrame[];
}): React.JSX.Element {
  return (
    <div className="flex flex-col gap-2 rounded-md border border-destructive/20 bg-destructive/5 p-3 text-xs">
      {/* Error message */}
      <div className="font-medium text-destructive">
        {message}
        {startLineNumber ? (
          <span className="ml-1 font-normal text-muted-foreground">
            (Line {startLineNumber}:{startColumn})
          </span>
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
  const { cadRef: cadActor } = useBuild();
  const error = useSelector(cadActor, (state) => state.context.kernelError);

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
      />
    </div>
  );
}
