import { Search, X } from 'lucide-react';
import React from 'react';
import { Input } from '#components/ui/input.js';
import { Button } from '#components/ui/button.js';
import { KeyShortcut } from '#components/ui/key-shortcut.js';
import { cn } from '#utils/ui.utils.js';

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
  readonly onClear: () => void;
  /**
   * Optional keyboard shortcut to display when input is not focused
   */
  readonly keyboardShortcut?: string;
} & Omit<React.ComponentProps<typeof Input>, 'type'>;

export const SearchInput = React.forwardRef<HTMLInputElement, SearchInputProperties>(function (
  { value = '', containerClassName, className, placeholder = 'Search...', onClear, keyboardShortcut, ...properties },
  reference,
) {
  const handleMouseDown = (event: React.MouseEvent<HTMLButtonElement>) => {
    event.preventDefault();
  };

  return (
    <div className={cn('relative w-full', containerClassName)}>
      <Input
        ref={reference}
        autoComplete="off"
        type="text"
        placeholder={placeholder}
        value={value}
        className={cn(
          'peer/search-input pr-2 pl-8 not-placeholder-shown:pr-6 placeholder:text-sm placeholder-shown:truncate focus:placeholder:opacity-0',
          keyboardShortcut && 'placeholder-shown:pr-14',
          className,
        )}
        {...properties}
      />
      <Search className="pointer-events-none absolute top-1/2 left-2 size-4 -translate-y-1/2 text-muted-foreground" />
      {keyboardShortcut ? (
        <KeyShortcut className="pointer-events-none absolute top-1/2 right-2 -translate-y-1/2 peer-not-placeholder-shown/search-input:invisible peer-focus-within/search-input:invisible">
          {keyboardShortcut}
        </KeyShortcut>
      ) : null}
      <Button
        variant="ghost"
        size="icon"
        className="absolute top-1/2 right-1.5 size-5 -translate-y-1/2 p-0 text-muted-foreground peer-placeholder-shown/search-input:invisible hover:text-foreground"
        type="button"
        aria-label="Clear search"
        onClick={onClear}
        onMouseDown={handleMouseDown}
      >
        <X className="size-3.5" />
      </Button>
    </div>
  );
});
