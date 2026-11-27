import { useEffect, useState } from 'react';
import type { ComponentType } from 'react';
import type { EarlyChatInput } from '#components/chat/chat-early-input.js';
import type { NewProjectChatComposer } from '#components/chat/new-project-chat-composer.js';
import { loadCode } from '@taucad/ui-core/lib/code-loading';

export type NewProjectComposerProperties = {
  readonly adoptedEarlyInput?: EarlyChatInput;
  readonly enableAutoFocus?: boolean;
  readonly className?: string;
};

type NewProjectComposerModule = { readonly NewProjectChatComposer: typeof NewProjectChatComposer };

/** This page's fetch of the composer's chunk, while it is in flight or once it is in. */
let composerLoad: Promise<NewProjectComposerModule> | undefined;

/**
 * Import the composer's chunk through the code-loading owner. A failure is kept: this page can never load the module
 * again (FP9), and the owner has already handed it to the page's recovery, which reloads an untouched page.
 */
const importComposer = async (): Promise<NewProjectComposerModule> =>
  loadCode(async () => import('#components/chat/new-project-chat-composer.js'));

/**
 * Start fetching the new-project composer's chunk, once per page. Home calls it as its module evaluates, so the chunk
 * downloads beside hydration instead of after the composer's host mounts (progressive loading PL5, "composer chunk
 * preloaded"). A failed fetch is kept: asking again in this page would fail the same way.
 *
 * @returns The composer's module.
 */
export const preloadNewProjectComposer = async (): Promise<NewProjectComposerModule> => {
  composerLoad ??= importComposer();
  return composerLoad;
};

/**
 * Start fetching the composer's chunk without waiting for it. A failure is dropped here: the hook reports it when the
 * composer's host mounts.
 */
export const prefetchNewProjectComposer = (): void => {
  const prefetch = async (): Promise<void> => {
    try {
      await preloadNewProjectComposer();
    } catch {
      // The hook owns the report.
    }
  };
  // async-iife: bootstrap — a module-evaluation prefetch cannot await; its failure is the hook's to report.
  void prefetch();
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
 * A rejected import is not tried again: the page keeps a module that failed to load failed, so the
 * code-loading owner hands it to the page's recovery instead (FP9), and the caller's placeholder
 * stands until the page reloads, which is why callers own what that placeholder is.
 */
export function useNewProjectComposer(): ComponentType<NewProjectComposerProperties> | undefined {
  const [composer, setComposer] = useState<ComponentType<NewProjectComposerProperties>>();

  useEffect(() => {
    let live = true;
    const fetchComposer = async (): Promise<void> => {
      const composerModule = await preloadNewProjectComposer();
      if (live) {
        setComposer(() => composerModule.NewProjectChatComposer);
      }
    };
    const load = async (): Promise<void> => {
      try {
        await fetchComposer();
      } catch (error) {
        if (live) {
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
