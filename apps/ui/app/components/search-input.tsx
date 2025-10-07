import { Search, X } from 'lucide-react';
import React from 'react';
import { Input } from '#components/ui/input.js';
import { Button } from '#components/ui/button.js';
import { cn } from '#utils/ui.js';

export type SearchInputProperties = {
  /**
   * The current search value
   */
  readonly value?: string;
  /**
   * Additional className for the container
   */
  readonly containerClassName?: string;
  /**
   * Callback function called when the clear button is clicked
   */
  readonly onClear?: () => void;
} & Omit<React.ComponentProps<typeof Input>, 'type'>;

export function SearchInput({
  value = '',
  containerClassName,
  className,
  placeholder = 'Search...',
  onClear,
  ...properties
}: SearchInputProperties): React.JSX.Element {
  const showClearButton = Boolean(value && onClear);

  const handleMouseDown = (event: React.MouseEvent<HTMLButtonElement>) => {
    event.preventDefault();
  };

  return (
    <div className={cn('relative w-full', containerClassName)}>
      <Input
        autoComplete="off"
        type="text"
        placeholder={placeholder}
        value={value}
        className={cn(
          'pl-8 pr-2 not-placeholder-shown:pr-6 placeholder:text-sm',
          className
        )}
        {...properties}
      />
      <Search className="absolute top-1/2 left-2 size-4 -translate-y-1/2 text-muted-foreground pointer-events-none" />
      {showClearButton ? (
        <Button
          variant="ghost"
          size="icon"
          className="absolute top-1/2 right-1 size-5 -translate-y-1/2 p-0 text-muted-foreground hover:text-foreground"
          type="button"
          aria-label="Clear search"
          onClick={onClear}
          onMouseDown={handleMouseDown}
        >
          <X className="size-3.5" />
        </Button>
      ) : null}
    </div>
  );
}
