import { useResponsiveSurfaceContainer } from '#hooks/responsive-surface.js';
import * as React from 'react';
import { Drawer as DrawerPrimitive } from 'vaul';
import { cn } from '#utils/cn.js';

const DrawerContext = React.createContext(false);

type SnapPoint = number | string;
type ActiveSnapPoint = React.ComponentProps<typeof DrawerPrimitive.Root>['activeSnapPoint'];
type DrawerSnapState = {
  readonly points: SnapPoint[];
  readonly active: ActiveSnapPoint;
  readonly setActive: (point: ActiveSnapPoint) => void;
};
const DrawerSnapContext = React.createContext<DrawerSnapState | undefined>(undefined);

function useDrawerSnapState(properties: React.ComponentProps<typeof DrawerPrimitive.Root>): DrawerSnapState {
  const [localPoint, setLocalPoint] = React.useState<ActiveSnapPoint>(properties.snapPoints?.[0] ?? null);
  const setActive = React.useCallback(
    (point: ActiveSnapPoint) => {
      setLocalPoint(point);
      properties.setActiveSnapPoint?.(point ?? null);
    },
    [properties.setActiveSnapPoint],
  );
  return {
    points: properties.snapPoints ?? [],
    active: properties.activeSnapPoint === undefined ? localPoint : properties.activeSnapPoint,
    setActive,
  };
}

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
  const container = useResponsiveSurfaceContainer();
  const snaps = useDrawerSnapState(properties);
  return (
    // oxlint-disable-next-line react/jsx-boolean-value -- we want to explicitly set the value to true
    <DrawerContext.Provider value={true}>
      {/* DrawerContent keeps a focused field above the keyboard. Vaul's own repositioning moves the
          drawer a second time on top of iOS's pan, and with snap points it counts the snap offset
          twice, so it pushes the field off screen. */}
      <DrawerSnapContext.Provider value={snaps}>
        <DrawerPrimitive.Root
          data-slot='drawer'
          container={container}
          repositionInputs={repositionInputs}
          {...properties}
          activeSnapPoint={snaps.active ?? null}
          setActiveSnapPoint={snaps.setActive}
        />
      </DrawerSnapContext.Provider>
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
  const container = useResponsiveSurfaceContainer();
  const snaps = useDrawerSnapState(properties);
  return (
    <DrawerSnapContext.Provider value={snaps}>
      <DrawerPrimitive.NestedRoot
        data-slot='drawer-nested-root'
        container={container}
        repositionInputs={repositionInputs}
        {...properties}
        activeSnapPoint={snaps.active ?? null}
        setActiveSnapPoint={snaps.setActive}
      />
    </DrawerSnapContext.Provider>
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
 * The spoken name of a detent: a half-screen detent is half wherever it sits, otherwise by its place: the lowest is the
 * peek, the tallest is full, and the one between three is half. Names, not percentages, so the same detent reads the
 * same at every viewport height.
 *
 * @param point - Where the detent rests: a fraction of the screen, or a CSS length.
 * @param index - The detent's place, from the lowest.
 * @param count - How many detents the drawer has.
 * @returns Peek, Half or Full.
 */
function detentName(point: SnapPoint | undefined, index: number, count: number): string {
  if (point === 0.5 && count > 1) {
    return 'Half';
  }
  if (index === 0) {
    return 'Peek';
  }
  if (index === count - 1) {
    return 'Full';
  }
  return count === 3 ? 'Half' : `Detent ${index + 1} of ${count}`;
}

/**
 * Supplies Vaul's draggable drawer handle. For multiple snap points it implements the APG slider pattern:
 * arrows step, Home/End select the extremes, and Enter/Space cycle without dismissing. The current detent is announced
 * by name (Peek, Half, Full).
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
function DrawerHandle({
  onKeyDown,
  ...properties
}: React.ComponentProps<typeof DrawerPrimitive.Handle>): React.JSX.Element {
  const snaps = React.useContext(DrawerSnapContext);
  const adjustable = snaps !== undefined && snaps.points.length > 1;
  const index = adjustable ? Math.max(0, snaps.points.indexOf(snaps.active ?? snaps.points[0]!)) : 0;
  return (
    <DrawerPrimitive.Handle
      data-slot='drawer-handle'
      {...(adjustable
        ? {
            role: 'slider',
            tabIndex: 0,
            'aria-hidden': false,
            'aria-label': 'Drawer height',
            'aria-orientation': 'vertical',
            'aria-valuemin': 1,
            'aria-valuemax': snaps.points.length,
            'aria-valuenow': index + 1,
            'aria-valuetext': detentName(snaps.points[index], index, snaps.points.length),
          }
        : {})}
      {...properties}
      onKeyDown={(event) => {
        onKeyDown?.(event);
        if (event.defaultPrevented || !adjustable) {
          return;
        }
        const next =
          event.key === 'Home'
            ? 0
            : event.key === 'End'
              ? snaps.points.length - 1
              : event.key === 'ArrowUp' || event.key === 'ArrowRight'
                ? Math.min(index + 1, snaps.points.length - 1)
                : event.key === 'ArrowDown' || event.key === 'ArrowLeft'
                  ? Math.max(index - 1, 0)
                  : event.key === 'Enter' || event.key === ' '
                    ? (index + 1) % snaps.points.length
                    : undefined;
        if (next === undefined) {
          return;
        }
        event.preventDefault();
        event.stopPropagation();
        snaps.setActive(snaps.points[next]);
      }}
    />
  );
}

/**
 * The grabber row: an 8px row whose bar sits 4px below the sheet's edge and ends where the row does, so no empty band
 * separates it from the header below. A header's actions then keep the same space above them as below. Its 16px
 * target is the row plus 8px above the sheet's edge: the header's actions are never part of it, and content docked
 * above a sheet keeps 8px clear of its edge.
 */
function DrawerHandleIndicator({ className, ...properties }: React.ComponentProps<'div'>): React.JSX.Element {
  return (
    <div className='relative hidden h-(--drawer-handle-height) shrink-0 group-data-[vaul-drawer-direction=bottom]/drawer-content:block has-[:focus-visible]:focus-outline'>
      <DrawerHandle className='absolute! inset-x-0! -top-2! bottom-0! m-0! h-auto! w-full! opacity-0! [&>[data-vaul-handle-hitarea]]:size-full!' />
      <div
        data-slot='drawer-handle-indicator'
        className={cn(
          'pointer-events-none absolute inset-x-0 bottom-0 mx-auto h-1 w-15 rounded-full bg-accent',
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
  overlayClassName,
  children,
  style,
  onFocus,
  onBlur,
  ...properties
}: React.ComponentProps<typeof DrawerPrimitive.Content> & {
  /** Classes for the overlay behind the drawer, such as a z-index that matches the content's. */
  readonly overlayClassName?: string;
}): React.JSX.Element {
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
      <DrawerOverlay className={overlayClassName} />
      <DrawerPrimitive.Content
        data-slot='drawer-content'
        data-keyboard={keyboard ? 'open' : undefined}
        style={frameStyle ? { ...style, ...frameStyle } : style}
        className={cn(
          'group/drawer-content fixed z-50 flex h-auto flex-col bg-background [--drawer-handle-height:calc(var(--spacing)*2)]',
          'select-none',
          /* A field is editable text even inside an unselectable drawer: WebKit inherits
             user-select, and iOS will not place a caret in an editor under user-select: none. */
          '[&_:is(input,textarea,[contenteditable=true])]:select-text',
          /* While a field has the keyboard, a bottom drawer fills the visible frame above it, at
             any snap point; the !s outrank the inline geometry vaul and callers set. */
          'data-[keyboard=open]:data-[vaul-drawer-direction=bottom]:bottom-(--keyboard-frame-bottom)!',
          'data-[keyboard=open]:data-[vaul-drawer-direction=bottom]:max-h-(--keyboard-frame-height)!',
          'data-[keyboard=open]:data-[vaul-drawer-direction=bottom]:transform-none!',
          /* A drawer is a touch surface: its list rows and their filter field take the touch row height. */
          '[&_[data-slot=command-item]]:min-h-touch-row [&_[data-slot=command-input]]:h-touch-row',
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
