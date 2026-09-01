import { Download, Ellipsis, FileCode } from 'lucide-react';
import { Button } from '@taucad/ui/components/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@taucad/ui/components/dropdown-menu';

type PreviewCodeActionsProps = {
  readonly onEdit: () => void;
  readonly onDownloadZip: () => void;
};

export function PreviewCodeActions({ onEdit, onDownloadZip }: PreviewCodeActionsProps): React.JSX.Element {
  return (
    <div className='flex items-center gap-2'>
      <Button variant='default' onClick={onEdit}>
        <FileCode />
        Edit
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
