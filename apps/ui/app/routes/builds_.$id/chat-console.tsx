import { ChevronUp, Filter, Settings, Trash } from 'lucide-react';
import { useState, useCallback, memo } from 'react';
import { collapsedConsoleSize } from './chat-view-split.js';
import { Button } from '~/components/ui/button.js';
import { Input } from '~/components/ui/input.js';
import { Tooltip, TooltipContent, TooltipTrigger } from '~/components/ui/tooltip.js';
import { KeyShortcut } from '~/components/ui/key-shortcut.js';
import { cn } from '~/utils/ui.js';
import { useConsole } from '~/hooks/use-console.js';
import type { LogLevel, LogOrigin } from '~/types/console.js';
import { logLevels } from '~/types/console.js';
import { Badge } from '~/components/ui/badge.js';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuCheckboxItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '~/components/ui/dropdown-menu.js';
import { useCookie } from '~/hooks/use-cookie.js';

type ChatConsoleProperties = React.HTMLAttributes<HTMLDivElement> & {
  readonly onButtonClick?: (event: React.MouseEvent<HTMLButtonElement>) => void;
  readonly onFilterChange?: (event: React.ChangeEvent<HTMLInputElement>) => void;
  readonly keyCombination?: string;
  readonly 'data-view': 'tabs' | 'split';
};

// Cookie names for persisting console settings
const consoleLogLevelsCookieName = 'console-log-levels';
const consoleDisplayConfigCookieName = 'console-display-config';

// Default values for enabled log levels
const defaultLogLevels: Record<LogLevel, boolean> = {
  error: true,
  warn: true,
  info: true,
  debug: true,
  trace: true,
};

// Default values for display configuration
const defaultDisplayConfig = {
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
    const charPoint = component.codePointAt(index) ?? 0;
    // eslint-disable-next-line no-bitwise -- this is a hash function
    hash = charPoint + ((hash << 5) - hash);
  }

  // Convert to hex color with good saturation and lightness
  const h = Math.abs(hash) % 360; // Hue between 0-359
  return `oklch(var(--l-primary) var(--c-primary) ${h})`; // Higher saturation for vibrant colors, light enough for text
};

// Component badge renderer
function ComponentBadge({ origin }: { readonly origin?: LogOrigin }) {
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
}

// Verbosity level badge renderer
function VerbosityBadge({ level }: { readonly level: LogLevel }) {
  const getBadgeColor = () => {
    switch (level) {
      case logLevels.error: {
        return 'bg-destructive';
      }

      case logLevels.warn: {
        return 'bg-warning';
      }

      case logLevels.info: {
        return 'bg-information';
      }

      case logLevels.debug: {
        return 'bg-stable';
      }

      case logLevels.trace: {
        return 'bg-feature';
      }

      // eslint-disable-next-line @typescript-eslint/switch-exhaustiveness-check -- exhaustive check
      default: {
        return 'bg-[grey]';
      }
    }
  };

  return (
    <Badge
      className={cn(
        'flex items-center justify-center text-xs font-normal',
        'w-12', // Fixed width
        getBadgeColor(),
        `hover:bg-initial`,
      )}
    >
      {level}
    </Badge>
  );
}

// Format timestamp with seconds
const formatTimestamp = (timestamp: number): string => {
  return new Date(timestamp).toLocaleTimeString(undefined, {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
};

export const ChatConsole = memo(function ({
  onButtonClick,
  keyCombination,
  onFilterChange,
  className,
  ...properties
}: ChatConsoleProperties) {
  const log = useConsole({ defaultOrigin: { component: 'ChatConsole' } });
  const [filter, setFilter] = useState('');

  // Cookie-persisted state for log levels
  const [enabledLevels, setEnabledLevels] = useCookie(consoleLogLevelsCookieName, defaultLogLevels);
  const [displayConfig, setDisplayConfig] = useCookie(consoleDisplayConfigCookieName, defaultDisplayConfig);

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
    (key: keyof typeof defaultDisplayConfig, value: boolean) => {
      setDisplayConfig((previous: typeof defaultDisplayConfig) => ({
        ...previous,
        [key]: value,
      }));
    },
    [setDisplayConfig],
  );

  // Filter logs based on search text and verbosity levels
  const filteredLogs = log.filterLogs((log) => {
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
        'group/console @container/console flex w-full flex-col',
        // Full height for both modes with different adjustments
        'group-data-[view=split]/console:h-full group-data-[view=split]/console:min-h-0',
        // Fix scrolling issues
        'max-h-full min-h-0 overflow-hidden',
        className,
      )}
      {...properties}
    >
      <div className="sticky top-0 flex flex-row gap-2 bg-background p-2">
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="outline"
              size="xs"
              className="hidden w-fit gap-2 px-1 group-data-[view=split]/console:flex @xs/console:pl-2"
              onClick={(event) => onButtonClick?.(event)}
            >
              <span className="hidden font-mono text-xs @xs/console:block">Console</span>
              <span className="relative flex size-4 flex-col gap-2 ease-in-out">
                <span
                  className={`absolute inset-0 flex size-4 scale-0 flex-col gap-2 transition-transform duration-200 ease-in-out group-data-[panel-size=${collapsedConsoleSize}.0]/console-resizable:scale-100`}
                >
                  <ChevronUp className="absolute -bottom-0.5 left-1/2 -translate-x-1/2" />
                  <ChevronUp className="absolute bottom-0.5 left-1/2 -translate-x-1/2" />
                </span>
                <span
                  className={`absolute inset-0 flex size-4 scale-100 rotate-180 flex-col gap-2 transition-transform duration-200 ease-in-out group-data-[panel-size=${collapsedConsoleSize}.0]/console-resizable:scale-0`}
                >
                  <ChevronUp className="absolute -bottom-0.5 left-1/2 -translate-x-1/2" />
                  <ChevronUp className="absolute bottom-0.5 left-1/2 -translate-x-1/2" />
                </span>
              </span>
            </Button>
          </TooltipTrigger>
          <TooltipContent>
            Toggle console
            {keyCombination ? (
              <KeyShortcut variant="tooltip" className="ml-1">
                {keyCombination}
              </KeyShortcut>
            ) : null}
          </TooltipContent>
        </Tooltip>
        <Input
          autoComplete="off"
          className="h-6 w-full group-data-[view=tabs]/console:h-8"
          placeholder="Filter..."
          value={filter}
          onChange={handleFilterChange}
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
              {Object.values(logLevels).map((level) => (
                <DropdownMenuCheckboxItem
                  key={level}
                  checked={enabledLevels[level]}
                  onSelect={(event) => {
                    event.preventDefault();
                  }}
                  onCheckedChange={(checked) => {
                    toggleLevel(level, checked);
                  }}
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
              {(Object.keys(defaultDisplayConfig) as Array<keyof typeof defaultDisplayConfig>).map((key) => (
                <DropdownMenuCheckboxItem
                  key={key}
                  checked={displayConfig[key]}
                  onSelect={(event) => {
                    event.preventDefault();
                  }}
                  onCheckedChange={(checked) => {
                    toggleDisplayConfig(key, checked);
                  }}
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
      <div className="flex min-h-0 flex-grow flex-col gap-0.5 overflow-x-hidden overflow-y-auto p-2 pt-0 group-data-[view=split]/console:flex-col-reverse">
        {/* Display console logs */}
        {filteredLogs.length > 0 ? (
          filteredLogs.map((log) => (
            <pre
              key={log.id}
              className={cn(
                'rounded border-l-2 bg-background px-2 py-1 font-mono text-xs',
                'group/log cursor-default border-primary hover:bg-muted/20',
                'flex-shrink-0 text-wrap',
                {
                  'border-destructive': log.level === logLevels.error,
                  'border-warning': log.level === logLevels.warn,
                  'border-information': log.level === logLevels.info,
                  'border-stable': log.level === logLevels.debug,
                  'border-feature': log.level === logLevels.trace,
                },
              )}
            >
              <div className="flex flex-wrap items-baseline gap-2">
                {displayConfig.showTimestamp ? (
                  <span className="shrink-0 opacity-60">[{formatTimestamp(log.timestamp)}]</span>
                ) : null}
                {displayConfig.showVerbosity ? <VerbosityBadge level={log.level} /> : null}
                {displayConfig.showComponent ? <ComponentBadge origin={log.origin} /> : null}
                <span className="mr-auto">{log.message}</span>
              </div>
              {log.data !== undefined && displayConfig.showData ? (
                <div>{JSON.stringify(log.data, undefined, 2)}</div>
              ) : null}
            </pre>
          ))
        ) : (
          <div className="flex flex-1 items-center justify-center text-muted-foreground">
            <p className="text-sm">No logs to display</p>
          </div>
        )}
      </div>
    </div>
  );
});
