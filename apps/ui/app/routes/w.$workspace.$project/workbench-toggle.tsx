import { useEffect, useReducer, useRef, useState } from 'react';
import type { DockviewApi, IDockviewPanel } from 'dockview-react';
import { Check } from 'lucide-react';
import { DockviewTabIcon } from '#components/panes/dockview-tab.js';
import type { DockviewTabIconRenderer } from '#components/panes/dockview-tab.js';
import { PaneButton } from '#components/ui/pane-button.js';
import { Popover, PopoverContent, PopoverTrigger } from '@taucad/ui/components/popover';
import { Command, CommandEmpty, CommandInput, CommandItem, CommandList } from '@taucad/ui/components/command';
import { menuContentVariants, menuLabelVariants } from '@taucad/ui/components/menu.variants';

type WorkbenchToggleProperties = {
  readonly isOpen: boolean;
  readonly onOpenChange: (open: boolean) => void;
  /** The workbench Dockview, mounted while the lane is hidden; its panels feed the count and list. */
  readonly api?: DockviewApi;
  readonly getIcon?: DockviewTabIconRenderer;
};

const getPanelPath = (panel: IDockviewPanel): string | undefined => {
  const path: unknown = panel.params?.['filePath'] ?? panel.params?.['entryPath'];
  return typeof path === 'string' ? path : undefined;
};

const getPanelTitle = (panel: IDockviewPanel): string => panel.api.title ?? panel.id;

// 16×14 px rounded frame in the 28 px button; the border matches a 14 px Lucide stroke.
const glyphFrame = 'relative flex h-3.5 w-4 items-center justify-center rounded-[4px] border-[1.25px] border-current';

/** Re-render whenever the workbench's panels, titles or active panel change. */
const usePanels = (api: DockviewApi | undefined): readonly IDockviewPanel[] => {
  const [, refresh] = useReducer((version: number) => version + 1, 0);

  useEffect(() => {
    if (!api) {
      return;
    }
    const disposables = [
      api.onDidAddPanel(refresh),
      api.onDidRemovePanel(refresh),
      api.onDidActivePanelChange(refresh),
      api.onDidLayoutFromJSON(refresh),
      api.onDidLayoutChange(refresh),
    ];
    refresh();
    return () => {
      for (const disposable of disposables) {
        disposable.dispose();
      }
    };
  }, [api]);

  return api?.panels ?? [];
};

/**
 * The workspace's top-right Workbench control, after Codex's side-panel button.
 * Clicking toggles the lane. While the lane is closed the button shows how many
 * workbench tabs are open, and hovering it (or Down Arrow) lists them; picking
 * one opens the lane on that tab. While open it shows a split frame and only
 * toggles: the tabs are on screen.
 */
export function WorkbenchToggle({ isOpen, onOpenChange, api, getIcon }: WorkbenchToggleProperties): React.JSX.Element {
  const panels = usePanels(api);
  const activePanel = api?.activePanel;
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const isHoverOpen = useRef(false);
  // After a click or Escape the menu stays shut until the pointer leaves and returns.
  const isSuppressed = useRef(false);
  const closeTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const canList = !isOpen && panels.length > 0;

  const cancelClose = (): void => {
    clearTimeout(closeTimer.current);
  };

  const scheduleClose = (): void => {
    cancelClose();
    isSuppressed.current = false;
    if (isHoverOpen.current) {
      // Milliseconds: lets the pointer cross the gap between the button and the menu.
      closeTimer.current = setTimeout(() => {
        setIsMenuOpen(false);
      }, 150);
    }
  };

  const closeMenu = (): void => {
    cancelClose();
    isSuppressed.current = true;
    setIsMenuOpen(false);
  };

  useEffect(() => cancelClose, []);

  const titleCounts = new Map<string, number>();
  for (const panel of panels) {
    titleCounts.set(getPanelTitle(panel), (titleCounts.get(getPanelTitle(panel)) ?? 0) + 1);
  }

  return (
    <Popover
      modal={false}
      open={isMenuOpen && canList}
      onOpenChange={(next) => {
        if (next) {
          setIsMenuOpen(true);
        } else {
          closeMenu();
        }
      }}
    >
      <PopoverTrigger asChild>
        <PaneButton
          className='aria-pressed:text-foreground'
          aria-label='Toggle Workbench lane'
          aria-pressed={isOpen}
          aria-description={canList ? `${panels.length} open tabs. Press Down Arrow to list them.` : undefined}
          tooltip={isOpen ? 'Close workbench' : 'Open workbench'}
          tooltipSide='left'
          onPointerEnter={(event) => {
            if (event.pointerType === 'touch' || isSuppressed.current || !canList) {
              return;
            }
            cancelClose();
            isHoverOpen.current = true;
            setIsMenuOpen(true);
          }}
          onPointerLeave={scheduleClose}
          onClick={(event) => {
            // The click belongs to the lane, not the menu.
            event.preventDefault();
            closeMenu();
            onOpenChange(!isOpen);
          }}
          onKeyDown={(event) => {
            if (event.key === 'ArrowDown' && canList) {
              event.preventDefault();
              isHoverOpen.current = false;
              cancelClose();
              setIsMenuOpen(true);
            }
          }}
        >
          {canList ? (
            <span aria-hidden className={`${glyphFrame} text-[9px] leading-none font-medium tabular-nums`}>
              {panels.length > 9 ? '9+' : panels.length}
            </span>
          ) : (
            <span aria-hidden className={glyphFrame}>
              <span className='h-full border-l-[1.25px] border-current' />
            </span>
          )}
        </PaneButton>
      </PopoverTrigger>
      <PopoverContent
        aria-label='Workbench tabs'
        align='end'
        side='bottom'
        collisionPadding={8}
        // Content height, capped at the space below the toolbar; rows scroll past that.
        className={menuContentVariants({
          className: 'max-h-(--radix-popover-content-available-height) w-80 max-w-[calc(100vw-1rem)]',
        })}
        onPointerDown={() => {
          isHoverOpen.current = false;
          cancelClose();
        }}
        onPointerEnter={cancelClose}
        onPointerLeave={scheduleClose}
        onOpenAutoFocus={(event) => {
          if (isHoverOpen.current) {
            event.preventDefault();
          }
        }}
        onCloseAutoFocus={(event) => {
          if (isHoverOpen.current) {
            event.preventDefault();
          }
        }}
      >
        <Command label='Workbench tabs' defaultValue={activePanel?.id} className='min-h-0 bg-transparent'>
          <div className={menuLabelVariants({ className: 'flex shrink-0 items-center justify-between font-normal' })}>
            <span>Open tabs</span>
            <span className='tabular-nums'>{panels.length}</span>
          </div>
          <CommandInput aria-label='Search open tabs' placeholder='Search open tabs…' />
          <CommandList label='Open tabs' className='max-h-none min-h-0 flex-1 overscroll-contain'>
            <CommandEmpty className='border-none'>No open tabs found.</CommandEmpty>
            {panels.map((panel) => {
              const title = getPanelTitle(panel);
              const path = getPanelPath(panel);
              const folder = (titleCounts.get(title) ?? 0) > 1 ? path?.split('/').slice(0, -1).join('/') : undefined;
              return (
                <CommandItem
                  key={panel.id}
                  value={panel.id}
                  keywords={[title, path ?? '']}
                  title={path ?? title}
                  aria-description={path}
                  aria-current={activePanel?.id === panel.id ? 'page' : undefined}
                  className='min-h-7 shrink-0 aria-current:bg-menu-highlight'
                  onSelect={() => {
                    onOpenChange(true);
                    panel.api.setActive();
                    closeMenu();
                  }}
                >
                  <span className='flex min-w-0 flex-1 items-center gap-2'>
                    <DockviewTabIcon title={title} icon={getIcon?.(panel)} />
                    <span className='min-w-0 flex-1 truncate'>{title}</span>
                    {folder ? <span className='max-w-1/2 truncate text-xs text-muted-foreground'>{folder}</span> : null}
                    {activePanel?.id === panel.id ? (
                      <Check aria-label='Active tab' className='size-3.5 shrink-0' />
                    ) : null}
                  </span>
                </CommandItem>
              );
            })}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
