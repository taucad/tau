// @vitest-environment jsdom
import { useState } from 'react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { getCoreRowModel, getPaginationRowModel, useReactTable } from '@tanstack/react-table';
import type { PaginationState } from '@tanstack/react-table';
import { describe, expect, it } from 'vitest';
import { DataTablePagination } from '#components/ui/data-table.js';

const rows = Array.from({ length: 31 }, (_, index) => ({ id: String(index) }));

function Harness({ withSelectedCount }: { readonly withSelectedCount?: boolean }): React.JSX.Element {
  const [pagination, setPagination] = useState<PaginationState>({ pageIndex: 0, pageSize: 20 });
  const table = useReactTable({
    data: rows,
    columns: [{ accessorKey: 'id' }],
    state: { pagination },
    onPaginationChange: setPagination,
    getCoreRowModel: getCoreRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
  });

  return (
    <DataTablePagination
      table={table}
      pageSizeOptions={[20, 50, 100]}
      withSelectedCount={withSelectedCount}
      itemName='example'
    />
  );
}

describe('DataTablePagination', () => {
  it('should keep the control names that consumers and assistive technology rely on', () => {
    render(<Harness />);

    expect(screen.getByRole('combobox', { name: 'Items per page' })).toBeInTheDocument();
    for (const name of ['Go to first page', 'Go to previous page', 'Go to next page', 'Go to last page']) {
      expect(screen.getByRole('button', { name })).toBeInTheDocument();
    }
  });

  it('should summarise the visible range when there is no selection count', async () => {
    const user = userEvent.setup();
    render(<Harness withSelectedCount={false} />);

    expect(screen.getByText('1–20 of 31 examples')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Go to next page' }));
    expect(screen.getByText('21–31 of 31 examples')).toBeInTheDocument();
    expect(screen.getByText('Page 2 of 2')).toBeInTheDocument();
  });

  it('should keep the selection count when it is requested', () => {
    render(<Harness />);

    expect(screen.getByText('0 of 31 example(s) selected.')).toBeInTheDocument();
  });

  it('should wrap its controls and size them from the Button and Select owners', () => {
    render(<Harness />);

    // Jsdom has no layout; the real-Chromium 390 px overflow check lives with the community canvas.
    const next = screen.getByRole('button', { name: 'Go to next page' });
    expect(next).toHaveClass('size-7');
    expect(next).not.toHaveClass('w-8');
    expect(next.parentElement?.parentElement).toHaveClass('flex-wrap');
    expect(next.parentElement?.parentElement?.parentElement).toHaveClass('flex-wrap');
    expect(screen.getByRole('combobox', { name: 'Items per page' })).not.toHaveClass('w-[70px]');
    expect(screen.getByText('Items per page')).toHaveClass('hidden', 'sm:block');
  });
});
