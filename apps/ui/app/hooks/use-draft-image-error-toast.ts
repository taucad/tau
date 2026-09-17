/**
 * Subscribes to a `draftMachine` actor's ingest failures and surfaces one
 * global `toast.error` per failure. This is the **only** site in the app that
 * toasts on attachment ingest — `<ActiveChatProvider>` and each composer
 * provider mount one subscriber per draft, so the entry points (drag/drop,
 * paste, file picker, capture-view, …) never need their own try/catch around
 * the resize or store step. Without this hook, Tiptap paste in particular used
 * to swallow resize errors silently.
 *
 * - `imageResizeFailed`: the image could not be processed.
 * - `attachmentStoreFailed`: the bytes were over the cap or could not be written.
 * - `attachmentRefused`: the selected model cannot read that kind (D20); the
 *   toast names the model.
 */

import { useEffect } from 'react';
import type { ActorRefFrom } from 'xstate';
import type { draftMachine } from '#hooks/draft.machine.js';
import { toast } from '#components/ui/sonner.js';

export function useDraftImageErrorToast(draftActorRef: ActorRefFrom<typeof draftMachine>): void {
  useEffect(() => {
    const subscriptions = [
      draftActorRef.on('imageResizeFailed', (event) => {
        toast.error('Failed to process image', {
          description: event.error.message,
        });
      }),
      draftActorRef.on('attachmentStoreFailed', (event) => {
        toast.error("Couldn't attach file", {
          description: event.error.message,
        });
      }),
      draftActorRef.on('attachmentRefused', (event) => {
        toast.error(`${event.modelName} can't read ${event.kind === 'image' ? 'images' : 'PDFs'}`, {
          description: 'Pick a model that can, or continue without this file.',
        });
      }),
    ];
    return () => {
      for (const subscription of subscriptions) {
        subscription.unsubscribe();
      }
    };
  }, [draftActorRef]);
}
