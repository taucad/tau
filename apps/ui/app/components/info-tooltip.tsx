import { Info } from 'lucide-react';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip.js';

export function InfoTooltip({ tooltip }: { readonly tooltip: string }) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span className="flex items-center justify-center text-foreground/50 hover:text-foreground/70">
          <Info className="size-4" />
        </span>
      </TooltipTrigger>
      <TooltipContent>{tooltip}</TooltipContent>
    </Tooltip>
  );
}
