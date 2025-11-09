import { Button } from '#components/ui/button.js';
import { Tooltip, TooltipContent, TooltipTrigger } from '#components/ui/tooltip.js';
import { SvgIcon } from '#components/icons/svg-icon.js';

type GitTriggerProperties = {
  readonly onClick: () => void;
  readonly className?: string;
};

export function GitTrigger({ onClick, className }: GitTriggerProperties): React.JSX.Element {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button variant="outline" size="icon" className={className} onClick={onClick}>
          <SvgIcon id="github" />
        </Button>
      </TooltipTrigger>
      <TooltipContent>Connect to Git</TooltipContent>
    </Tooltip>
  );
}
