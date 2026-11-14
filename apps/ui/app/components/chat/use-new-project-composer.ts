import { useEffect, useState } from 'react';
import type { ComponentType } from 'react';
import type { EarlyChatInput } from '#components/chat/chat-early-input.js';

export type NewProjectComposerProperties = {
  readonly adoptedEarlyInput?: EarlyChatInput;
  readonly enableAutoFocus?: boolean;
  readonly className?: string;
};

function reportComposerLoadFailure(error: unknown): void {
  console.error('The new-project composer module could not be loaded.', error);
}

/**
 * Fetch the new-project composer on demand, so a route that renders it does not carry it.
 *
 * `NewProjectChatComposer` reaches the rich editor, the skills catalog, the file manager and the
 * headless image service, and every route that imports it statically evaluates all of that before
 * it can show anything. Both of Home's composers are below or behind something a user can already
 * act on — the hero has its own native input, and the library's is in an empty state — so neither
 * needs to be in the route's static closure. Returns `undefined` until the module is here.
 *
 * A rejected import is caught and tried once more, because one failed fetch during a deploy is the
 * common case and a second is not. A rejection that survives both leaves the caller's placeholder
 * standing, which is why callers own what that placeholder is.
 */
export function useNewProjectComposer(): ComponentType<NewProjectComposerProperties> | undefined {
  const [composer, setComposer] = useState<ComponentType<NewProjectComposerProperties>>();

  useEffect(() => {
    let live = true;
    const fetchComposer = async (): Promise<void> => {
      const composerModule = await import('#components/chat/new-project-chat-composer.js');
      if (live) {
        setComposer(() => composerModule.NewProjectChatComposer);
      }
    };
    const load = async (): Promise<void> => {
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

  return composer;
}
