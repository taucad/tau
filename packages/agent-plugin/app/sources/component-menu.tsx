/**
 * The Tau app's part menu on the viewer page: right-click a part on the canvas, or open a row's menu in the Model
 * pane, for the same items, order and keyboard behaviour as the workbench. Focus, visibility, isolation and opacity act
 * on the page's graphics actor inside `@taucad/workbench-panes`; the page's verbs are "Add to chat" (the host
 * bridge), "Reveal in Explorer" (the Model pane) and "Show kinematics" (the Kinematics pane). The page has no part
 * gallery or thumbnails, so "Open preview" and "Retry preview" never show.
 */
import { useCallback, useMemo, useRef, useState } from 'react';
import type React from 'react';
import type { GeometryComponentReference } from '@taucad/types';
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
  /** "Add to chat": the page sends `bridge.addToChat(chatReferenceOf(model, reference))` and shows its notice. */
  addToChat: (reference: GeometryComponentReference) => void;
  /** Show the lane and make `pane` its active tab, opening the tab when it is closed. */
  openPane: (pane: ComponentMenuPane) => void;
  /** The page's reveal channels. */
  reveal: ComponentReveal;
}>;

/**
 * The page's part verbs, for both the canvas menu and the Model pane's row menus.
 *
 * @param options - What the page does for chat and its panes.
 * @returns The host verbs; "Open preview" is absent because the page has no part gallery.
 */
export function createPageComponentActions({
  addToChat,
  openPane,
  reveal,
}: PageComponentMenuOptions): ModelComponentHostActions {
  return {
    addToChat: (reference) => {
      addToChat(reference);
    },
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
  /** Spread on the canvas region that holds `ModelViewer` (`#tau-viewer-canvas`). */
  regionProps: Readonly<
    Pick<
      React.HTMLAttributes<HTMLDivElement>,
      | 'onPointerDownCapture'
      | 'onPointerMoveCapture'
      | 'onPointerUpCapture'
      | 'onPointerCancelCapture'
      | 'onLostPointerCapture'
      | 'onContextMenu'
    >
  >;
  /** `ModelViewer`'s `onComponentSecondaryPointerCandidate`. */
  onComponentSecondaryPointerCandidate: (target: ViewerSecondaryGestureMenu['target'] | undefined) => void;
  /** Close the menu, for example when the shown model changes. */
  close: () => void;
  /** The menu itself; render it anywhere inside the page's providers. */
  menu: React.JSX.Element;
}>;

const pointOf = (event: React.PointerEvent): ViewerSecondaryGestureMenu['point'] => ({
  clientX: event.clientX,
  clientY: event.clientY,
});

/**
 * The canvas part menu, opened as the Tau app's viewer opens it: a right press that stays within 4 px until release
 * opens the menu at the press, and one that travels further pans the camera.
 *
 * @param options - The page's graphics actor and the part verbs.
 * @returns The canvas region's handlers, the viewer callback and the menu.
 */
export function useViewerComponentMenu({
  graphicsRef,
  actions,
}: Readonly<{
  graphicsRef: GraphicsRef;
  actions: ModelComponentHostActions;
}>): ViewerComponentMenu {
  const [open, setOpen] = useState<ViewerSecondaryGestureMenu | undefined>(undefined);
  const gesture = useRef<ViewerSecondaryGestureState>(idleViewerSecondaryGestureState);
  const data = useViewerModelComponentActionMenuData({
    graphicsRef,
    target: open?.target,
    actions,
  });

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
    close,
    menu: (
      <ViewerModelComponentActionMenu
        isOpen={open !== undefined}
        point={open?.point}
        data={data}
        onOpenChange={onOpenChange}
      />
    ),
  };
}

function releaseCapture(event: React.PointerEvent<HTMLDivElement>): void {
  try {
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
  } catch {
    /* The browser may already have ended the pointer session. */
  }
}
