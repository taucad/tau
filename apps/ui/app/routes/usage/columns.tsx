import type { ColumnDef, Row } from '@tanstack/react-table';
import type { ReactNode } from 'react';
import { format } from 'date-fns';
import { DataTableColumnHeader } from '#components/ui/data-table.js';
import { formatNumberAbbreviation } from '#utils/number.utils.js';
// eslint-disable-next-line @nx/enforce-module-boundaries -- this first-party usage surface owns the direct billing client contract
import { formatCreditAtomsDisplay } from '@taucad/billing';
import type { WireUsageEvent } from '@taucad/billing';
import { getUsageColor } from '#routes/usage/provider-colors.js';

/** Stable row identity used for sorting keys and the open detail row. */
export const usageEventId = (event: WireUsageEvent): string =>
  event.kind === 'base' ? event.baseTransactionId : event.transactionId;

/** Credits the account actually spent on this event; a correction keeps its negative sign. */
export const usageEventNetAtoms = (event: WireUsageEvent): bigint => -BigInt(event.accountDeltaCreditAtoms);

/** When the metered work happened; `undefined` when the range is not reported. */
export const usageEventTime = (event: WireUsageEvent): string | undefined => event.usageOccurredAt ?? undefined;

const notReported = <span className='text-sm text-muted-foreground'>Not reported</span>;

const tokenCell = (value: string | undefined): ReactNode =>
  value === undefined ? (
    notReported
  ) : (
    <span className='font-mono text-sm'>{formatNumberAbbreviation(Number(value))}</span>
  );

function ProviderBadge({ provider }: { readonly provider: string }): ReactNode {
  return (
    <span
      className='inline-flex items-center rounded-md px-2 py-1 text-xs font-medium text-white'
      style={{ backgroundColor: getUsageColor(provider) }}
    >
      {provider}
    </span>
  );
}

export const usageColumns: Array<ColumnDef<WireUsageEvent>> = [
  {
    id: 'time',
    accessorFn: (row) => usageEventTime(row) ?? '',
    header: ({ column }) => <DataTableColumnHeader column={column} title='Time' />,
    cell({ row }: { readonly row: Row<WireUsageEvent> }): ReactNode {
      const occurred = usageEventTime(row.original);
      return occurred === undefined ? (
        notReported
      ) : (
        <span className='font-mono text-sm'>{format(new Date(occurred), 'MMM d, yyyy HH:mm')}</span>
      );
    },
    enableSorting: true,
    enableHiding: true,
  },
  {
    id: 'model',
    accessorFn: (row) => row.model.displayName ?? row.model.id,
    header: ({ column }) => <DataTableColumnHeader column={column} title='Model' />,
    cell({ row }: { readonly row: Row<WireUsageEvent> }): ReactNode {
      const { model } = row.original;
      return (
        <div className='flex items-center gap-2'>
          {model.providerId === null ? undefined : <ProviderBadge provider={model.providerId} />}
          <span className='max-w-[180px] truncate text-sm'>{model.displayName ?? model.id}</span>
        </div>
      );
    },
    enableSorting: true,
    enableHiding: true,
  },
  {
    id: 'activity',
    accessorFn: (row) => row.activity.kind,
    header: ({ column }) => <DataTableColumnHeader column={column} title='Activity' />,
    cell({ row }: { readonly row: Row<WireUsageEvent> }): ReactNode {
      return <span className='text-sm'>{row.original.activity.kind}</span>;
    },
    enableSorting: true,
    enableHiding: true,
  },
  {
    id: 'status',
    accessorFn: (row) => (row.kind === 'base' ? row.executionStatus : 'correction'),
    header: ({ column }) => <DataTableColumnHeader column={column} title='Status' />,
    cell({ row }: { readonly row: Row<WireUsageEvent> }): ReactNode {
      const event = row.original;
      return (
        <span className='text-sm'>
          {event.kind === 'base' ? `${event.executionStatus} · ${event.customerState}` : 'correction'}
        </span>
      );
    },
    enableSorting: true,
    enableHiding: true,
  },
  {
    id: 'input',
    accessorFn: (row) => (row.kind === 'base' ? (row.tokens.inputTotal ?? '') : ''),
    header: ({ column }) => <DataTableColumnHeader column={column} title='Input' />,
    cell({ row }: { readonly row: Row<WireUsageEvent> }): ReactNode {
      return tokenCell(row.original.kind === 'base' ? (row.original.tokens.inputTotal ?? undefined) : undefined);
    },
    enableSorting: true,
    enableHiding: true,
  },
  {
    id: 'output',
    accessorFn: (row) => (row.kind === 'base' ? (row.tokens.output ?? '') : ''),
    header: ({ column }) => <DataTableColumnHeader column={column} title='Output' />,
    cell({ row }: { readonly row: Row<WireUsageEvent> }): ReactNode {
      return tokenCell(row.original.kind === 'base' ? (row.original.tokens.output ?? undefined) : undefined);
    },
    enableSorting: true,
    enableHiding: true,
  },
  {
    id: 'credits',
    accessorFn: (row) => Number(usageEventNetAtoms(row)),
    header: ({ column }) => <DataTableColumnHeader column={column} title='Credits' />,
    cell({ row }: { readonly row: Row<WireUsageEvent> }): ReactNode {
      return (
        <span className='font-mono text-sm font-medium'>
          {formatCreditAtomsDisplay(usageEventNetAtoms(row.original))}
        </span>
      );
    },
    enableSorting: true,
    enableHiding: false,
  },
];
