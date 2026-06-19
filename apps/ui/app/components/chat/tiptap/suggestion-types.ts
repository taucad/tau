import type { ChipType } from '#components/chat/context-chip.js';

/**
 * Structured metadata for screenshot action items.
 * Carried directly on the item to avoid encoding/decoding action type from string IDs.
 */
export type ScreenshotActionData = { type: 'single' } | { type: 'composite' } | { type: 'view'; entryFile: string };

export type ContextSuggestionItem = {
  id: string;
  label: string;
  chipType: ChipType;
  path?: string;
  group: string;
  /** When true, the item action is handled externally (e.g. screenshot trigger) rather than inserting a chip. */
  isAction?: boolean;
  /** Numeric key for temporal sorting (e.g. `Chat.updatedAt`). Higher values sort first. */
  sortKey?: number;
  /** Structured action metadata for screenshot items. Present when `chipType` is `'screenshot'`. */
  screenshotAction?: ScreenshotActionData;
};

export type SlashCommandItem = {
  id: string;
  label: string;
  title?: string;
  description: string;
  fullDescription?: string;
  group: string;
  source?: string;
};

export type SuggestionPopupState<I> = {
  query: string;
  items: I[];
  command: (item: I) => void;
  // oxlint-disable-next-line @typescript-eslint/no-restricted-types -- Tiptap Suggestion API returns null
  clientRect: (() => DOMRect | null) | undefined;
};

export type SuggestionRenderCallbacks<I> = {
  onStateChange: (state: SuggestionPopupState<I> | undefined) => void;
  // oxlint-disable-next-line @typescript-eslint/no-restricted-types -- React ref object
  keydownHandlerRef: React.RefObject<((event: KeyboardEvent) => boolean) | undefined>;
};
