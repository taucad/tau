/**
 * The viewer's part menu on the canvas, as both the Tau app and the agent plugin viewer open it: a right press on a part
 * that stays within 4 px until release opens the menu at the press, and one that travels further pans the camera.
 * With focus in the canvas region, Shift+F10 or the Menu key opens it for the selected part at the region's centre, on
 * its first item; closing it hands focus back to the region. The selected part is the model interaction machine's
 * first selected component, so a host keeps no copy of it.
 */
import { useCallback, useMemo, useRef, useState } from 'react';
import { useSelector } from '@xstate/react';
import { useKeybinding } from '@taucad/ui/components/keyboard';
import type { KeyCombination } from '@taucad/ui/utils/keys';
import { isViewerKeyTarget } from '@taucad/viewer/hooks/use-viewer-shortcuts';
import { getModelInteractionUnitState } from '@taucad/viewer/machines/model-interaction.machine';
import type { ModelComponentActionMenuData } from '#component-menu/component-action-menu.jsx';
import type { ModelComponentHostActions } from '#component-menu/component-actions.js';
import {
  useViewerModelComponentActionMenuData,
  ViewerModelComponentActionMenu,
} from '#component-menu/viewer-component-action-menu.jsx';
import type { ViewerModelComponentMenuTarget } from '#component-menu/viewer-component-action-menu.jsx';
import {
  attachViewerSecondaryGestureTarget,
  beginViewerSecondaryGesture,
  cancelViewerSecondaryGesture,
  completeViewerSecondaryGesture,
  idleViewerSecondaryGestureState,
  moveViewerSecondaryGesture,
} from '#component-menu/viewer-secondary-gesture.js';
import type {
  ViewerSecondaryGestureMenu,
  ViewerSecondaryGesturePoint,
  ViewerSecondaryGestureState,
} from '#component-menu/viewer-secondary-gesture.js';
import type { GraphicsRef } from '#host/workbench-host.jsx';

/**
 * Options for {@link useViewerPartMenu}.
 *
 * @public
 */
export type UseViewerPartMenuOptions = Readonly<{
  /** The viewer's graphics actor; the host creates and owns it. */
  graphicsRef: GraphicsRef;
  /** The host's part verbs; the menu leaves out the item of an absent verb. */
  actions?: ModelComponentHostActions;
}>;

/**
 * Adds host-only data to the canvas menu's data, such as the Tau app's part thumbnail and its retry and decode
 * callbacks. Called on every render while the menu is open; return `data` unchanged to add nothing.
 *
 * @public
 */
export type ViewerPartMenuDecorator = (data: ModelComponentActionMenuData) => ModelComponentActionMenuData;

/**
 * The canvas region's part-menu handlers and ref, which `ViewerStage` spreads on its region.
 *
 * @public
 */
export type ViewerPartMenuRegionProps = Readonly<
  Pick<
    React.HTMLAttributes<HTMLElement>,
    | 'onPointerDownCapture'
    | 'onPointerMoveCapture'
    | 'onPointerUpCapture'
    | 'onPointerCancelCapture'
    | 'onLostPointerCapture'
    | 'onContextMenu'
  > & {
    // oxlint-disable-next-line @typescript-eslint/no-restricted-types -- required by React
    ref: React.RefObject<HTMLElement | null>;
  }
>;

/**
 * What {@link useViewerPartMenu} hands the host: pass it to `ViewerStage` as `partMenu`, and read `selectedMenu` for a
 * header that names the selected part.
 *
 * @public
 */
export type ViewerPartMenu = Readonly<{
  /** The canvas region's handlers and ref. */
  regionProps: ViewerPartMenuRegionProps;
  /** The canvas's `onComponentSecondaryPointerCandidate`: the part under a right press. */
  onComponentSecondaryPointerCandidate: (target: ViewerSecondaryGestureMenu['target'] | undefined) => void;
  /** The selected part's menu data, for a header's `ModelComponentActionDropdown`; `undefined` with no part. */
  selectedMenu: ModelComponentActionMenuData | undefined;
  /** The open canvas menu's data, before any decoration, such as for a host that prepares the part's thumbnail. */
  openMenuData: ModelComponentActionMenuData | undefined;
  /** Whether the canvas menu is open; the hover label hides while it is, as the menu names its part. */
  isOpen: boolean;
  /** Close the menu. A new model closes it without this. */
  close: () => void;
  /**
   * Draws the menu and binds its keys; `ViewerStage` calls it. Render it inside the host's `KeyboardProvider` and
   * `TooltipProvider`.
   */
  renderMenu: (decoratePartMenu?: ViewerPartMenuDecorator) => React.JSX.Element;
}>;

/** The open menu, whether a key opened it, and the model it opened on. */
type OpenMenu = ViewerSecondaryGestureMenu & Readonly<{ isFromKey: boolean; artifactKey: string | undefined }>;

const shiftF10Key: KeyCombination = { key: 'F10', shiftKey: true };
const menuKey: KeyCombination = { key: 'ContextMenu' };

/**
 * Shift+F10 and the Menu key, registered inside the host's `KeyboardProvider`. Keys typed in a field stay with it.
 *
 * @param props - When the keys belong to the canvas, and what they do.
 * @returns Nothing; the keys are bound while it is mounted.
 */
function ViewerPartMenuKeys({
  isEnabled,
  onOpen,
}: Readonly<{ isEnabled: () => boolean; onOpen: () => void }>): React.ReactNode {
  const options = useMemo(() => ({ ignoreInputs: true, enabled: isEnabled }), [isEnabled]);
  useKeybinding(shiftF10Key, onOpen, options);
  useKeybinding(menuKey, onOpen, options);
  return null;
}

const pointOf = (event: React.PointerEvent): ViewerSecondaryGesturePoint => ({
  clientX: event.clientX,
  clientY: event.clientY,
});

function releaseCapture(event: React.PointerEvent<HTMLElement>): void {
  try {
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
  } catch {
    /* The browser may already have ended the pointer session. */
  }
}

/**
 * The canvas part menu: the secondary gesture, the keyboard route, the menu data and the anchored menu.
 *
 * @param options - The graphics actor and the host's part verbs.
 * @returns The region's handlers and ref, the canvas callback, the selected part's menu data and the menu.
 * @public
 *
 * @example <caption>A host passes the part menu to the stage and names the selected part in its header</caption>
 * ```typescript
 * import { useActorRef } from '@xstate/react';
 * import { graphicsMachine } from '@taucad/viewer/machines/graphics.machine';
 * import { useViewerPartMenu } from '@taucad/workbench-panes/component-menu/use-viewer-part-menu';
 *
 * export function useHostPartMenu(): string | undefined {
 *   const graphicsRef = useActorRef(graphicsMachine, { input: { graphicsBackend: 'webgl' } });
 *   const partMenu = useViewerPartMenu({ graphicsRef, actions: { addToChatLabel: 'Send to chat' } });
 *   return partMenu.selectedMenu?.node.name;
 * }
 * ```
 */
export function useViewerPartMenu({ graphicsRef, actions }: UseViewerPartMenuOptions): ViewerPartMenu {
  const [opened, setOpened] = useState<OpenMenu | undefined>(undefined);
  const gesture = useRef<ViewerSecondaryGestureState>(idleViewerSecondaryGestureState);
  // oxlint-disable-next-line @typescript-eslint/no-restricted-types -- required by React
  const regionRef = useRef<HTMLElement | null>(null);
  const artifactKey = useSelector(graphicsRef, (state) => state.context.artifactKey);
  const unitId = useSelector(graphicsRef, (state) => state.context.modelInteractionUnitId);
  const modelRef = useSelector(graphicsRef, (state) => state.context.modelInteractionRef);
  const selectedComponentId = useSelector(modelRef, (state) =>
    unitId === undefined ? undefined : getModelInteractionUnitState(state.context, unitId).selectedComponentIds[0],
  );
  // A menu opened on another model is closed: derived here, so the host need not close it on each new model.
  const open = opened?.artifactKey === artifactKey ? opened : undefined;
  const data = useViewerModelComponentActionMenuData({ graphicsRef, target: open?.target, actions });
  const selectedTarget = useMemo(
    (): ViewerModelComponentMenuTarget | undefined =>
      unitId === undefined || selectedComponentId === undefined
        ? undefined
        : { unitId, componentId: selectedComponentId },
    [selectedComponentId, unitId],
  );
  const selectedMenu = useViewerModelComponentActionMenuData({ graphicsRef, target: selectedTarget, actions });
  const latest = useRef({ target: selectedTarget, hasSelectedMenu: false, artifactKey });
  latest.current = { target: selectedTarget, hasSelectedMenu: selectedMenu !== undefined, artifactKey };

  const isKeyTarget = useCallback(
    () => latest.current.hasSelectedMenu && isViewerKeyTarget(regionRef.current ?? undefined),
    [],
  );
  const openFromKey = useCallback(() => {
    const region = regionRef.current;
    const { target } = latest.current;
    if (region === null || target === undefined) {
      return;
    }
    const box = region.getBoundingClientRect();
    setOpened({
      target,
      point: { clientX: box.left + box.width / 2, clientY: box.top + box.height / 2 },
      isFromKey: true,
      artifactKey: latest.current.artifactKey,
    });
  }, []);
  const returnFocusTo = useCallback(() => regionRef.current ?? undefined, []);
  const close = useCallback(() => {
    setOpened(undefined);
  }, []);
  const onOpenChange = useCallback((isOpen: boolean) => {
    if (!isOpen) {
      setOpened(undefined);
    }
  }, []);
  const onComponentSecondaryPointerCandidate = useCallback(
    (target: ViewerSecondaryGestureMenu['target'] | undefined) => {
      gesture.current = attachViewerSecondaryGestureTarget(gesture.current, target);
    },
    [],
  );

  const regionProps = useMemo(
    (): ViewerPartMenuRegionProps => ({
      ref: regionRef,
      onPointerDownCapture(event) {
        if (event.button !== 2) {
          return;
        }
        setOpened(undefined);
        gesture.current = beginViewerSecondaryGesture({ pointerId: event.pointerId, point: pointOf(event) });
        try {
          event.currentTarget.setPointerCapture(event.pointerId);
        } catch {
          /* The browser may already have ended the pointer session. */
        }
      },
      onPointerMoveCapture(event) {
        const previous = gesture.current;
        const next = moveViewerSecondaryGesture({ state: previous, pointerId: event.pointerId, point: pointOf(event) });
        if (previous.status === 'pendingContextClick' && next.status === 'cameraPan') {
          graphicsRef.send({ type: 'markModelPointerGestureMoved' });
        }
        gesture.current = next;
      },
      onPointerUpCapture(event) {
        if (event.button !== 2) {
          return;
        }
        const completion = completeViewerSecondaryGesture({
          state: gesture.current,
          pointerId: event.pointerId,
          point: pointOf(event),
        });
        gesture.current = completion.state;
        releaseCapture(event);
        const { menu } = completion;
        setOpened(
          menu === undefined ? undefined : { ...menu, isFromKey: false, artifactKey: latest.current.artifactKey },
        );
      },
      onPointerCancelCapture(event) {
        gesture.current = cancelViewerSecondaryGesture(gesture.current, event.pointerId);
        releaseCapture(event);
      },
      onLostPointerCapture(event) {
        gesture.current = cancelViewerSecondaryGesture(gesture.current, event.pointerId);
      },
      onContextMenu(event) {
        event.preventDefault();
        event.stopPropagation();
      },
    }),
    [graphicsRef],
  );

  return {
    regionProps,
    onComponentSecondaryPointerCandidate,
    selectedMenu,
    openMenuData: data,
    isOpen: open !== undefined,
    close,
    renderMenu: (decoratePartMenu) => (
      <>
        <ViewerPartMenuKeys isEnabled={isKeyTarget} onOpen={openFromKey} />
        <ViewerModelComponentActionMenu
          isOpen={open !== undefined}
          point={open?.point}
          data={data === undefined || decoratePartMenu === undefined ? data : decoratePartMenu(data)}
          shouldFocusFirstItem={open?.isFromKey === true}
          returnFocusTo={returnFocusTo}
          onOpenChange={onOpenChange}
        />
      </>
    ),
  };
}
