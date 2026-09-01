import { useCallback } from 'react';
import { Link } from 'react-router';
import { Download, Link2 } from 'lucide-react';
import { TauWordmark } from '#components/icons/tau-wordmark.js';
import { Button } from '@taucad/ui/components/button';
import { Tooltip, TooltipContent, TooltipTrigger } from '@taucad/ui/components/tooltip';
import { ForkAction } from '#components/share/fork-action.js';
import type { ParsedPublication } from '#components/share/parsed-publication.js';
import { ProjectExportAction } from '#routes/w.$workspace.$project/project-export-action.js';
import { cn } from '@taucad/ui/utils/cn';
import { toast } from '#components/ui/sonner.js';

type PublicationTopbarProps = {
  readonly publication: ParsedPublication;
  readonly files: Map<string, { filename: string; content: Uint8Array<ArrayBuffer> }>;
  readonly className?: string;
  readonly archive?: Uint8Array<ArrayBuffer>;
  readonly shareUrl?: string;
  readonly parameters: Record<string, unknown>;
  readonly sourceLabel?: string;
  readonly managementActions?: React.ReactNode;
};

/** Slim top bar for the canonical shared-project workbench. */
export function PublicationTopbar({
  publication,
  files,
  className,
  archive,
  shareUrl,
  parameters,
  sourceLabel,
  managementActions,
}: PublicationTopbarProps): React.JSX.Element {
  const downloadArchive = useCallback(() => {
    if (!archive) {
      return;
    }
    const url = URL.createObjectURL(new Blob([archive], { type: 'application/zip' }));
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = `${publication.title.replaceAll(/[^A-Za-z0-9._-]+/gu, '-') || 'tau-project'}.zip`;
    anchor.click();
    URL.revokeObjectURL(url);
  }, [archive, publication.title]);
  const copyShareUrl = useCallback(async () => {
    if (!shareUrl) {
      return;
    }
    try {
      await navigator.clipboard.writeText(shareUrl);
      toast.success('Link copied');
    } catch {
      toast.error('Could not copy link');
    }
  }, [shareUrl]);

  return (
    <header
      data-slot='publication-topbar'
      className={cn('flex h-12 shrink-0 items-center justify-between gap-2 border-b px-2 sm:gap-4 sm:px-4', className)}
    >
      <Tooltip>
        <TooltipTrigger asChild className='flex items-center gap-2 font-medium'>
          <Link to='/' aria-label='Go home'>
            <TauWordmark className='h-6 text-primary' />
          </Link>
        </TooltipTrigger>
        <TooltipContent side='right'>Go home</TooltipContent>
      </Tooltip>
      <div className='hidden min-w-0 flex-1 text-center sm:block'>
        <p className='truncate text-sm font-medium'>{publication.title}</p>
        <p className='truncate text-[11px] text-muted-foreground'>
          {sourceLabel ?? (publication.visibility === 'private' ? 'Private Tau share' : 'Public Tau share')}
        </p>
      </div>
      <div className='flex items-center gap-1 sm:gap-2'>
        {shareUrl ? (
          <Button
            type='button'
            size='sm'
            variant='ghost'
            aria-label='Copy link'
            className='max-sm:size-8 max-sm:px-0'
            onClick={() => void copyShareUrl()}
          >
            <Link2 className='size-3.5 sm:mr-1.5' aria-hidden />
            <span className='hidden sm:inline'>Copy link</span>
          </Button>
        ) : null}
        {managementActions}
        {archive ? (
          <Button
            type='button'
            size='sm'
            variant='ghost'
            aria-label='Download source'
            className='max-sm:size-8 max-sm:px-0'
            onClick={downloadArchive}
          >
            <Download className='size-3.5 sm:mr-1.5' aria-hidden />
            <span className='hidden sm:inline'>Download source</span>
          </Button>
        ) : null}
        <ProjectExportAction
          className='h-8 px-2.5 text-xs max-sm:size-8 max-sm:px-0'
          labelClassName='hidden sm:inline'
        />
        <ForkAction publication={publication} files={files} parameters={parameters} />
      </div>
    </header>
  );
}
