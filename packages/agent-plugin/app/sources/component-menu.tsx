/**
 * The Tau app's part menu on the viewer page: right-click a part on the canvas, press Shift+F10 or the Menu key with
 * the canvas region focused, open the header's "Actions for <name>", or open a row's menu in the Model pane, for the
 * same items, order and keyboard behaviour as the workbench. Focus, visibility, isolation and opacity act
 * on the page's graphics actor inside `@taucad/workbench-panes`; the page's verbs are "Add to chat" (the host
 * bridge), "Reveal in Explorer" (the Model pane) and "Show kinematics" (the Kinematics pane). The page has no part
 * gallery or thumbnails, so "Open preview" and "Retry preview" never show.
 */
import { useCallback, useMemo, useRef, useState } from 'react';
import type React from 'react';
import { useSelector } from '@xstate/react';
import type { GeometryComponentReference } from '@taucad/types';
import { useKeybinding } from '@taucad/ui/components/keyboard';
import type { KeyCombination } from '@taucad/ui/utils/keys';
import { isViewerKeyTarget } from '@taucad/viewer/hooks/use-viewer-shortcuts';
import type { ModelComponentActionMenuData } from '@taucad/workbench-panes/component-menu/component-action-menu';
import type { ModelComponentHostActions } from '@taucad/workbench-panes/component-menu/component-actions';
import {
  useViewerModelComponentActionMenuData,
  ViewerModelComponentActionMenu,
} from '@taucad/workbench-panes/component-menu/viewer-component-action-menu';
import {
  attachViewerSecondaryGestureTarget,
  beginViewerSecondaryGesture,
  cancelViewerSecondaryGesture,
  completeViewerSecondaryGesture,
  idleViewerSecondaryGestureState,
  moveViewerSecondaryGesture,
} from '@taucad/workbench-panes/component-menu/viewer-secondary-gesture';
import type {
  ViewerSecondaryGestureMenu,
  ViewerSecondaryGestureState,
} from '@taucad/workbench-panes/component-menu/viewer-secondary-gesture';
import type { GraphicsRef } from '@taucad/workbench-panes/host/workbench-host';
import type { KinematicsRevealRequest, KinematicsSource } from '@taucad/workbench-panes/kinematics/kinematics-source';
import type { ModelComponentTarget, ModelSource } from '@taucad/workbench-panes/model/model-source';

/** A pane a part verb opens in the lane. */
export type ComponentMenuPane = 'model' | 'kinematics';

/**
 * One reveal channel: a request waits for the first listener when none is subscribed yet, so a pane the request
 * just opened still receives it.
 */
type RevealChannel<Request> = Readonly<{
  subscribe: (listener: (request: Request) => void) => () => void;
  request: (request: Request) => void;
}>;

function createRevealChannel<Request>(): RevealChannel<Request> {
  const listeners = new Set<(request: Request) => void>();
  let pending: { readonly request: Request } | undefined;
  return {
    subscribe(listener) {
      listeners.add(listener);
      if (pending !== undefined) {
        const { request } = pending;
        pending = undefined;
        listener(request);
      }
      return () => {
        listeners.delete(listener);
      };
    },
    request(request) {
      if (listeners.size === 0) {
        pending = { request };
        return;
      }
      for (const listener of listeners) {
        listener(request);
      }
    },
  };
}

/**
 * The page's reveal channels: what the Model pane's `reveal` and the Kinematics pane's `subscribeReveal` listen to.
 * Create it once per page, above the lane, so a reveal survives the lane mounting.
 */
export type ComponentReveal = Readonly<{
  /** The Model pane source's `reveal`. */
  model: NonNullable<ModelSource['reveal']>;
  /** The Kinematics pane source's `subscribeReveal`. */
  subscribeKinematics: NonNullable<KinematicsSource['subscribeReveal']>;
  /** Ask the Kinematics pane to show the joint that moves a part. */
  requestKinematics: (request: KinematicsRevealRequest) => void;
}>;

/**
 * Creates the page's reveal channels.
 *
 * @returns The Model and Kinematics reveal channels.
 */
export function createComponentReveal(): ComponentReveal {
  const model = createRevealChannel<ModelComponentTarget>();
  const kinematics = createRevealChannel<KinematicsRevealRequest>();
  return {
    model,
    subscribeKinematics: kinematics.subscribe,
    requestKinematics: kinematics.request,
  };
}

/** What the page does for the part menu's host verbs. */
export type PageComponentMenuOptions = Readonly<{
  /** "Add to chat": the page adds the part to what it handed the chat (`bridge.addToChat`) and shows its notice. */
  addToChat: (reference: GeometryComponentReference) => void;
  /** The chat item's label on this host's route: "Add to chat", "Send to chat" or "Copy reference". */
  addToChatLabel: string;
  /** Show the lane and make `pane` its active tab, opening the tab when it is closed. */
  openPane: (pane: ComponentMenuPane) => void;
  /** The page's reveal channels. */
  reveal: ComponentReveal;
}>;

/**
 * The page's part verbs, for both the canvas menu and the Model pane's row menus.
 *
 * @param options - What the page does for chat and its panes, and the chat item's label.
 * @returns The host verbs; "Open preview" is absent because the page has no part gallery.
 */
export function createPageComponentActions({
  addToChat,
  addToChatLabel,
  openPane,
  reveal,
}: PageComponentMenuOptions): ModelComponentHostActions {
  return {
    addToChat: (reference) => {
      addToChat(reference);
    },
    addToChatLabel,
    revealInExplorer: ({ manifest, node, graphicsRef, unitId }) => {
      const entryPath = manifest.sourceFile;
      if (entryPath === undefined) {
        return;
      }
      graphicsRef.send({
        type: 'selectModelComponent',
        unitId,
        componentId: node.id,
        source: 'viewer',
      });
      openPane('model');
      reveal.model.request({ entryPath, unitId, componentId: node.id });
    },
    showKinematics: ({ manifest }, componentId) => {
      const entryPath = manifest.sourceFile;
      if (entryPath === undefined) {
        return;
      }
      openPane('kinematics');
      reveal.requestKinematics({ entryPath, componentId });
    },
  };
}

/** What {@link useViewerComponentMenu} hands the page. */
export type ViewerComponentMenu = Readonly<{
  /** Spread on the canvas region that holds `ModelViewer` (`#tau-viewer-canvas`); the page makes it focusable. */
  regionProps: Readonly<
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
  /** `ModelViewer`'s `onComponentSecondaryPointerCandidate`. */
  onComponentSecondaryPointerCandidate: (target: ViewerSecondaryGestureMenu['target'] | undefined) => void;
  /** The selected part's menu data, for the header's `ModelComponentActionDropdown`; `undefined` with no part. */
  selectedMenu: ModelComponentActionMenuData | undefined;
  /** Close the menu, for example when the shown model changes. */
  close: () => void;
  /** The menu and its keys; render it anywhere inside the page's `KeyboardProvider` and other providers. */
  menu: React.JSX.Element;
}>;

/** The menu the canvas shows, and whether a key opened it. */
type OpenMenu = ViewerSecondaryGestureMenu & Readonly<{ isFromKey?: boolean }>;

const shiftF10Key: KeyCombination = { key: 'F10', shiftKey: true };
const menuKey: KeyCombination = { key: 'ContextMenu' };

/**
 * Shift+F10 and the Menu key, registered inside the page's `KeyboardProvider`.
 *
 * @param props - When the keys belong to the canvas, and what they do.
 * @returns Nothing; the keys are bound while it is mounted.
 */
function ViewerComponentMenuKeys({
  isEnabled,
  onOpen,
}: Readonly<{ isEnabled: () => boolean; onOpen: () => void }>): React.ReactNode {
  const options = useMemo(() => ({ ignoreInputs: true, enabled: isEnabled }), [isEnabled]);
  useKeybinding(shiftF10Key, onOpen, options);
  useKeybinding(menuKey, onOpen, options);
  return null;
}

const pointOf = (event: React.PointerEvent): ViewerSecondaryGestureMenu['point'] => ({
  clientX: event.clientX,
  clientY: event.clientY,
});

/**
 * The canvas part menu, opened as the Tau app's viewer opens it: a right press that stays within 4 px until release
 * opens the menu at the press, and one that travels further pans the camera. With focus in the canvas region,
 * Shift+F10 or the Menu key opens it for the selected part at the region's centre, on its first item; closing it
 * hands focus back to the region (viewer chrome VUI-6, D8). A touch long-press is not offered (D7).
 *
 * @param options - The page's graphics actor, the part verbs and the selected part's component id.
 * @returns The canvas region's handlers and ref, the viewer callback, the selected part's menu data and the menu.
 */
export function useViewerComponentMenu({
  graphicsRef,
  actions,
  selectedComponentId,
}: Readonly<{
  graphicsRef: GraphicsRef;
  actions: ModelComponentHostActions;
  selectedComponentId: string | undefined;
}>): ViewerComponentMenu {
  const [open, setOpen] = useState<OpenMenu | undefined>(undefined);
  const gesture = useRef<ViewerSecondaryGestureState>(idleViewerSecondaryGestureState);
  // oxlint-disable-next-line @typescript-eslint/no-restricted-types -- required by React
  const regionRef = useRef<HTMLElement | null>(null);
  const data = useViewerModelComponentActionMenuData({
    graphicsRef,
    target: open?.target,
    actions,
  });
  const unitId = useSelector(graphicsRef, (state) => state.context.modelInteractionUnitId);
  const selectedTarget = useMemo(
    () =>
      unitId === undefined || selectedComponentId === undefined
        ? undefined
        : { unitId, componentId: selectedComponentId },
    [selectedComponentId, unitId],
  );
  const selectedMenu = useViewerModelComponentActionMenuData({ graphicsRef, target: selectedTarget, actions });
  const hasSelectedMenu = selectedMenu !== undefined;
  const latestSelected = useRef({ target: selectedTarget, hasSelectedMenu });
  latestSelected.current = { target: selectedTarget, hasSelectedMenu };

  const isKeyTarget = useCallback(
    () => latestSelected.current.hasSelectedMenu && isViewerKeyTarget(regionRef.current ?? undefined),
    [],
  );
  const openFromKey = useCallback(() => {
    const region = regionRef.current;
    const { target } = latestSelected.current;
    if (region === null || target === undefined) {
      return;
    }
    const box = region.getBoundingClientRect();
    setOpen({
      target,
      point: { clientX: box.left + box.width / 2, clientY: box.top + box.height / 2 },
      isFromKey: true,
    });
  }, []);
  const returnFocusTo = useCallback(() => regionRef.current ?? undefined, []);

  const close = useCallback(() => {
    setOpen(undefined);
  }, []);
  const onOpenChange = useCallback((isOpen: boolean) => {
    if (!isOpen) {
      setOpen(undefined);
    }
  }, []);
  const onComponentSecondaryPointerCandidate = useCallback(
    (target: ViewerSecondaryGestureMenu['target'] | undefined) => {
      gesture.current = attachViewerSecondaryGestureTarget(gesture.current, target);
    },
    [],
  );

  const regionProps = useMemo(
    (): ViewerComponentMenu['regionProps'] => ({
      ref: regionRef,
      onPointerDownCapture(event) {
        if (event.button !== 2) {
          return;
        }
        setOpen(undefined);
        gesture.current = beginViewerSecondaryGesture({
          pointerId: event.pointerId,
          point: pointOf(event),
        });
        try {
          event.currentTarget.setPointerCapture(event.pointerId);
        } catch {
          /* The browser may already have ended the pointer session. */
        }
      },
      onPointerMoveCapture(event) {
        const previous = gesture.current;
        const next = moveViewerSecondaryGesture({
          state: previous,
          pointerId: event.pointerId,
          point: pointOf(event),
        });
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
        setOpen(completion.menu);
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
    close,
    menu: (
      <>
        <ViewerComponentMenuKeys isEnabled={isKeyTarget} onOpen={openFromKey} />
        <ViewerModelComponentActionMenu
          isOpen={open !== undefined}
          point={open?.point}
          data={data}
          shouldFocusFirstItem={open?.isFromKey === true}
          returnFocusTo={returnFocusTo}
          onOpenChange={onOpenChange}
        />
      </>
    ),
  };
}

function releaseCapture(event: React.PointerEvent<HTMLElement>): void {
  try {
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
  } catch {
    /* The browser may already have ended the pointer session. */
  }
}
