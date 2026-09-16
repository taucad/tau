/**
 * Production resize-image actor for `draftMachine`.
 *
 * This is the **single** chokepoint that wraps `resizeImageForChat()` and is
 * provided to the draft machine via `.provide({ actors: { resizeImageActor } })`
 * by both ownership sites:
 *
 * - `active-chat-provider.tsx` (the marketing and Home composers)
 * - `ChatSessionStore` (session-backed real chats)
 *
 * Tests override this actor via `draftMachine.provide(...)` with a fake
 * resize implementation. The actor returns an `imageResized` event whose
 * `resized` data URL the `attachmentProcessing.resizing` state decodes and
 * hands to `storing`; only the stored attachment reaches the draft. Documents
 * never enter this actor.
 *
 * See `apps/ui/app/hooks/draft.machine.ts` for the consumer state machine.
 */

import { fromSafeAsync } from '#lib/xstate.lib.js';
import { resizeImageForChat } from '#utils/resize-image.js';

export const resizeImageActor = fromSafeAsync<
  { type: 'imageResized'; resized: string },
  { image: string; preserveOriginal: boolean }
>(async ({ input }) => {
  const resized = input.preserveOriginal ? input.image : await resizeImageForChat(input.image);
  return { type: 'imageResized', resized };
});
