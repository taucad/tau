import { useState, useMemo } from 'react';
import { getCoreRowModel, getFilteredRowModel, getSortedRowModel, useReactTable } from '@tanstack/react-table';
import type { SortingState, VisibilityState } from '@tanstack/react-table';
import {
  DataTableVirtualized,
  DataTableSearch,
  DataTableSortingDropdown,
  DataTableColumnVisibilityDropdown,
} from '#components/ui/data-table.js';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@taucad/ui/components/card';
import type { UsageRecord } from '@taucad/billing/usage';
import { usageColumns } from '#routes/usage/columns.js';

const tableHooks = { useReactTable };

type UsageTableProps = {
  readonly records: UsageRecord[];
  readonly title?: string;
  readonly description?: string;
  readonly height?: number;
};

export function UsageTable({
  records,
  title = 'Usage Details',
  description,
  height = 400,
}: UsageTableProps): React.JSX.Element {
  const [sorting, setSorting] = useState<SortingState>([{ id: 'date', desc: true }]);
  const [columnVisibility, setColumnVisibility] = useState<VisibilityState>({});
  const [globalFilter, setGlobalFilter] = useState('');

  const columns = useMemo(() => usageColumns, []);

  const table = tableHooks.useReactTable({
    data: records,
    columns,
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
            <DataTableSearch table={table} placeholder='Search usage...' containerClassName='max-w-sm' />
            <DataTableSortingDropdown table={table} />
            <DataTableColumnVisibilityDropdown table={table} />
          </div>
        </div>
      </CardHeader>
      <CardContent>
        <DataTableVirtualized table={table} columns={columns} emptyMessage='No usage data found.' height={height} />
        <div className='mt-2 text-sm text-muted-foreground'>
          Showing {table.getFilteredRowModel().rows.length} of {records.length} records
        </div>
      </CardContent>
    </Card>
  );
}
