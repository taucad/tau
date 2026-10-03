import { useEffect, useReducer, useRef, useState } from 'react';
import type { DockviewApi, IDockviewPanel } from 'dockview-react';
import { DockviewTabsComboBox } from '#components/panes/dockview-tab-overflow-picker.js';
import type { DockviewTabIconRenderer } from '#components/panes/dockview-tab.js';
import { PaneButton } from '#components/ui/pane-button.js';

type WorkbenchToggleProperties = {
  readonly isOpen: boolean;
  readonly onOpenChange: (open: boolean) => void;
  /** The workbench Dockview, mounted while the lane is hidden; its panels feed the count and list. */
  readonly api?: DockviewApi;
  readonly getIcon?: DockviewTabIconRenderer;
};

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

  return (
    <DockviewTabsComboBox
      panels={panels}
      activePanel={api?.activePanel}
      getIcon={getIcon}
      description='Search and open a workbench tab.'
      isOpen={isMenuOpen && canList}
      popoverProperties={{
        onPointerDown() {
          isHoverOpen.current = false;
          cancelClose();
        },
        onPointerEnter: cancelClose,
        onPointerLeave: scheduleClose,
        onOpenAutoFocus(event) {
          // A hover peek leaves focus where it was; Down Arrow moves it into the search field.
          if (isHoverOpen.current) {
            event.preventDefault();
          }
        },
        onCloseAutoFocus(event) {
          if (isHoverOpen.current) {
            event.preventDefault();
          }
        },
      }}
      onOpenChange={(next) => {
        if (next) {
          setIsMenuOpen(true);
        } else {
          closeMenu();
        }
      }}
      onPick={() => {
        onOpenChange(true);
      }}
    >
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
    </DockviewTabsComboBox>
  );
}
