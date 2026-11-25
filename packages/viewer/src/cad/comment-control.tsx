/**
 * SPIKE (chat pointers design): the Comment tool's toggle and its row in the viewer bar.
 */
import { MessageSquarePlus } from 'lucide-react';
import { ToolToggle } from '#cad/section-view-control.jsx';
import { commentPinsStore, useCommentPins } from '#cad/comment-pins.store.js';

/**
 * Starts and stops commenting; stopping keeps every pin.
 *
 * @param props - The formatted shortcut the tooltip shows.
 * @returns The toggle.
 */
export function CommentControl({ shortcut }: { readonly shortcut?: string }): React.JSX.Element {
  const isActive = useCommentPins((state) => state.isActive);
  return (
    <ToolToggle
      tool='comment'
      name='Comment'
      label='Comment'
      icon={<MessageSquarePlus className='size-4' />}
      isActive={isActive}
      shortcut={shortcut}
      onToggle={() => {
        commentPinsStore.setActive(!isActive);
      }}
    />
  );
}

/**
 * The running Comment tool's row: only what to do. The count and removal live in the composer's comment list.
 *
 * @returns The row's options.
 */
export function CommentOptions(): React.JSX.Element {
  return <span className='px-1 text-xs text-muted-foreground'>Click the model to pin a comment</span>;
}
