import { GitBranch } from 'lucide-react';
import { Button } from '#components/ui/button.js';
import { Tooltip, TooltipContent, TooltipTrigger } from '#components/ui/tooltip.js';

type GitTriggerProperties = {
  readonly onClick: () => void;
  readonly className?: string;
};

export function GitTrigger({ onClick, className }: GitTriggerProperties): React.JSX.Element {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button variant="outline" size="icon" className={className} onClick={onClick}>
          <GitBranch className="size-4" />
        </Button>
      </TooltipTrigger>
      <TooltipContent>Connect to Git</TooltipContent>
    </Tooltip>
  );
}
