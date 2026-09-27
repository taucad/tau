/**
 * The one naming form on every revision surface (canvas rounds 14, 16 and 18).
 *
 * Name version, Rename version, New branch, New branch from a revision and
 * Rename branch all name something in the same small form under the control that
 * opened it: one field, one sentence saying what the name does, then Cancel and
 * the verb. So every naming cancels the same way — Cancel, Escape or a click
 * away — keeps no cancelled draft, and hands focus back to where it came from.
 */
import { useState } from 'react';
import type { RefObject } from 'react';
import { Button } from '@taucad/ui/components/button';
import { Input } from '@taucad/ui/components/input';
import { Popover, PopoverAnchor, PopoverContent, PopoverTrigger } from '@taucad/ui/components/popover';

export type NameFormCopy = Readonly<{
  /** The field's accessible name, e.g. `Name Rev 8`. */
  label: string;
  placeholder: string;
  /** One sentence saying what the name does. */
  note: string;
  /** The committing verb, e.g. `Create branch`. */
  saveLabel: string;
  /** The name the field starts from on every opening. */
  initial?: string;
}>;

type NamePopoverProps = NameFormCopy & {
  readonly isBusy?: boolean;
  readonly align?: 'start' | 'end';
  /** Resolves once the name is recorded; a rejection keeps the form open and says why. */
  readonly onSave: (name: string) => Promise<void> | void;
} & (
    | {
        /** The button that opens the form; focus returns to it on close. */
        readonly trigger: React.JSX.Element;
        readonly anchor?: never;
        readonly isOpen?: never;
        readonly onOpenChange?: never;
        readonly returnFocus?: never;
      }
    | {
        readonly trigger?: never;
        /** What the form opens under when a menu item opens it (the menu's button). */
        readonly anchor: React.JSX.Element;
        readonly isOpen: boolean;
        readonly onOpenChange: (isOpen: boolean) => void;
        /** Where focus returns, since the form has no trigger of its own. */
        // oxlint-disable-next-line typescript/no-restricted-types -- required by React: `useRef(null)` is a `RefObject<T | null>`
        readonly returnFocus: RefObject<HTMLElement | null>;
      }
  );

/**
 * The naming form in a popover, opened by its own trigger or by a menu item.
 *
 * @param props - The copy, the verb and how the form opens.
 * @returns The popover.
 */
export function NamePopover({
  trigger,
  anchor,
  isOpen,
  onOpenChange,
  returnFocus,
  isBusy = false,
  align = 'start',
  onSave,
  ...copy
}: NamePopoverProps): React.JSX.Element {
  const [isOwnOpen, setIsOwnOpen] = useState(false);
  const open = isOpen ?? isOwnOpen;
  const setOpen = onOpenChange ?? setIsOwnOpen;
  return (
    <Popover open={open} onOpenChange={setOpen}>
      {trigger === undefined ? (
        <PopoverAnchor asChild>{anchor}</PopoverAnchor>
      ) : (
        <PopoverTrigger asChild>{trigger}</PopoverTrigger>
      )}
      <PopoverContent
        align={align}
        className='w-72 max-w-[calc(100vw-2rem)] p-3'
        onCloseAutoFocus={
          returnFocus === undefined
            ? undefined
            : (event) => {
                event.preventDefault();
                returnFocus.current?.focus();
              }
        }
      >
        <NameForm
          {...copy}
          isBusy={isBusy}
          onSave={onSave}
          onClose={() => {
            setOpen(false);
          }}
        />
      </PopoverContent>
    </Popover>
  );
}

/**
 * The form itself. It mounts with the popover's content, so every opening
 * starts from `initial` and a cancelled draft is gone.
 *
 * @param props - The copy, the verb and how to close.
 * @returns The form.
 */
function NameForm({
  label,
  placeholder,
  note,
  saveLabel,
  initial = '',
  isBusy,
  onSave,
  onClose,
}: NameFormCopy & {
  readonly isBusy: boolean;
  readonly onSave: (name: string) => Promise<void> | void;
  readonly onClose: () => void;
}): React.JSX.Element {
  const [draft, setDraft] = useState(initial);
  const [failure, setFailure] = useState<string>();
  const [isSaving, setIsSaving] = useState(false);
  const canSave = draft.trim() !== '' && !isBusy && !isSaving;
  return (
    <form
      className='flex flex-col gap-3'
      onSubmit={async (event) => {
        event.preventDefault();
        if (!canSave) {
          return;
        }
        setIsSaving(true);
        try {
          await onSave(draft.trim());
          onClose();
        } catch (error) {
          setFailure(error instanceof Error ? error.message : 'That name could not be saved.');
          setIsSaving(false);
        }
      }}
    >
      <Input
        autoFocus
        aria-label={label}
        value={draft}
        placeholder={placeholder}
        aria-invalid={failure === undefined ? undefined : true}
        onChange={(event) => {
          setDraft(event.target.value);
        }}
        onFocus={(event) => {
          event.target.select();
        }}
      />
      {failure === undefined ? (
        <p className='text-xs text-muted-foreground'>{note}</p>
      ) : (
        <p role='alert' className='text-xs'>
          {failure}
        </p>
      )}
      <div className='flex justify-end gap-2'>
        <Button type='button' variant='outline' size='xs' onClick={onClose}>
          Cancel
        </Button>
        <Button type='submit' size='xs' disabled={!canSave}>
          {saveLabel}
        </Button>
      </div>
    </form>
  );
}
