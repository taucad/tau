import { ChevronsDown, Filter, Settings, Trash } from 'lucide-react';
import { useState, useCallback, memo } from 'react';
import { useSelector } from '@xstate/react';
import { Button } from '#components/ui/button.js';
import { Tooltip, TooltipContent, TooltipTrigger } from '#components/ui/tooltip.js';
import { KeyShortcut } from '#components/ui/key-shortcut.js';
import { cn } from '#utils/ui.utils.js';
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
import { cookieName } from '#constants/cookie.constants.js';
import { useBuild } from '#hooks/use-build.js';
import { stringToColor } from '#utils/color.utils.js';
import { EmptyItems } from '#components/ui/empty-items.js';
import { SearchInput } from '#components/search-input.js';
import { HighlightText } from '#components/highlight-text.js';

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

export const collapsedConsoleSize = 4;

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
function ComponentBadge({ origin, searchTerm }: { readonly origin?: LogOrigin; readonly searchTerm?: string }) {
  if (!origin?.component) {
    return;
  }

  const bgColor = getComponentColor(origin.component);

  return (
    <Badge
      className="rounded-sm rounded-xs px-0.5 py-0 text-xs font-normal"
      variant="outline"
      style={{
        borderColor: bgColor,
        backgroundColor: bgColor,
      }}
    >
      <span className="inline-block whitespace-nowrap">
        <HighlightText text={origin.component} searchTerm={searchTerm} />
      </span>
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
  const { logRef } = useBuild();
  const [filter, setFilter] = useState('');

  // Cookie-persisted state for log levels
  const [enabledLevels, setEnabledLevels] = useCookie(cookieName.consoleLogLevel, defaultLogLevels);
  const [displayConfig, setDisplayConfig] = useCookie(cookieName.consoleDisplayConfig, defaultDisplayConfig);

  // Filter logs based on search text and verbosity levels
  const filteredLogs = useSelector(logRef, (state) => {
    const { logs } = state.context;

    const filtered = logs.filter((log) => {
      // Check if log level is enabled
      if (!enabledLevels[log.level]) {
        return false;
      }

      // If there's a text filter, check if any searchable field contains it
      if (filter) {
        const filterLower = filter.toLowerCase();
        const timestampString = formatTimestamp(log.timestamp).toLowerCase();
        const componentString = log.origin?.component?.toLowerCase() ?? '';
        const messageString = log.message.toLowerCase();
        const dataString = log.data === undefined ? '' : JSON.stringify(log.data).toLowerCase();

        const matches =
          timestampString.includes(filterLower) ||
          componentString.includes(filterLower) ||
          messageString.includes(filterLower) ||
          dataString.includes(filterLower);

        if (!matches) {
          return false;
        }
      }

      return true;
    });

    let infoCount = 0;

    return filtered
      .map((log) => ({
        ...log,
        infoIndex: infoCount++,
      }))
      .reverse();
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
    logRef.send({ type: 'clearLogs' });
  }, [logRef]);

  const handleClearFilter = useCallback(() => {
    setFilter('');
  }, [setFilter]);

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
      <div className="sticky top-0 flex flex-row gap-2 border-b bg-sidebar p-2 text-muted-foreground">
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="outline"
              className="size-7 gap-1 has-[>svg]:px-2 @xs/console:w-fit"
              onClick={(event) => onButtonClick?.(event)}
            >
              <span className="hidden font-normal @xs/console:block">Console</span>
              <ChevronsDown
                // IMPORTANT: Update this when collapsedConsoleSize changes
                className={`transition-transform duration-200 ease-in-out group-data-[panel-size="4.0"]/console-resizable:rotate-180`}
              />
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
        <SearchInput
          autoComplete="off"
          className="h-7 w-full bg-background"
          placeholder="Filter logs..."
          value={filter}
          onChange={handleFilterChange}
          onClear={handleClearFilter}
        />

        <div className="flex flex-row gap-2">
          {/* Verbosity filter dropdown */}
          <DropdownMenu modal={false}>
            <Tooltip>
              <TooltipTrigger asChild>
                <DropdownMenuTrigger asChild>
                  <Button variant="outline" size="icon" className={cn('size-7 gap-2 [&>svg]:size-3')}>
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
                  <Button variant="outline" size="icon" className={cn('size-7 gap-2 [&>svg]:size-3')}>
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
                className={cn('size-7 gap-2 [&>svg]:size-3')}
                onClick={handleClearLogs}
              >
                <Trash />
              </Button>
            </TooltipTrigger>
            <TooltipContent>Clear logs</TooltipContent>
          </Tooltip>
        </div>
      </div>
      <div className="flex min-h-0 grow flex-col justify-end overflow-hidden bg-background">
        <div className="flex flex-col gap-0.25 overflow-x-hidden overflow-y-auto p-2">
          {/* Display console logs */}
          {filteredLogs.length > 0 ? (
            filteredLogs.map((log) => (
              <pre
                key={log.id}
                className={cn('rounded p-1 font-mono text-xs', 'group/log shrink-0 cursor-text text-wrap', {
                  'bg-destructive/10 text-destructive hover:bg-destructive/20': log.level === logLevels.error,
                  'bg-warning/10 text-warning hover:bg-warning/20': log.level === logLevels.warn,
                  'hover:bg-neutral/20': log.level === logLevels.info,
                  'bg-neutral/10': log.level === logLevels.info && log.infoIndex % 2 !== 0,
                  'bg-stable/10 text-stable hover:bg-stable/20': log.level === logLevels.debug,
                  'bg-feature/10 text-feature hover:bg-feature/20': log.level === logLevels.trace,
                })}
              >
                <span className="flex flex-wrap items-baseline gap-2">
                  {displayConfig.showTimestamp ? (
                    <span className="shrink-0 opacity-60">
                      [<HighlightText text={formatTimestamp(log.timestamp)} searchTerm={filter} />]
                    </span>
                  ) : null}
                  {displayConfig.showComponent ? <ComponentBadge origin={log.origin} searchTerm={filter} /> : null}
                  <span className="mr-auto">
                    <HighlightText text={log.message} searchTerm={filter} />
                  </span>
                </span>
                {log.data !== undefined && displayConfig.showData ? (
                  <span>
                    <HighlightText text={JSON.stringify(log.data, undefined, 2)} searchTerm={filter} />
                  </span>
                ) : null}
              </pre>
            ))
          ) : (
            <EmptyItems className="m-0">No logs to display</EmptyItems>
          )}
        </div>
      </div>
    </div>
  );
});
