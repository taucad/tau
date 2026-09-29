import { useState } from 'react';
import type { FileExtension } from '@taucad/types';
import { SearchInput } from '#components/search-input.js';
import { formatDisplayName } from '#components/geometry/converter/converter-utils.js';

type FormatsListProps = {
  readonly formats: readonly FileExtension[];
  readonly isLoading: boolean;
};

export function FormatsList({ formats, isLoading }: FormatsListProps): React.JSX.Element {
  const [searchQuery, setSearchQuery] = useState('');
  const filteredFormats = formats.filter((format) => {
    const query = searchQuery.toLowerCase();
    return formatDisplayName(format).toLowerCase().includes(query) || format.toLowerCase().includes(query);
  });

  return (
    <section className='space-y-4'>
      <div className='flex items-baseline justify-between gap-2'>
        <h2 className='text-sm font-medium'>Input formats</h2>
        {isLoading ? undefined : <span className='text-xs text-muted-foreground tabular-nums'>{formats.length}</span>}
      </div>
      <SearchInput
        aria-label='Search input formats'
        placeholder='Find a format…'
        value={searchQuery}
        onClear={() => {
          setSearchQuery('');
        }}
        onChange={(event) => {
          setSearchQuery(event.target.value);
        }}
      />
      {isLoading ? (
        <p role='status' className='text-sm text-muted-foreground'>
          Loading formats…
        </p>
      ) : filteredFormats.length > 0 ? (
        <ul className='grid grid-cols-3 gap-x-4 gap-y-2'>
          {filteredFormats.map((format) => (
            <li key={format} className='font-mono text-xs' aria-label={formatDisplayName(format)}>
              {format.toUpperCase()}
            </li>
          ))}
        </ul>
      ) : (
        <p role='status' className='text-sm text-muted-foreground'>
          No formats match.
        </p>
      )}
    </section>
  );
}
