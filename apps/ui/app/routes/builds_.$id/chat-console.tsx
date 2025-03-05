import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { ChevronUp, Filter, Settings, Trash } from 'lucide-react';
import { KeyShortcut } from '@/components/ui/key-shortcut';
import { cn } from '@/utils/ui';
import { useConsole } from '@/hooks/use-console';
import { useState, useCallback } from 'react';
import { LogLevel, LOG_LEVELS, LogOrigin } from '@/types/console';
import { Badge } from '@/components/ui/badge';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuCheckboxItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';

type ChatConsoleProperties = React.HTMLAttributes<HTMLDivElement> & {
  onButtonClick?: (event: React.MouseEvent<HTMLButtonElement>) => void;
  onFilterChange?: (event: React.ChangeEvent<HTMLInputElement>) => void;
  keyCombination?: string;
  'data-view': 'tabs' | 'split';
  'data-state'?: 'open' | 'closed';
};

// Cookie names for persisting console settings
// const CONSOLE_LOG_LEVELS_COOKIE = 'tau-console-log-levels';
// const CONSOLE_DISPLAY_CONFIG_COOKIE = 'tau-console-display-config';

// Default values for enabled log levels
const DEFAULT_ENABLED_LEVELS: Record<LogLevel, boolean> = {
  ERROR: true,
  WARN: true,
  INFO: true,
  DEBUG: true,
  TRACE: true,
};

// Default values for display configuration
const DEFAULT_DISPLAY_CONFIG = {
  showTimestamp: true,
  showComponent: true,
  showVerbosity: true,
  showData: true,
};

// Generate a deterministic color based on the component name
const getComponentColor = (component: string | undefined): string => {
  if (!component) return '#6b7280'; // Default gray

  // Simple hash function
  let hash = 0;
  for (let index = 0; index < component.length; index++) {
    const charPoint = component.codePointAt(index) || 0;
    hash = charPoint + ((hash << 5) - hash);
  }

  // Convert to hex color with good saturation and lightness
  const h = Math.abs(hash) % 360; // Hue between 0-359
  return `oklch(var(--l-primary) var(--c-primary) ${h})`; // Higher saturation for vibrant colors, light enough for text
};

// Component badge renderer
const ComponentBadge = ({ origin }: { origin?: LogOrigin }) => {
  if (!origin?.component) return;

  const bgColor = getComponentColor(origin.component);

  return (
    <Badge
      className="text-xs font-normal"
      style={{
        backgroundColor: bgColor,
      }}
    >
      <span className="inline-block whitespace-nowrap">{origin.component}</span>
    </Badge>
  );
};

// Verbosity level badge renderer
const VerbosityBadge = ({ level }: { level: LogLevel }) => {
  const getBadgeColor = () => {
    switch (level) {
      case LOG_LEVELS.ERROR: {
        return 'bg-destructive';
      }
      case LOG_LEVELS.WARN: {
        return 'bg-warning';
      }
      case LOG_LEVELS.INFO: {
        return 'bg-information';
      }
      case LOG_LEVELS.DEBUG: {
        return 'bg-stable';
      }
      case LOG_LEVELS.TRACE: {
        return 'bg-feature';
      }
      default: {
        return 'bg-[grey]';
      }
    }
  };

  return (
    <Badge
      className={cn(
        'text-xs font-normal flex items-center justify-center',
        'w-12', // Fixed width
        getBadgeColor(),
        `hover:bg-initial`,
      )}
    >
      {level}
    </Badge>
  );
};

// Format timestamp with seconds
const formatTimestamp = (timestamp: number): string => {
  return new Date(timestamp).toLocaleTimeString(undefined, {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
};

export const ChatConsole = ({
  onButtonClick,
  keyCombination,
  onFilterChange,
  className,
  ...properties
}: ChatConsoleProperties) => {
  const log = useConsole({ defaultOrigin: { component: 'ChatConsole' } });
  const [filter, setFilter] = useState('');

  // Cookie-persisted state for log levels with proper parse and stringify
  const [enabledLevels, setEnabledLevels] = useState<Record<LogLevel, boolean>>(DEFAULT_ENABLED_LEVELS);
  const [displayConfig, setDisplayConfig] = useState(DEFAULT_DISPLAY_CONFIG);

  // Handle filter changes
  const handleFilterChange = useCallback(
    (event: React.ChangeEvent<HTMLInputElement>) => {
      setFilter(event.target.value);
      if (onFilterChange) {
        onFilterChange(event);
      }
    },
    [onFilterChange],
  );

  // Handle clear logs
  const handleClearLogs = useCallback(() => {
    log.clear();
  }, [log]);

  // Toggle log level filter
  const toggleLevel = useCallback(
    (level: LogLevel, value: boolean) => {
      setEnabledLevels((previous: Record<LogLevel, boolean>) => ({
        ...previous,
        [level]: value,
      }));
    },
    [setEnabledLevels],
  );

  // Toggle display configuration
  const toggleDisplayConfig = useCallback(
    (key: keyof typeof DEFAULT_DISPLAY_CONFIG, value: boolean) => {
      console.log('toggleDisplayConfig', key);
      setDisplayConfig((previous: typeof DEFAULT_DISPLAY_CONFIG) => ({
        ...previous,
        [key]: value,
      }));
    },
    [setDisplayConfig],
  );

  // Filter logs based on search text and verbosity levels
  const filteredLogs = log.logs.filter((log) => {
    // Check if log level is enabled
    if (!enabledLevels[log.level]) {
      return false;
    }

    // If there's a text filter, check if the message contains it
    if (filter && !log.message.toLowerCase().includes(filter.toLowerCase())) {
      return false;
    }

    return true;
  });

  return (
    <div
      className={cn(
        'flex flex-col w-full group/console',
        // Full height for both modes with different adjustments
        'group-data-[view=split]/console:h-full group-data-[view=split]/console:min-h-0',
        // Fix scrolling issues
        'min-h-0 max-h-full overflow-hidden',
        className,
      )}
      {...properties}
    >
      <div className="flex flex-row gap-2 sticky top-0 bg-background p-2">
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
          className="h-6 group-data-[view=tabs]/console:h-8 w-full shadow-none"
          placeholder="Filter..."
          onChange={handleFilterChange}
          value={filter}
        />

        <div className="flex flex-row gap-2">
          {/* Verbosity filter dropdown */}
          <DropdownMenu modal={false}>
            <Tooltip>
              <TooltipTrigger asChild>
                <DropdownMenuTrigger asChild>
                  <Button
                    variant="outline"
                    size="icon"
                    className={cn(
                      'gap-2 group-data-[view=split]/console:size-6 group-data-[view=split]/console:[&>svg]:size-3',
                    )}
                  >
                    <Filter />
                  </Button>
                </DropdownMenuTrigger>
              </TooltipTrigger>
              <TooltipContent>
                <span>Filter by log level</span>
              </TooltipContent>
            </Tooltip>
            <DropdownMenuContent align="end">
              <DropdownMenuLabel>Log Levels</DropdownMenuLabel>
              <DropdownMenuSeparator />
              {Object.values(LOG_LEVELS).map((level) => (
                <DropdownMenuCheckboxItem
                  key={level}
                  checked={enabledLevels[level]}
                  onSelect={(event) => event.preventDefault()}
                  onCheckedChange={(checked) => toggleLevel(level, checked)}
                >
                  <VerbosityBadge level={level} />
                </DropdownMenuCheckboxItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>

          {/* Display configuration dropdown */}
          <DropdownMenu modal={false}>
            <Tooltip>
              <TooltipTrigger asChild>
                <DropdownMenuTrigger asChild>
                  <Button
                    variant="outline"
                    size="icon"
                    className={cn(
                      'gap-2 group-data-[view=split]/console:size-6 group-data-[view=split]/console:[&>svg]:size-3',
                    )}
                  >
                    <Settings />
                  </Button>
                </DropdownMenuTrigger>
              </TooltipTrigger>
              <TooltipContent>
                <span>Display settings</span>
              </TooltipContent>
            </Tooltip>
            <DropdownMenuContent align="end" className="w-56">
              <DropdownMenuLabel>Display Options</DropdownMenuLabel>
              <DropdownMenuSeparator />
              {Object.keys(DEFAULT_DISPLAY_CONFIG).map((key) => (
                <DropdownMenuCheckboxItem
                  key={key}
                  checked={displayConfig[key as keyof typeof DEFAULT_DISPLAY_CONFIG]}
                  onSelect={(event) => event.preventDefault()}
                  onCheckedChange={(checked) =>
                    toggleDisplayConfig(key as keyof typeof DEFAULT_DISPLAY_CONFIG, checked)
                  }
                >
                  {key.replaceAll(/([A-Z])/g, ' $1').replace(/^./, (string_) => string_.toUpperCase())}
                </DropdownMenuCheckboxItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>

          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="outline"
                size="icon"
                className={cn(
                  'gap-2 group-data-[view=split]/console:size-6 group-data-[view=split]/console:[&>svg]:size-3',
                )}
                onClick={handleClearLogs}
              >
                <Trash />
              </Button>
            </TooltipTrigger>
            <TooltipContent>Clear logs</TooltipContent>
          </Tooltip>
        </div>
      </div>
      <div className="flex flex-col group-data-[view=split]/console:flex-col-reverse gap-0.5 overflow-y-auto p-2 pt-0 min-h-0 flex-grow">
        {/* Display console logs */}
        {filteredLogs.length > 0 ? (
          filteredLogs.map((log) => (
            <pre
              key={log.id}
              className={cn(
                'text-xs bg-background font-mono py-1 px-2 rounded border-l-2',
                'hover:bg-muted/20 transition-colors cursor-default group/log border-primary',
                {
                  'border-destructive': log.level === LOG_LEVELS.ERROR,
                  'border-warning': log.level === LOG_LEVELS.WARN,
                  'border-information': log.level === LOG_LEVELS.INFO,
                  'border-stable': log.level === LOG_LEVELS.DEBUG,
                  'border-feature': log.level === LOG_LEVELS.TRACE,
                },
              )}
            >
              <div className="flex items-baseline flex-wrap gap-2">
                {displayConfig.showTimestamp && (
                  <span className="opacity-60 shrink-0">[{formatTimestamp(log.timestamp)}]</span>
                )}
                {displayConfig.showVerbosity && <VerbosityBadge level={log.level} />}
                {displayConfig.showComponent && <ComponentBadge origin={log.origin} />}
                <span className="mr-auto">{log.message}</span>
              </div>
              {log.data !== undefined && displayConfig.showData && (
                <div className="block opacity-80 overflow-x-auto">{JSON.stringify(log.data, undefined, 2)}</div>
              )}
            </pre>
          ))
        ) : (
          <div className="flex-1 flex items-center justify-center text-muted-foreground">
            <p className="text-sm">No logs to display</p>
          </div>
        )}
      </div>
    </div>
  );
};
