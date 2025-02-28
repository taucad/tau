import { useReplicad } from '@/components/geometry/kernel/replicad/replicad-context';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { ChevronUp, Trash } from 'lucide-react';
import { KeyShortcut } from '@/components/ui/key-shortcut';
import { cn } from '@/utils/ui';

type ChatConsoleProperties = React.HTMLAttributes<HTMLDivElement> & {
  onButtonClick?: (event: React.MouseEvent<HTMLButtonElement>) => void;
  onFilterChange?: (event: React.ChangeEvent<HTMLInputElement>) => void;
  keyCombination?: string;
  'data-view': 'tabs' | 'split';
  'data-state'?: 'open' | 'closed';
};

export const ChatConsole = ({
  onButtonClick,
  keyCombination,
  onFilterChange,
  className,
  ...properties
}: ChatConsoleProperties) => {
  const { status } = useReplicad();

  return (
    <div className={cn('flex flex-col gap-2 w-full group/console', className)} {...properties}>
      <div className="flex flex-row gap-2">
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="outline"
              size="xs"
              className="gap-2 w-fit pr-1 hidden group-data-[view=split]/console:flex"
              onClick={(event) => onButtonClick?.(event)}
            >
              <span className="font-mono text-xs">Console</span>
              <span className="relative flex flex-col gap-2 size-4 ease-in-out">
                <span className="absolute inset-0 flex flex-col gap-2 size-4 scale-100 group-data-[state=open]/console:scale-0 transition-transform duration-200 ease-in-out">
                  <ChevronUp className="absolute -bottom-0.5 left-1/2 -translate-x-1/2" />
                  <ChevronUp className="absolute bottom-0.5 left-1/2 -translate-x-1/2" />
                </span>
                <span className="absolute inset-0 flex flex-col gap-2 size-4 rotate-180 scale-0 group-data-[state=open]/console:scale-100 transition-transform duration-200 ease-in-out">
                  <ChevronUp className="absolute -bottom-0.5 left-1/2 -translate-x-1/2" />
                  <ChevronUp className="absolute bottom-0.5 left-1/2 -translate-x-1/2" />
                </span>
              </span>
            </Button>
          </TooltipTrigger>
          <TooltipContent>
            <span>Toggle console</span>
            {keyCombination && (
              <KeyShortcut variant="tooltip" className="ml-1">
                {keyCombination}
              </KeyShortcut>
            )}
          </TooltipContent>
        </Tooltip>
        <Input
          className="h-6 group-data-[view=tabs]/console:h-8 shadow-none"
          placeholder="Filter..."
          onChange={onFilterChange}
        />
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="outline"
              size="icon"
              className="gap-2 h-6 [&>svg]:size-3 group-data-[view=tabs]/console:size-8"
            >
              <Trash />
            </Button>
          </TooltipTrigger>
          <TooltipContent>Clear logs</TooltipContent>
        </Tooltip>
      </div>
      <div className="flex flex-col gap-2 ">
        {status.isComputing && <pre className="text-xs bg-background font-mono">{`Computing...`}</pre>}
        {status.isBuffering && <pre className="text-xs bg-background font-mono">{`Buffering...`}</pre>}
        {status.error && <pre className="text-xs bg-background font-mono">{`${status.error}`}</pre>}
      </div>
    </div>
  );
};
