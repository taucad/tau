import { TabsList, TabsTrigger } from "#components/ui/tabs.js";
import { cn } from "#utils/ui.js";
import { Box, Code2, Info, MessageCircleIcon, SlidersHorizontal } from "lucide-react";

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

export function ChatInterfaceNav({ className }: { className?: string }) {
  return (
    <TabsList
      activeClassName="rounded-lg"
      className={cn(
        "shadow-none rounded-none w-full",
        "[&_svg]:size-4! [&_svg]:text-muted-foreground text-muted-foreground! border rounded-xl",
        className,
      )}>
      {chatTabs.map((tab) => (
        <TabsTrigger key={tab.id} value={tab.id} className={cn(
          'flex flex-col gap-0.5 items-center justify-center',
          "data-[state=active]:text-primary!",
          "data-[state=active]:[&_svg]:text-primary",
        )}
        >
          {tab.icon}
          <span className="text-[0.625rem] text-muted-foreground">{tab.label}</span>
        </TabsTrigger>
      ))}
    </TabsList>
  );
}
