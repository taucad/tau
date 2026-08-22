import { TriangleAlert } from 'lucide-react';
import { Button } from '#components/ui/button.js';

type ChatEditorTooLargeWarningProps = {
  readonly size: number;
  readonly limit: number;
  readonly onOpenAnyway: () => void;
};

const formatBytes = (bytes: number): string => {
  if (bytes >= 1024 * 1024) {
    const mb = bytes / (1024 * 1024);
    return `${mb.toFixed(mb >= 10 ? 0 : 1)} MB`;
  }
  if (bytes >= 1024) {
    return `${Math.round(bytes / 1024)} KB`;
  }
  return `${bytes} B`;
};

export function ChatEditorTooLargeWarning({
  size,
  limit,
  onOpenAnyway,
}: ChatEditorTooLargeWarningProps): React.JSX.Element {
  return (
    <div className='flex h-full items-center justify-center bg-background p-4'>
      <div className='flex flex-col items-center gap-4 text-center'>
        <TriangleAlert className='size-10 stroke-1 text-warning' />
        <div className='flex flex-col items-center gap-4'>
          <p className='text-sm'>
            The file is {formatBytes(size)} which exceeds the {formatBytes(limit)} editor limit. Opening very large
            files in the editor can cause your browser tab to become unresponsive.
          </p>
          <Button variant='outline' onClick={onOpenAnyway}>
            Open Anyway
          </Button>
        </div>
      </div>
    </div>
  );
}
