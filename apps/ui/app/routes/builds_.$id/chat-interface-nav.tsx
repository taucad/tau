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
        'gap-0.25 rounded-t-xl rounded-b-none border-b-0 p-0.5 text-muted-foreground! [&_svg]:size-4! [&_svg]:text-muted-foreground',
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
            'data-[state=active]:text-primary',
            'data-[state=active]:bg-primary/20',
            'data-[state=active]:border-primary/50',
            'data-[state=active]:[&_svg]:text-primary',
            tab.id === 'model' && 'border-sidebar-primary/20 data-[state=inactive]:bg-neutral/20',
          )}
        >
          {tab.icon}
          {tab.label}
        </TabsTrigger>
      ))}
    </TabsList>
  );
}
