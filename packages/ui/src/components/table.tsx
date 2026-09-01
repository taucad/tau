import * as React from 'react';
import { cn } from '#utils/cn.js';

/**
 * Render a horizontally scrollable native data table. Native table semantics
 * provide its accessibility contract; include a caption and scoped headers.
 *
 * @public
 * @param properties - Standard table properties.
 * @returns The scroll container and table.
 *
 * @example <caption>Create a data table</caption>
 * ```typescript
 * import { createElement } from 'react';
 * import { Table, TableCaption } from '@taucad/ui/components/table';
 *
 * export const example = createElement(Table, null, createElement(TableCaption, null, 'Parameters'));
 * ```
 */
function Table({ className, ...properties }: React.ComponentProps<'table'>): React.JSX.Element {
  return (
    <div data-slot='table-container' className='relative w-full overflow-x-auto'>
      <table data-slot='table' className={cn('w-full caption-bottom text-sm', className)} {...properties} />
    </div>
  );
}

/**
 * Group a table's column-header rows.
 *
 * @public
 * @param properties - Standard table-head properties.
 * @returns The table header group.
 *
 * @example <caption>Add a table header group</caption>
 * ```typescript
 * import { createElement } from 'react';
 * import { TableHeader } from '@taucad/ui/components/table';
 *
 * export const example = createElement(TableHeader);
 * ```
 */
function TableHeader({ className, ...properties }: React.ComponentProps<'thead'>): React.JSX.Element {
  return <thead data-slot='table-header' className={cn('[&_tr]:border-b', className)} {...properties} />;
}

/**
 * Group a table's data rows.
 *
 * @public
 * @param properties - Standard table-body properties.
 * @returns The table body group.
 *
 * @example <caption>Add a table body</caption>
 * ```typescript
 * import { createElement } from 'react';
 * import { TableBody } from '@taucad/ui/components/table';
 *
 * export const example = createElement(TableBody);
 * ```
 */
function TableBody({ className, ...properties }: React.ComponentProps<'tbody'>): React.JSX.Element {
  return <tbody data-slot='table-body' className={cn('[&_tr:last-child]:border-0', className)} {...properties} />;
}

/**
 * Group summary rows at the end of a table.
 *
 * @public
 * @param properties - Standard table-footer properties.
 * @returns The table footer group.
 *
 * @example <caption>Add a table footer</caption>
 * ```typescript
 * import { createElement } from 'react';
 * import { TableFooter } from '@taucad/ui/components/table';
 *
 * export const example = createElement(TableFooter);
 * ```
 */
function TableFooter({ className, ...properties }: React.ComponentProps<'tfoot'>): React.JSX.Element {
  return (
    <tfoot
      data-slot='table-footer'
      className={cn('border-t bg-muted/50 font-medium [&>tr]:last:border-b-0', className)}
      {...properties}
    />
  );
}

/**
 * Render one native table row.
 *
 * @public
 * @param properties - Standard row properties.
 * @returns The table row.
 *
 * @example <caption>Add a table row</caption>
 * ```typescript
 * import { createElement } from 'react';
 * import { TableRow } from '@taucad/ui/components/table';
 *
 * export const example = createElement(TableRow);
 * ```
 */
function TableRow({ className, ...properties }: React.ComponentProps<'tr'>): React.JSX.Element {
  return (
    <tr
      data-slot='table-row'
      className={cn('border-b transition-colors hover:bg-muted/50 data-[state=selected]:bg-muted', className)}
      {...properties}
    />
  );
}

/**
 * Render a column or row header cell.
 *
 * @public
 * @param properties - Standard table-header-cell properties.
 * @returns The header cell.
 *
 * @example <caption>Add a column header</caption>
 * ```typescript
 * import { createElement } from 'react';
 * import { TableHead } from '@taucad/ui/components/table';
 *
 * export const example = createElement(TableHead, { scope: 'col' }, 'Name');
 * ```
 */
function TableHead({ className, ...properties }: React.ComponentProps<'th'>): React.JSX.Element {
  return (
    <th
      data-slot='table-head'
      className={cn(
        'h-10 px-2 text-left align-middle font-medium whitespace-nowrap text-muted-foreground [&:has([role=checkbox])]:pr-0 [&>[role=checkbox]]:translate-y-[2px]',
        className,
      )}
      {...properties}
    />
  );
}

/**
 * Render one native table data cell.
 *
 * @public
 * @param properties - Standard table-cell properties.
 * @returns The data cell.
 *
 * @example <caption>Add a data cell</caption>
 * ```typescript
 * import { createElement } from 'react';
 * import { TableCell } from '@taucad/ui/components/table';
 *
 * export const example = createElement(TableCell, null, '20 mm');
 * ```
 */
function TableCell({ className, ...properties }: React.ComponentProps<'td'>): React.JSX.Element {
  return (
    <td
      data-slot='table-cell'
      className={cn(
        'p-2 align-middle whitespace-nowrap [&:has([role=checkbox])]:pr-0 [&>[role=checkbox]]:translate-y-[2px]',
        className,
      )}
      {...properties}
    />
  );
}

/**
 * Give a table an accessible name and visible description.
 *
 * @public
 * @param properties - Standard caption properties.
 * @returns The table caption.
 *
 * @example <caption>Caption a parameter table</caption>
 * ```typescript
 * import { createElement } from 'react';
 * import { TableCaption } from '@taucad/ui/components/table';
 *
 * export const example = createElement(TableCaption, null, 'Model parameters');
 * ```
 */
function TableCaption({ className, ...properties }: React.ComponentProps<'caption'>): React.JSX.Element {
  return (
    <caption
      data-slot='table-caption'
      className={cn('mt-4 text-xs text-muted-foreground', className)}
      {...properties}
    />
  );
}

export { Table, TableHeader, TableBody, TableFooter, TableHead, TableRow, TableCell, TableCaption };
