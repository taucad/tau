import { useEffect, useRef, useState } from 'react';
import type { IDockviewHeaderActionsProps, IDockviewPanel } from 'dockview-react';
import { Check, Square } from 'lucide-react';
import { DockviewTabIcon } from '#components/panes/dockview-tab.js';
import type { DockviewTabIconRenderer, DockviewTabProps } from '#components/panes/dockview-tab.js';
import { PaneButton } from '#components/ui/pane-button.js';
import { Popover, PopoverContent, PopoverTrigger } from '@taucad/ui/components/popover';
import { Command, CommandEmpty, CommandInput, CommandItem, CommandList } from '@taucad/ui/components/command';
import { menuContentVariants, menuLabelVariants } from '@taucad/ui/components/menu.variants';

export type DockviewTabOverflowPickerProperties = IDockviewHeaderActionsProps & {
  readonly getIcon?: DockviewTabIconRenderer;
  readonly leadingIcon?: DockviewTabProps['leadingIcon'];
};

const getPanelPath = (panel: IDockviewPanel): string | undefined => {
  const parameters = panel.params;
  if (typeof parameters?.['filePath'] === 'string') {
    return parameters['filePath'];
  }
  if (typeof parameters?.['entryPath'] === 'string') {
    return parameters['entryPath'];
  }
  return undefined;
};

const getPanelTitle = (panel: IDockviewPanel): string => panel.api.title ?? panel.id;

const renderPanelLabel = (
  panel: IDockviewPanel,
  activePanel: IDockviewPanel | undefined,
  iconOptions: Pick<DockviewTabOverflowPickerProperties, 'getIcon' | 'leadingIcon'>,
): React.JSX.Element => {
  const title = getPanelTitle(panel);
  const path = getPanelPath(panel);

  return (
    <span className='flex min-w-0 flex-1 items-center gap-2'>
      <DockviewTabIcon title={title} leadingIcon={iconOptions.leadingIcon} icon={iconOptions.getIcon?.(panel)} />
      <span className='flex min-w-0 flex-1 flex-col'>
        <span className='truncate'>{title}</span>
        {path && path !== title ? <span className='truncate text-xs text-muted-foreground'>{path}</span> : null}
      </span>
      {activePanel?.id === panel.id ? <Check aria-label='Active tab' className='size-3.5 shrink-0' /> : null}
    </span>
  );
};

export function DockviewTabOverflowPicker(
  properties: DockviewTabOverflowPickerProperties,
): React.JSX.Element | undefined {
  const { activePanel, getIcon, leadingIcon, panels } = properties;
  const [isOpen, setIsOpen] = useState(false);
  const isHoverOpen = useRef(false);
  const closeTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  const cancelClose = (): void => {
    clearTimeout(closeTimer.current);
    closeTimer.current = undefined;
  };

  const scheduleClose = (): void => {
    cancelClose();
    if (isHoverOpen.current) {
      // Milliseconds: allow the pointer to cross the gap between the button and portal.
      closeTimer.current = setTimeout(() => {
        setIsOpen(false);
      }, 150);
    }
  };

  useEffect(
    () => () => {
      clearTimeout(closeTimer.current);
    },
    [],
  );

  if (panels.length === 0) {
    return undefined;
  }

  return (
    <Popover
      modal={false}
      open={isOpen}
      onOpenChange={(nextOpen) => {
        cancelClose();
        setIsOpen(nextOpen);
      }}
    >
      <PopoverTrigger asChild>
        <PaneButton
          aria-label='Open tabs'
          aria-description={`${panels.length} open tabs in this pane`}
          className='relative'
          onPointerEnter={(event) => {
            if (event.pointerType === 'touch') {
              return;
            }
            cancelClose();
            if (!isOpen) {
              isHoverOpen.current = true;
              setIsOpen(true);
            }
          }}
          onPointerLeave={scheduleClose}
          onClick={(event) => {
            if (isOpen && isHoverOpen.current && event.button === 0) {
              // A click after hover keeps the already-visible menu open.
              event.preventDefault();
            }
            isHoverOpen.current = false;
            cancelClose();
          }}
          onKeyDown={() => {
            isHoverOpen.current = false;
            cancelClose();
          }}
        >
          <Square aria-hidden className='size-5' />
          <span aria-hidden className='absolute text-xs leading-none tabular-nums'>
            {panels.length > 9 ? '9+' : panels.length}
          </span>
        </PaneButton>
      </PopoverTrigger>
      <PopoverContent
        aria-label='Open tabs'
        align='end'
        side='bottom'
        collisionPadding={8}
        className={menuContentVariants({
          className: 'h-(--radix-popover-content-available-height) w-80 max-w-[calc(100vw-1rem)] overflow-hidden',
        })}
        onPointerDown={() => {
          isHoverOpen.current = false;
          cancelClose();
        }}
        onKeyDown={() => {
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
        <Command label='Open tabs' defaultValue={activePanel?.id} className='bg-transparent'>
          <div className={menuLabelVariants({ className: 'flex shrink-0 items-center justify-between font-normal' })}>
            <span>Open tabs</span>
            <span className='tabular-nums'>{panels.length}</span>
          </div>
          <CommandInput aria-label='Search open tabs' placeholder='Search open tabs…' />
          <CommandList label='Open tabs' className='max-h-none min-h-0 flex-1 overscroll-contain'>
            <CommandEmpty className='border-none'>No open tabs found.</CommandEmpty>
            {panels.map((panel) => (
              <CommandItem
                key={panel.id}
                value={panel.id}
                keywords={[getPanelTitle(panel), getPanelPath(panel) ?? '']}
                title={getPanelPath(panel) ?? getPanelTitle(panel)}
                aria-current={activePanel?.id === panel.id ? 'page' : undefined}
                className='min-h-9 shrink-0 py-2 aria-current:bg-menu-highlight'
                onSelect={() => {
                  panel.api.setActive();
                  cancelClose();
                  setIsOpen(false);
                }}
              >
                {renderPanelLabel(panel, activePanel, { getIcon, leadingIcon })}
              </CommandItem>
            ))}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
