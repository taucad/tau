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
 * @param pathname - The frame's destination pathname when it is drawn ahead of the route.
 * @returns The surface and the project's scope.
 */
export function useProjectComposerHandOff(pathname?: string): HandOffTarget {
  const parameters = useParams();
  /* Drawn ahead of the route (A15b2), the frame names its destination by pathname: the route's params are still the
   * page being left's. */
  const fromPath = pathname === undefined ? undefined : /^\/w\/([^/]+)\/([^/]+)/u.exec(pathname);
  const workspace = fromPath ? decodeURIComponent(fromPath[1]!) : (parameters['workspace'] ?? '');
  const project = fromPath ? decodeURIComponent(fromPath[2]!) : (parameters['project'] ?? '');
  return useMemo(() => ({ surface: 'project-composer', scope: `${workspace}/${project}` }), [workspace, project]);
}

/**
 * The project composer's native input, in the workspace frame's chat-lane composer box (progressive loading PL6, on
 * A15b's frame).
 *
 * The project page serves its frame long before the live composer can mount: the worker, the workspace chunk, the
 * session and the focused chat come first. This input takes text from first paint in the box where the live composer
 * rests, with the editor's inset and text metrics over the bar's reserved height, and the live composer adopts its
 * text, caret, focus and a queued send in the commit that reveals the workspace (`ChatTextarea`'s `handOff`, gated by
 * `handOffRevealContext`).
 *
 * @param props - The hand-off target the frame serves.
 * @returns The input and the bar's reserved height.
 */
export function ProjectComposerHandOff({ target }: { readonly target: HandOffTarget }): React.JSX.Element {
  const { surface, scope } = target;
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
