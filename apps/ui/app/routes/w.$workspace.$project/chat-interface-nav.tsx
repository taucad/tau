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
  Printer,
  Rotate3d,
  Share2,
  SlidersHorizontal,
  Terminal,
} from 'lucide-react';
import { useRef, useState } from 'react';
import { Drawer, DrawerContent, DrawerTitle, DrawerDescription } from '@taucad/ui/components/drawer';
import { Button } from '@taucad/ui/components/button';
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
  { label: 'Diagnostics', surfaces: ['kernel', 'console'] },
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
}: {
  readonly className?: string;
  readonly activeTab: MobilePanelId;
  readonly onTabChange: (id: MobilePanelId) => void;
  /** A decision or failure waiting in the chat, shown on Chat while another surface has the sheet (I5). */
  readonly chatCue?: MobileWorkbenchDestinationCue;
}): React.ReactNode {
  const [isAllOpen, setAllOpen] = useState(false);
  // Choosing a surface hands focus to that surface; All must not take it back as it closes.
  const hasChosenSurface = useRef(false);
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
            setAllOpen(true);
          } else {
            onTabChange(id === 'model' ? 'viewer' : id);
          }
        }}
      />
      <Drawer open={isAllOpen} onOpenChange={setAllOpen}>
        <DrawerContent
          onCloseAutoFocus={(event) => {
            if (hasChosenSurface.current) {
              event.preventDefault();
            }
          }}
        >
          <DrawerTitle className='px-3'>All surfaces</DrawerTitle>
          <DrawerDescription className='sr-only'>Choose a workbench surface</DrawerDescription>
          <div className='min-h-0 overflow-y-auto pb-3'>
            {groups.map((group) => (
              <section key={group.label} aria-labelledby={`all-surfaces-${group.label}`}>
                <h3
                  id={`all-surfaces-${group.label}`}
                  className='px-3 pt-3 pb-1 text-xs font-medium text-muted-foreground'
                >
                  {group.label}
                </h3>
                {/* Two columns at 320px, so the longest title keeps its whole word beside its icon. */}
                <div className='grid grid-cols-[repeat(auto-fill,minmax(8rem,1fr))] gap-2 px-3'>
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
