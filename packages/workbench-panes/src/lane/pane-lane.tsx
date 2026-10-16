import { Fragment, useCallback, useEffect, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { PanelRightClose, Plus, X } from 'lucide-react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@taucad/ui/components/dropdown-menu';
import { KeyShortcut } from '@taucad/ui/components/key-shortcut';
import { useKeybinding } from '@taucad/ui/components/keyboard';
import { cn } from '@taucad/ui/utils/cn';
import { formatKeyCombination } from '@taucad/ui/utils/keys';
import { PaneButton } from '#components/pane-button.jsx';
import { dockviewStyleOverrides, tauDockviewTheme } from '#paneview/dockview-theme.js';
import { workbenchPanes } from '#registry/pane-registry.js';
import type { WorkbenchPaneDefinition, WorkbenchPaneId } from '#registry/pane-registry.js';

/** The lane's width bounds and default, in CSS pixels. */
const laneWidth = { minimum: 260, initial: 340, maximum: 640 } as const;

/** Keyboard resize step, in CSS pixels. */
const resizeStep = 16;

/**
 * Props for {@link PaneLane}.
 *
 * @public
 */
export type PaneLaneProps = Readonly<{
  /** The panes the host can draw, in the registry's order; others are not offered. */
  panes: readonly WorkbenchPaneId[];
  /** The tabs the lane opens with; the first is active. */
  initialOpen: readonly WorkbenchPaneId[];
  /** Draws one pane's body. */
  renderPane: (pane: WorkbenchPaneId) => ReactNode;
  /** Hides the lane; the lane offers the action only when given one. */
  onHide?: () => void;
  /** Opens `pane` and makes it the active tab each time `requestId` changes (a part menu's "Show kinematics"). */
  openRequest?: Readonly<{ pane: WorkbenchPaneId; requestId: number }>;
  className?: string;
}>;

/** One pane shortcut, registered while the lane is mounted. */
function PaneShortcut({
  definition,
  onOpen,
}: Readonly<{
  definition: WorkbenchPaneDefinition & { shortcut: NonNullable<WorkbenchPaneDefinition['shortcut']> };
  onOpen: (pane: WorkbenchPaneId) => void;
}>): undefined {
  useKeybinding(definition.shortcut, (event) => {
    event.preventDefault();
    onOpen(definition.id);
  });
  return undefined;
}

const groupLabels = { design: 'Design', project: 'Project' } as const;

/**
 * The workbench lane outside the Tau app: a tab per open pane, the same `+` menu of panes (grouped, with their
 * shortcuts) the app's workbench offers, and a resizable edge. One pane shows at a time.
 *
 * @param props - The offered panes, the opening tabs and how to draw a pane.
 * @returns The lane.
 * @public
 */
export function PaneLane({
  panes,
  initialOpen,
  renderPane,
  onHide,
  openRequest,
  className,
}: PaneLaneProps): React.JSX.Element {
  const [open, setOpen] = useState<readonly WorkbenchPaneId[]>(() =>
    initialOpen.filter((pane) => panes.includes(pane)),
  );
  const [active, setActive] = useState<WorkbenchPaneId | undefined>(() => open[0]);
  const [width, setWidth] = useState<number>(laneWidth.initial);
  const drag = useRef<{ startX: number; startWidth: number } | undefined>(undefined);

  const openPane = useCallback((pane: WorkbenchPaneId) => {
    setOpen((current) => (current.includes(pane) ? current : [...current, pane]));
    setActive(pane);
  }, []);
  useEffect(() => {
    if (openRequest !== undefined && panes.includes(openRequest.pane)) {
      openPane(openRequest.pane);
    }
  }, [openRequest, openPane, panes]);
  const closePane = useCallback(
    (pane: WorkbenchPaneId) => {
      const remaining = open.filter((candidate) => candidate !== pane);
      setOpen(remaining);
      if (active === pane) {
        const index = open.indexOf(pane);
        setActive(remaining[Math.min(index, remaining.length - 1)]);
      }
    },
    [active, open],
  );

  const definitions = panes.map((pane) => workbenchPanes[pane]);
  const groups = (['design', 'project'] as const)
    .map((group) => ({ group, items: definitions.filter((definition) => definition.group === group) }))
    .filter(({ items }) => items.length > 0);

  const clampWidth = (next: number): number => Math.min(laneWidth.maximum, Math.max(laneWidth.minimum, next));

  return (
    <aside
      aria-label='Workbench'
      data-slot='pane-lane'
      /* The app dock's theme, so the panes' paneviews draw as they do in the workbench. */
      className={cn(
        'pane-resize relative flex h-full shrink-0 flex-col border-l bg-background',
        tauDockviewTheme.className,
        dockviewStyleOverrides,
        className,
      )}
      style={{ width }}
    >
      <div
        role='separator'
        aria-orientation='vertical'
        aria-label='Resize workbench'
        aria-valuemin={laneWidth.minimum}
        aria-valuemax={laneWidth.maximum}
        aria-valuenow={width}
        tabIndex={0}
        className='absolute inset-y-0 -left-1 z-10 w-2 cursor-col-resize touch-none'
        onPointerDown={(event) => {
          event.currentTarget.setPointerCapture(event.pointerId);
          drag.current = { startX: event.clientX, startWidth: width };
        }}
        onPointerMove={(event) => {
          if (drag.current !== undefined) {
            setWidth(clampWidth(drag.current.startWidth + drag.current.startX - event.clientX));
          }
        }}
        onPointerUp={() => {
          drag.current = undefined;
        }}
        onKeyDown={(event) => {
          if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') {
            event.preventDefault();
            setWidth((current) => clampWidth(current + (event.key === 'ArrowLeft' ? resizeStep : -resizeStep)));
          }
        }}
      />
      {definitions.map((definition) =>
        definition.shortcut === undefined ? null : (
          <PaneShortcut
            key={definition.id}
            definition={{ ...definition, shortcut: definition.shortcut }}
            onOpen={openPane}
          />
        ),
      )}
      <div className='flex h-9 shrink-0 items-center gap-1 px-1'>
        <div role='tablist' aria-label='Open panes' className='flex min-w-0 items-center gap-0.5 overflow-x-auto'>
          {open.map((pane) => {
            const { icon: Icon, title } = workbenchPanes[pane];
            const isActive = pane === active;
            return (
              <div
                key={pane}
                className={cn(
                  'group/tab flex h-7 shrink-0 items-center gap-1.5 rounded-sm pr-1 pl-2 text-[13px]',
                  isActive ? 'bg-accent text-foreground' : 'text-muted-foreground hover:text-foreground',
                )}
              >
                <button
                  type='button'
                  role='tab'
                  aria-selected={isActive}
                  aria-keyshortcuts='Delete'
                  className='flex items-center gap-1.5'
                  onClick={() => {
                    setActive(pane);
                  }}
                  onKeyDown={(event) => {
                    if (event.key === 'Delete' || event.key === 'Backspace') {
                      event.preventDefault();
                      closePane(pane);
                    }
                  }}
                >
                  <Icon aria-hidden className='size-3.5 shrink-0' />
                  <span>{title}</span>
                </button>
                <button
                  type='button'
                  tabIndex={-1}
                  aria-label={`Close ${title}`}
                  className={cn(
                    'flex size-4 items-center justify-center rounded-xs opacity-0 group-hover/tab:opacity-100 hover:bg-background/60',
                    isActive && 'opacity-100',
                  )}
                  onClick={() => {
                    closePane(pane);
                  }}
                >
                  <X aria-hidden className='size-3' />
                </button>
              </div>
            );
          })}
        </div>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <PaneButton aria-label='Open workbench tab' tooltip='Open pane'>
              <Plus className='size-3.5' />
            </PaneButton>
          </DropdownMenuTrigger>
          <DropdownMenuContent align='start' side='bottom' sideOffset={4} className='w-64'>
            {groups.map(({ group, items }, index) => (
              <Fragment key={group}>
                {index === 0 ? null : <DropdownMenuSeparator />}
                <DropdownMenuGroup aria-label={groupLabels[group]}>
                  {items.map(({ id, icon: Icon, title, shortcut }) => (
                    <DropdownMenuItem
                      key={id}
                      onSelect={() => {
                        openPane(id);
                      }}
                    >
                      <Icon aria-hidden />
                      <span>{title}</span>
                      {shortcut === undefined ? null : (
                        <KeyShortcut className='ml-auto'>{formatKeyCombination(shortcut)}</KeyShortcut>
                      )}
                    </DropdownMenuItem>
                  ))}
                </DropdownMenuGroup>
              </Fragment>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
        {onHide === undefined ? null : (
          <PaneButton aria-label='Hide workbench' tooltip='Hide workbench' className='ml-auto' onClick={onHide}>
            <PanelRightClose className='size-3.5' />
          </PaneButton>
        )}
      </div>
      <div className='min-h-0 flex-1 overflow-hidden'>
        {open.map((pane) => (
          /* Hidden panes stay mounted, as dockview keeps them, so a pane keeps its scroll and drafts. */
          <div
            key={pane}
            role='tabpanel'
            aria-label={workbenchPanes[pane].title}
            hidden={pane !== active}
            className='size-full'
          >
            {renderPane(pane)}
          </div>
        ))}
        {open.length === 0 ? (
          <p className='p-4 text-center text-sm text-muted-foreground'>Open a pane with the + menu.</p>
        ) : null}
      </div>
    </aside>
  );
}
