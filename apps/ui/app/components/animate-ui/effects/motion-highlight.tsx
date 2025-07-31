import * as React from 'react';
import type { Transition } from 'motion/react';
import { AnimatePresence, motion } from 'motion/react';
import { cn } from '#utils/ui.js';

type MotionHighlightMode = 'children' | 'parent';

type Bounds = {
  top: number;
  left: number;
  width: number;
  height: number;
};

type MotionHighlightContextType<T extends string> = {
  mode: MotionHighlightMode;
  activeValue: T | undefined;
  setActiveValue: (value: T | undefined) => void;
  setBounds: (bounds: DOMRect) => void;
  clearBounds: () => void;
  id: string;
  hover: boolean;
  className?: string;
  activeClassName?: string;
  setActiveClassName: (className: string) => void;
  transition?: Transition;
  disabled?: boolean;
  enabled?: boolean;
  exitDelay?: number;
  forceUpdateBounds?: boolean;
};

const MotionHighlightContext = React.createContext<
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- any is used to allow for dynamic context values
  MotionHighlightContextType<any> | undefined
>(undefined);

function useMotionHighlight<T extends string>(): MotionHighlightContextType<T> {
  const context = React.useContext(MotionHighlightContext);
  if (!context) {
    throw new Error('useMotionHighlight must be used within a MotionHighlightProvider');
  }

  return context as unknown as MotionHighlightContextType<T>;
}

type BaseMotionHighlightProps<T extends string> = {
  mode?: MotionHighlightMode;
  value?: T | undefined;
  defaultValue?: T | undefined;
  onValueChange?: (value: T | undefined) => void;
  className?: string;
  transition?: Transition;
  hover?: boolean;
  disabled?: boolean;
  enabled?: boolean;
  exitDelay?: number;
};

type ParentModeMotionHighlightProps = {
  boundsOffset?: Partial<Bounds>;
  containerClassName?: string;
  forceUpdateBounds?: boolean;
};

type ControlledParentModeMotionHighlightProps<T extends string> = BaseMotionHighlightProps<T> &
  ParentModeMotionHighlightProps & {
    mode: 'parent';
    controlledItems: true;
    children: React.ReactNode;
  };

type ControlledChildrenModeMotionHighlightProps<T extends string> = BaseMotionHighlightProps<T> & {
  mode?: 'children' | undefined;
  controlledItems: true;
  children: React.ReactNode;
};

type UncontrolledParentModeMotionHighlightProps<T extends string> = BaseMotionHighlightProps<T> &
  ParentModeMotionHighlightProps & {
    mode: 'parent';
    controlledItems?: false;
    itemsClassName?: string;
    children: React.ReactElement | React.ReactElement[];
  };

type UncontrolledChildrenModeMotionHighlightProps<T extends string> = BaseMotionHighlightProps<T> & {
  mode?: 'children';
  controlledItems?: false;
  itemsClassName?: string;
  children: React.ReactElement | React.ReactElement[];
};

type MotionHighlightProps<T extends string> = React.ComponentProps<'div'> &
  (
    | ControlledParentModeMotionHighlightProps<T>
    | ControlledChildrenModeMotionHighlightProps<T>
    | UncontrolledParentModeMotionHighlightProps<T>
    | UncontrolledChildrenModeMotionHighlightProps<T>
  );

function MotionHighlight<T extends string>({ ref, ...props }: MotionHighlightProps<T>): React.JSX.Element {
  const {
    children,
    value,
    defaultValue,
    onValueChange,
    className,
    transition = { type: 'spring', stiffness: 350, damping: 35 },
    hover = false,
    enabled = true,
    controlledItems,
    disabled = false,
    exitDelay = 0.2,
    mode = 'children',
  } = props;

  const localRef = React.useRef<HTMLDivElement>(null);
  React.useImperativeHandle(ref, () => localRef.current!);

  const [activeValue, setActiveValue] = React.useState<T | undefined>(value ?? defaultValue ?? undefined);
  const [boundsState, setBoundsState] = React.useState<Bounds | undefined>(undefined);
  const [activeClassNameState, setActiveClassNameState] = React.useState<string>('');

  const safeSetActiveValue = React.useCallback(
    (id: T | undefined) => {
      setActiveValue((previous) => (previous === id ? previous : id));
      if (id !== activeValue) {
        onValueChange?.(id);
      }
    },
    [activeValue, onValueChange],
  );

  const safeSetBounds = React.useCallback(
    (bounds: DOMRect) => {
      if (!localRef.current) {
        return;
      }

      const boundsOffset = (props as ParentModeMotionHighlightProps).boundsOffset ?? {
        top: 0,
        left: 0,
        width: 0,
        height: 0,
      };

      const containerRect = localRef.current.getBoundingClientRect();
      const newBounds: Bounds = {
        top: bounds.top - containerRect.top + (boundsOffset.top ?? 0),
        left: bounds.left - containerRect.left + (boundsOffset.left ?? 0),
        width: bounds.width + (boundsOffset.width ?? 0),
        height: bounds.height + (boundsOffset.height ?? 0),
      };

      setBoundsState((previous) => {
        if (
          previous &&
          previous.top === newBounds.top &&
          previous.left === newBounds.left &&
          previous.width === newBounds.width &&
          previous.height === newBounds.height
        ) {
          return previous;
        }

        return newBounds;
      });
    },
    [props],
  );

  const clearBounds = React.useCallback(() => {
    setBoundsState((previous) => (previous === undefined ? previous : undefined));
  }, []);

  React.useEffect(() => {
    if (value !== undefined) {
      setActiveValue(value);
    } else if (defaultValue !== undefined) {
      setActiveValue(defaultValue);
    }
  }, [value, defaultValue]);

  const id = React.useId();

  React.useEffect(() => {
    if (mode !== 'parent') {
      return;
    }

    const container = localRef.current;
    if (!container) {
      return;
    }

    const onScroll = () => {
      if (!activeValue) {
        return;
      }

      const activeElement = container.querySelector<HTMLElement>(
        `[data-value="${activeValue}"][data-highlight="true"]`,
      );
      if (activeElement) {
        safeSetBounds(activeElement.getBoundingClientRect());
      }
    };

    container.addEventListener('scroll', onScroll, { passive: true });
    return () => {
      container.removeEventListener('scroll', onScroll);
    };
  }, [mode, activeValue, safeSetBounds]);

  const render = React.useCallback(
    // eslint-disable-next-line @typescript-eslint/promise-function-async -- this is a callback function
    (children: React.ReactNode) => {
      if (mode === 'parent') {
        return (
          <div
            ref={localRef}
            data-slot="motion-highlight-container"
            className={cn('relative', (props as ParentModeMotionHighlightProps).containerClassName)}
          >
            <AnimatePresence initial={false}>
              {boundsState ? (
                <motion.div
                  data-slot="motion-highlight"
                  animate={{
                    top: boundsState.top,
                    left: boundsState.left,
                    width: boundsState.width,
                    height: boundsState.height,
                    opacity: 1,
                  }}
                  initial={{
                    top: boundsState.top,
                    left: boundsState.left,
                    width: boundsState.width,
                    height: boundsState.height,
                    opacity: 0,
                  }}
                  exit={{
                    opacity: 0,
                    transition: {
                      ...transition,
                      delay: (transition.delay ?? 0) + exitDelay,
                    },
                  }}
                  transition={transition}
                  className={cn('absolute z-0 bg-muted', className, activeClassNameState)}
                />
              ) : null}
            </AnimatePresence>
            {children}
          </div>
        );
      }

      return children;
    },
    [mode, props, boundsState, transition, exitDelay, className, activeClassNameState],
  );

  const contextValue = React.useMemo(
    () => ({
      mode,
      activeValue,
      setActiveValue: safeSetActiveValue,
      id,
      hover,
      className,
      transition,
      disabled,
      enabled,
      exitDelay,
      setBounds: safeSetBounds,
      clearBounds,
      activeClassName: activeClassNameState,
      setActiveClassName: setActiveClassNameState,
      forceUpdateBounds: (props as ParentModeMotionHighlightProps).forceUpdateBounds,
    }),
    [
      mode,
      activeValue,
      safeSetActiveValue,
      id,
      hover,
      className,
      transition,
      disabled,
      enabled,
      exitDelay,
      safeSetBounds,
      clearBounds,
      activeClassNameState,
      props,
    ],
  );

  return (
    <MotionHighlightContext.Provider value={contextValue}>
      {enabled
        ? controlledItems
          ? render(children)
          : render(
              React.Children.map(children, (child) => (
                <MotionHighlightItem key={child.key} className={props.itemsClassName}>
                  {child}
                </MotionHighlightItem>
              )),
            )
        : children}
    </MotionHighlightContext.Provider>
  );
}

function getNonOverridingDataAttributes(
  element: React.ReactElement,
  dataAttributes: Record<string, unknown>,
): Record<string, unknown> {
  // eslint-disable-next-line unicorn/no-array-reduce -- copied from animate-ui
  return Object.keys(dataAttributes).reduce<Record<string, unknown>>((acc, key) => {
    if ((element.props as Record<string, unknown>)[key] === undefined) {
      acc[key] = dataAttributes[key];
    }

    return acc;
  }, {});
}

type ExtendedChildProps = React.ComponentProps<'div'> & {
  id?: string;
  ref?: React.Ref<HTMLElement>;
  'data-active'?: string;
  'data-value'?: string;
  'data-disabled'?: boolean;
  'data-highlight'?: boolean;
  'data-slot'?: string;
};

type MotionHighlightItemProps = React.ComponentProps<'div'> & {
  readonly children: React.ReactElement;
  readonly id?: string;
  readonly value?: string;
  readonly className?: string;
  readonly transition?: Transition;
  readonly activeClassName?: string;
  readonly isDisabled?: boolean;
  readonly exitDelay?: number;
  readonly asChild?: boolean;
  readonly shouldForceUpdateBounds?: boolean;
};

// eslint-disable-next-line complexity -- copied from animate-ui
function MotionHighlightItem({
  ref,
  children,
  id,
  value,
  className,
  transition,
  activeClassName,
  exitDelay,
  asChild = false,
  shouldForceUpdateBounds: forceUpdateBounds,
  ...props
}: MotionHighlightItemProps): React.JSX.Element {
  const itemId = React.useId();
  const {
    activeValue,
    setActiveValue,
    mode,
    setBounds,
    clearBounds,
    hover,
    enabled,
    className: contextClassName,
    transition: contextTransition,
    id: contextId,
    disabled: contextDisabled,
    exitDelay: contextExitDelay,
    forceUpdateBounds: contextForceUpdateBounds,
    setActiveClassName,
  } = useMotionHighlight();

  const element = children as React.ReactElement<ExtendedChildProps>;
  const childValue = id ?? value ?? element.props['data-value'] ?? element.props.id ?? itemId;
  const isActive = activeValue === childValue;
  const isDisabled = props.isDisabled ?? contextDisabled;
  const itemTransition = transition ?? contextTransition;

  const localRef = React.useRef<HTMLDivElement>(null);
  React.useImperativeHandle(ref, () => localRef.current!);

  // @ts-expect-error -- copied from animate-ui
  React.useEffect(() => {
    if (mode !== 'parent') {
      return;
    }

    let rafId: number;
    let previousBounds: Bounds | undefined;
    const shouldUpdateBounds = forceUpdateBounds === true || (contextForceUpdateBounds && forceUpdateBounds !== false);

    const updateBounds = () => {
      if (!localRef.current) {
        return;
      }

      const bounds = localRef.current.getBoundingClientRect();

      if (shouldUpdateBounds) {
        if (
          previousBounds &&
          previousBounds.top === bounds.top &&
          previousBounds.left === bounds.left &&
          previousBounds.width === bounds.width &&
          previousBounds.height === bounds.height
        ) {
          rafId = requestAnimationFrame(updateBounds);
          return;
        }

        previousBounds = bounds;
        rafId = requestAnimationFrame(updateBounds);
      }

      setBounds(bounds);
    };

    if (isActive) {
      updateBounds();
      setActiveClassName(activeClassName ?? '');
    } else if (!activeValue) {
      clearBounds();
    }

    if (shouldUpdateBounds) {
      return () => {
        cancelAnimationFrame(rafId);
      };
    }
  }, [
    mode,
    isActive,
    activeValue,
    setBounds,
    clearBounds,
    activeClassName,
    setActiveClassName,
    forceUpdateBounds,
    contextForceUpdateBounds,
  ]);

  if (!React.isValidElement(children)) {
    return children;
  }

  const dataAttributes = {
    'data-active': isActive ? 'true' : 'false',
    'aria-selected': isActive,
    'data-disabled': isDisabled,
    'data-value': childValue,
    'data-highlight': true,
  };

  const commonHandlers = hover
    ? {
        onMouseEnter(event: React.MouseEvent<HTMLDivElement>) {
          setActiveValue(childValue);
          element.props.onMouseEnter?.(event);
        },
        onMouseLeave(event: React.MouseEvent<HTMLDivElement>) {
          setActiveValue(undefined);
          element.props.onMouseLeave?.(event);
        },
      }
    : {
        onClick(event: React.MouseEvent<HTMLDivElement>) {
          setActiveValue(childValue);
          element.props.onClick?.(event);
        },
      };

  if (asChild) {
    if (mode === 'children') {
      return React.cloneElement(
        element,
        {
          key: childValue,
          ref: localRef,
          className: cn('relative', element.props.className),
          ...getNonOverridingDataAttributes(element, {
            ...dataAttributes,
            'data-slot': 'motion-highlight-item-container',
          }),
          ...commonHandlers,
          ...props,
        },
        <>
          <AnimatePresence initial={false}>
            {isActive && !isDisabled ? (
              <motion.div
                layoutId={`transition-background-${contextId}`}
                data-slot="motion-highlight"
                className={cn('absolute inset-0 z-0 bg-muted', contextClassName, activeClassName)}
                transition={itemTransition}
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{
                  opacity: 0,
                  transition: {
                    ...itemTransition,
                    delay: (itemTransition?.delay ?? 0) + (exitDelay ?? contextExitDelay ?? 0),
                  },
                }}
                {...dataAttributes}
              />
            ) : null}
          </AnimatePresence>

          <div data-slot="motion-highlight-item" className={cn('relative z-[1]', className)} {...dataAttributes}>
            {children}
          </div>
        </>,
      );
    }

    return React.cloneElement(element, {
      ref: localRef,
      ...getNonOverridingDataAttributes(element, {
        ...dataAttributes,
        'data-slot': 'motion-highlight-item',
      }),
      ...commonHandlers,
    });
  }

  return enabled ? (
    <div
      key={childValue}
      ref={localRef}
      data-slot="motion-highlight-item-container"
      className={cn(mode === 'children' && 'relative', className)}
      {...dataAttributes}
      {...props}
      {...commonHandlers}
    >
      {mode === 'children' && (
        <AnimatePresence initial={false}>
          {isActive && !isDisabled ? (
            <motion.div
              layoutId={`transition-background-${contextId}`}
              data-slot="motion-highlight"
              className={cn('absolute inset-0 z-0 bg-muted', contextClassName, activeClassName)}
              transition={itemTransition}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{
                opacity: 0,
                transition: {
                  ...itemTransition,
                  delay: (itemTransition?.delay ?? 0) + (exitDelay ?? contextExitDelay ?? 0),
                },
              }}
              {...dataAttributes}
            />
          ) : null}
        </AnimatePresence>
      )}

      {React.cloneElement(element, {
        className: cn('relative z-[1]', element.props.className),
        ...getNonOverridingDataAttributes(element, {
          ...dataAttributes,
          'data-slot': 'motion-highlight-item',
        }),
      })}
    </div>
  ) : (
    children
  );
}

export {
  MotionHighlight,
  MotionHighlightItem,
  useMotionHighlight,
  type MotionHighlightProps,
  type MotionHighlightItemProps,
};
