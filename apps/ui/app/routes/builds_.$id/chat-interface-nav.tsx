import { Box, Code2, Info, MessageCircleIcon, SlidersHorizontal } from 'lucide-react';
import { TabsList, TabsTrigger } from '#components/ui/tabs.js';
import { cn } from '#utils/ui.js';

export const chatTabs = [
  {
    id: 'chat' as const,
    label: 'Chat',
    icon: <MessageCircleIcon />,
  },
  {
    id: 'parameters' as const,
    label: 'Params',
    icon: <SlidersHorizontal />,
  },
  {
    id: 'model' as const,
    label: 'Model',
    icon: <Box />,
  },
  {
    id: 'editor' as const,
    label: 'Editor',
    icon: <Code2 />,
  },
  {
    id: 'details' as const,
    label: 'Details',
    icon: <Info />,
  },
] as const;

export function ChatInterfaceNav({ className }: { readonly className?: string }): React.ReactNode {
  return (
    <TabsList
      enableAnimation={false}
      className={cn(
        'w-full',
        'rounded-xl border text-muted-foreground! [&_svg]:size-4! [&_svg]:text-muted-foreground',
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
            'data-[state=active]:text-primary!',
            'data-[state=active]:bg-primary/20',
            'data-[state=active]:rounded-lg',
            'data-[state=active]:[&_svg]:text-primary',
          )}
        >
          {tab.icon}
        </TabsTrigger>
      ))}
    </TabsList>
  );
}
