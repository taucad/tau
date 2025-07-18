import { useSelector } from '@xstate/react';
import type { JSX } from 'react';
import type { KernelStackFrame } from '~/types/kernel.types.js';
import { HammerAnimation } from '~/components/hammer-animation.js';
import { cadActor } from '~/routes/builds_.$id/cad-actor.js';

function StackFrame({ frame, index }: { readonly frame: KernelStackFrame; readonly index: number }): JSX.Element {
  const fileName = frame.fileName ?? '<unknown>';

  return (
    <div className="flex min-w-0 items-center gap-2 font-mono text-xs">
      <span className="w-3 flex-shrink-0 text-right text-muted-foreground">{index + 1}</span>
      <span className="flex-shrink-0 text-muted-foreground">|</span>
      <span className="flex-shrink-0 text-foreground">{frame.functionName ?? 'main'}</span>
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
}): JSX.Element {
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

export function ChatViewerStatus(): JSX.Element {
  const error = useSelector(cadActor, (state) => state.context.kernelError);
  const state = useSelector(cadActor, (state) => state.value);
  return (
    <>
      {['buffering', 'rendering', 'booting', 'initializing'].includes(state) ? (
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 md:top-[90%] md:left-[50%] md:-translate-x-[50%] md:-translate-y-[90%]">
          <div className="border-neutral-200 m-auto flex items-center gap-2 rounded-md border bg-background/70 p-1 backdrop-blur-sm md:p-2">
            <span className="font-mono text-sm text-muted-foreground capitalize">{state}...</span>
            <HammerAnimation className="size-4 animate-spin text-primary ease-in-out md:size-6" />
          </div>
        </div>
      ) : null}
      <div className="absolute bottom-12 left-2 max-w-[60%]">
        {error ? (
          <ErrorStackTrace
            message={error.message}
            startLineNumber={error.startLineNumber}
            startColumn={error.startColumn}
            stackFrames={error.stackFrames}
          />
        ) : null}
      </div>
    </>
  );
}
