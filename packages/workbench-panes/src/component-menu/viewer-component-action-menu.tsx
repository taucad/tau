import { useCallback } from 'react';
import type { CSSProperties } from 'react';
import { useSelector } from '@xstate/react';
import { Popover, PopoverAnchor, PopoverContent } from '@taucad/ui/components/popover';
import { menuContentVariants } from '@taucad/ui/components/menu.variants';
import { preventMenuSliderEscapeDismissal } from '@taucad/ui/components/menu-slider-item';
import { cn } from '@taucad/ui/utils/cn';
import { getModelInteractionUnitState } from '@taucad/viewer/machines/model-interaction.machine';
import type { GraphicsRef } from '#host/workbench-host.jsx';
import { ModelComponentViewerMenuItems } from '#component-menu/component-action-menu.jsx';
import type { ModelComponentActionMenuData } from '#component-menu/component-action-menu.jsx';
import type { ModelComponentHostActions } from '#component-menu/component-actions.js';

/**
 * Where the viewer's part menu opens, in viewport coordinates.
 *
 * @public
 */
export type ViewerModelComponentActionMenuPoint = {
  readonly clientX: number;
  readonly clientY: number;
};

/**
 * Props for {@link ViewerModelComponentActionMenu}.
 *
 * @public
 */
export type ViewerModelComponentActionMenuProperties = {
  readonly data: ModelComponentActionMenuData | undefined;
  readonly point: ViewerModelComponentActionMenuPoint | undefined;
  readonly isOpen: boolean;
  readonly onOpenChange: (isOpen: boolean) => void;
  /** Whether the first item takes focus on open, as when a key opened the menu; otherwise the menu focuses itself. */
  readonly shouldFocusFirstItem?: boolean;
  /** Where focus goes when the menu closes and took focus with it, such as the canvas region that opened it. */
  readonly returnFocusTo?: () => HTMLElement | undefined;
};

/** The rows the arrow keys move between: every enabled `menuitem`, in document order. */
const enabledItemsSelector = '[role="menuitem"]:not([disabled])';

/**
 * Moves focus between the menu's items as a menu's arrow keys do (APG menu pattern): ↓ and ↑ to the next and previous
 * enabled item, without wrapping, Home and End to the first and last. Keys typed in a field inside an item, such as
 * the opacity input, stay with the field.
 *
 * @param event - A key that went down inside the menu.
 */
const moveItemFocus = (event: React.KeyboardEvent<HTMLElement>): void => {
  const menu = event.currentTarget;
  const { target } = event;
  if (!(target instanceof HTMLElement) || (target !== menu && target.getAttribute('role') !== 'menuitem')) {
    return;
  }
  const items = [...menu.querySelectorAll<HTMLElement>(enabledItemsSelector)];
  const index = items.indexOf(target);
  const next =
    event.key === 'ArrowDown'
      ? items[index === -1 ? 0 : Math.min(index + 1, items.length - 1)]
      : event.key === 'ArrowUp'
        ? items[index === -1 ? items.length - 1 : Math.max(index - 1, 0)]
        : event.key === 'Home'
          ? items[0]
          : event.key === 'End'
            ? items.at(-1)
            : undefined;
  if (next === undefined) {
    return;
  }
  event.preventDefault();
  next.focus();
};

/**
 * The part menu the viewer opens at the pointer when a part is secondary-clicked, or at a point the host names when a
 * key opens it: the same rows as the Model pane's row menu, in a non-modal popover anchored at `point`. ↓, ↑, Home and
 * End move focus between its items, Enter runs one, and Escape closes it, handing focus to `returnFocusTo`.
 *
 * @param props - The part's menu data, the anchor point, the open state and where focus starts and returns.
 * @returns The anchored menu.
 * @public
 */
export function ViewerModelComponentActionMenu({
  data,
  point,
  isOpen: shouldOpen,
  onOpenChange,
  shouldFocusFirstItem = false,
  returnFocusTo,
}: ViewerModelComponentActionMenuProperties): React.JSX.Element {
  const isOpen = shouldOpen && Boolean(data && point);
  const handleRequestClose = useCallback(() => {
    onOpenChange(false);
  }, [onOpenChange]);

  return (
    <Popover open={isOpen} modal={false} onOpenChange={onOpenChange}>
      {point ? (
        <PopoverAnchor asChild>
          <span aria-hidden='true' style={getViewerMenuAnchorStyle(point)} />
        </PopoverAnchor>
      ) : null}
      {isOpen && data ? (
        <PopoverContent
          role='menu'
          side='right'
          align='start'
          sideOffset={2}
          collisionPadding={8}
          className={cn(
            menuContentVariants(),
            'max-h-[min(24rem,calc(100vh-1rem))] w-auto min-w-56 overflow-x-hidden overflow-y-auto [&>*]:shrink-0',
          )}
          onOpenAutoFocus={(event) => {
            // A pointer-opened menu takes focus itself, as Radix menus do, instead of the popover focusing and
            // highlighting its first row; a key-opened one starts on its first item.
            event.preventDefault();
            if (!(event.currentTarget instanceof HTMLElement)) {
              return;
            }
            const first = shouldFocusFirstItem
              ? event.currentTarget.querySelector<HTMLElement>(enabledItemsSelector)
              : null;
            (first ?? event.currentTarget).focus({ preventScroll: true });
          }}
          onCloseAutoFocus={(event) => {
            event.preventDefault();
            // Only focus the menu took with it: a click elsewhere keeps the focus it gave.
            const { activeElement } = document;
            if (activeElement === null || activeElement === document.body) {
              returnFocusTo?.()?.focus({ preventScroll: true });
            }
          }}
          onEscapeKeyDown={preventMenuSliderEscapeDismissal}
          onKeyDown={moveItemFocus}
        >
          <ModelComponentViewerMenuItems {...data} onRequestClose={handleRequestClose} />
        </PopoverContent>
      ) : null}
    </Popover>
  );
}

function getViewerMenuAnchorStyle(point: ViewerModelComponentActionMenuPoint): CSSProperties {
  return {
    position: 'fixed',
    left: point.clientX,
    top: point.clientY,
    width: 0,
    height: 0,
    pointerEvents: 'none',
  };
}

/**
 * The part a viewer menu opens on.
 *
 * @public
 */
export type ViewerModelComponentMenuTarget = Readonly<{
  unitId: string;
  componentId: string;
}>;

/**
 * The viewer menu's data for one part, kept current with the unit's focus, isolation, visibility and opacity.
 *
 * @param options - The graphics actor, the part (or `undefined` while no menu is open) and the host verbs.
 * @returns The menu data, or `undefined` while no menu is open or the unit no longer has the part.
 * @public
 */
export function useViewerModelComponentActionMenuData({
  graphicsRef,
  target,
  actions,
}: Readonly<{
  graphicsRef: GraphicsRef;
  target: ViewerModelComponentMenuTarget | undefined;
  actions?: ModelComponentHostActions;
}>): ModelComponentActionMenuData | undefined {
  const modelRef = useSelector(graphicsRef, (state) => state.context.modelInteractionRef);
  const unit = useSelector(modelRef, (state) =>
    target === undefined ? undefined : getModelInteractionUnitState(state.context, target.unitId),
  );
  const manifest = unit?.manifest;
  const node = target === undefined ? undefined : manifest?.nodesById[target.componentId];
  if (!target || !unit || !manifest || !node) {
    return undefined;
  }
  return {
    manifest,
    node,
    graphicsRef,
    unitId: target.unitId,
    source: 'viewer',
    isFocused: unit.focusedComponentId === target.componentId,
    isIsolated: unit.isolatedComponentIds.includes(target.componentId),
    hasHiddenComponents: unit.hiddenComponentIds.length > 0,
    hasOpacityOverrides: Object.keys(unit.opacityByComponentId).length > 0,
    opacity: unit.opacityByComponentId[target.componentId] ?? 1,
    actions,
  };
}
