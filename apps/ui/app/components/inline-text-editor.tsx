import { useState } from 'react';
import type { ReactNode } from 'react';
import { cva } from 'class-variance-authority';
import type { VariantProps } from 'class-variance-authority';
import { Button } from '@taucad/ui/components/button';
import { Input } from '@taucad/ui/components/input';
import { cn } from '@taucad/ui/utils/cn';

const inlineTextEditorVariants = cva('h-full px-[calc(var(--spacing)*1.75)] text-sm select-auto', {
  variants: {
    variant: {
      default: 'bg-background',
      ghost: 'border-transparent bg-transparent px-0 shadow-none',
    },
  },
  defaultVariants: {
    variant: 'default',
  },
});

type InlineTextEditorProps = {
  readonly value: string;
  readonly onSave: (value: string) => Promise<void> | void;
  readonly placeholder?: string;
  readonly isDisabled?: boolean;
  readonly shouldSubmitOnBlur?: boolean;
  readonly shouldAutoSelectOnFocus?: boolean;
  readonly shouldStartEditing?: boolean;
  readonly onEditingChange?: (isEditing: boolean) => void;
  readonly className?: string;
  readonly renderDisplay?: (value: string) => ReactNode;
} & VariantProps<typeof inlineTextEditorVariants>;

export function InlineTextEditor({
  value,
  onSave,
  placeholder,
  isDisabled,
  shouldSubmitOnBlur = true,
  shouldAutoSelectOnFocus = true,
  shouldStartEditing = false,
  onEditingChange,
  variant = 'default',
  className,
  renderDisplay,
}: InlineTextEditorProps): React.JSX.Element {
  const [isEditing, setIsEditing] = useState(shouldStartEditing);
  const [editValue, setEditValue] = useState<string>(value);

  const startEditing = (): void => {
    if (isDisabled) {
      return;
    }

    setEditValue(value);
    setIsEditing(true);
    onEditingChange?.(true);
  };

  const cancel = (): void => {
    setEditValue(value);
    setIsEditing(false);
    onEditingChange?.(false);
  };

  const save = async (): Promise<void> => {
    const next = editValue.trim();
    if (next && next !== value) {
      await onSave(next);
    }

    setIsEditing(false);
    onEditingChange?.(false);
  };

  return (
    <div data-slot='inline-text-editor' className={className}>
      {isEditing ? (
        <form
          data-slot='form'
          className='flex h-full items-center gap-1'
          onSubmit={(event) => {
            event.preventDefault();
            void save();
          }}
        >
          <Input
            autoFocus
            data-slot='input'
            autoComplete='off'
            type='text'
            value={editValue}
            placeholder={placeholder}
            className={cn(inlineTextEditorVariants({ variant }))}
            onChange={(event) => {
              setEditValue(event.target.value);
            }}
            onKeyDown={(event) => {
              if (event.key === 'Enter') {
                event.preventDefault();
                void save();
              } else if (event.key === 'Escape') {
                event.preventDefault();
                cancel();
              }
            }}
            onBlur={() => {
              if (shouldSubmitOnBlur) {
                void save();
              }
            }}
            onFocus={(event) => {
              if (shouldAutoSelectOnFocus) {
                const input = event.target;
                // Set selection from start to end with cursor at the start
                input.setSelectionRange(0, input.value.length, 'backward');
                // Scroll to show the beginning of the text
                input.scrollLeft = 0;
              }
            }}
            onClick={(event) => {
              event.stopPropagation();
            }}
          />
          <Button
            data-slot='save-button'
            type='submit'
            size='sm'
            className='h-full'
            disabled={!editValue.trim() || editValue === value}
          >
            Save
          </Button>
        </form>
      ) : (
        <Button
          variant='ghost'
          className='h-full cursor-text justify-start px-2'
          disabled={isDisabled}
          onClick={startEditing}
        >
          {renderDisplay ? (
            renderDisplay(value)
          ) : (
            <span data-slot='display-text' className='truncate'>
              {value}
            </span>
          )}
        </Button>
      )}
    </div>
  );
}
