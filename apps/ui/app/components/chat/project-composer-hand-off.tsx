import { useMemo } from 'react';
import { useParams } from 'react-router';
import { Plus } from 'lucide-react';
import { Button } from '@taucad/ui/components/button';
import { cn } from '@taucad/ui/utils/cn';
import {
  chatComposerAddTriggerClassName,
  chatComposerBarClassName,
  chatComposerBarLeftClassName,
  chatComposerBarRightClassName,
  chatComposerCollapsibleControlsClassName,
  chatComposerEditorAreaClassName,
  chatComposerEditorTextClassName,
  chatComposerGhostPillClassName,
  chatComposerMainEditorAreaClassName,
  chatComposerModelTriggerClassName,
  chatComposerPlaceholder,
} from '@taucad/chat-ui/components/chat-input-styles';
import { ServedSendButton } from '#components/chat/chat-textarea-submit-button.js';
import { HandOffSlot } from '#components/hand-off/hand-off-slot.js';
import { draftHintAttribute, handOffBoxAttribute, queuedSendStatusSlot } from '#components/hand-off/hand-off.js';
import type { HandOffTarget } from '#components/hand-off/hand-off-store.js';

/**
 * The project composer box's marks for the recorder: a hand-off box that paints the draft hint. An Enter on the painted
 * draft queues as any Enter does; the composer replays it only when the chat's record holds that text.
 */
export const projectComposerBox = { [handOffBoxAttribute]: '', [draftHintAttribute]: '' } as const;

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
 * A15d (guest edit, programme control's ruling of 2026-11-16T22:06Z): the input sits in a hand-off box, so the served
 * recorder paints the project's stored draft (the draft hint) into it before first paint as prefilled text, draws a
 * queued send (Send pending, and the status said aloud) and cancels it on Escape or an edit. An Enter on a painted
 * draft nobody edited queues the same way; the composer replays it only when the chat's record holds that text, and
 * otherwise cancels it and says why (ruling 2026-11-17T03:28Z). Under the input is the composer's bar at rest: each
 * control the rich bar draws has its final box (ruling 2026-11-16T13:30Z), so adoption moves none.
 *
 * @param props - The hand-off target the frame serves.
 * @returns The input, its status and the bar.
 */
export function ProjectComposerHandOff({ target }: { readonly target: HandOffTarget }): React.JSX.Element {
  const { surface, scope } = target;
  return (
    /* The composer's own column inside the frame's box, with the composer frame's top inset, so the input row and the
     * bar sit where the rich composer's do (F7b). The served recorder marks it before React hydrates it. */
    <div className='flex min-h-0 flex-1 flex-col pt-3' suppressHydrationWarning {...projectComposerBox}>
      {/* Says a queued send aloud, as Send's pending state shows it; the served recorder writes it. */}
      <span
        data-slot={queuedSendStatusSlot}
        role='status'
        className='sr-only'
        suppressHydrationWarning
        // oxlint-disable-next-line react/no-danger -- Empty, so hydration leaves the text the served recorder wrote.
        dangerouslySetInnerHTML={{ __html: '' }}
      />
      <HandOffSlot
        surface={surface}
        scope={scope}
        label='Chat message'
        placeholder={chatComposerPlaceholder}
        className={cn(chatComposerEditorAreaClassName, chatComposerMainEditorAreaClassName)}
        inputClassName={cn(
          chatComposerEditorTextClassName,
          'block resize-none bg-transparent outline-none field-sizing-content placeholder:text-muted-foreground',
        )}
      />
      <ServedComposerBar />
    </div>
  );
}

/**
 * The served composer's bar (programme control's ruling, 2026-11-16T13:30Z; F7b): each control the rich bar draws at
 * rest has its final box here, so adoption moves nothing. The add trigger and Send are drawn as themselves, inert. The
 * mode and model controls follow the chat's agent and model, which the frame cannot read before the route chunk, so
 * their boxes are reserved empty: the mode at its icon face, the model at its pending face. Their labels arrive into
 * the reserved boxes at adoption (label parity is A10's).
 *
 * @returns The bar.
 */
function ServedComposerBar(): React.JSX.Element {
  return (
    <div inert data-slot='composer-bar' className={cn(chatComposerBarClassName, 'mt-auto mb-2 shrink-0')}>
      <div data-slot='composer-left' className={chatComposerBarLeftClassName}>
        <Button variant='ghost' size='sm' aria-label='Add' className={chatComposerAddTriggerClassName}>
          <Plus className='size-4' aria-hidden='true' />
        </Button>
        <div
          data-slot='composer-collapsible'
          className={cn(chatComposerCollapsibleControlsClassName, 'gap-0.5 pointer-coarse:gap-3')}
        >
          <span
            data-slot='mode-placeholder'
            aria-hidden='true'
            className={cn(chatComposerGhostPillClassName, 'flex w-7 items-center justify-center px-0')}
          >
            <span className='size-4' />
          </span>
        </div>
      </div>
      <div data-slot='composer-right' className={chatComposerBarRightClassName}>
        <div
          data-slot='composer-collapsible'
          className={cn(chatComposerCollapsibleControlsClassName, 'gap-1 pointer-coarse:gap-3')}
        >
          <span
            data-slot='agent-trigger-placeholder'
            aria-hidden='true'
            className={cn(chatComposerModelTriggerClassName, 'flex items-center')}
          >
            <span className='h-3 w-20 shrink-0' />
          </span>
        </div>
        <ServedSendButton isEmpty />
      </div>
    </div>
  );
}
