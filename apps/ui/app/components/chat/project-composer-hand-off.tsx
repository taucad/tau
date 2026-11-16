import { cn } from '@taucad/ui/utils/cn';
import {
  chatComposerEditorAreaClassName,
  chatComposerEditorTextClassName,
  chatComposerMainEditorAreaClassName,
  chatComposerPlaceholder,
} from '@taucad/chat-ui/components/chat-input-styles';
import { HandOffSlot } from '#components/hand-off/hand-off-slot.js';

/**
 * The project composer's native input, in the workspace placeholder's composer frame (progressive loading PL6).
 *
 * The project page serves its placeholder long before the live composer can mount: the worker, the workspace chunk,
 * the session and the focused chat come first. This input takes text from first paint in the frame where the live
 * composer rests, with the editor's inset and text metrics over the bar's reserved height, and the live composer
 * adopts its text, caret, focus and a queued send when it mounts (`ChatTextarea`'s `handOffSurface`). One input
 * serves the whole load, however many placeholders it passes through (`HandOffSlot`).
 *
 * @returns The input and the bar's reserved height.
 */
export function ProjectComposerHandOff(): React.JSX.Element {
  return (
    <>
      <HandOffSlot
        surface='project-composer'
        label='Chat message'
        placeholder={chatComposerPlaceholder}
        className={cn('pt-3', chatComposerEditorAreaClassName, chatComposerMainEditorAreaClassName)}
        inputClassName={cn(
          chatComposerEditorTextClassName,
          'block resize-none bg-transparent outline-none field-sizing-content placeholder:text-muted-foreground',
        )}
      />
      <div aria-hidden='true' className='mt-auto mb-2 h-7 shrink-0' />
    </>
  );
}
