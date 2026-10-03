import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from 'react';
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

/**
 * Codex's rounded side-panel frame, 15×14 px: split down the middle, or
 * holding the tab count. An SVG stroke rather than a CSS border: Chrome snaps
 * border widths to whole device pixels and draws small border radii coarsely,
 * while a 1 px stroke on half-pixel coordinates stays crisp and smoothly
 * rounded at every density. The odd width puts the divider on a pixel
 * boundary; `mr-px` keeps the frame on whole pixels when the 28 px button
 * centres it.
 */
const WorkbenchFrame = ({ count }: { readonly count?: number }): React.JSX.Element => (
  <span aria-hidden className='relative mr-px flex items-center justify-center'>
    <svg width='15' height='14' viewBox='0 0 15 14' fill='none' stroke='currentColor' className='size-auto'>
      <rect x='0.5' y='0.5' width='14' height='13' rx='3.5' />
      {count === undefined ? <path d='M7.5 0.5v13' /> : null}
    </svg>
    {count === undefined ? null : (
      <span className='absolute inset-0 flex items-center justify-center text-[9px] leading-none font-medium tabular-nums'>
        {count > 9 ? '9+' : count}
      </span>
    )}
  </span>
);

/** Subscribe to tab identity, not pixel-only Dockview layout notifications. */
const usePanels = (api: DockviewApi | undefined): readonly IDockviewPanel[] => {
  const subscribe = useCallback(
    (onChange: () => void) => {
      if (!api) {
        return () => undefined;
      }
      const disposables = [
        api.onDidAddPanel(onChange),
        api.onDidRemovePanel(onChange),
        api.onDidActivePanelChange(onChange),
        api.onDidLayoutFromJSON(onChange),
        api.onDidLayoutChange(onChange),
      ];
      return () => {
        for (const disposable of disposables) {
          disposable.dispose();
        }
      };
    },
    [api],
  );
  const snapshot = useCallback(
    () =>
      JSON.stringify([
        api?.activePanel?.id,
        api?.panels.map((panel) => {
          const filePath: unknown = panel.params?.['filePath'];
          const entryPath: unknown = panel.params?.['entryPath'];
          return [panel.id, panel.api.title, filePath, entryPath];
        }),
      ]),
    [api],
  );
  useSyncExternalStore(subscribe, snapshot, snapshot);
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
        <WorkbenchFrame count={canList ? panels.length : undefined} />
      </PaneButton>
    </DockviewTabsComboBox>
  );
}
