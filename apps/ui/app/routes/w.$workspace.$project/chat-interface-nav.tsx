import {
  Activity,
  Bot,
  Box,
  BriefcaseBusiness,
  Code2,
  Download,
  FolderOpen,
  Globe,
  History,
  Info,
  ListTree,
  MessageCircleIcon,
  MoreHorizontal,
  Plus,
  Printer,
  Rotate3d,
  Share2,
  SlidersHorizontal,
  SquareTerminal,
  Terminal,
  X,
} from 'lucide-react';
import { useRef, useState } from 'react';
import type { DockviewApi } from 'dockview-react';
import { useDockviewPanels } from '#components/panes/dockview-tab-overflow-picker.js';
import {
  Drawer,
  DrawerAction,
  DrawerBar,
  DrawerClose,
  DrawerContent,
  DrawerTitle,
  DrawerDescription,
  DrawerDivider,
  drawerBarTitleClass,
} from '@taucad/ui/components/drawer';
import { Button } from '@taucad/ui/components/button';
import { DropdownMenu, DropdownMenuTrigger, DropdownMenuContent } from '@taucad/ui/components/dropdown-menu';
import { FileSelector } from '#components/files/file-selector.js';
import { ViewerTabContextMenu } from '#components/panes/viewer-tab-context-menu.js';
import type { ViewerFileActions } from '#routes/w.$workspace.$project/chat-viewer-dockview.js';
import { MobileWorkbenchNavigation } from '#components/mobile-workbench-navigation.js';
import type { MobileWorkbenchDestinationCue } from '#components/mobile-workbench-navigation.js';
import type { MobilePanelId } from '#constants/editor.constants.js';
import { useFeature } from '#flags/use-feature.js';
import { paneTitle } from '#workbench-records/pane-titles.js';
import { isSurfaceShipped } from '#workbench-records/surface-availability.js';

/** Every mobile surface, by its workbench title, so label, sheet name and accessible name agree (I6). */
export const chatTabs = [
  { id: 'chat', label: 'Chat', icon: <MessageCircleIcon /> },
  { id: 'files', label: 'Files', icon: <FolderOpen /> },
  { id: 'parameters', label: paneTitle('parameters'), icon: <SlidersHorizontal /> },
  // The stage: the 3D model itself. The Workbench `model` pane is the Model tree (EQ5).
  { id: 'viewer', label: 'Model', icon: <Box /> },
  { id: 'editor', label: 'Editor', icon: <Code2 /> },
  { id: 'model-tree', label: paneTitle('model'), icon: <ListTree /> },
  { id: 'kinematics', label: paneTitle('kinematics'), icon: <Rotate3d /> },
  { id: 'print', label: paneTitle('print'), icon: <Printer /> },
  { id: 'browser', label: paneTitle('browser'), icon: <Globe /> },
  { id: 'revisions', label: paneTitle('revisions'), icon: <History /> },
  { id: 'agents', label: paneTitle('agents'), icon: <Bot /> },
  { id: 'jobs', label: paneTitle('jobs'), icon: <BriefcaseBusiness /> },
  { id: 'details', label: paneTitle('details'), icon: <Info /> },
  { id: 'converter', label: paneTitle('export'), icon: <Download /> },
  { id: 'share', label: paneTitle('share'), icon: <Share2 /> },
  { id: 'kernel', label: paneTitle('kernel'), icon: <Activity /> },
  { id: 'console', label: paneTitle('console'), icon: <Terminal /> },
  { id: 'terminal', label: paneTitle('terminal'), icon: <SquareTerminal /> },
] as const satisfies Array<{
  id: MobilePanelId;
  label: string;
  icon: React.ReactNode;
}>;

type SurfaceGroup = {
  readonly label: 'Design' | 'Activity' | 'Project' | 'Diagnostics';
  readonly surfaces: readonly MobilePanelId[];
};

/**
 * The surfaces All lists, grouped as the desktop Workbench launcher groups them: everything the primary destinations
 * (Chat, Parameters, Model) do not already reach (D9).
 */
export const secondarySurfaceGroups: readonly SurfaceGroup[] = [
  { label: 'Design', surfaces: ['model-tree', 'kinematics', 'print'] },
  { label: 'Activity', surfaces: ['browser', 'revisions', 'agents', 'jobs'] },
  { label: 'Project', surfaces: ['files', 'editor', 'converter', 'share', 'details'] },
  { label: 'Diagnostics', surfaces: ['kernel', 'console', 'terminal'] },
];

/** Every surface All can list, whatever the flags. */
export const secondarySurfaces: readonly MobilePanelId[] = secondarySurfaceGroups.flatMap(({ surfaces }) => surfaces);

/**
 * The All groups this person can open, gated as the desktop launcher gates them: Browser in the desktop app only, Jobs
 * nowhere, Print behind Machines, Telemetry and Console behind debug mode.
 *
 * @returns The visible groups, without empty ones.
 */
export function useVisibleSurfaceGroups(): readonly SurfaceGroup[] {
  const isMachinesEnabled = useFeature('machines');
  const isTauDebugEnabled = useFeature('tauDebug');
  return secondarySurfaceGroups.flatMap((group) => {
    const surfaces = group.surfaces.filter(
      (id) =>
        isSurfaceShipped(id) &&
        (id !== 'print' || isMachinesEnabled) &&
        ((id !== 'kernel' && id !== 'console') || isTauDebugEnabled),
    );
    return surfaces.length === 0 ? [] : [{ ...group, surfaces }];
  });
}

/** A mobile surface's title. */
export function surfaceTitle(id: MobilePanelId): string {
  return chatTabs.find((tab) => tab.id === id)?.label ?? id;
}

const surfaceById = new Map<MobilePanelId, (typeof chatTabs)[number]>(chatTabs.map((tab) => [tab.id, tab]));

export function ChatInterfaceNav({
  className,
  activeTab,
  onTabChange,
  chatCue,
  viewerApi,
  viewerNames,
  fileActions,
}: {
  readonly className?: string;
  readonly activeTab: MobilePanelId;
  readonly onTabChange: (id: MobilePanelId) => void;
  /** A decision or failure waiting in the chat, shown on Chat while another surface has the sheet (I5). */
  readonly chatCue?: MobileWorkbenchDestinationCue;
  /** Existing viewer panels, including distinct saved views of the same file. */
  readonly viewerApi?: DockviewApi;
  readonly viewerNames?: ReadonlyMap<string, string>;
  /** Creates a fresh viewer, including another view of an already-open file. */
  readonly fileActions?: ViewerFileActions;
}): React.ReactNode {
  const [isAllOpen, setAllOpen] = useState(false);
  const views = useDockviewPanels(viewerApi);
  // Choosing a surface hands focus to that surface; All must not take it back as it closes.
  const hasChosenSurface = useRef(false);
  const hasChosenView = useRef(false);
  const sheetRef = useRef<HTMLDivElement>(null);
  // All has no dialog trigger, so Radix has nowhere to return focus; it goes back to what opened All.
  const opener = useRef<HTMLElement | undefined>(undefined);
  const groups = useVisibleSurfaceGroups();
  const active =
    activeTab === 'viewer' ? 'model' : activeTab === 'chat' || activeTab === 'parameters' ? activeTab : 'all';
  return (
    <>
      <MobileWorkbenchNavigation
        className={className}
        active={isAllOpen ? 'all' : active}
        cues={chatCue && activeTab !== 'chat' ? { chat: chatCue } : undefined}
        onSelect={(id) => {
          if (id === 'all') {
            hasChosenSurface.current = false;
            hasChosenView.current = false;
            opener.current = document.activeElement instanceof HTMLElement ? document.activeElement : undefined;
            setAllOpen(true);
          } else {
            onTabChange(id === 'model' ? 'viewer' : id);
          }
        }}
      />
      <Drawer open={isAllOpen} onOpenChange={setAllOpen}>
        <DrawerContent
          ref={sheetRef}
          className='outline-none'
          onOpenAutoFocus={(event) => {
            // Vaul leaves focus on the opener, outside the modal the page is hidden behind; the sheet takes it (T6).
            event.preventDefault();
            sheetRef.current?.focus({ preventScroll: true });
          }}
          onCloseAutoFocus={(event) => {
            event.preventDefault();
            if (hasChosenView.current) {
              document.querySelector<HTMLElement>('nav[aria-label="Workbench"] [aria-current="page"]')?.focus();
            } else if (!hasChosenSurface.current && opener.current?.isConnected) {
              opener.current.focus({ preventScroll: true });
            }
          }}
        >
          <DrawerBar>
            <DrawerTitle className={drawerBarTitleClass}>All surfaces</DrawerTitle>
            <DrawerClose asChild>
              <DrawerAction aria-label='Close'>
                <X aria-hidden className='size-4' />
              </DrawerAction>
            </DrawerClose>
          </DrawerBar>
          <DrawerDivider />
          <DrawerDescription className='sr-only'>Choose a workbench surface</DrawerDescription>
          <div
            className='min-h-0 overflow-y-auto pb-3'
            onFocusCapture={(event) => {
              const focused = event.target;
              // Radix wraps focus with preventScroll. Keep the focused action inside this scrollport,
              // but do not scroll All for events bubbling from a portaled picker or menu.
              if (!(focused instanceof HTMLElement) || !event.currentTarget.contains(focused)) {
                return;
              }
              if (focused.dataset['openViewFile'] === undefined) {
                focused.scrollIntoView({ block: 'nearest' });
              } else {
                // The first action belongs with the Views heading above it.
                event.currentTarget.scrollTop = 0;
              }
            }}
          >
            {viewerApi ? (
              <section aria-labelledby='all-views-title'>
                <h3 id='all-views-title' className='px-4 pt-3 pb-1 text-xs font-medium text-muted-foreground'>
                  Views
                </h3>
                <div className='grid grid-cols-1 gap-2 px-4'>
                  <FileSelector
                    dataSource={fileActions?.dataSource}
                    selectedFile={undefined}
                    title='Open File'
                    description='Choose a file to open in a new view'
                    searchPlaceholder='Search files…'
                    isDisabled={!fileActions}
                    onSelect={(path) => {
                      fileActions?.openFile(path);
                      hasChosenSurface.current = true;
                      hasChosenView.current = true;
                      onTabChange('viewer');
                      setAllOpen(false);
                    }}
                  >
                    <Button
                      data-open-view-file
                      variant='outline'
                      size='touch'
                      className='justify-start'
                      disabled={!fileActions}
                    >
                      <Plus aria-hidden />
                      Open file
                    </Button>
                  </FileSelector>
                  {views.map((panel) => {
                    const title = `${viewerNames?.get(panel.id) ? `${viewerNames.get(panel.id)} · ` : ''}${panel.api.title ?? 'Untitled view'}`;
                    return (
                      <div key={panel.id} data-view-id={panel.id} className='flex min-w-0 gap-1'>
                        <Button
                          variant={panel.id === viewerApi.activePanel?.id ? 'secondary' : 'outline'}
                          size='touch'
                          aria-current={panel.id === viewerApi.activePanel?.id ? 'page' : undefined}
                          className='min-w-0 flex-1 justify-start'
                          onClick={() => {
                            hasChosenSurface.current = true;
                            hasChosenView.current = true;
                            panel.api.setActive();
                            onTabChange('viewer');
                            setAllOpen(false);
                          }}
                        >
                          <Box aria-hidden />
                          <span className='truncate'>{title}</span>
                        </Button>
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button variant='outline' size='icon-touch' aria-label={`More actions for ${title}`}>
                              <MoreHorizontal aria-hidden />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent
                            onCloseAutoFocus={(event) => {
                              if (hasChosenSurface.current) {
                                event.preventDefault();
                              } else if (!viewerApi.getPanel(panel.id)) {
                                event.preventDefault();
                                sheetRef.current?.querySelector<HTMLElement>('[data-open-view-file]')?.focus();
                              }
                            }}
                          >
                            <ViewerTabContextMenu
                              api={panel.api}
                              params={panel.params}
                              variant='dropdown'
                              onNavigate={(surface) => {
                                hasChosenSurface.current = true;
                                onTabChange(surface);
                                setAllOpen(false);
                              }}
                            />
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </div>
                    );
                  })}
                </div>
              </section>
            ) : null}
            {groups.map((group) => (
              <section key={group.label} aria-labelledby={`all-surfaces-${group.label}`}>
                <h3
                  id={`all-surfaces-${group.label}`}
                  className='px-4 pt-3 pb-1 text-xs font-medium text-muted-foreground'
                >
                  {group.label}
                </h3>
                {/* Two columns at 320px, so the longest title keeps its whole word beside its icon. */}
                <div className='grid grid-cols-[repeat(auto-fill,minmax(8rem,1fr))] gap-2 px-4'>
                  {group.surfaces.map((id) => {
                    const tab = surfaceById.get(id)!;
                    return (
                      <Button
                        key={id}
                        variant={id === activeTab ? 'secondary' : 'outline'}
                        size='touch'
                        aria-current={id === activeTab ? 'page' : undefined}
                        className='min-w-0 justify-start'
                        onClick={() => {
                          hasChosenSurface.current = true;
                          onTabChange(id);
                          setAllOpen(false);
                        }}
                      >
                        {tab.icon}
                        <span className='truncate'>{tab.label}</span>
                      </Button>
                    );
                  })}
                </div>
              </section>
            ))}
          </div>
        </DrawerContent>
      </Drawer>
    </>
  );
}
