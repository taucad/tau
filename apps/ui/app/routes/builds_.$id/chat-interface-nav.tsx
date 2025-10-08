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
      activeClassName="rounded-lg"
      className={cn(
        'w-full rounded-none shadow-none',
        'rounded-xl border text-muted-foreground! [&_svg]:size-4! [&_svg]:text-muted-foreground',
        className,
      )}
    >
      {chatTabs.map((tab) => (
        <TabsTrigger
          key={tab.id}
          value={tab.id}
          className={cn(
            'flex flex-col items-center justify-center gap-0.5',
            'data-[state=active]:text-primary!',
            'data-[state=active]:[&_svg]:text-primary',
          )}
        >
          {tab.icon}
          <span className="text-[0.625rem] text-muted-foreground">{tab.label}</span>
        </TabsTrigger>
      ))}
    </TabsList>
  );
}
