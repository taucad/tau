/**
 * Production resize-image actor for `draftMachine`.
 *
 * This is the **single** chokepoint that wraps `resizeImageForChat()` and is
 * provided to the draft machine via `.provide({ actors: { resizeImageActor } })`
 * by both ownership sites:
 *
 * - `EphemeralActiveChatProvider` (marketing / homepage routes — no real chat)
 * - `ChatSessionStore` (session-backed real chats)
 *
 * Tests override this actor via `draftMachine.provide(...)` with a fake
 * resize implementation. The actor returns an `imageResized` event whose
 * `resized` payload is appended to `draftImages` / `editDraftImages` by the
 * `imageProcessing.resizing` state.
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
