import * as React from 'react';
import { Drawer as DrawerPrimitive } from 'vaul';
import { cn } from '#utils/cn.js';

const DrawerContext = React.createContext(false);

/** A visual viewport shorter than the layout viewport by less than this is browser chrome, not a keyboard. CSS pixels. */
const softKeyboardThreshold = 120;

/** The slice of the layout viewport the user can see. CSS pixels, layout-viewport coordinates. */
type VisibleFrame = { readonly top: number; readonly bottom: number };

let visibleFrame: VisibleFrame | undefined;

/* A software keyboard shrinks only the visual viewport, and iOS also pans it down to reveal the
   focused field, so what the user sees is `offsetTop` to `offsetTop + height`. A pinch zoom shrinks
   it too, so a scaled viewport never reads as a keyboard. */
function readKeyboardFrame(): VisibleFrame | undefined {
  const viewport = globalThis.visualViewport;
  if (!viewport || viewport.scale > 1.01 || globalThis.innerHeight - viewport.height < softKeyboardThreshold) {
    visibleFrame = undefined;
    return visibleFrame;
  }
  const top = Math.round(viewport.offsetTop);
  const bottom = Math.round(viewport.offsetTop + viewport.height);
  if (visibleFrame?.top !== top || visibleFrame.bottom !== bottom) {
    visibleFrame = { top, bottom };
  }
  return visibleFrame;
}

function subscribeKeyboardFrame(onChange: () => void): () => void {
  const viewport = globalThis.visualViewport;
  viewport?.addEventListener('resize', onChange);
  viewport?.addEventListener('scroll', onChange);
  return () => {
    viewport?.removeEventListener('resize', onChange);
    viewport?.removeEventListener('scroll', onChange);
  };
}

const readNoKeyboard = (): undefined => undefined;

const nonTextInputTypes = new Set([
  'button',
  'checkbox',
  'color',
  'file',
  'image',
  'radio',
  'range',
  'reset',
  'submit',
]);

function isTextEntry(target: EventTarget): boolean {
  if (target instanceof HTMLInputElement) {
    return !nonTextInputTypes.has(target.type);
  }
  return target instanceof HTMLTextAreaElement || (target instanceof HTMLElement && target.isContentEditable);
}

/**
 * Reports whether the caller is rendered inside a {@link Drawer}.
 *
 * @public
 * @example <caption>Adapt a component to a drawer context.</caption>
 * ```typescript
 * import { useIsInsideDrawer } from '@taucad/ui/components/drawer';
 *
 * const DrawerAware = () => useIsInsideDrawer() ? 'drawer' : 'page';
 * ```
 */
function useIsInsideDrawer(): boolean {
  return React.useContext(DrawerContext);
}

/**
 * Owns the open state and gesture lifecycle for a drawer. `repositionInputs` defaults to `false`:
 * {@link DrawerContent} keeps a focused field above the keyboard instead.
 *
 * @public
 * @example <caption>Open a drawer by default.</caption>
 * ```typescript
 * import { createElement } from 'react';
 * import { Drawer } from '@taucad/ui/components/drawer';
 *
 * createElement(Drawer, { defaultOpen: true });
 * ```
 */
function Drawer({
  repositionInputs = false,
  ...properties
}: React.ComponentProps<typeof DrawerPrimitive.Root>): React.JSX.Element {
  return (
    // oxlint-disable-next-line react/jsx-boolean-value -- we want to explicitly set the value to true
    <DrawerContext.Provider value={true}>
      {/* DrawerContent keeps a focused field above the keyboard. Vaul's own repositioning moves the
          drawer a second time on top of iOS's pan, and with snap points it counts the snap offset
          twice, so it pushes the field off screen. */}
      <DrawerPrimitive.Root data-slot='drawer' repositionInputs={repositionInputs} {...properties} />
    </DrawerContext.Provider>
  );
}

/**
 * Creates a drawer nested inside another drawer.
 *
 * @public
 * @example <caption>Render a nested drawer root.</caption>
 * ```typescript
 * import { createElement } from 'react';
 * import { DrawerNestedRoot } from '@taucad/ui/components/drawer';
 *
 * createElement(DrawerNestedRoot);
 * ```
 */
function DrawerNestedRoot({
  repositionInputs = false,
  ...properties
}: React.ComponentProps<typeof DrawerPrimitive.NestedRoot>): React.JSX.Element {
  return (
    <DrawerPrimitive.NestedRoot data-slot='drawer-nested-root' repositionInputs={repositionInputs} {...properties} />
  );
}

/**
 * Opens the nearest drawer when activated.
 *
 * @public
 * @example <caption>Render a drawer trigger.</caption>
 * ```typescript
 * import { createElement } from 'react';
 * import { DrawerTrigger } from '@taucad/ui/components/drawer';
 *
 * createElement(DrawerTrigger, null, 'Details');
 * ```
 */
function DrawerTrigger({ ...properties }: React.ComponentProps<typeof DrawerPrimitive.Trigger>): React.JSX.Element {
  return <DrawerPrimitive.Trigger data-slot='drawer-trigger' {...properties} />;
}

/**
 * Portals drawer content into the document body.
 *
 * @public
 * @example <caption>Render content through the drawer portal.</caption>
 * ```typescript
 * import { createElement } from 'react';
 * import { DrawerPortal } from '@taucad/ui/components/drawer';
 *
 * createElement(DrawerPortal, null, createElement('div'));
 * ```
 */
function DrawerPortal({ ...properties }: React.ComponentProps<typeof DrawerPrimitive.Portal>): React.JSX.Element {
  return <DrawerPrimitive.Portal data-slot='drawer-portal' {...properties} />;
}

/**
 * Closes the nearest drawer when activated.
 *
 * @public
 * @example <caption>Render a drawer close control.</caption>
 * ```typescript
 * import { createElement } from 'react';
 * import { DrawerClose } from '@taucad/ui/components/drawer';
 *
 * createElement(DrawerClose, null, 'Done');
 * ```
 */
function DrawerClose({ ...properties }: React.ComponentProps<typeof DrawerPrimitive.Close>): React.JSX.Element {
  return <DrawerPrimitive.Close data-slot='drawer-close' {...properties} />;
}

/**
 * Supplies Vaul's draggable drawer handle.
 *
 * @public
 * @example <caption>Render a drawer handle.</caption>
 * ```typescript
 * import { createElement } from 'react';
 * import { DrawerHandle } from '@taucad/ui/components/drawer';
 *
 * createElement(DrawerHandle);
 * ```
 */
function DrawerHandle({ ...properties }: React.ComponentProps<typeof DrawerPrimitive.Handle>): React.JSX.Element {
  return <DrawerPrimitive.Handle data-slot='drawer-handle' {...properties} />;
}

function DrawerHandleIndicator({ className, ...properties }: React.ComponentProps<'div'>): React.JSX.Element {
  return (
    <div className='relative'>
      <DrawerHandle className='absolute! inset-0! m-auto! size-full! opacity-0!' />
      <div
        data-slot='drawer-handle-indicator'
        className={cn(
          'relative mx-auto mt-1 hidden h-1 w-15 shrink-0 rounded-full bg-accent group-data-[vaul-drawer-direction=bottom]/drawer-content:block',
          className,
        )}
        {...properties}
      />
    </div>
  );
}

/**
 * Dims the page behind an open drawer.
 *
 * @public
 * @example <caption>Render the drawer overlay.</caption>
 * ```typescript
 * import { createElement } from 'react';
 * import { DrawerOverlay } from '@taucad/ui/components/drawer';
 *
 * createElement(DrawerOverlay);
 * ```
 */
function DrawerOverlay({
  className,
  ...properties
}: React.ComponentProps<typeof DrawerPrimitive.Overlay>): React.JSX.Element {
  return (
    <DrawerPrimitive.Overlay
      data-slot='drawer-overlay'
      className={cn(
        'fixed inset-0 z-50 bg-black/50 data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:animate-in data-[state=open]:fade-in-0',
        className,
      )}
      {...properties}
    />
  );
}

/**
 * Renders the draggable drawer surface. While a field inside a bottom drawer has the software
 * keyboard, the drawer fills the part of the screen the keyboard leaves visible, so the field
 * stays in view, and it exposes that state as `data-keyboard="open"`.
 *
 * @public
 * @example <caption>Render drawer content.</caption>
 * ```typescript
 * import { createElement } from 'react';
 * import { DrawerContent } from '@taucad/ui/components/drawer';
 *
 * createElement(DrawerContent, null, 'Project details');
 * ```
 */
function DrawerContent({
  className,
  children,
  style,
  onFocus,
  onBlur,
  ...properties
}: React.ComponentProps<typeof DrawerPrimitive.Content>): React.JSX.Element {
  const keyboardFrame = React.useSyncExternalStore(subscribeKeyboardFrame, readKeyboardFrame, readNoKeyboard);
  const [isEditing, setIsEditing] = React.useState(false);
  const keyboard = isEditing ? keyboardFrame : undefined;

  /* Fitting the drawer to the frame can leave the field below the fold of a scrolling panel. */
  React.useEffect(() => {
    if (keyboard && document.activeElement instanceof HTMLElement) {
      document.activeElement.scrollIntoView({ block: 'nearest' });
    }
  }, [keyboard]);

  const frameStyle: Record<`--${string}`, string> | undefined = keyboard
    ? {
        '--keyboard-frame-bottom': `${globalThis.innerHeight - keyboard.bottom}px`,
        '--keyboard-frame-height': `${keyboard.bottom - keyboard.top}px`,
      }
    : undefined;

  return (
    <DrawerPortal data-slot='drawer-portal'>
      <DrawerOverlay />
      <DrawerPrimitive.Content
        data-slot='drawer-content'
        data-keyboard={keyboard ? 'open' : undefined}
        style={frameStyle ? { ...style, ...frameStyle } : style}
        className={cn(
          'group/drawer-content fixed z-50 flex h-auto flex-col bg-background',
          'select-none',
          /* A field is editable text even inside an unselectable drawer: WebKit inherits
             user-select, and iOS will not place a caret in an editor under user-select: none. */
          '[&_:is(input,textarea,[contenteditable=true])]:select-text',
          /* While a field has the keyboard, a bottom drawer fills the visible frame above it, at
             any snap point; the !s outrank the inline geometry vaul and callers set. */
          'data-[keyboard=open]:data-[vaul-drawer-direction=bottom]:bottom-(--keyboard-frame-bottom)!',
          'data-[keyboard=open]:data-[vaul-drawer-direction=bottom]:max-h-(--keyboard-frame-height)!',
          'data-[keyboard=open]:data-[vaul-drawer-direction=bottom]:transform-none!',
          /* A drawer is a touch surface: its list rows are 44px thumb targets (Tau's spacing unit is 4.4px). */
          '[&_[data-slot=command-item]]:min-h-10',
          'data-[vaul-drawer-direction=bottom]:pb-[env(safe-area-inset-bottom)]',
          'data-[vaul-drawer-direction=top]:inset-x-0 data-[vaul-drawer-direction=top]:top-0 data-[vaul-drawer-direction=top]:mb-24 data-[vaul-drawer-direction=top]:max-h-[80vh] data-[vaul-drawer-direction=top]:rounded-b-lg data-[vaul-drawer-direction=top]:border-b',
          'data-[vaul-drawer-direction=bottom]:inset-x-0 data-[vaul-drawer-direction=bottom]:bottom-0 data-[vaul-drawer-direction=bottom]:mt-24 data-[vaul-drawer-direction=bottom]:max-h-[80vh] data-[vaul-drawer-direction=bottom]:rounded-t-lg data-[vaul-drawer-direction=bottom]:border-t',
          'data-[vaul-drawer-direction=right]:inset-y-0 data-[vaul-drawer-direction=right]:right-0 data-[vaul-drawer-direction=right]:w-3/4 data-[vaul-drawer-direction=right]:border-l data-[vaul-drawer-direction=right]:sm:max-w-sm',
          'data-[vaul-drawer-direction=left]:inset-y-0 data-[vaul-drawer-direction=left]:left-0 data-[vaul-drawer-direction=left]:w-3/4 data-[vaul-drawer-direction=left]:border-r data-[vaul-drawer-direction=left]:sm:max-w-sm',
          className,
        )}
        onFocus={(event) => {
          setIsEditing(isTextEntry(event.target));
          onFocus?.(event);
        }}
        onBlur={(event) => {
          setIsEditing(false);
          onBlur?.(event);
        }}
        {...properties}
      >
        <DrawerHandleIndicator />
        {children}
      </DrawerPrimitive.Content>
    </DrawerPortal>
  );
}

/**
 * Groups a drawer title and description.
 *
 * @public
 * @example <caption>Render a drawer header.</caption>
 * ```typescript
 * import { createElement } from 'react';
 * import { DrawerHeader } from '@taucad/ui/components/drawer';
 *
 * createElement(DrawerHeader, null, 'Project details');
 * ```
 */
function DrawerHeader({ className, ...properties }: React.ComponentProps<'div'>): React.JSX.Element {
  return <div data-slot='drawer-header' className={cn('flex flex-col gap-1.5 p-4', className)} {...properties} />;
}

/**
 * Aligns actions at the bottom of a drawer.
 *
 * @public
 * @example <caption>Render a drawer footer.</caption>
 * ```typescript
 * import { createElement } from 'react';
 * import { DrawerFooter } from '@taucad/ui/components/drawer';
 *
 * createElement(DrawerFooter, null, 'Actions');
 * ```
 */
function DrawerFooter({ className, ...properties }: React.ComponentProps<'div'>): React.JSX.Element {
  return <div data-slot='drawer-footer' className={cn('mt-auto flex flex-col gap-2 p-4', className)} {...properties} />;
}

/**
 * Provides the accessible name for a drawer.
 *
 * @public
 * @example <caption>Name a drawer.</caption>
 * ```typescript
 * import { createElement } from 'react';
 * import { DrawerTitle } from '@taucad/ui/components/drawer';
 *
 * createElement(DrawerTitle, null, 'Project details');
 * ```
 */
function DrawerTitle({
  className,
  ...properties
}: React.ComponentProps<typeof DrawerPrimitive.Title>): React.JSX.Element {
  return (
    <DrawerPrimitive.Title
      data-slot='drawer-title'
      className={cn('font-semibold text-foreground', className)}
      {...properties}
    />
  );
}

/**
 * Provides supporting text for a drawer.
 *
 * @public
 * @example <caption>Describe a drawer.</caption>
 * ```typescript
 * import { createElement } from 'react';
 * import { DrawerDescription } from '@taucad/ui/components/drawer';
 *
 * createElement(DrawerDescription, null, 'Inspect project metadata.');
 * ```
 */
function DrawerDescription({
  className,
  ...properties
}: React.ComponentProps<typeof DrawerPrimitive.Description>): React.JSX.Element {
  return (
    <DrawerPrimitive.Description
      data-slot='drawer-description'
      className={cn('text-sm text-muted-foreground', className)}
      {...properties}
    />
  );
}

export {
  Drawer,
  DrawerNestedRoot,
  DrawerPortal,
  DrawerOverlay,
  DrawerTrigger,
  DrawerClose,
  DrawerHandle,
  DrawerContent,
  DrawerHeader,
  DrawerFooter,
  DrawerTitle,
  DrawerDescription,
  useIsInsideDrawer,
};
