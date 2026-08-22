import { TriangleAlert } from 'lucide-react';

type ChatEditorErrorPlaceholderProps = {
  readonly cause: unknown;
};

const formatCause = (cause: unknown): string => {
  if (cause instanceof Error) {
    return cause.message;
  }
  if (typeof cause === 'string') {
    return cause;
  }
  return 'An unknown error occurred while loading this file.';
};

export function ChatEditorErrorPlaceholder({ cause }: ChatEditorErrorPlaceholderProps): React.JSX.Element {
  return (
    <div className='flex h-full items-center justify-center bg-background p-4'>
      <div className='flex max-w-md flex-col items-center gap-4 text-center'>
        <TriangleAlert className='size-10 stroke-1 text-destructive' />
        <p className='text-sm font-medium'>Failed to load file</p>
        <p className='text-xs text-muted-foreground'>{formatCause(cause)}</p>
      </div>
    </div>
  );
}
