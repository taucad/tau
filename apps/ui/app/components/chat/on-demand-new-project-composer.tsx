import { lazy, Suspense } from 'react';
import { ChatTextareaSkeleton } from '#components/chat/chat-textarea-skeleton.js';

/**
 * Declared once, at module scope, so the composer keeps its identity and its state across renders.
 * The import is what matters: it makes the composer a chunk of its own instead of part of every
 * route that renders this.
 */
const NewProjectChatComposer = lazy(async () => {
  const composerModule = await import('#components/chat/new-project-chat-composer.js');
  return { default: composerModule.NewProjectChatComposer };
});

/**
 * The new-project composer, fetched on demand, with the composer's own placeholder in its place.
 *
 * For a composer that is not its route's first action — the project library's empty state — the
 * placeholder is the one the composer already uses before hydration, so the reserved space and
 * chrome are the same and nothing shifts when the module arrives. Home's hero uses
 * `HomeChatComposer` instead, because the placeholder there has to be a real input.
 */
export function OnDemandNewProjectComposer({
  enableAutoFocus = true,
  className,
}: {
  readonly enableAutoFocus?: boolean;
  readonly className?: string;
}): React.JSX.Element {
  return (
    <Suspense fallback={<ChatTextareaSkeleton className={className} />}>
      <NewProjectChatComposer enableAutoFocus={enableAutoFocus} className={className} />
    </Suspense>
  );
}
