import { XIcon } from 'lucide-react';
import { createContext, useContext, useMemo, useRef, useState } from 'react';
import type { ComponentProps, MouseEventHandler, ReactNode } from 'react';
import { Badge } from '#components/ui/badge.js';
import type { CommandGroup } from '#components/ui/command.js';
import { Command, CommandEmpty, CommandItem, CommandList } from '#components/ui/command.js';
import { Popover, PopoverContent, PopoverTrigger } from '#components/ui/popover.js';
import { cn } from '#utils/ui.utils.js';
import { stringToColor } from '#utils/color.utils.js';

type TagsContextType = {
  value: string;
  setValue: (value: string) => void;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  tags: string[];
  onTagsChange: (tags: string[]) => void;
};
const TagsContext = createContext<TagsContextType | undefined>(undefined);
const useTagsContext = (): TagsContextType => {
  const context = useContext(TagsContext);
  if (!context) {
    throw new Error('useTagsContext must be used within a TagsProvider');
  }

  return context;
};

export type TagsProps = {
  readonly tags: string[];
  readonly onTagsChange: (tags: string[]) => void;
  readonly isOpen?: boolean;
  readonly onOpenChange?: (open: boolean) => void;
  readonly children?: ReactNode;
  readonly className?: string;
};
export function Tags({
  tags,
  onTagsChange,
  isOpen: controlledOpen,
  onOpenChange: controlledOnOpenChange,
  children,
  className,
}: TagsProps): React.JSX.Element {
  const [uncontrolledOpen, setUncontrolledOpen] = useState(false);
  const [value, setValue] = useState('');
  const open = controlledOpen ?? uncontrolledOpen;
  const onOpenChange = controlledOnOpenChange ?? setUncontrolledOpen;

  const contextValue = useMemo(
    () => ({ value, setValue, open, onOpenChange, tags, onTagsChange }),
    [value, open, onOpenChange, tags, onTagsChange],
  );

  return (
    <TagsContext.Provider value={contextValue}>
      <Popover open={open} onOpenChange={onOpenChange}>
        <div className={cn('relative w-full', className)}>{children}</div>
      </Popover>
    </TagsContext.Provider>
  );
}

export type TagsTriggerProps = {
  readonly id?: string;
  readonly placeholder?: string;
  readonly className?: string;
  readonly inputAriaLabel?: string;
  // oxlint-disable-next-line react-js/boolean-prop-naming -- mirrors native input prop.
  readonly disabled?: boolean;
};
export function TagsTrigger({
  id,
  className,
  placeholder = 'Type to add tags...',
  inputAriaLabel,
  disabled,
}: TagsTriggerProps): React.JSX.Element {
  const { tags, onTagsChange, value, setValue } = useTagsContext();
  const inputRef = useRef<HTMLInputElement>(null);

  const handleRemoveTag = (tagToRemove: string): void => {
    if (disabled) {
      return;
    }

    onTagsChange(tags.filter((tag) => tag !== tagToRemove));
  };

  const commitCurrentValue = (): void => {
    if (disabled) {
      return;
    }

    const normalizedTag = value.trim().toLowerCase();
    if (!normalizedTag) {
      return;
    }

    if (!tags.includes(normalizedTag)) {
      onTagsChange([...tags, normalizedTag]);
    }

    setValue('');
  };

  const handleKeyDown: React.KeyboardEventHandler<HTMLInputElement> = (event) => {
    if (disabled) {
      return;
    }

    if (event.key === 'Enter' && value.trim()) {
      event.preventDefault();
      commitCurrentValue();
    } else if (event.key === 'Backspace' && !value && tags.length > 0) {
      // Remove last tag on backspace when input is empty
      event.preventDefault();
      onTagsChange(tags.slice(0, -1));
    }
  };

  const handleContainerClick: MouseEventHandler<HTMLDivElement> = (event) => {
    if (disabled) {
      return;
    }

    // Don't focus if clicking on a tag remove button
    if ((event.target as HTMLElement).closest('[data-tag-remove]')) {
      return;
    }

    inputRef.current?.focus();
  };

  return (
    <PopoverTrigger asChild>
      <div
        className={cn(
          'group/tags-trigger flex h-auto min-h-9 w-full cursor-text flex-wrap items-center gap-1 rounded-md border border-input bg-background p-2 text-sm shadow-xs transition-[box-shadow] outline-none dark:bg-input/30',
          'has-[[data-slot=input-tags-input]:focus-visible]:ring-2 has-[[data-slot=input-tags-input]:focus-visible]:ring-ring',
          disabled && 'cursor-not-allowed opacity-50',
          className,
        )}
        onClick={handleContainerClick}
      >
        {tags.map((tag) => (
          <TagsValue
            key={tag}
            onRemove={() => {
              handleRemoveTag(tag);
            }}
          >
            {tag}
          </TagsValue>
        ))}
        <input
          ref={inputRef}
          data-slot='input-tags-input'
          id={id}
          type='text'
          aria-label={inputAriaLabel}
          value={value}
          disabled={disabled}
          placeholder={tags.length === 0 ? placeholder : ''}
          className='w-0 flex-1 bg-transparent px-0.5 py-px text-base outline-none group-focus-within/tags-trigger:w-[120px] placeholder:text-muted-foreground md:text-sm'
          onChange={(event) => {
            setValue(event.target.value);
          }}
          onKeyDown={handleKeyDown}
          onBlur={commitCurrentValue}
        />
      </div>
    </PopoverTrigger>
  );
}

export type TagsValueProps = ComponentProps<typeof Badge>;
export function TagsValue({
  className,
  children,
  onRemove,
  ...props
}: TagsValueProps & { readonly onRemove?: () => void; readonly children?: string }): React.JSX.Element {
  const handleRemove: MouseEventHandler<HTMLButtonElement> = (event) => {
    event.preventDefault();
    event.stopPropagation();
    if (onRemove) {
      onRemove();
    }
  };

  const handlePointerDown: MouseEventHandler<HTMLButtonElement> = (event) => {
    event.preventDefault();
    event.stopPropagation();
  };

  return (
    <Badge
      style={{ backgroundColor: stringToColor(String(children), 0.7) }}
      className={cn('flex items-center gap-2 pr-0.5', className)}
      {...props}
    >
      {children}
      {onRemove ? (
        <button
          type='button'
          data-tag-remove
          aria-label={`Remove ${children}`}
          className='size-auto cursor-pointer rounded-full outline-none hover:bg-primary-foreground/30 focus-visible:ring-2 focus-visible:ring-ring'
          onClick={handleRemove}
          onPointerDown={handlePointerDown}
        >
          <XIcon className='size-4' />
        </button>
      ) : null}
    </Badge>
  );
}

export type TagsContentProps = ComponentProps<typeof PopoverContent>;
export function TagsContent({ className, children, ...props }: TagsContentProps): React.JSX.Element {
  const { value, setValue } = useTagsContext();
  return (
    <PopoverContent className={cn('w-[300px] p-0', className)} align='start' {...props}>
      <Command value={value} onValueChange={setValue}>
        {children}
      </Command>
    </PopoverContent>
  );
}

export type TagsListProps = ComponentProps<typeof CommandList>;
export function TagsList({ className, ...props }: TagsListProps): React.JSX.Element {
  return <CommandList className={cn('max-h-[200px]', className)} {...props} />;
}

export type TagsEmptyProps = ComponentProps<typeof CommandEmpty>;
export function TagsEmpty({ children, className, ...props }: TagsEmptyProps): React.JSX.Element {
  return <CommandEmpty {...props}>{children ?? 'No tags found.'}</CommandEmpty>;
}

export type TagsGroupProps = ComponentProps<typeof CommandGroup>;

export type TagsItemProps = ComponentProps<typeof CommandItem>;
export function TagsItem({ className, ...props }: TagsItemProps): React.JSX.Element {
  return <CommandItem className={cn('items-center justify-between', className)} {...props} />;
}

// oxlint-disable-next-line no-barrel-files/no-barrel-files -- allowed for component reuse.
export { CommandGroup as TagsGroup } from '#components/ui/command.js';
