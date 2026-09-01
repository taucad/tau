import * as React from 'react';
import { Slot as SlotPrimitive, Tabs as TabsPrimitive } from 'radix-ui';
import { cn } from '#utils/cn.js';

/**
 * Properties for the tabs root.
 *
 * @public
 *
 * @example <caption>Configure uncontrolled tabs</caption>
 * ```typescript
 * import type { TabsProps } from '@taucad/ui/components/tabs';
 *
 * export const properties: TabsProps = { defaultValue: 'details' };
 * ```
 */
type TabsProps = React.ComponentProps<typeof TabsPrimitive.Root>;

/**
 * Properties for a tabs list. Animation properties remain as deprecated no-ops
 * so applications can migrate motion to their own layer without a flag day.
 *
 * @public
 *
 * @example <caption>Style the active indicator</caption>
 * ```typescript
 * import type { TabsListProps } from '@taucad/ui/components/tabs';
 *
 * export const properties: TabsListProps = { activeClassName: 'shadow-none' };
 * ```
 */
type TabsListProps = React.ComponentProps<typeof TabsPrimitive.List> & {
  readonly activeClassName?: string;
  /** Compatibility no-op; motion belongs in the consuming application. */
  readonly transition?: unknown;
  /** Compatibility no-op; the package indicator is always non-animated. */
  readonly enableAnimation?: boolean;
};

/**
 * Properties for a tabs trigger.
 *
 * @public
 *
 * @example <caption>Configure a tab trigger</caption>
 * ```typescript
 * import type { TabsTriggerProps } from '@taucad/ui/components/tabs';
 *
 * export const properties: TabsTriggerProps = { value: 'details' };
 * ```
 */
type TabsTriggerProps = React.ComponentProps<typeof TabsPrimitive.Trigger> & {
  /** Compatibility no-op; the package indicator is always non-animated. */
  readonly enableAnimation?: boolean;
};

/**
 * Properties for one tab panel.
 *
 * @public
 *
 * @example <caption>Configure a tab panel</caption>
 * ```typescript
 * import type { TabsContentProps } from '@taucad/ui/components/tabs';
 *
 * export const properties: TabsContentProps = { value: 'details' };
 * ```
 */
type TabsContentProps = React.ComponentProps<typeof TabsPrimitive.Content> & {
  /** Compatibility no-op; motion belongs in the consuming application. */
  readonly transition?: unknown;
  /** Compatibility no-op; tab panels are always non-animated. */
  readonly enableAnimation?: boolean;
};

/**
 * Properties for the optional wrapper around several tab panels.
 *
 * @public
 *
 * @example <caption>Configure a panel wrapper</caption>
 * ```typescript
 * import type { TabsContentsProps } from '@taucad/ui/components/tabs';
 *
 * export const properties: TabsContentsProps = { children: 'Panel content' };
 * ```
 */
type TabsContentsProps = React.ComponentProps<'div'> & {
  /** Compatibility no-op; motion belongs in the consuming application. */
  readonly transition?: unknown;
  /** Compatibility no-op; the wrapper is always non-animated. */
  readonly enableAnimation?: boolean;
};

const TabsValueContext = React.createContext<string | undefined>(undefined);
const TabsIndicatorClassContext = React.createContext<string | undefined>(undefined);

/**
 * Provide the ARIA tabs pattern. Arrow keys move focus according to Radix's
 * orientation and activation mode; Tab enters and leaves the tab set.
 *
 * @public
 * @param properties - Radix tabs root properties.
 * @returns The tabs state provider and root element.
 *
 * @example <caption>Create a tabs root</caption>
 * ```typescript
 * import { createElement } from 'react';
 * import { Tabs } from '@taucad/ui/components/tabs';
 *
 * export const example = createElement(Tabs, { defaultValue: 'details' });
 * ```
 */
function Tabs({ className, ...properties }: TabsProps): React.JSX.Element {
  const { value, defaultValue, onValueChange, ...rootProperties } = properties;
  const [currentValue, setCurrentValue] = React.useState<string | undefined>(value ?? defaultValue);

  React.useEffect(() => {
    if (value !== undefined) {
      setCurrentValue(value);
    }
  }, [value]);

  const handleValueChange = React.useCallback(
    (nextValue: string) => {
      setCurrentValue(nextValue);
      onValueChange?.(nextValue);
    },
    [onValueChange],
  );

  return (
    <TabsValueContext.Provider value={currentValue}>
      <TabsPrimitive.Root
        data-slot='tabs'
        className={cn('flex flex-col gap-2', className)}
        value={value}
        defaultValue={defaultValue}
        onValueChange={handleValueChange}
        {...rootProperties}
      />
    </TabsValueContext.Provider>
  );
}

/**
 * Group tab triggers and provide the class for the active indicator.
 *
 * @public
 * @param properties - Radix list properties and active-indicator styling.
 * @returns The tab list.
 *
 * @example <caption>Render a tab list</caption>
 * ```typescript
 * import { createElement } from 'react';
 * import { TabsList, TabsTrigger } from '@taucad/ui/components/tabs';
 *
 * export const example = createElement(
 *   TabsList,
 *   null,
 *   createElement(TabsTrigger, { value: 'details' }, 'Details'),
 * );
 * ```
 */
function TabsList({
  ref,
  children,
  className,
  activeClassName,
  transition,
  enableAnimation,
  ...properties
}: TabsListProps): React.JSX.Element {
  void transition;
  void enableAnimation;

  return (
    <TabsIndicatorClassContext.Provider value={activeClassName}>
      <TabsPrimitive.List
        ref={ref}
        data-slot='tabs-list'
        className={cn(
          'w-fit items-center justify-center rounded-md border bg-sidebar p-0.75 text-sidebar-foreground',
          'data-[orientation=vertical]:h-fit',
          'data-[orientation=horizontal]:min-h-8',
          'data-[orientation=horizontal]:inline-flex',
          className,
        )}
        {...properties}
      >
        {children}
      </TabsPrimitive.List>
    </TabsIndicatorClassContext.Provider>
  );
}

/**
 * Activate one tab. Enter or Space selects a focused trigger when manual
 * activation is enabled on the root.
 *
 * @public
 * @param properties - Radix trigger properties.
 * @returns The tab trigger and its plain active indicator.
 *
 * @example <caption>Add a tab trigger</caption>
 * ```typescript
 * import { createElement } from 'react';
 * import { Tabs, TabsList, TabsTrigger } from '@taucad/ui/components/tabs';
 *
 * export const example = createElement(
 *   Tabs,
 *   { defaultValue: 'details' },
 *   createElement(TabsList, null, createElement(TabsTrigger, { value: 'details' }, 'Details')),
 * );
 * ```
 */
function TabsTrigger({
  className,
  value,
  children,
  enableAnimation,
  ...properties
}: TabsTriggerProps): React.JSX.Element {
  const currentValue = React.useContext(TabsValueContext);
  const activeClassName = React.useContext(TabsIndicatorClassContext);
  void enableAnimation;

  return (
    <TabsPrimitive.Trigger
      data-slot='tabs-trigger'
      className={cn(
        "relative isolate z-10 flex size-full cursor-pointer items-center justify-center gap-1.5 rounded-md px-2 py-1 text-sm font-medium whitespace-nowrap text-foreground transition-[box-shadow] select-none outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50 dark:text-sidebar-foreground dark:data-[state=active]:text-foreground [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
        className,
      )}
      value={value}
      {...properties}
    >
      {currentValue === value ? (
        <span
          aria-hidden='true'
          data-slot='tabs-active-indicator'
          className={cn(
            'pointer-events-none absolute inset-0 -z-10 rounded-sm bg-background shadow-sm',
            activeClassName,
          )}
        />
      ) : null}
      <SlotPrimitive.Slottable>{children}</SlotPrimitive.Slottable>
    </TabsPrimitive.Trigger>
  );
}

/**
 * Render the panel associated with a tab trigger.
 *
 * @public
 * @param properties - Radix tab-panel properties.
 * @returns The selected tab panel.
 *
 * @example <caption>Add a tab panel</caption>
 * ```typescript
 * import { createElement } from 'react';
 * import { Tabs, TabsContent } from '@taucad/ui/components/tabs';
 *
 * export const example = createElement(
 *   Tabs,
 *   { defaultValue: 'details' },
 *   createElement(TabsContent, { value: 'details' }, 'Details'),
 * );
 * ```
 */
function TabsContent({ className, transition, enableAnimation, ...properties }: TabsContentProps): React.JSX.Element {
  void transition;
  void enableAnimation;

  return (
    <TabsPrimitive.Content
      data-slot='tabs-content'
      className={cn(
        'flex-1 outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring data-[state=inactive]:hidden',
        className,
      )}
      {...properties}
    />
  );
}

/**
 * Group tab panels without imposing animation or layout measurement.
 *
 * @public
 * @param properties - Standard div properties plus deprecated motion flags.
 * @returns A panel wrapper.
 *
 * @example <caption>Group tab panels</caption>
 * ```typescript
 * import { createElement } from 'react';
 * import { TabsContents } from '@taucad/ui/components/tabs';
 *
 * export const example = createElement(TabsContents, null, 'Panels');
 * ```
 */
function TabsContents({ transition, enableAnimation, ...properties }: TabsContentsProps): React.JSX.Element {
  void transition;
  void enableAnimation;
  return <div data-slot='tabs-contents' {...properties} />;
}

export {
  Tabs,
  TabsList,
  TabsTrigger,
  TabsContent,
  TabsContents,
  type TabsProps,
  type TabsListProps,
  type TabsTriggerProps,
  type TabsContentProps,
  type TabsContentsProps,
};
