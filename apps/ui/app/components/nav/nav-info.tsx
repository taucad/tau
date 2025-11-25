import { Info } from 'lucide-react';
import { CollapsibleContent, CollapsibleTrigger } from '#components/ui/collapsible.js';
import { SidebarMenuButton } from '#components/ui/sidebar.js';
import { Tooltip, TooltipContent, TooltipTrigger } from '#components/ui/tooltip.js';
import { metaConfig } from '#constants/meta.constants.js';

export function NavInfoTrigger(): React.JSX.Element {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <CollapsibleTrigger asChild>
          <SidebarMenuButton className="size-7">
            <Info className="size-4" />
            <span className="sr-only">Toggle app info</span>
          </SidebarMenuButton>
        </CollapsibleTrigger>
      </TooltipTrigger>
      <TooltipContent side="top">App info</TooltipContent>
    </Tooltip>
  );
}

export function NavInfoContent(): React.JSX.Element {
  return (
    <CollapsibleContent className="data-[state=closed]:animate-collapse-up data-[state=open]:animate-collapse-down overflow-hidden">
      <div className="mb-2 flex w-full flex-col gap-2 border-b border-border px-2 py-3">
        <div className="flex w-full items-center justify-between">
          <span className="text-xs text-muted-foreground">Version</span>
          <span className="text-xs font-medium">v{metaConfig.version}</span>
        </div>
        <div className="flex w-full items-center justify-between">
          <span className="text-xs text-muted-foreground">Name</span>
          <span className="text-xs font-medium">{metaConfig.name}</span>
        </div>
      </div>
    </CollapsibleContent>
  );
}
