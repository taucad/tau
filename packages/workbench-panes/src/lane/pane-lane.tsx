import { Fragment, useCallback, useEffect, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { Plus, X } from 'lucide-react';
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
  /** Opens `pane` and makes it the active tab each time `requestId` changes (a part menu's "Show kinematics"). */
  openRequest?: Readonly<{ pane: WorkbenchPaneId; requestId: number }>;
  /**
   * Drawn at the end of the lane's header, after the `+` menu. A host whose own header sits beside the lane puts its
   * workbench toggle here, so the tabs share the page's one top row and the toggle ends it, top right.
   */
  headerEnd?: ReactNode;
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
 * shortcuts) the app's workbench offers, and a resizable edge. One pane shows at a time. Its header is one 36 px row,
 * as tall as a page header, so a host draws its own header beside the lane and the two make one top row, as the app's
 * dock groups share theirs: the host's header ends with its actions, the lane's with `headerEnd`. Showing and hiding
 * the lane is the host's: a `WorkbenchToggleButton` (`components/workbench-toggle`) in `headerEnd` while the lane is
 * open, and at the end of the host's header while it is closed.
 *
 * @param props - The offered panes, the opening tabs and how to draw a pane.
 * @returns The lane.
 * @public
 */
export function PaneLane({
  panes,
  initialOpen,
  renderPane,
  openRequest,
  headerEnd,
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
      <div className='flex h-9 shrink-0 items-center gap-1 border-b px-1'>
        <div
          role='tablist'
          aria-label='Open panes'
          className='flex min-w-0 flex-1 items-center gap-0.5 overflow-x-auto'
        >
          {open.map((pane) => {
            const { icon: Icon, title } = workbenchPanes[pane];
            const isActive = pane === active;
            return (
              /* As the app's dock tabs do, tabs share the header equally up to 144 px and their titles dissolve at
               * the end, under the close glyph when it shows. A tab stops at 48 px, where its centre still clears the
               * glyph; past that the tablist scrolls, never under the header's buttons. */
              <div
                key={pane}
                className={cn(
                  'group/tab fade-row flex h-7 w-36 min-w-12 shrink items-center rounded-sm text-[13px]',
                  isActive
                    ? 'bg-accent text-foreground'
                    : 'text-muted-foreground [--fade-scrim-into:var(--background)] hover:text-foreground',
                )}
              >
                <button
                  type='button'
                  role='tab'
                  title={title}
                  aria-selected={isActive}
                  aria-keyshortcuts='Delete'
                  className='flex size-full min-w-0 items-center gap-1.5 pr-1 pl-2'
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
                  <span
                    className={cn(
                      'fade-label flex-1 text-left',
                      isActive && '[--fade-label-size:var(--fade-label-size-actions)]',
                    )}
                  >
                    {title}
                  </span>
                </button>
                <button
                  type='button'
                  tabIndex={-1}
                  aria-label={`Close ${title}`}
                  className={cn(
                    'fade-action absolute right-1 flex size-4 items-center justify-center rounded-xs opacity-0 group-focus-within/tab:opacity-100 group-hover/tab:opacity-100 hover:bg-background/60',
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
        {headerEnd}
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
