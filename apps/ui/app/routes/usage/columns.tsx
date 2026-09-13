import type { ColumnDef, Row } from '@tanstack/react-table';
import type { ReactNode } from 'react';
import { format } from 'date-fns';
import { Link } from 'react-router';
import { DataTableColumnHeader } from '#components/ui/data-table.js';
import { formatCurrency } from '#utils/currency.utils.js';
import { formatNumberAbbreviation } from '#utils/number.utils.js';
import type { UsageRecord } from '#hooks/use-all-usage.js';
import { getProviderColor } from '#routes/usage/provider-colors.js';

/**
 * Provider badge component with consistent hash-based coloring.
 */
function ProviderBadge({ provider }: { readonly provider: string }): ReactNode {
  const color = getProviderColor(provider);

  return (
    <span
      className='inline-flex items-center rounded-md px-2 py-1 text-xs font-medium text-white'
      style={{ backgroundColor: color }}
    >
      {provider}
    </span>
  );
}

export const usageColumns: Array<ColumnDef<UsageRecord>> = [
  {
    accessorKey: 'date',
    header: ({ column }) => <DataTableColumnHeader column={column} title='Date' />,
    cell({ row }: { readonly row: Row<UsageRecord> }): ReactNode {
      return <span className='font-mono text-sm'>{format(row.original.date, 'MMM d, yyyy HH:mm')}</span>;
    },
    sortingFn: 'datetime',
    enableSorting: true,
    enableHiding: true,
  },
  {
    accessorKey: 'projectName',
    header: ({ column }) => <DataTableColumnHeader column={column} title='Project' />,
    cell({ row }: { readonly row: Row<UsageRecord> }): ReactNode {
      return (
        <Link to={`/projects/${row.original.projectId}`} className='max-w-[200px] truncate hover:underline'>
          {row.original.projectName}
        </Link>
      );
    },
    enableSorting: true,
    enableHiding: true,
  },
  {
    accessorKey: 'modelName',
    header: ({ column }) => <DataTableColumnHeader column={column} title='Model' />,
    cell({ row }: { readonly row: Row<UsageRecord> }): ReactNode {
      return (
        <div className='flex items-center gap-2'>
          <ProviderBadge provider={row.original.provider} />
          <span className='max-w-[150px] truncate text-sm'>{row.original.modelName}</span>
        </div>
      );
    },
    enableSorting: true,
    enableHiding: true,
  },
  {
    accessorKey: 'inputTokens',
    header: ({ column }) => <DataTableColumnHeader column={column} title='Input' />,
    cell({ row }: { readonly row: Row<UsageRecord> }): ReactNode {
      return <span className='font-mono text-sm'>{formatNumberAbbreviation(row.original.inputTokens)}</span>;
    },
    enableSorting: true,
    enableHiding: true,
  },
  {
    accessorKey: 'outputTokens',
    header: ({ column }) => <DataTableColumnHeader column={column} title='Output' />,
    cell({ row }: { readonly row: Row<UsageRecord> }): ReactNode {
      return <span className='font-mono text-sm'>{formatNumberAbbreviation(row.original.outputTokens)}</span>;
    },
    enableSorting: true,
    enableHiding: true,
  },
  {
    id: 'cacheTokens',
    accessorFn: (row) => row.cacheReadTokens + row.cacheWriteTokens,
    header: ({ column }) => <DataTableColumnHeader column={column} title='Cache' />,
    cell({ row }: { readonly row: Row<UsageRecord> }): ReactNode {
      const cacheTokens = row.original.cacheReadTokens + row.original.cacheWriteTokens;
      if (cacheTokens === 0) {
        return <span className='text-sm text-muted-foreground/50'>—</span>;
      }

      return <span className='font-mono text-sm'>{formatNumberAbbreviation(cacheTokens)}</span>;
    },
    enableSorting: true,
    enableHiding: true,
  },
  {
    accessorKey: 'totalCost',
    header: ({ column }) => <DataTableColumnHeader column={column} title='Cost' />,
    cell({ row }: { readonly row: Row<UsageRecord> }): ReactNode {
      return (
        <span className='font-mono text-sm font-medium'>
          {formatCurrency(row.original.totalCost, { significantFigures: 2 })}
        </span>
      );
    },
    enableSorting: true,
    enableHiding: false,
  },
];
