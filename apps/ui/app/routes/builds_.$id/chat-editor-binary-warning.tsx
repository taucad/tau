import { TriangleAlert } from 'lucide-react';
import { Button } from '#components/ui/button.js';

type ChatEditorBinaryWarningProps = {
  readonly onForceOpen: () => void;
};

export function ChatEditorBinaryWarning({ onForceOpen }: ChatEditorBinaryWarningProps): React.JSX.Element {
  return (
    <div className="flex h-full items-center justify-center bg-background p-4">
      <div className="flex flex-col items-center gap-4 text-center">
        <TriangleAlert className="size-10 stroke-1 text-warning" />
        <div className="flex flex-col items-center gap-4">
          <p className="text-sm">
            The file is not displayed in the text editor because it is either binary or uses an unsupported text
            encoding.
          </p>
          <Button variant="outline" onClick={onForceOpen}>
            Open Anyway
          </Button>
        </div>
      </div>
    </div>
  );
}
