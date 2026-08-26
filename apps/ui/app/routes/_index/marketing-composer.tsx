import { NewProjectChatComposer } from '#components/chat/new-project-chat-composer.js';
import { ChatComposerProvider } from '#hooks/active-chat-provider.js';

/**
 * Marketing chat composer: describe a part, land in a live project. Composer-only
 * (no persisted chat session) — the draft lives in memory and routes into project
 * creation on submit. Used by the hero; the final CTA owns its own provider wrapper
 * around the same shared inner composer.
 */
export function MarketingComposer(): React.JSX.Element {
  return (
    <ChatComposerProvider>
      <NewProjectChatComposer enableAutoFocus={false} />
    </ChatComposerProvider>
  );
}
