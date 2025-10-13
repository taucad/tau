import { useState } from 'react';
import type { LucideIcon } from 'lucide-react';
import type { InputFormat, OutputFormat } from '@taucad/converter';
import { Badge } from '#components/ui/badge.js';
import { SearchInput } from '#components/search-input.js';
import { formatDisplayName } from '#routes/converter/converter-utils.js';

type FormatsListProps = {
  readonly icon: LucideIcon;
  readonly title: string;
  readonly description: string;
  readonly formats: ReadonlyArray<InputFormat | OutputFormat>;
  readonly className?: string;
};

export function FormatsList({
  icon: Icon,
  title,
  description,
  formats,
  className,
}: FormatsListProps): React.JSX.Element {
  const [searchQuery, setSearchQuery] = useState('');

  const filteredFormats = formats.filter((format) => {
    const query = searchQuery.toLowerCase();
    const displayName = formatDisplayName(format).toLowerCase();
    const extension = format.toLowerCase();

    return displayName.includes(query) || extension.includes(query);
  });

  return (
    <div className={className}>
      <div className="flex flex-col overflow-hidden rounded-lg border bg-card shadow-sm">
        {/* Header */}
        <div className="border-b bg-muted/50 px-6 py-4">
          <div className="flex items-center gap-3">
            <div className="flex size-10 items-center justify-center rounded-lg bg-primary/10">
              <Icon className="size-5 text-primary" />
            </div>
            <div>
              <h2 className="text-xl font-semibold">{title}</h2>
              <p className="text-sm text-muted-foreground">{description}</p>
            </div>
          </div>
        </div>

        {/* Content */}
        <div className="overflow-auto p-6">
          <div className="space-y-4">
            {/* Count */}
            <p className="text-sm text-muted-foreground">{formats.length} formats supported</p>

            {/* Search */}
            <SearchInput
              placeholder="Search formats..."
              value={searchQuery}
              onClear={() => {
                setSearchQuery('');
              }}
              onChange={(event) => {
                setSearchQuery(event.target.value);
              }}
            />

            {/* Formats Grid */}
            {filteredFormats.length > 0 ? (
              <div className="flex flex-wrap gap-2">
                {filteredFormats.map((format) => (
                  <Badge key={format} variant="secondary" className="px-3 py-1.5 font-mono text-xs">
                    {format.toUpperCase()}
                  </Badge>
                ))}
              </div>
            ) : (
              <div className="flex h-32 items-center justify-center rounded-md border border-dashed">
                <p className="text-sm text-muted-foreground">No formats found</p>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
