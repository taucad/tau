/**
 * The viewer page's part verbs and reveal channels, behind the Tau app's part menu: right-click a part on the canvas,
 * press Shift+F10 or the Menu key with the canvas region focused, open the header's "Actions for <name>", or open a
 * row's menu in the Model pane. The menu itself is `useViewerPartMenu` from `@taucad/workbench-panes`, as on the
 * desktop; the page's verbs are "Add to chat" (the host bridge), "Reveal in Explorer" (the Model pane) and "Show
 * kinematics" (the Kinematics pane). The page has no part gallery or thumbnails, so "Open preview" and "Retry preview"
 * never show.
 */
import type { GeometryComponentReference } from '@taucad/types';
import type { ModelComponentHostActions } from '@taucad/workbench-panes/component-menu/component-actions';
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
