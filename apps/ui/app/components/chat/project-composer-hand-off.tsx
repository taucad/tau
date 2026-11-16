import { useMemo } from 'react';
import { useParams } from 'react-router';
import { cn } from '@taucad/ui/utils/cn';
import {
  chatComposerEditorAreaClassName,
  chatComposerEditorTextClassName,
  chatComposerMainEditorAreaClassName,
  chatComposerPlaceholder,
} from '@taucad/chat-ui/components/chat-input-styles';
import { HandOffSlot } from '#components/hand-off/hand-off-slot.js';
import type { HandOffTarget } from '#components/hand-off/hand-off-store.js';

/**
 * The project composer's hand-off, scoped to the project in the route: the placeholder serves it and the live
 * composer adopts it, and a client navigation to another project before adoption starts over with an empty input.
 *
 * @returns The surface and the project's scope.
 */
export function useProjectComposerHandOff(): HandOffTarget {
  const { workspace = '', project = '' } = useParams();
  return useMemo(() => ({ surface: 'project-composer', scope: `${workspace}/${project}` }), [workspace, project]);
}

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
  const { surface, scope } = useProjectComposerHandOff();
  return (
    <>
      <HandOffSlot
        surface={surface}
        scope={scope}
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
