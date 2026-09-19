import { useMemo, useState } from 'react';
import { getCoreRowModel, getFilteredRowModel, getSortedRowModel, useReactTable } from '@tanstack/react-table';
import type { SortingState, VisibilityState } from '@tanstack/react-table';
import {
  DataTable,
  DataTableSearch,
  DataTableSortingDropdown,
  DataTableColumnVisibilityDropdown,
} from '#components/ui/data-table.js';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@taucad/ui/components/card';
import { formatCreditAtoms } from '@taucad/billing';
import type { WireUsageEvent } from '@taucad/billing';
import { usageColumns, usageEventId, usageEventNetAtoms } from '#routes/usage/columns.js';
import { chatLabel, projectLabel } from '#routes/usage/activity-names.js';
import { useChatName } from '#routes/usage/use-chat-name.js';

const tableHooks = { useReactTable };

type UsageTableProps = {
  readonly rows: WireUsageEvent[];
  /** True when the server has further pages for this range. */
  readonly hasMore: boolean;
  /** Project id to project name, so a receipt names its project instead of identifying it. */
  readonly projectNames: ReadonlyMap<string, string>;
  readonly title?: string;
  readonly description?: string;
  /** Row whose credit explanation is open; owned by the page so a refresh keeps it. */
  readonly openEventId: string | undefined;
  readonly onOpenEventChange: (id: string | undefined) => void;
};

function DetailRow({
  label,
  value,
  isPending,
}: {
  readonly label: string;
  readonly value: string;
  /** Present when this row resolves after the panel opens; the live region then exists before its value changes. */
  readonly isPending?: boolean;
}): React.JSX.Element {
  return (
    <div className='flex justify-between gap-4'>
      <dt className='text-muted-foreground'>{label}</dt>
      <dd className='font-mono'>
        {isPending === undefined ? (
          value
        ) : (
          <span role='status' aria-busy={isPending}>
            {value}
          </span>
        )}
      </dd>
    </div>
  );
}

const tokenValue = (value: string | undefined): string => value ?? 'Not reported';

/** The per-action credit explanation: exact credits, tokens and the pinned public rates. */
function UsageEventDetail({
  event,
  projectNames,
}: {
  readonly event: WireUsageEvent;
  readonly projectNames: ReadonlyMap<string, string>;
}): React.JSX.Element {
  /* Mounted only for the row a reader opened, so no chat storage is touched
     until then — the page, prerendered shell included, still renders with no
     local source behind it. */
  const chatName = useChatName(event.activity.projectHint, event.activity.chatHint);
  return (
    <div className='grid gap-4 rounded-md border p-4 text-sm md:grid-cols-3' data-testid='usage-event-detail'>
      <dl className='flex flex-col gap-1'>
        <DetailRow label='Credits' value={`${formatCreditAtoms(usageEventNetAtoms(event))} credits`} />
        <DetailRow label='Model' value={event.model.id} />
        <DetailRow label='Activity' value={event.activity.kind} />
        <DetailRow label='Project' value={projectLabel(event.activity.projectHint, projectNames)} />
        <DetailRow
          label='Chat'
          value={chatLabel(event.activity.chatHint, chatName)}
          isPending={event.activity.chatHint === null ? undefined : chatName === undefined}
        />
        <DetailRow label='Usage time' value={event.usageOccurredAt ?? 'Not reported'} />
        <DetailRow label='Range timing' value={event.timingStatus} />
      </dl>
      {event.kind === 'base' ? (
        <>
          <dl className='flex flex-col gap-1'>
            <DetailRow label='Status' value={`${event.executionStatus} · ${event.customerState}`} />
            <DetailRow label='Authorized maximum' value={formatCreditAtoms(BigInt(event.authorizedMaxCreditAtoms))} />
            <DetailRow label='Charged' value={formatCreditAtoms(BigInt(event.chargedCreditAtoms))} />
            <DetailRow label='Token evidence' value={event.tokens.status} />
            <DetailRow label='Uncached input' value={tokenValue(event.tokens.uncachedInput ?? undefined)} />
            <DetailRow label='Cache read' value={tokenValue(event.tokens.cacheRead ?? undefined)} />
            <DetailRow label='Cache write' value={tokenValue(event.tokens.cacheWrite ?? undefined)} />
            <DetailRow label='Output' value={tokenValue(event.tokens.output ?? undefined)} />
            <DetailRow label='Reasoning (of output)' value={tokenValue(event.tokens.reasoning ?? undefined)} />
          </dl>
          <dl className='flex flex-col gap-1'>
            {event.meterItems.length === 0 ? (
              <DetailRow label='Rates' value='Not reported' />
            ) : (
              event.meterItems.map((item) => (
                <DetailRow
                  key={`${item.dimension}:${item.kind}:${item.tier ?? ''}`}
                  label={`${item.dimension}${item.tier === undefined ? '' : ` (${item.tier})`}`}
                  value={`${tokenValue(item.quantity ?? undefined)} × ${item.rate.numeratorCreditAtoms}/${item.rate.denominatorUnits} atoms`}
                />
              ))
            )}
          </dl>
        </>
      ) : (
        <dl className='flex flex-col gap-1'>
          <DetailRow label='Correction' value={event.reason} />
          <DetailRow label='Corrected at' value={event.correctedAt} />
          <DetailRow label='Corrects' value={event.baseTransactionId} />
        </dl>
      )}
    </div>
  );
}

/**
 * Server-owned activity rows. Selecting a row opens its credit explanation;
 * the table never sums rows into a range total.
 */
export function UsageTable({
  rows,
  hasMore,
  projectNames,
  title = 'Activity',
  description,
  openEventId,
  onOpenEventChange,
}: UsageTableProps): React.JSX.Element {
  // TanStack keeps its state on a stable `table` object, so the React Compiler would cache these reads forever.
  'use no memo';

  const [sorting, setSorting] = useState<SortingState>([{ id: 'time', desc: true }]);
  const [columnVisibility, setColumnVisibility] = useState<VisibilityState>({});
  const [globalFilter, setGlobalFilter] = useState('');

  const columns = useMemo(() => usageColumns, []);
  const openEvent = rows.find((row) => usageEventId(row) === openEventId);

  const table = tableHooks.useReactTable({
    data: rows,
    columns,
    getRowId: usageEventId,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    onSortingChange: setSorting,
    onColumnVisibilityChange: setColumnVisibility,
    onGlobalFilterChange: setGlobalFilter,
    state: {
      sorting,
      columnVisibility,
      globalFilter,
    },
  });

  return (
    <Card>
      <CardHeader>
        <div className='flex items-center justify-between'>
          <div>
            <CardTitle>{title}</CardTitle>
            {description ? <CardDescription className='mt-1'>{description}</CardDescription> : undefined}
          </div>
          <div className='flex items-center gap-2'>
            <DataTableSearch table={table} placeholder='Search activity...' containerClassName='max-w-sm' />
            <DataTableSortingDropdown table={table} />
            <DataTableColumnVisibilityDropdown table={table} />
          </div>
        </div>
      </CardHeader>
      <CardContent className='flex flex-col gap-3'>
        {/* ponytail: one server page is at most 200 rows, so the plain table is enough — virtualize if the page size grows. */}
        <DataTable
          table={table}
          columns={columns}
          emptyMessage='No Tau-funded actions in this range.'
          onRowClick={(row) => {
            const id = usageEventId(row);
            onOpenEventChange(id === openEventId ? undefined : id);
          }}
        />
        {openEvent ? <UsageEventDetail event={openEvent} projectNames={projectNames} /> : undefined}
        <p className='text-sm text-muted-foreground'>
          {hasMore
            ? `Showing the first ${rows.length} actions of this range; the totals above cover the whole range.`
            : `Showing all ${rows.length} actions in this range.`}
        </p>
      </CardContent>
    </Card>
  );
}
