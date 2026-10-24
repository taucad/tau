import { Box, Code2, Info, MessageCircleIcon, SlidersHorizontal, Download, Files, History, Share2 } from 'lucide-react';
import { useState } from 'react';
import { Drawer, DrawerContent, DrawerTitle, DrawerDescription } from '@taucad/ui/components/drawer';
import { Button } from '@taucad/ui/components/button';
import { MobileWorkbenchNavigation } from '#components/mobile-workbench-navigation.js';
import type { MobilePanelId } from '#constants/editor.constants.js';

export const chatTabs = [
  {
    id: 'chat',
    label: 'Chat',
    icon: <MessageCircleIcon />,
  },
  {
    id: 'files',
    label: 'Files',
    icon: <Files />,
  },
  {
    id: 'parameters',
    label: 'Params',
    icon: <SlidersHorizontal />,
  },
  {
    id: 'viewer',
    label: 'Model',
    icon: <Box />,
  },
  {
    id: 'editor',
    label: 'Editor',
    icon: <Code2 />,
  },
  {
    id: 'details',
    label: 'Details',
    icon: <Info />,
  },
  {
    id: 'converter',
    label: 'Export',
    icon: <Download />,
  },
  {
    id: 'share',
    label: 'Share',
    icon: <Share2 />,
  },
  {
    id: 'revisions',
    label: 'History',
    icon: <History />,
  },
] as const satisfies Array<{
  id: MobilePanelId;
  label: string;
  icon: React.ReactNode;
}>;

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
          <DrawerTitle className='px-3'>Open a surface</DrawerTitle>
          <DrawerDescription className='sr-only'>Choose a workbench surface</DrawerDescription>
          <div className='grid grid-cols-3 gap-2 p-3'>
            {chatTabs.map((tab) => (
              <Button
                key={tab.id}
                variant='outline'
                size='touch'
                onClick={() => {
                  onTabChange(tab.id);
                  setAllOpen(false);
                }}
              >
                {tab.icon}
                {tab.label}
              </Button>
            ))}
          </div>
        </DrawerContent>
      </Drawer>
    </>
  );
}
