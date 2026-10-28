/** Balanced vertical insets for user-authored history messages. */
export const chatUserMessagePaddingClassName = 'py-3';

/** The toolbar's bottom inset matches its horizontal inset around the circular send control. */
export const chatComposerPaddingClassName = 'pt-3 pb-2';

/** User messages retain the composer's plain-text line height and wrapping. */
export const chatInputTextClassName = 'text-sm leading-5 wrap-break-word whitespace-pre-wrap text-foreground';

/** The tray owns separators between whichever adornment sections actually render. */
export const chatComposerTrayClassName =
  'mx-2 -mb-3 flex flex-col divide-y divide-border rounded-t-2xl border border-b-0 border-border/60 bg-muted/20 pb-3 empty:hidden';

/** Header glyphs share the queue's size-6 icon columns and centered row geometry. */
export const chatComposerTrayHeaderClassName =
  'relative flex h-auto min-h-8 w-full min-w-0 items-center justify-start gap-2 rounded-none px-2 py-1 text-left font-normal group-first/tray-section:rounded-t-2xl hover:bg-accent/50 hover:text-foreground focus-visible:z-10 [&>svg]:mx-1.25';
