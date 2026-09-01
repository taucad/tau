import { Box, Code2, Info, MessageCircleIcon, SlidersHorizontal, Download, Files, Share2 } from 'lucide-react';
import { TabsList, TabsTrigger } from '@taucad/ui/components/tabs';
import { cn } from '@taucad/ui/utils/cn';
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
] as const satisfies Array<{ id: MobilePanelId; label: string; icon: React.ReactNode }>;

export function ChatInterfaceNav({ className }: { readonly className?: string }): React.ReactNode {
  return (
    <TabsList
      enableAnimation={false}
      className={cn(
        'w-full border-t bg-sidebar',
        'gap-0.25 rounded-t-xl rounded-b-none p-0.5 text-muted-foreground! [&_svg]:size-4! [&_svg]:text-muted-foreground',
        className,
      )}
    >
      {chatTabs.map((tab) => (
        <TabsTrigger
          key={tab.id}
          enableAnimation={false}
          value={tab.id}
          className={cn(
            'flex flex-col items-center justify-center gap-0.5 pb-0.5 text-[10px]',
            'rounded-lg border border-transparent transition-[color,background-color,border-color] duration-200 ease-linear',
            'data-[state=active]:border-border',
            'data-[state=active]:bg-accent',
            'data-[state=active]:text-accent-foreground',
            'data-[state=active]:[&_svg]:text-accent-foreground',
            tab.id === 'viewer' && 'border-sidebar-primary/20 data-[state=inactive]:bg-neutral/20',
          )}
        >
          {tab.icon}
          {tab.label}
        </TabsTrigger>
      ))}
    </TabsList>
  );
}
