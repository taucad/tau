import { ChevronsDown, Filter, Settings, Trash } from 'lucide-react';
import { useState, useCallback, memo } from 'react';
import { useSelector } from '@xstate/react';
import { collapsedConsoleSize } from '#routes/builds_.$id/chat-editor-layout.js';
import { Button } from '#components/ui/button.js';
import { Input } from '#components/ui/input.js';
import { Tooltip, TooltipContent, TooltipTrigger } from '#components/ui/tooltip.js';
import { KeyShortcut } from '#components/ui/key-shortcut.js';
import { cn } from '#utils/ui.js';
import { useLogs } from '#hooks/use-logs.js';
import type { LogLevel, LogOrigin } from '#types/console.types.js';
import { logLevels } from '#types/console.types.js';
import { Badge } from '#components/ui/badge.js';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuCheckboxItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '#components/ui/dropdown-menu.js';
import { useCookie } from '#hooks/use-cookie.js';
import { logActor } from '#machines/logs.machine.js';
import { cookieName } from '#constants/cookie.constants.js';
import { stringToColor } from '#utils/color.utils.js';
import { EmptyItems } from '#components/ui/empty-items.js';

type ChatConsoleProperties = React.HTMLAttributes<HTMLDivElement> & {
  readonly onButtonClick?: (event: React.MouseEvent<HTMLButtonElement>) => void;
  readonly onFilterChange?: (event: React.ChangeEvent<HTMLInputElement>) => void;
  readonly keyCombination?: string;
};

// Default values for enabled log levels
const defaultLogLevels: Record<LogLevel, boolean> = {
  error: true,
  warn: true,
  info: true,
  debug: false,
  trace: false,
};

// Default values for display configuration
const defaultDisplayConfig = {
  showTimestamp: true,
  showComponent: false,
  showData: true,
};

// Generate a deterministic color based on the component name
const getComponentColor = (component: string | undefined): string => {
  if (!component) {
    return '#6b7280'; // Default gray
  }

  return stringToColor(component, 0.5);
};

// Component badge renderer
function ComponentBadge({ origin }: { readonly origin?: LogOrigin }) {
  if (!origin?.component) {
    return;
  }

  const bgColor = getComponentColor(origin.component);

  return (
    <Badge
      className="rounded-sm border-none px-0.5 py-0 text-xs font-normal"
      style={{
        backgroundColor: bgColor,
      }}
    >
      <span className="inline-block whitespace-nowrap">{origin.component}</span>
    </Badge>
  );
}

const getBadgeColor = (level: LogLevel) => {
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

    default: {
      return 'bg-[grey]';
    }
  }
};

// Verbosity level badge renderer
function VerbosityBadge({ level }: { readonly level: LogLevel }) {
  return (
    <Badge
      className={cn(
        'flex items-center justify-center p-0 font-mono text-xs font-normal uppercase',
        'w-12', // Fixed width
        getBadgeColor(level),
        `hover:bg-initial`,
      )}
    >
      {level}
    </Badge>
  );
}

// Format timestamp with seconds and milliseconds
const formatTimestamp = (timestamp: number): string => {
  return new Date(timestamp).toLocaleTimeString(undefined, {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    fractionalSecondDigits: 3,
  });
};

export const ChatConsole = memo(function ({
  onButtonClick,
  keyCombination,
  onFilterChange,
  className,
  ...properties
}: ChatConsoleProperties) {
  const log = useLogs({ defaultOrigin: { component: 'ChatConsole' } });
  const [filter, setFilter] = useState('');

  // Cookie-persisted state for log levels
  const [enabledLevels, setEnabledLevels] = useCookie(cookieName.consoleLogLevel, defaultLogLevels);
  const [displayConfig, setDisplayConfig] = useCookie(cookieName.consoleDisplayConfig, defaultDisplayConfig);

  // Filter logs based on search text and verbosity levels
  const filteredLogs = useSelector(logActor, (state) => {
    const { logs } = state.context;

    const filtered = logs.filter((log) => {
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

    let infoCount = 0;

    return filtered.map((log) => ({
      ...log,
      infoIndex: infoCount++,
    }));
  });

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

  return (
    <div
      className={cn(
        'group/console @container/console flex w-full flex-col',
        // Full height with adjustments
        'h-full min-h-0',
        // Fix scrolling issues
        'max-h-full overflow-hidden',
        className,
      )}
      {...properties}
    >
      <div className="sticky top-0 flex flex-row gap-2 bg-sidebar p-2 text-muted-foreground border-b border-border/50">
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="outline"
              className="size-7 gap-1 has-[>svg]:px-2 @xs/console:w-fit"
              onClick={(event) => onButtonClick?.(event)}
            >
              <span className="hidden font-normal @xs/console:block">Console</span>
              <ChevronsDown className={`transition-transform duration-200 ease-in-out group-data-[panel-size="${collapsedConsoleSize}.0"]/console-resizable:rotate-x-180`} />
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
          className="h-7 w-full bg-background"
          placeholder="Filter logs..."
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
                      'gap-2 size-7 [&>svg]:size-3',
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
                      'gap-2 size-7 [&>svg]:size-3',
                    )}
                  >
                    <Settings />
                  </Button>
                </DropdownMenuTrigger>
              </TooltipTrigger>
              <TooltipContent>
                <span>Console settings</span>
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
                  'gap-2 size-7 [&>svg]:size-3',
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
      <div className="flex min-h-0 flex-grow bg-background flex-col-reverse gap-0.25 overflow-x-hidden overflow-y-auto p-2">
        {/* Display console logs */}
        {filteredLogs.length > 0 ? (
          filteredLogs.map((log) => (
            <pre
              key={log.id}
              className={cn(
                'rounded p-1 font-mono text-xs',
                'group/log cursor-default',
                'flex-shrink-0 text-wrap',
                {
                  'bg-destructive/10 text-destructive hover:bg-destructive/20': log.level === logLevels.error,
                  'bg-warning/10 text-warning hover:bg-warning/20': log.level === logLevels.warn,
                  'hover:bg-neutral/20': log.level === logLevels.info,
                  'bg-neutral/10': log.level === logLevels.info && log.infoIndex % 2 !== 0,
                  'bg-stable/10 text-stable hover:bg-stable/20': log.level === logLevels.debug,
                  'bg-feature/10 text-feature hover:bg-feature/20': log.level === logLevels.trace,
                },
              )}
            >
              <div className="flex flex-wrap items-baseline gap-2">
                {displayConfig.showTimestamp ? (
                  <span className="shrink-0 opacity-60">[{formatTimestamp(log.timestamp)}]</span>
                ) : null}
                {displayConfig.showComponent ? <ComponentBadge origin={log.origin} /> : null}
                <span className="mr-auto">{log.message}</span>
              </div>
              {log.data !== undefined && displayConfig.showData ? (
                <div>{JSON.stringify(log.data, undefined, 2)}</div>
              ) : null}
            </pre>
          ))
        ) : (
          <EmptyItems className="m-0">
            No logs to display
          </EmptyItems>
        )}
      </div>
    </div>
  );
});
