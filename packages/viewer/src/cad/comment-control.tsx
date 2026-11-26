import { useCallback } from 'react';
import { flushSync } from 'react-dom';
import { MessageSquarePlus } from 'lucide-react';
import { ToolToggle } from '#cad/section-view-control.jsx';
import { useGraphics, useGraphicsSelector } from '#hooks/use-graphics.jsx';

type CommentControlProps = Readonly<{
  /** Runs once the toggle has started commenting and its row is on screen. */
  onStart?: () => void;
}>;

/**
 * Starts and stops commenting; stopping keeps every pin. Starting turns Measure off, since both read a click.
 *
 * @public
 */
export function CommentControl({ onStart }: CommentControlProps): React.JSX.Element {
  const graphicsRef = useGraphics();
  const isCommentActive = useGraphicsSelector((state) => state.context.isCommentActive);

  const handleToggle = useCallback(() => {
    // Synchronous, so the commenting row exists when `onStart` moves focus into it.
    flushSync(() => {
      graphicsRef.send({ type: 'setCommentActive', payload: !isCommentActive });
    });
    if (!isCommentActive) {
      onStart?.();
    }
  }, [graphicsRef, isCommentActive, onStart]);

  return (
    <ToolToggle
      tool='comment'
      name='Comment'
      label='Comment'
      icon={<MessageSquarePlus className='size-4' />}
      isActive={isCommentActive}
      onToggle={handleToggle}
    />
  );
}

/**
 * The running Comment tool's row: only what to do. The comments themselves live in the chat composer.
 *
 * @public
 */
export function CommentOptions(): React.JSX.Element {
  return <span className='px-1 text-xs text-muted-foreground'>Click the model to pin a comment</span>;
}
