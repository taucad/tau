import { Extension } from '@tiptap/core';

export type SubmitOnEnterOptions = {
  onSubmit: () => void;
  onEscape?: () => void;
};

// eslint-disable-next-line @typescript-eslint/naming-convention -- Tiptap extensions are PascalCase by convention
export const SubmitOnEnter = Extension.create<SubmitOnEnterOptions>({
  name: 'submitOnEnter',

  addOptions() {
    return {
      // oxlint-disable-next-line no-empty-function -- default no-op, overridden by consumer
      onSubmit: () => {},
      onEscape: undefined,
    };
  },

  addKeyboardShortcuts() {
    return {
      // eslint-disable-next-line @typescript-eslint/naming-convention -- Tiptap keyboard shortcut API key
      Enter: () => {
        /* Q15: on a touch keyboard, return starts a new line and only Send sends. */
        if (globalThis.matchMedia('(pointer: coarse)').matches) {
          return false;
        }
        this.options.onSubmit();
        return true;
      },
      // eslint-disable-next-line @typescript-eslint/naming-convention -- Tiptap keyboard shortcut API key
      Escape: () => {
        this.options.onEscape?.();
        return true;
      },
    };
  },
});
