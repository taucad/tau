import { useCallback, useEffect, useRef, useState } from 'react';
import type { IDockviewPanelHeaderProps } from 'dockview-react';
import { Box, X } from 'lucide-react';
import { FileExtensionIcon } from '#components/icons/file-extension-icon.js';
import { Tooltip, TooltipContent, TooltipTrigger } from '#components/ui/tooltip.js';

export type DockviewTabProps = IDockviewPanelHeaderProps & {
  /**
   * Viewer tabs use the same cube glyph as {@link ViewerLink} / chat viewer
   * affordances; editor tabs keep extension-based icons.
   */
  readonly leadingIcon?: 'extension' | 'viewer';
  /** Concrete icon for utility tabs. Editor and viewer defaults remain unchanged. */
  readonly icon?: React.ReactNode;
};

type DockviewTabParameters = {
  readonly entryPath?: unknown;
  readonly filePath?: unknown;
};

const resolveFullTitle = (properties: DockviewTabProps, title: string): string => {
  const parameters = properties.params as DockviewTabParameters | undefined;

  if (typeof parameters?.filePath === 'string' && parameters.filePath.length > 0) {
    return parameters.filePath;
  }

  if (typeof parameters?.entryPath === 'string' && parameters.entryPath.length > 0) {
    return parameters.entryPath;
  }

  return title;
};

/**
 * Custom Dockview tab component that adds a leading icon before the title.
 *
 * Reuses the dv-default-tab / dv-default-tab-content / dv-default-tab-action
 * class names so all built-in + theme CSS applies unchanged.
 */
export function DockviewTab(properties: DockviewTabProps): React.JSX.Element {
  const { api, icon, leadingIcon = 'extension' } = properties;
  const [title, setTitle] = useState(api.title ?? '');
  const rootRef = useRef<HTMLDivElement>(null);
  const fullTitle = resolveFullTitle(properties, title);

  // Keep title in sync when the panel updates it
  useEffect(() => {
    const disposable = api.onDidTitleChange((event) => {
      setTitle(event.title);
    });

    return () => {
      disposable.dispose();
    };
  }, [api]);

  // Dockview owns the actual keyboard-focus target outside this React root.
  useEffect(() => {
    const tab = rootRef.current?.closest<HTMLElement>('.dv-tab');
    if (!tab) {
      return;
    }

    tab.setAttribute('aria-label', fullTitle);

    return () => {
      if (tab.getAttribute('aria-label') === fullTitle) {
        tab.removeAttribute('aria-label');
      }
    };
  }, [fullTitle]);

  const handleClose = useCallback(
    (event: React.MouseEvent) => {
      event.stopPropagation();
      api.close();
    },
    [api],
  );

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <div
          ref={rootRef}
          className='dv-default-tab group/default-tab relative size-full min-w-0 overflow-hidden py-1 pr-1 pl-2'
        >
          <span className='dv-default-tab-content mr-0! flex min-w-0 flex-1 items-center gap-1.5 overflow-hidden'>
            {icon ??
              (leadingIcon === 'viewer' ? (
                <Box aria-hidden className='relative -bottom-px size-3 shrink-0' />
              ) : (
                <FileExtensionIcon filename={title} className='size-3 shrink-0' />
              ))}
            <span className='dockview-tab-title min-w-0 flex-1 overflow-hidden scroll-shadow-right whitespace-nowrap [--scroll-fade-size:24px] group-hover/default-tab:[--scroll-fade-size:42px]'>
              {title}
            </span>
          </span>
          <button
            type='button'
            aria-label={`Close ${fullTitle}`}
            className="dv-default-tab-action absolute right-1 z-10 size-4.5! rounded-[5px]! bg-transparent p-0! opacity-0 group-hover/default-tab:opacity-100 before:pointer-events-none before:absolute before:inset-y-0 before:right-full before:w-6 before:bg-linear-to-r before:from-transparent before:to-accent before:content-[''] hover:bg-input!"
            onClick={handleClose}
            onPointerDown={(event) => {
              event.stopPropagation();
            }}
          >
            <X aria-hidden className='size-3.5' />
          </button>
        </div>
      </TooltipTrigger>
      <TooltipContent className='max-w-[min(42rem,calc(100vw-1rem))] text-left break-all'>{fullTitle}</TooltipContent>
    </Tooltip>
  );
}
