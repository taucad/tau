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

/*
 * The composer's shape, shared by the rich composer and the native stand-in Home serves before the
 * rich composer's chunk arrives (R2). Both draw the same box from these strings, so the swap
 * between them changes nothing on screen. This module has no imports, so a route can carry it
 * without carrying the editor.
 */

/** What an empty main composer says; the editor's accessible name too. */
export const chatComposerPlaceholder = 'Ask Tau to build anything...';

/** The positioning context around the composer box (the beam overlay's, and the `composer` container). */
export const chatComposerShellClassName = '@container/composer relative w-full';

/** The composer box: border, padding, background and shadow. Its corners are the caller's (F19). */
export const chatComposerFrameClassName = `group/chat-textarea @container relative flex w-full flex-col border border-border/60 bg-background ${chatComposerPaddingClassName} cursor-text overflow-hidden shadow-sm`;

/** The scrolling area that holds the editor. */
export const chatComposerEditorAreaClassName = 'max-h-48 min-w-0 overflow-y-auto overscroll-contain';

/** The main composer's editor area stops growing at 30% of its container's height. */
export const chatComposerMainEditorAreaClassName = 'max-h-[min(12rem,30cqh)]';

/** The editor's text box: one line plus its bottom inset, and 16px text under touch, since iOS zooms into anything smaller. */
export const chatComposerEditorTextClassName = `w-full min-h-6 px-3 pb-3 ${chatInputTextClassName} pointer-coarse:text-base pointer-coarse:leading-6`;

/** The ghost pill every composer control shares: h-7, round, no boundary at rest, muted until hover. */
export const chatComposerGhostPillClassName =
  'h-7 rounded-full px-2.5 font-normal text-muted-foreground hover:text-foreground';

/** A collapsible composer animates these between its one-row rest and its full layout. */
export const chatComposerCollapseTransitionClassName =
  'transition-[padding,margin,border-radius,corner-shape,opacity,visibility] duration-200 ease-out motion-reduce:transition-none';

/**
 * Touch targets (I3). The bar keeps its 28px controls, so the composer keeps its geometry, but
 * under a coarse pointer each control's hit area reaches 40px and the controls sit 12px apart, so
 * neighbouring hit areas meet without overlapping.
 */
const composerTouchTargetsClassName =
  "pointer-coarse:gap-3 pointer-coarse:[&_button]:relative pointer-coarse:[&_button]:after:absolute pointer-coarse:[&_button]:after:-inset-1.5 pointer-coarse:[&_button]:after:content-['']";

/** The bar, risen onto the editor's line in a collapsed composer; taps between its controls reach the editor. */
const collapsedBarClassName = `${chatComposerCollapseTransitionClassName} @max-[768px]/composer:group-data-[collapsed]/chat-textarea:-mt-6.5 @max-[768px]/composer:group-data-[collapsed]/chat-textarea:pointer-events-none`;

/** The composer's one bar (D6): two clusters, `justify-between`, so they can never overlap (F4). */
export const chatComposerBarClassName = `group/bar flex items-center justify-between gap-2 px-2 ${composerTouchTargetsClassName} ${collapsedBarClassName}`;

/** The bar's left cluster: +, then the controls a collapsed composer hides. */
export const chatComposerBarLeftClassName =
  'pointer-events-auto flex shrink-0 flex-row items-center gap-0.5 pointer-coarse:gap-3';

/** The bar's right cluster: the controls a collapsed composer hides, then dictation and Send. */
export const chatComposerBarRightClassName =
  'pointer-events-auto flex min-w-0 flex-row items-center gap-1 pointer-coarse:gap-3';

/** Controls a collapsed composer hides: every one but +, dictation and Send. */
export const chatComposerCollapsibleControlsClassName = `${chatComposerCollapseTransitionClassName} flex min-w-0 flex-row items-center empty:hidden @max-[768px]/composer:group-data-[collapsed]/chat-textarea:invisible @max-[768px]/composer:group-data-[collapsed]/chat-textarea:opacity-0`;

/** The model trigger's ghost pill, beside Send. */
export const chatComposerModelTriggerClassName = `${chatComposerGhostPillClassName} max-w-64 min-w-0 shrink gap-1 pr-2 text-foreground`;

/** The + menu's trigger: a round 28px ghost button. */
export const chatComposerAddTriggerClassName = `${chatComposerGhostPillClassName} w-7 shrink-0 px-0`;
