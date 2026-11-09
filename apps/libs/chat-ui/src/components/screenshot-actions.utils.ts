import type { ContextSuggestionItem } from '#components/tiptap/suggestion-types.js';

type ContextActionCallbacks = {
  handleAddImage: (image: string) => void;
  onScreenshotAction?: (item: ContextSuggestionItem) => void;
};

/**
 * Creates a handler for context action items from the `@` suggestion menu.
 * Items with `chipType: 'screenshot'` are routed to the capture mechanism
 * (`onScreenshotAction`), which performs actual screenshot capture and eventually
 * calls `handleAddImage` with a valid data URL.
 */
export function createScreenshotContextHandler(
  callbacks: ContextActionCallbacks,
): (item: ContextSuggestionItem) => void {
  return (item) => {
    if (item.chipType === 'screenshot') {
      callbacks.onScreenshotAction?.(item);
    }
  };
}
