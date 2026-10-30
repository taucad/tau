import { useEffect, useState } from 'react';
import type { ComponentType } from 'react';
import { ChatEarlyInput } from '#components/chat/chat-early-input.js';
import type { EarlyChatInput } from '#components/chat/chat-early-input.js';

type ComposerProperties = {
  readonly adoptedEarlyInput: EarlyChatInput;
  readonly enableAutoFocus?: boolean;
};

/**
 * Home's composer, with the native input in the route's own bundle and the rich composer in none.
 *
 * `ChatEarlyInput` used to be rendered by `ChatTextarea`, so the whole composer graph — the rich
 * editor, the skills catalog, the file manager, the headless image service — had to be fetched and
 * evaluated before Home could accept a keystroke, even though the thing that accepts the keystroke
 * is a native textarea. Here the route imports only the native input and asks for the composer in
 * an effect, so that graph is a dynamic chunk: Home's static closure loses it, and the input that
 * satisfies the first-action contract is in the served document as before.
 *
 * The handover is unchanged and still belongs to `ChatEarlyInput`: this component only withholds
 * `isHostReady` until the module is here, so the native input keeps accepting and holding text until
 * there is something to hand it to, rather than being replaced by a pending boundary.
 *
 * A rejected import leaves the native input standing with whatever the user has typed, which is why
 * it is caught: an unreachable chunk must not take the text with it. It is tried once more, because
 * a single failed fetch during a deploy is the common case and a second one is not.
 */
function reportComposerLoadFailure(error: unknown): void {
  console.error('Home composer module could not be loaded; the native input keeps the draft.', error);
}

export function HomeChatComposer({
  enableAutoFocus = true,
}: {
  readonly enableAutoFocus?: boolean;
}): React.JSX.Element {
  const [Composer, setComposer] = useState<ComponentType<ComposerProperties>>();

  useEffect(() => {
    let live = true;
    const fetchComposer = async (): Promise<void> => {
      const composerModule = await import('#components/chat/new-project-chat-composer.js');
      if (live) {
        setComposer(() => composerModule.NewProjectChatComposer);
      }
    };
    const load = async (): Promise<void> => {
      /* Tried twice: one failed fetch during a deploy is the common case and a second is not. A
       * rejection that survives both leaves the native input standing with the user's text, which
       * is the whole reason it is caught rather than allowed to replace the hero with an error. */
      try {
        await fetchComposer();
      } catch {
        if (!live) {
          return;
        }
        try {
          await fetchComposer();
        } catch (error) {
          reportComposerLoadFailure(error);
        }
      }
    };
    // async-iife: bootstrap — React effects cannot await the import; the live flag owns its lifecycle.
    void load();
    return () => {
      live = false;
    };
  }, []);

  return (
    <ChatEarlyInput isHostReady={Composer !== undefined}>
      {(input) =>
        Composer === undefined ? null : <Composer adoptedEarlyInput={input} enableAutoFocus={enableAutoFocus} />
      }
    </ChatEarlyInput>
  );
}
