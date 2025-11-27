import { Box, Code2, Info, MessageCircleIcon, SlidersHorizontal, Download, Files } from 'lucide-react';
import { TabsList, TabsTrigger } from '#components/ui/tabs.js';
import { cn } from '#utils/ui.utils.js';

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
    id: 'model',
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
] as const;

export function ChatInterfaceNav({ className }: { readonly className?: string }): React.ReactNode {
  return (
    <TabsList
      enableAnimation={false}
      className={cn(
        'w-full border bg-sidebar',
        'rounded-xl p-0 text-muted-foreground! [&_svg]:size-4! [&_svg]:text-muted-foreground',
        className,
      )}
    >
      {chatTabs.map((tab) => (
        <TabsTrigger
          key={tab.id}
          enableAnimation={false}
          value={tab.id}
          className={cn(
            '-mx-1 flex flex-col items-center justify-center gap-0 first:ml-0 last:mr-0',
            'data-[state=active]:text-primary',
            'data-[state=active]:bg-primary/20',
            'data-[state=active]:rounded-xl',
            'data-[state=active]:[&_svg]:text-primary',
          )}
        >
          {tab.icon}
        </TabsTrigger>
      ))}
    </TabsList>
  );
}
