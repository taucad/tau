import * as React from 'react';
import { cn } from '~/utils/ui.js';

function Table({ className, ...properties }: React.ComponentProps<'table'>): React.JSX.Element {
  return (
    <div data-slot="table-container" className="relative w-full overflow-x-auto">
      <table data-slot="table" className={cn('w-full caption-bottom text-sm', className)} {...properties} />
    </div>
  );
}

function TableHeader({ className, ...properties }: React.ComponentProps<'thead'>): React.JSX.Element {
  return <thead data-slot="table-header" className={cn('[&_tr]:border-b', className)} {...properties} />;
}

function TableBody({ className, ...properties }: React.ComponentProps<'tbody'>): React.JSX.Element {
  return <tbody data-slot="table-body" className={cn('[&_tr:last-child]:border-0', className)} {...properties} />;
}

function TableFooter({ className, ...properties }: React.ComponentProps<'tfoot'>): React.JSX.Element {
  return (
    <tfoot
      data-slot="table-footer"
      className={cn('border-t bg-muted/50 font-medium [&>tr]:last:border-b-0', className)}
      {...properties}
    />
  );
}

function TableRow({ className, ...properties }: React.ComponentProps<'tr'>): React.JSX.Element {
  return (
    <tr
      data-slot="table-row"
      className={cn('border-b transition-colors hover:bg-muted/50 data-[state=selected]:bg-muted', className)}
      {...properties}
    />
  );
}

function TableHead({ className, ...properties }: React.ComponentProps<'th'>): React.JSX.Element {
  return (
    <th
      data-slot="table-head"
      className={cn(
        'h-10 px-2 text-left align-middle font-medium whitespace-nowrap text-muted-foreground [&:has([role=checkbox])]:pr-0 [&>[role=checkbox]]:translate-y-[2px]',
        className,
      )}
      {...properties}
    />
  );
}

function TableCell({ className, ...properties }: React.ComponentProps<'td'>): React.JSX.Element {
  return (
    <td
      data-slot="table-cell"
      className={cn(
        'p-2 align-middle whitespace-nowrap [&:has([role=checkbox])]:pr-0 [&>[role=checkbox]]:translate-y-[2px]',
        className,
      )}
      {...properties}
    />
  );
}

function TableCaption({ className, ...properties }: React.ComponentProps<'caption'>): React.JSX.Element {
  return (
    <caption
      data-slot="table-caption"
      className={cn('mt-4 text-xs text-muted-foreground', className)}
      {...properties}
    />
  );
}

export { Table, TableHeader, TableBody, TableFooter, TableHead, TableRow, TableCell, TableCaption };
