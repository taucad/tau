import { ListFilter, Terminal } from 'lucide-react';
import { memo, useCallback, useMemo, useState } from 'react';
import { Virtuoso } from 'react-virtuoso';
import { useSelector } from '@xstate/react';
import type { LogEntry } from '@taucad/types';
import { SearchInput } from '#components/search-input.js';
import { HighlightText } from '#components/highlight-text.js';
import { PaneButton } from '#components/ui/pane-button.js';
import { cn } from '#utils/ui.utils.js';
import { useProject } from '#hooks/use-project.js';
import { logLevelColors } from '#routes/w.$workspace.$project/chat-kernel-types.js';
import { formatTimestamp } from '#routes/w.$workspace.$project/chat-kernel-utils.js';

function VirtualizedLogList({
  filteredLogs,
  filter,
}: {
  readonly filteredLogs: LogEntry[];
  readonly filter: string;
}): React.JSX.Element {
  const renderLogItem = useCallback(
    (index: number) => {
      const log = filteredLogs[index];
      if (!log) {
        return undefined;
      }

      return (
        <div className='group flex items-start gap-1.5 py-[3px] pr-2 text-xs hover:bg-muted/30'>
          <span className='shrink-0 font-mono text-[10px] leading-4 text-muted-foreground/40'>
            {formatTimestamp(log.timestamp)}
          </span>
          <span className={cn('flex-1 leading-4 break-all', logLevelColors[log.level] ?? 'text-foreground')}>
            <HighlightText text={log.message} searchTerm={filter} />
          </span>
        </div>
      );
    },
    [filteredLogs, filter],
  );

  return (
    <Virtuoso
      totalCount={filteredLogs.length}
      itemContent={renderLogItem}
      style={{ height: Math.min(192, filteredLogs.length * 22) }}
    />
  );
}

export const GeometryUnitLogs = memo(function GeometryUnitLogs({
  entryPath,
}: {
  readonly entryPath: string;
}): React.JSX.Element {
  const { logRef } = useProject();
  const logVersion = useSelector(logRef, (state) => state.context.logVersion);
  const [filter, setFilter] = useState('');
  const [isFilterVisible, setIsFilterVisible] = useState(false);

  const cuLogs = useMemo(() => {
    const all = logRef.getSnapshot().context.logBuffer.toArray();
    return all.filter((log: LogEntry) => log.origin?.file === entryPath);
    // oxlint-disable-next-line react-hooks/exhaustive-deps -- logVersion tracks buffer mutations
  }, [logRef, logVersion, entryPath]);

  const filteredLogs = useMemo(() => {
    if (!filter) {
      return cuLogs;
    }

    const filterLower = filter.toLowerCase();
    return cuLogs.filter((log: LogEntry) => {
      const messageMatch = log.message.toLowerCase().includes(filterLower);
      const componentMatch = log.origin?.component?.toLowerCase().includes(filterLower) ?? false;
      return messageMatch || componentMatch;
    });
  }, [cuLogs, filter]);

  const handleFilterChange = useCallback((event: React.ChangeEvent<HTMLInputElement>) => {
    setFilter(event.target.value);
  }, []);

  const handleClearFilter = useCallback(() => {
    setFilter('');
  }, []);

  const toggleFilter = useCallback(() => {
    setIsFilterVisible((previous) => {
      if (previous) {
        setFilter('');
      }

      return !previous;
    });
  }, []);

  return (
    <div className='flex flex-col gap-1 p-2'>
      <div className='flex items-center justify-between'>
        <div className='flex items-center gap-1.5'>
          <Terminal className='size-3 shrink-0 text-muted-foreground' />
          <span className='text-xs font-medium tracking-wider text-muted-foreground uppercase'>Console</span>
          {cuLogs.length > 0 ? (
            <span className='ml-0.5 text-[10px] text-muted-foreground/50 tabular-nums'>{cuLogs.length}</span>
          ) : undefined}
        </div>
        <PaneButton
          tooltip='Filter logs'
          className={cn('size-5', isFilterVisible && 'text-primary')}
          onClick={toggleFilter}
        >
          <ListFilter className='size-3' />
        </PaneButton>
      </div>

      {isFilterVisible ? (
        <SearchInput
          autoComplete='off'
          className='h-6 w-full bg-background text-xs'
          placeholder='Filter logs...'
          value={filter}
          onChange={handleFilterChange}
          onClear={handleClearFilter}
        />
      ) : undefined}

      {filteredLogs.length > 0 ? (
        <VirtualizedLogList filteredLogs={filteredLogs} filter={filter} />
      ) : (
        <p className='py-2 text-center text-[11px] text-muted-foreground/60'>
          {cuLogs.length > 0 ? 'No matching logs.' : 'No logs yet.'}
        </p>
      )}
    </div>
  );
});
