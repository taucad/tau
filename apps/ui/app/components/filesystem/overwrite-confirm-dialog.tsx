/**
 * Reusable overwrite-confirm dialog for rename / drag / paste flows.
 *
 * Mirrors VS Code's `getMultipleFilesOverwriteConfirm` pattern: when a
 * filesystem mutation lands on a path that already exists, the caller
 * raises this dialog instead of failing the mutation outright. The
 * dialog returns one of:
 *   - `'overwrite'` — caller re-issues the mutation with `{ overwrite: true }`.
 *   - `'cancel'` — caller aborts without mutating.
 *
 * The "Do not ask again for this session" checkbox lets power users
 * silence repeat prompts during a multi-drag session. The caller is
 * responsible for honouring the resulting `rememberChoice` flag —
 * typically by stashing it in a `useRef` for the lifetime of the
 * component instance (NOT across reloads).
 *
 * @see docs/research/editor-filesystem-surface-audit.md R8
 */

import { useCallback, useState } from 'react';
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '#components/ui/alert-dialog.js';
import { Button } from '#components/ui/button.js';
import { Checkbox } from '#components/ui/checkbox.js';
import { Label } from '#components/ui/label.js';

/**
 * Choice returned from the dialog.
 *
 * @public
 */
export type OverwriteConfirmChoice = 'overwrite' | 'cancel';

/**
 * Result delivered to the caller — includes the choice and whether the
 * user opted to remember it for the rest of the session.
 *
 * @public
 */
export type OverwriteConfirmResult = Readonly<{
  choice: OverwriteConfirmChoice;
  rememberChoice: boolean;
}>;

/**
 * Props for {@link OverwriteConfirmDialog}.
 *
 * @public
 */
export type OverwriteConfirmDialogProps = Readonly<{
  /**
   * Controls dialog visibility. Pair with `onClose` so the caller owns
   * the open/close lifecycle.
   */
  open: boolean;
  /**
   * Paths the mutation would overwrite. Drives the dialog copy
   * (singular vs plural).
   */
  targetPaths: readonly string[];
  /**
   * Whether to show the "Do not ask again for this session" checkbox.
   * Disable for single-shot rename flows where remembering doesn't
   * apply.
   */
  showRememberChoice?: boolean;
  /**
   * Invoked when the user picks a choice (overwrite or cancel) or
   * dismisses the dialog. `rememberChoice` is `true` only when the
   * checkbox is shown and ticked.
   */
  onResolve: (result: OverwriteConfirmResult) => void;
}>;

/**
 * Render the overwrite-confirm dialog.
 *
 * @param props - See {@link OverwriteConfirmDialogProps}.
 * @returns The dialog element (always mounted; controlled via `open`).
 */
export function OverwriteConfirmDialog({
  open,
  targetPaths,
  showRememberChoice = true,
  onResolve,
}: OverwriteConfirmDialogProps): React.JSX.Element {
  const [rememberChoice, setRememberChoice] = useState(false);

  const handleOverwrite = useCallback(() => {
    onResolve({ choice: 'overwrite', rememberChoice });
  }, [onResolve, rememberChoice]);

  const handleCancel = useCallback(() => {
    onResolve({ choice: 'cancel', rememberChoice: false });
  }, [onResolve]);

  const handleOpenChange = useCallback(
    (next: boolean) => {
      if (!next) {
        handleCancel();
      }
    },
    [handleCancel],
  );

  const targetCount = targetPaths.length;
  const isSingleTarget = targetCount === 1;
  const firstTarget = targetPaths[0] ?? '';

  return (
    <AlertDialog open={open} onOpenChange={handleOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>
            {isSingleTarget ? `Replace '${firstTarget}'?` : `Replace ${String(targetCount)} existing items?`}
          </AlertDialogTitle>
          <AlertDialogDescription>
            {isSingleTarget
              ? 'A file or folder with this name already exists. Replacing will overwrite its contents and cannot be undone.'
              : 'One or more destinations already contain files or folders with these names. Replacing will overwrite their contents and cannot be undone.'}
          </AlertDialogDescription>
        </AlertDialogHeader>
        {showRememberChoice ? (
          <div className='flex items-center gap-2 px-1 py-2'>
            <Checkbox
              id='overwrite-remember'
              checked={rememberChoice}
              onCheckedChange={(checked) => {
                setRememberChoice(checked === true);
              }}
            />
            <Label htmlFor='overwrite-remember' className='cursor-pointer text-sm'>
              Do not ask again for this session
            </Label>
          </div>
        ) : undefined}
        <AlertDialogFooter className='gap-2'>
          <Button variant='ghost' onClick={handleCancel}>
            Cancel
          </Button>
          <Button variant='destructive' onClick={handleOverwrite}>
            Replace
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
