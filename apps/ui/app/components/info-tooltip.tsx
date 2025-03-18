import { Tooltip, TooltipContent, TooltipTrigger } from './ui/tooltip';
import { Info } from 'lucide-react';

export const InfoTooltip = ({ tooltip }: { tooltip: string }) => {
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
};
