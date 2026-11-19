import { useCallback, useRef, useState } from 'react';
import { Link, useParams } from 'react-router';
import { Download, LayoutGrid, Link2 } from 'lucide-react';
import { TauWordmark } from '@taucad/ui-kit/icons/tau-wordmark';
import { Button } from '@taucad/ui/components/button';
import { Tooltip, TooltipContent, TooltipTrigger } from '@taucad/ui/components/tooltip';
import { ForkAction } from '#components/share/fork-action.js';
import type { ParsedPublication } from '@taucad/publish-ui/components/share/parsed-publication';
import { ProjectExportAction } from '#routes/w.$workspace.$project/project-export-action.js';
import { cn } from '@taucad/ui/utils/cn';
import { isDesktopTarget } from '#lib/build-target.js';
import { toast } from '@taucad/ui/components/sonner';
import { Input } from '@taucad/ui/components/input';
import { Popover, PopoverAnchor, PopoverContent } from '@taucad/ui/components/popover';
import { copyText } from '@taucad/ui/utils/clipboard';

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
  const desktopTarget = isDesktopTarget();
  // Native window controls consume the space that web action labels use below lg.
  const actionButtonClassName = desktopTarget ? 'max-lg:size-8 max-lg:px-0' : 'max-md:size-8 max-md:px-0';
  const actionLabelClassName = desktopTarget ? 'hidden lg:inline' : 'hidden md:inline';
  const actionIconClassName = cn('size-3.5', desktopTarget ? 'lg:mr-1.5' : 'md:mr-1.5');
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
  /* Where the clipboard refused the link, it is shown selected under the button for the person to copy. */
  const [isCopyRefused, setIsCopyRefused] = useState(false);
  const refusedLinkRef = useRef<HTMLInputElement>(null);
  /* The popover has no trigger, so a keyboard close hands focus back to Copy link itself. */
  const copyLinkRef = useRef<HTMLButtonElement>(null);
  const closedByKeyboardRef = useRef(false);
  /* The write starts inside the press, before any await, so a browser that needs the gesture still allows it. */
  const copyShareUrl = async (): Promise<void> => {
    if (!shareUrl) {
      return;
    }
    const { isCopied } = await copyText(shareUrl);
    if (isCopied) {
      setIsCopyRefused(false);
      toast.success('Link copied');
    } else {
      setIsCopyRefused(true);
    }
  };
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
        desktopTarget &&
          'pl-(--desktop-titlebar-inset) sm:pl-(--desktop-titlebar-inset) [&_:is(a,button,input)]:[app-region:no-drag]',
        className,
      )}
    >
      <div className='flex shrink-0 items-center gap-1 sm:gap-2'>
        <Tooltip>
          <TooltipTrigger asChild className='flex items-center gap-2 font-medium'>
            <Link to='/' aria-label='Go home' className={cn(desktopTarget && 'h-7')}>
              <TauWordmark className={cn('h-6 text-primary', desktopTarget && 'h-5')} />
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
      <div className='order-last flex w-full min-w-0 items-center justify-center gap-2 text-center sm:order-none sm:w-auto sm:flex-1'>
        <p className='truncate text-sm font-medium'>{publication.title}</p>
        <p className='hidden max-w-1/2 shrink-0 truncate text-xs text-muted-foreground sm:block'>
          {sourceLabel ??
            (publication.visibility === 'private'
              ? 'Cloud link · Invited people only'
              : 'Cloud link · Anyone with the link')}
        </p>
      </div>
      {/* At phone widths the workbench trigger shares this row; desktop also reserves native window controls. */}
      <div className='flex shrink-0 items-center gap-1 sm:gap-2'>
        {shareUrl ? (
          <Popover open={isCopyRefused} onOpenChange={setIsCopyRefused}>
            <PopoverAnchor asChild>
              <Button
                ref={copyLinkRef}
                type='button'
                size='sm'
                variant='ghost'
                aria-label='Copy link'
                className={actionButtonClassName}
                onClick={() => {
                  void copyShareUrl();
                }}
              >
                <Link2 className={actionIconClassName} aria-hidden />
                <span className={actionLabelClassName}>Copy link</span>
              </Button>
            </PopoverAnchor>
            <PopoverContent
              align='end'
              className='flex w-80 max-w-[calc(100vw-2rem)] flex-col gap-2'
              onOpenAutoFocus={(event) => {
                event.preventDefault();
                refusedLinkRef.current?.focus();
                refusedLinkRef.current?.select();
              }}
              onEscapeKeyDown={() => {
                closedByKeyboardRef.current = true;
              }}
              onCloseAutoFocus={(event) => {
                event.preventDefault();
                if (closedByKeyboardRef.current) {
                  closedByKeyboardRef.current = false;
                  copyLinkRef.current?.focus();
                }
              }}
            >
              <Input
                ref={refusedLinkRef}
                aria-label='Share link'
                readOnly
                value={shareUrl}
                onFocus={(event) => {
                  event.target.select();
                }}
              />
              <p className='text-xs text-muted-foreground'>Select the link and copy it.</p>
            </PopoverContent>
          </Popover>
        ) : null}
        {managementActions}
        {archive ? (
          <Button
            type='button'
            size='sm'
            variant='ghost'
            aria-label='Download source'
            className={actionButtonClassName}
            onClick={downloadArchive}
          >
            <Download className={actionIconClassName} aria-hidden />
            <span className={actionLabelClassName}>Download source</span>
          </Button>
        ) : null}
        <ProjectExportAction
          className={cn('h-8 px-2.5 text-xs', actionButtonClassName)}
          labelClassName={actionLabelClassName}
        />
        <ForkAction publication={publication} files={files} parameters={parameters} />
      </div>
    </header>
  );
}
