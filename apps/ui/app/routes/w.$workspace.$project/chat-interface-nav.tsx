import { Box, Code2, Info, MessageCircleIcon, SlidersHorizontal, Download, Files, History, Share2 } from 'lucide-react';
import { useState } from 'react';
import { Drawer, DrawerContent, DrawerTitle, DrawerDescription } from '@taucad/ui/components/drawer';
import { Button } from '@taucad/ui/components/button';
import { MobileWorkbenchNavigation } from '#components/mobile-workbench-navigation.js';
import type { MobilePanelId } from '#constants/editor.constants.js';
import { paneTitle } from '#workbench-records/pane-titles.js';

/** Every mobile surface, by its workbench title, so label, sheet name and accessible name agree. */
export const chatTabs = [
  { id: 'chat', label: 'Chat', icon: <MessageCircleIcon /> },
  { id: 'files', label: 'Files', icon: <Files /> },
  { id: 'parameters', label: paneTitle('parameters'), icon: <SlidersHorizontal /> },
  { id: 'viewer', label: paneTitle('model'), icon: <Box /> },
  { id: 'editor', label: 'Editor', icon: <Code2 /> },
  { id: 'details', label: paneTitle('details'), icon: <Info /> },
  { id: 'converter', label: paneTitle('export'), icon: <Download /> },
  { id: 'share', label: paneTitle('share'), icon: <Share2 /> },
  { id: 'revisions', label: paneTitle('revisions'), icon: <History /> },
] as const satisfies Array<{
  id: MobilePanelId;
  label: string;
  icon: React.ReactNode;
}>;

/** The surfaces All lists: everything the primary destinations (Chat, Parameters, Model) do not already reach. */
export const secondarySurfaces: readonly MobilePanelId[] = [
  'files',
  'editor',
  'details',
  'converter',
  'share',
  'revisions',
];

/** A mobile surface's title. */
export function surfaceTitle(id: MobilePanelId): string {
  return chatTabs.find((tab) => tab.id === id)?.label ?? id;
}

export function ChatInterfaceNav({
  className,
  activeTab,
  onTabChange,
}: {
  readonly className?: string;
  readonly activeTab: MobilePanelId;
  readonly onTabChange: (id: MobilePanelId) => void;
}): React.ReactNode {
  const [isAllOpen, setAllOpen] = useState(false);
  const active =
    activeTab === 'viewer' ? 'model' : activeTab === 'chat' || activeTab === 'parameters' ? activeTab : 'all';
  return (
    <>
      <MobileWorkbenchNavigation
        className={className}
        active={isAllOpen ? 'all' : active}
        onSelect={(id) => {
          if (id === 'all') {
            setAllOpen(true);
          } else {
            onTabChange(id === 'model' ? 'viewer' : id);
          }
        }}
      />
      <Drawer open={isAllOpen} onOpenChange={setAllOpen}>
        <DrawerContent>
          <DrawerTitle className='px-3'>All surfaces</DrawerTitle>
          <DrawerDescription className='sr-only'>Choose a workbench surface</DrawerDescription>
          {/* Two columns at 320px, so the longest title keeps its whole word beside its icon. */}
          <div className='grid grid-cols-[repeat(auto-fill,minmax(8rem,1fr))] gap-2 p-3'>
            {chatTabs
              .filter((tab) => secondarySurfaces.includes(tab.id))
              .map((tab) => (
                <Button
                  key={tab.id}
                  variant={tab.id === activeTab ? 'secondary' : 'outline'}
                  size='touch'
                  aria-current={tab.id === activeTab ? 'page' : undefined}
                  className='min-w-0 justify-start'
                  onClick={() => {
                    onTabChange(tab.id);
                    setAllOpen(false);
                  }}
                >
                  {tab.icon}
                  <span className='truncate'>{tab.label}</span>
                </Button>
              ))}
          </div>
        </DrawerContent>
      </Drawer>
    </>
  );
}
