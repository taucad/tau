import { useCallback } from 'react';
import { Link, useParams } from 'react-router';
import { Download, LayoutGrid, Link2 } from 'lucide-react';
import { TauWordmark } from '#components/icons/tau-wordmark.js';
import { Button } from '@taucad/ui/components/button';
import { Tooltip, TooltipContent, TooltipTrigger } from '@taucad/ui/components/tooltip';
import { ForkAction } from '#components/share/fork-action.js';
import type { ParsedPublication } from '#components/share/parsed-publication.js';
import { ProjectExportAction } from '#routes/w.$workspace.$project/project-export-action.js';
import { cn } from '@taucad/ui/utils/cn';
import { isDesktopTarget } from '#lib/build-target.js';
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

const builtinSlugPrefix = 'builtin~';

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
  /* A builtin example leads back to its card in the gallery; other shares have no gallery. */
  const { slug } = useParams();
  const builtinLocator = slug?.startsWith(builtinSlugPrefix) ? slug.slice(builtinSlugPrefix.length) : undefined;
  const isWarehousePart = builtinLocator?.startsWith('warehouse.') ?? false;
  const galleryLabel = isWarehousePart ? 'Parts' : 'Examples';
  const examplesHref = builtinLocator ? `${isWarehousePart ? '/parts' : '/community'}#${builtinLocator}` : undefined;

  return (
    <header
      data-slot='publication-topbar'
      className={cn(
        // Below sm the title takes its own row: with every action present the bar has no room left for it.
        'flex shrink-0 flex-wrap items-center justify-between gap-x-2 gap-y-1 border-b px-2 py-2 sm:h-12 sm:flex-nowrap sm:gap-4 sm:px-4 sm:py-0',
        // This bar is the top of a window that has no application shell, so it
        // overlaps the desktop drag band (see `Page`). Its controls subtract
        // themselves; the gaps between them stay draggable.
        isDesktopTarget() && '[&_:is(a,button,input)]:[app-region:no-drag]',
        className,
      )}
    >
      <div className='flex items-center gap-1 sm:gap-2'>
        <Tooltip>
          <TooltipTrigger asChild className='flex items-center gap-2 font-medium'>
            <Link to='/' aria-label='Go home'>
              <TauWordmark className='h-6 text-primary' />
            </Link>
          </TooltipTrigger>
          <TooltipContent side='right'>Go home</TooltipContent>
        </Tooltip>
        {examplesHref ? (
          <Button asChild size='sm' variant='ghost' className='max-md:size-8 max-md:px-0'>
            <Link to={examplesHref} aria-label={galleryLabel}>
              <LayoutGrid className='size-3.5 md:mr-1.5' aria-hidden />
              <span className='hidden md:inline'>{galleryLabel}</span>
            </Link>
          </Button>
        ) : null}
      </div>
      <div className='order-last w-full min-w-0 text-center sm:order-none sm:w-auto sm:flex-1'>
        <p className='truncate text-sm font-medium'>{publication.title}</p>
        <p className='hidden truncate text-xs text-muted-foreground sm:block'>
          {sourceLabel ?? (publication.visibility === 'private' ? 'Private Tau share' : 'Public Tau share')}
        </p>
      </div>
      {/* Every action here (Remix and Manage too) shows its label from md: below it the shared page's phone layout
          adds its Workbench trigger, and with every action present the labelled bar overflowed at 640-667 px. */}
      <div className='flex items-center gap-1 sm:gap-2'>
        {shareUrl ? (
          <Button
            type='button'
            size='sm'
            variant='ghost'
            aria-label='Copy link'
            className='max-md:size-8 max-md:px-0'
            onClick={() => {
              void copyShareUrl();
            }}
          >
            <Link2 className='size-3.5 md:mr-1.5' aria-hidden />
            <span className='hidden md:inline'>Copy link</span>
          </Button>
        ) : null}
        {managementActions}
        {archive ? (
          <Button
            type='button'
            size='sm'
            variant='ghost'
            aria-label='Download source'
            className='max-md:size-8 max-md:px-0'
            onClick={downloadArchive}
          >
            <Download className='size-3.5 md:mr-1.5' aria-hidden />
            <span className='hidden md:inline'>Download source</span>
          </Button>
        ) : null}
        <ProjectExportAction
          className='h-8 px-2.5 text-xs max-md:size-8 max-md:px-0'
          labelClassName='hidden md:inline'
        />
        <ForkAction publication={publication} files={files} parameters={parameters} />
      </div>
    </header>
  );
}
