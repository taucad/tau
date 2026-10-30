import { createElement } from 'react';
import { ChatTextareaSkeleton } from '#components/chat/chat-textarea-skeleton.js';
import { useNewProjectComposer } from '#components/chat/use-new-project-composer.js';

/**
 * The new-project composer, fetched on demand, with the composer's own placeholder in its place.
 *
 * For a composer that is not its route's first action — the project library's empty state — the
 * placeholder is the one the composer already uses before hydration, so the reserved space and
 * chrome are the same and nothing shifts when the module arrives. Home's hero uses
 * `HomeChatComposer` instead, because the placeholder there has to be a real input.
 *
 * Both callers go through `useNewProjectComposer`, so there is one dynamic import of the composer
 * and one retry policy. A `lazy()` boundary here would instead rethrow a rejected import during
 * render, which nothing short of the route's own error boundary would catch, and would cache that
 * rejection so no later render could recover; the loader leaves this placeholder standing instead.
 * The element is built with `createElement` because the composer arrives as a value rather than an
 * import, which `react(static-components)` reads as a component declared during render.
 */
export function OnDemandNewProjectComposer({
  enableAutoFocus = true,
  className,
}: {
  readonly enableAutoFocus?: boolean;
  readonly className?: string;
}): React.JSX.Element {
  const composer = useNewProjectComposer();

  if (composer === undefined) {
    return <ChatTextareaSkeleton className={className} />;
  }
  return createElement(composer, { enableAutoFocus, className });
}
