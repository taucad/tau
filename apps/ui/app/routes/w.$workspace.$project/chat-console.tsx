import { ChevronsDown, Filter, Settings, Trash } from 'lucide-react';
import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useSelector } from '@xstate/react';
import type { PaneviewApi, PaneviewPanelApi } from 'dockview-react';
import { PaneviewReact } from 'dockview-react';
import type { VirtuosoHandle } from 'react-virtuoso';
import { Virtuoso } from 'react-virtuoso';
import type { LogEntry, LogLevel, LogOrigin } from '@taucad/types';
import { logLevels } from '@taucad/types/constants';
import { Badge } from '#components/ui/badge.js';
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '#components/ui/dropdown-menu.js';
import { EmptyItems } from '#components/ui/empty-items.js';
import { PaneButton } from '#components/ui/pane-button.js';
import { Tooltip, TooltipContent, TooltipTrigger } from '#components/ui/tooltip.js';
import { SearchInput } from '#components/search-input.js';
import { HighlightText } from '#components/highlight-text.js';
import {
  PaneviewHeader,
  PaneviewHeaderControls,
  paneviewAttachedSurfaceStyleOverrides,
  paneviewHeaderSize,
} from '#components/panes/paneview-header.js';
import { cookieName } from '#constants/cookie.constants.js';
import { useCookie } from '#hooks/use-cookie.js';
import { useProject } from '#hooks/use-project.js';
import { sortGeometryUnitEntries } from '#routes/w.$workspace.$project/geometry-unit.utils.js';
import {
  getInitialPanelOptions,
  usePaneviewPersistence,
} from '#routes/w.$workspace.$project/use-chat-interface-state.js';
import { stringToColor } from '#utils/color.utils.js';
import { cn } from '#utils/ui.utils.js';

const defaultLogLevels: Record<LogLevel, boolean> = {
  error: true,
  warn: true,
  info: true,
  debug: false,
  trace: false,
};

const defaultDisplayConfig = {
  showTimestamp: true,
  showComponent: false,
  showData: true,
};

type DisplayConfig = typeof defaultDisplayConfig;
type ConsoleLog = LogEntry & { infoIndex: number };
type ConsolePanelParams = {
  entryPath: string;
  logs: ConsoleLog[];
  totalCount: number;
  query: string;
  displayConfig: DisplayConfig;
};

const getComponentColor = (component: string | undefined): string =>
  component ? stringToColor(component, 0.5) : 'var(--muted-foreground)';

const ComponentBadge = ({ origin, searchTerm }: { readonly origin?: LogOrigin; readonly searchTerm?: string }) => {
  if (!origin?.component) {
    return;
  }

  const backgroundColor = getComponentColor(origin.component);
  return (
    <Badge
      className='rounded-xs px-0.5 py-0 text-xs font-normal'
      variant='outline'
      style={{ borderColor: backgroundColor, backgroundColor }}
    >
      <span className='inline-block whitespace-nowrap'>
        <HighlightText text={origin.component} searchTerm={searchTerm} />
      </span>
    </Badge>
  );
};

const getBadgeColor = (level: LogLevel): string => {
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
  }
};

const VerbosityBadge = ({ level }: { readonly level: LogLevel }): React.JSX.Element => (
  <Badge
    className={cn(
      'flex w-12 items-center justify-center p-0 font-mono text-xs font-normal uppercase hover:bg-initial',
      getBadgeColor(level),
    )}
  >
    {level}
  </Badge>
);

const formatTimestamp = (timestamp: number): string =>
  new Date(timestamp).toLocaleTimeString(undefined, {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    fractionalSecondDigits: 3,
  });

const ConsoleLogRow = ({
  log,
  query,
  displayConfig,
}: {
  readonly log: ConsoleLog;
  readonly query: string;
  readonly displayConfig: DisplayConfig;
}): React.JSX.Element => (
  <pre
    data-console-log-row
    className={cn('group/log mx-2 rounded p-1 font-mono text-xs text-wrap', {
      'bg-destructive/10 text-destructive hover:bg-destructive/20': log.level === logLevels.error,
      'bg-warning/10 text-warning hover:bg-warning/20': log.level === logLevels.warn,
      'hover:bg-neutral/20': log.level === logLevels.info,
      'bg-neutral/10': log.level === logLevels.info && log.infoIndex % 2 !== 0,
      'bg-stable/10 text-stable hover:bg-stable/20': log.level === logLevels.debug,
      'bg-feature/10 text-feature hover:bg-feature/20': log.level === logLevels.trace,
    })}
  >
    <span className='sr-only'>{log.level} log: </span>
    <span className='flex flex-wrap items-baseline gap-2'>
      {displayConfig.showTimestamp ? (
        <span className='shrink-0 opacity-60'>
          [<HighlightText text={formatTimestamp(log.timestamp)} searchTerm={query} />]
        </span>
      ) : null}
      {displayConfig.showComponent ? <ComponentBadge origin={log.origin} searchTerm={query} /> : null}
      <span className='mr-auto break-all'>
        <HighlightText text={log.message} searchTerm={query} />
      </span>
    </span>
    {log.data !== undefined && displayConfig.showData ? (
      <span className='block break-all'>
        <HighlightText text={JSON.stringify(log.data, undefined, 2)} searchTerm={query} />
      </span>
    ) : null}
  </pre>
);

const ConsoleLogListFooter = (): React.JSX.Element => (
  <div data-slot='console-scroll-footer' className='h-2' aria-hidden />
);
const virtuosoComponents = { Footer: ConsoleLogListFooter };

const ConsolePanelBody = ({ params }: { readonly params: ConsolePanelParams }): React.JSX.Element => {
  const virtuosoRef = useRef<VirtuosoHandle>(null);
  const [atBottom, setAtBottom] = useState(true);
  const followOutput = useCallback((isAtBottom: boolean): 'smooth' | false => (isAtBottom ? 'smooth' : false), []);
  const renderLog = useCallback(
    (_index: number, log: ConsoleLog) => (
      <ConsoleLogRow log={log} query={params.query} displayConfig={params.displayConfig} />
    ),
    [params.displayConfig, params.query],
  );

  let content: React.ReactNode;
  if (params.logs.length > 0) {
    content = (
      <>
        <Virtuoso
          ref={virtuosoRef}
          role='log'
          aria-label={`Console logs for ${params.entryPath}`}
          data-slot='console-unit-scroller'
          className='size-full scroll-shadows-y [--scroll-fade-end:transparent] [--scroll-fade-size:28px]'
          components={virtuosoComponents}
          data={params.logs}
          initialTopMostItemIndex={{ index: 'LAST', align: 'end' }}
          followOutput={followOutput}
          atBottomStateChange={setAtBottom}
          itemContent={renderLog}
        />
        {!atBottom ? (
          <PaneButton
            className='absolute right-4 bottom-4 z-10 size-7 border border-border bg-card shadow-sm'
            tooltip='Scroll to latest logs'
            aria-label='Scroll to latest logs'
            onClick={() => {
              virtuosoRef.current?.scrollToIndex({ index: 'LAST', align: 'end', behavior: 'smooth' });
            }}
          >
            <ChevronsDown />
          </PaneButton>
        ) : null}
      </>
    );
  } else {
    content = (
      <EmptyItems className='m-2 h-[calc(100%-1rem)]'>
        {params.totalCount === 0 ? 'No logs yet.' : 'No matching logs.'}
      </EmptyItems>
    );
  }

  return (
    <div
      data-slot='console-unit-surface'
      className='relative h-full overflow-hidden rounded-b-xl border border-border bg-card'
    >
      {content}
    </div>
  );
};

const ConsolePanelHeader = ({
  api,
  params,
}: {
  readonly api: PaneviewPanelApi;
  readonly params: ConsolePanelParams;
}): React.JSX.Element => (
  <PaneviewHeader api={api} title={params.entryPath}>
    <PaneviewHeaderControls>
      <span className='px-1 text-xs text-muted-foreground tabular-nums'>({params.logs.length})</span>
    </PaneviewHeaderControls>
  </PaneviewHeader>
);

const paneviewComponents = { consolePanel: ConsolePanelBody };
const paneviewHeaderComponents = { consoleHeader: ConsolePanelHeader };

const ConsolePaneview = ({
  entryPaths,
  mainEntryPath,
  projections,
  query,
  displayConfig,
}: {
  readonly entryPaths: string[];
  readonly mainEntryPath: string;
  readonly projections: Map<string, { logs: ConsoleLog[]; totalCount: number }>;
  readonly query: string;
  readonly displayConfig: DisplayConfig;
}): React.JSX.Element => {
  const { savedState, connectApi } = usePaneviewPersistence('consolePaneview');
  const paneviewApiRef = useRef<PaneviewApi | undefined>(undefined);
  const paneviewKey = entryPaths.join('\0');

  const getPanelParams = useCallback(
    (entryPath: string): ConsolePanelParams => {
      const projection = projections.get(entryPath);
      return {
        entryPath,
        logs: projection?.logs ?? [],
        totalCount: projection?.totalCount ?? 0,
        query,
        displayConfig,
      };
    },
    [displayConfig, projections, query],
  );

  const handleReady = useCallback(
    (event: { api: PaneviewApi }) => {
      paneviewApiRef.current = event.api;
      connectApi(event.api);

      for (const entryPath of entryPaths) {
        const isMain = entryPath === mainEntryPath;
        const initial = getInitialPanelOptions(savedState, entryPath, {
          isExpanded: isMain,
          size: isMain ? 200 : undefined,
        });
        event.api.addPanel({
          id: entryPath,
          title: entryPath,
          component: 'consolePanel',
          headerComponent: 'consoleHeader',
          headerSize: paneviewHeaderSize,
          isExpanded: initial.isExpanded,
          minimumBodySize: 80,
          size: initial.size,
          params: getPanelParams(entryPath),
        });
      }
    },
    [connectApi, entryPaths, getPanelParams, mainEntryPath, savedState],
  );

  useEffect(() => {
    const api = paneviewApiRef.current;
    if (!api) {
      return;
    }
    for (const entryPath of entryPaths) {
      api.getPanel(entryPath)?.api.updateParameters(getPanelParams(entryPath));
    }
  }, [entryPaths, getPanelParams]);

  return (
    <PaneviewReact
      key={paneviewKey}
      className={paneviewAttachedSurfaceStyleOverrides}
      components={paneviewComponents}
      headerComponents={paneviewHeaderComponents}
      onReady={handleReady}
    />
  );
};

export const ChatConsole = memo(function ChatConsole(): React.JSX.Element {
  const { geometryUnits, logRef, mainEntryPath } = useProject();
  const [query, setQuery] = useState('');
  const [enabledLevels, setEnabledLevels] = useCookie(cookieName.consoleLogLevel, defaultLogLevels);
  const [displayConfig, setDisplayConfig] = useCookie(cookieName.consoleDisplayConfig, defaultDisplayConfig);
  const logVersion = useSelector(logRef, (state) => state.context.logVersion);
  const allLogs = useMemo(
    () => logRef.getSnapshot().context.logBuffer.toArray(),
    // oxlint-disable-next-line react-hooks/exhaustive-deps -- logVersion is the mutable buffer's reactive version
    [logRef, logVersion],
  );
  const entries = useMemo(() => [...geometryUnits.entries()], [geometryUnits]);
  const entryPaths = useMemo(
    () => sortGeometryUnitEntries(entries, mainEntryPath).map(([entryPath]) => entryPath),
    [entries, mainEntryPath],
  );
  const projections = useMemo(() => {
    const result = new Map<string, { logs: ConsoleLog[]; totalCount: number }>(
      entryPaths.map((entryPath) => [entryPath, { logs: [], totalCount: 0 }]),
    );
    const normalizedQuery = query.toLowerCase();

    for (const log of allLogs) {
      const projection = log.origin?.file ? result.get(log.origin.file) : undefined;
      if (!projection) {
        continue;
      }
      projection.totalCount += 1;
      const matchesQuery =
        normalizedQuery.length === 0 ||
        log.message.toLowerCase().includes(normalizedQuery) ||
        (log.origin?.component?.toLowerCase().includes(normalizedQuery) ?? false);
      if (enabledLevels[log.level] && matchesQuery) {
        projection.logs.push({ ...log, infoIndex: 0 });
      }
    }

    for (const projection of result.values()) {
      projection.logs.reverse();
      projection.logs.forEach((log, index) => {
        log.infoIndex = index;
      });
    }
    return result;
  }, [allLogs, enabledLevels, entryPaths, query]);

  return (
    <div data-slot='console-panel-body' className='flex size-full min-h-0 flex-col overflow-hidden bg-sidebar'>
      <div
        data-slot='console-filter'
        className='flex shrink-0 items-center gap-1 bg-sidebar px-2 pt-2 text-muted-foreground'
      >
        <SearchInput
          aria-label='Filter logs'
          autoComplete='off'
          className='h-7 min-w-0 flex-1 bg-background'
          placeholder='Filter logs...'
          value={query}
          onChange={(event) => {
            setQuery(event.target.value);
          }}
          onClear={() => {
            setQuery('');
          }}
        />

        <DropdownMenu modal={false}>
          <Tooltip>
            <TooltipTrigger asChild>
              <DropdownMenuTrigger asChild>
                <PaneButton
                  className='size-7 data-[state=open]:bg-muted-foreground/15 data-[state=open]:text-foreground'
                  aria-label='Filter by log level'
                >
                  <Filter />
                </PaneButton>
              </DropdownMenuTrigger>
            </TooltipTrigger>
            <TooltipContent>Filter by log level</TooltipContent>
          </Tooltip>
          <DropdownMenuContent align='end'>
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
                  setEnabledLevels((previous) => ({ ...previous, [level]: checked }));
                }}
              >
                <VerbosityBadge level={level} />
              </DropdownMenuCheckboxItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>

        <DropdownMenu modal={false}>
          <Tooltip>
            <TooltipTrigger asChild>
              <DropdownMenuTrigger asChild>
                <PaneButton
                  className='size-7 data-[state=open]:bg-muted-foreground/15 data-[state=open]:text-foreground'
                  aria-label='Console settings'
                >
                  <Settings />
                </PaneButton>
              </DropdownMenuTrigger>
            </TooltipTrigger>
            <TooltipContent>Console settings</TooltipContent>
          </Tooltip>
          <DropdownMenuContent align='end' className='w-56'>
            <DropdownMenuLabel>Display Options</DropdownMenuLabel>
            <DropdownMenuSeparator />
            {(Object.keys(defaultDisplayConfig) as Array<keyof DisplayConfig>).map((key) => (
              <DropdownMenuCheckboxItem
                key={key}
                checked={displayConfig[key]}
                onSelect={(event) => {
                  event.preventDefault();
                }}
                onCheckedChange={(checked) => {
                  setDisplayConfig((previous) => ({ ...previous, [key]: checked }));
                }}
              >
                {key.replaceAll(/([A-Z])/g, ' $1').replace(/^./, (value) => value.toUpperCase())}
              </DropdownMenuCheckboxItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>

        <PaneButton
          className='size-7'
          tooltip='Clear logs'
          aria-label='Clear logs'
          disabled={allLogs.length === 0}
          onClick={() => {
            logRef.send({ type: 'clearLogs' });
          }}
        >
          <Trash />
        </PaneButton>
      </div>

      <div className='min-h-0 flex-1 overflow-hidden'>
        {entryPaths.length === 0 ? (
          <EmptyItems className='bg-card'>No geometry units.</EmptyItems>
        ) : (
          <ConsolePaneview
            entryPaths={entryPaths}
            mainEntryPath={mainEntryPath}
            projections={projections}
            query={query}
            displayConfig={displayConfig}
          />
        )}
      </div>
    </div>
  );
});
