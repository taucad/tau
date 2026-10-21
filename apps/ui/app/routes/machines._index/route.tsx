import { useDesktopScheme } from '#hooks/use-desktop-scheme.js';
import { useFeature } from '#flags/use-feature.js';
import { MachinesDisabled } from '#components/machines/machines-disabled.js';
import { useCookie } from '#hooks/use-cookie.js';
import { cookieName } from '#constants/cookie.constants.js';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@taucad/ui/components/select';
import { memo, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router';
import { Printer, RefreshCw } from 'lucide-react';
import type { ColumnDef } from '@tanstack/react-table';
import { cn } from '@taucad/ui/utils/cn';
import { getCoreRowModel, getPaginationRowModel, useReactTable } from '@tanstack/react-table';
import type { MachineClient, MachineDirectoryEntry } from '@taucad/runtime/machine';
import { Button } from '@taucad/ui/components/button';
import { SearchInput } from '@taucad/ui/components/search-input';
import { PanelEmptyState } from '@taucad/ui/components/panel-empty-state';
import { PageHeader } from '#components/layout/page-header.js';
import { DataTablePagination } from '#components/ui/data-table.js';
import { presentMachine } from '#components/machines/machine-presentation.js';
import { useMachineDirectory, useMachinesFacet } from '#hooks/use-machines.js';
import { useSearchParameter } from '#hooks/use-search-parameter.js';
import { useSettingsDialog } from '#hooks/use-settings-dialog.js';
import { searchParameterName } from '#constants/search-parameter.constants.js';
import { z } from 'zod';
import { stringParameter, enumParameter } from '#utils/search-parameter.codecs.js';
import { machineUrl } from '#utils/machine-url.utils.js';

export const meta = (): Array<{ title: string }> => [{ title: 'Machines · Tau' }];
const queryCodec = stringParameter();
const statusCodec = enumParameter(z.enum(['', 'ready', 'active', 'attention']), '');
const columns: Array<ColumnDef<MachineDirectoryEntry>> = [];
const MachineRow = memo(function MachineRow({
  entry,
  hostId,
}: {
  readonly entry: MachineDirectoryEntry;
  readonly hostId: string;
}): React.JSX.Element {
  const status = presentMachine(entry);
  const Icon = status.icon;
  return (
    <li className='border-b last:border-b-0'>
      <Link
        to={machineUrl({ hostId, machineId: entry.machineId })}
        className='flex min-w-0 flex-wrap items-center gap-3 rounded-md p-3 hover:bg-accent focus-visible:focus-outline'
      >
        <Printer aria-hidden className='size-5 shrink-0' />
        <div className='min-w-0 flex-1'>
          <h2 className='text-sm font-medium wrap-break-word'>{entry.name}</h2>
          <p className='text-xs text-muted-foreground'>{entry.descriptor.model}</p>
        </div>
        <span className='flex items-center gap-2 text-xs'>
          <Icon aria-hidden className={cn('size-4', status.iconClassName)} />
          {status.label}
        </span>
      </Link>
    </li>
  );
});
function ConnectedMachines({ client }: { readonly client: MachineClient }): React.JSX.Element {
  const { snapshot, error, refresh } = useMachineDirectory(client);
  const [, setSearchParameters] = useSearchParams();
  const [query, setQuery] = useSearchParameter(searchParameterName.query, queryCodec);
  const [status, setStatus] = useSearchParameter(searchParameterName.machineStatus, statusCodec);
  const [storedSize, setPageSize] = useCookie<number>(cookieName.machinePageSize, 20);
  const pageSize = [20, 50, 100].includes(storedSize) ? storedSize : 20;
  const filterKey = JSON.stringify([query, status]);
  const [page, setPage] = useState({ filterKey, pageIndex: 0 });
  const settings = useSettingsDialog();
  const rows = useMemo(
    () =>
      (snapshot?.entries ?? [])
        .filter((entry) =>
          `${entry.name} ${entry.descriptor.model}`.toLocaleLowerCase().includes(query.toLocaleLowerCase()),
        )
        .filter(
          (entry) =>
            status === '' ||
            (status === 'attention'
              ? entry.freshness === 'stale' ||
                entry.snapshot.connection !== 'connected' ||
                entry.snapshot.state.status === 'alarm'
              : status === 'active'
                ? entry.snapshot.state.status === 'active' || entry.snapshot.state.status === 'held'
                : entry.snapshot.state.status === 'ready'),
        )
        .toSorted((a, b) => a.name.localeCompare(b.name) || a.machineId.localeCompare(b.machineId)),
    [snapshot?.entries, query, status],
  );
  const pagination = {
    pageSize,
    pageIndex: Math.min(
      page.filterKey === filterKey ? page.pageIndex : 0,
      Math.max(0, Math.ceil(rows.length / pageSize) - 1),
    ),
  };
  const table = useReactTable({
    data: rows,
    columns,
    getCoreRowModel: getCoreRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    state: { pagination },
    onPaginationChange: (updater) => {
      const next = typeof updater === 'function' ? updater(pagination) : updater;
      setPage({ filterKey, pageIndex: next.pageIndex });
      setPageSize(next.pageSize);
    },
  });
  return (
    <div className='container mx-auto space-y-3 px-4 pt-5 pb-8'>
      <PageHeader
        title='Machines'
        count={snapshot?.entries.length}
        action={
          <Button
            onClick={() => {
              settings.open('machines');
            }}
          >
            Connect a machine
          </Button>
        }
      />
      <div className='flex flex-wrap items-center gap-2'>
        <SearchInput
          aria-label='Search machines'
          placeholder='Search machines…'
          value={query}
          onChange={(event) => {
            setQuery(event.target.value);
          }}
          onClear={() => {
            setQuery('');
          }}
        />
        <Select
          value={status || 'all'}
          onValueChange={(value) => {
            setStatus(statusCodec.parse(value));
          }}
        >
          <SelectTrigger aria-label='Filter machine status' className='w-40'>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value='all'>All statuses</SelectItem>
            <SelectItem value='ready'>Ready</SelectItem>
            <SelectItem value='active'>Active</SelectItem>
            <SelectItem value='attention'>Needs attention</SelectItem>
          </SelectContent>
        </Select>
        <Button variant='outline' onClick={refresh}>
          <RefreshCw aria-hidden />
          Refresh
        </Button>
      </div>
      {error ? (
        <p role='alert' className='text-sm'>
          Machine updates are unavailable. Check the host connection and retry.{' '}
          <Button size='sm' variant='outline' onClick={refresh}>
            Retry
          </Button>
        </p>
      ) : null}
      {snapshot === undefined ? (
        <p role='status' aria-busy='true'>
          Loading machines…
        </p>
      ) : (
        <>
          <p role='status' className='text-xs text-muted-foreground'>
            {rows.length} of {snapshot.entries.length} machines{query ? ' match' : ''}
          </p>
          {rows.length > 0 ? (
            <ul aria-label='Machines' className='divide-border'>
              {table.getRowModel().rows.map(({ original }) => (
                <MachineRow key={original.machineId} entry={original} hostId={snapshot.cursor.hostId} />
              ))}
            </ul>
          ) : (
            <PanelEmptyState
              icon={Printer}
              title={snapshot.entries.length === 0 ? 'No machines connected' : 'No matching machines'}
              description={
                snapshot.entries.length === 0
                  ? 'Connect a machine to monitor it and send jobs from your projects.'
                  : 'Try another name or clear the search.'
              }
            >
              <Button
                variant='outline'
                onClick={() => {
                  if (snapshot.entries.length === 0) {
                    settings.open('machines');
                  } else {
                    setSearchParameters(
                      (previous) => {
                        const next = new URLSearchParams(previous);
                        next.delete(searchParameterName.query);
                        next.delete(searchParameterName.machineStatus);
                        return next;
                      },
                      { replace: true },
                    );
                  }
                }}
              >
                {snapshot.entries.length === 0 ? 'Connect a machine' : 'Clear search'}
              </Button>
            </PanelEmptyState>
          )}
          {rows.length > 0 ? <DataTablePagination table={table} itemName='machine' withSelectedCount={false} /> : null}
        </>
      )}
    </div>
  );
}
export default function MachinesRoute(): React.JSX.Element {
  const scheme = useDesktopScheme();
  const machines = useMachinesFacet();
  const enabled = useFeature('machines');
  if (!enabled) {
    return <MachinesDisabled />;
  }
  return machines.available ? (
    <ConnectedMachines client={machines} />
  ) : (
    <div className='container mx-auto space-y-3 px-4 pt-5 pb-8'>
      <PageHeader title='Machines' />
      <PanelEmptyState
        icon={Printer}
        title={machines.reason === 'not-granted' ? 'Machine access is not granted' : 'Open Machines in Tau desktop'}
        description='The desktop app connects to machines on this computer. Your project files stay available here.'
      >
        <Button asChild>
          <a href={`${scheme}://machines`}>Open Tau desktop</a>
        </Button>
      </PanelEmptyState>
    </div>
  );
}
