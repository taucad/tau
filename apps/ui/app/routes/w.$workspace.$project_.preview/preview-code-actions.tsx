import { Download, Ellipsis, FileCode } from 'lucide-react';
import { Button } from '#components/ui/button.js';
import { Loader } from '#components/ui/loader.js';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '#components/ui/dropdown-menu.js';

type PreviewCodeActionsProps = {
  readonly isStaticProject: boolean;
  readonly isCloning: boolean;
  readonly onRemix: () => void;
  readonly onDownloadZip: () => void;
};

export function PreviewCodeActions({
  isStaticProject,
  isCloning,
  onRemix,
  onDownloadZip,
}: PreviewCodeActionsProps): React.JSX.Element {
  const remixLabel = isCloning ? 'Remixing...' : isStaticProject ? 'Remix' : 'Edit';

  return (
    <div className='flex items-center gap-2'>
      <Button variant='default' disabled={isCloning} onClick={onRemix}>
        {isCloning ? <Loader /> : <FileCode />}
        {remixLabel}
      </Button>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant='ghost' size='icon' aria-label='More code actions' data-testid='preview-code-actions-menu'>
            <Ellipsis className='size-4' />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align='end'>
          <DropdownMenuItem onClick={onDownloadZip}>
            <Download />
            Download ZIP
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}
