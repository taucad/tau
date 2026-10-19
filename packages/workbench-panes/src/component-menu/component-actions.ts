import { findLinkByComponent } from '@taucad/kinematics';
import type { GeometryComponentManifest, GeometryComponentNode, GeometryComponentReference } from '@taucad/types';
import type { GraphicsRef } from '#host/workbench-host.jsx';

/**
 * Where a part menu opens: on an Explorer (Model pane) row, or on the part in the viewer canvas.
 *
 * @public
 */
export type ModelComponentMenuSource = 'explorer' | 'viewer';

/**
 * The part a set of verbs acts on, and where the request came from.
 *
 * @public
 */
export type ModelComponentActionTarget = Readonly<{
  manifest: GeometryComponentManifest;
  node: GeometryComponentNode;
  graphicsRef: GraphicsRef;
  unitId: string;
  source: ModelComponentMenuSource;
  isIsolated: boolean;
}>;

/**
 * Which part a part preview (gallery) opens on, and where focus returns when it closes.
 *
 * @public
 */
export type ModelComponentPreviewRequest = Readonly<{
  graphicsRef: GraphicsRef;
  unitId: string;
  componentId: string;
  source: ModelComponentMenuSource;
  origin?: HTMLElement;
}>;

/**
 * The part verbs only a host can perform, because they reach its chat, panes or project. Each is optional: the part
 * menu leaves out the item of an absent verb.
 *
 * @public
 */
export type ModelComponentHostActions = Readonly<{
  /** "Add to chat": hand the part's structured reference to the host's chat. */
  addToChat?: (reference: GeometryComponentReference, target: ModelComponentActionTarget) => void;
  /**
   * The {@link ModelComponentHostActions.addToChat} item's label, naming where the reference goes on this host, such as
   * "Send to chat" or "Copy reference". "Add to chat" when absent.
   */
  addToChatLabel?: string;
  /** "Reveal in Explorer": select the part and reveal it in the Model pane. Offered only in the viewer's menu. */
  revealInExplorer?: (target: ModelComponentActionTarget) => void;
  /**
   * "Show kinematics": open the Kinematics pane on the joint that moves the part. `componentId` is the part, or the
   * first part inside it, that belongs to a mechanism link; the item is disabled when there is none.
   */
  showKinematics?: (target: ModelComponentActionTarget, componentId: string) => void;
  /** "Open preview": open the part gallery on a previewable part. */
  openPreview?: (request: ModelComponentPreviewRequest) => void;
}>;

/**
 * The part verbs that act on the graphics actor alone, bound to one part.
 *
 * @public
 */
export type ModelComponentGraphicsActions = Readonly<{
  focusComponent: () => void;
  hideComponent: () => void;
  showComponent: () => void;
  toggleIsolation: () => void;
  showAll: () => void;
  setOpacityPercent: (value: number) => void;
  resetAllOpacities: () => void;
}>;

/**
 * The part, or the first part inside it, that belongs to a link of the unit's mechanism: what "Show kinematics"
 * reveals.
 *
 * @param manifest - The unit's component manifest.
 * @param node - The part the menu acts on.
 * @returns The component id to reveal, or `undefined`, which disables the item.
 * @public
 */
export function findModelComponentKinematicsTarget(
  manifest: GeometryComponentManifest,
  node: GeometryComponentNode,
): string | undefined {
  const { mechanism } = manifest;
  if (!mechanism) {
    return undefined;
  }
  const pending = [node.id];
  for (let id = pending.shift(); id !== undefined; id = pending.shift()) {
    if (findLinkByComponent({ mechanism, componentId: id })) {
      return id;
    }
    pending.push(...(manifest.nodesById[id]?.childIds ?? []));
  }
  return undefined;
}

/**
 * The graphics-only part verbs shared by the part menus and a host's part gallery, bound to one part.
 *
 * @param target - The part and the graphics actor that draws it.
 * @returns Focus, visibility, isolation and opacity verbs.
 * @public
 */
export function createModelComponentGraphicsActions({
  node,
  graphicsRef,
  unitId,
  source,
  isIsolated,
}: ModelComponentActionTarget): ModelComponentGraphicsActions {
  return {
    focusComponent: () => {
      graphicsRef.send({
        type: 'focusModelComponent',
        unitId,
        componentId: node.id,
        source,
      });
    },
    hideComponent: () => {
      graphicsRef.send({
        type: 'hideModelComponent',
        unitId,
        componentId: node.id,
        source,
      });
    },
    showComponent: () => {
      graphicsRef.send({
        type: 'showModelComponent',
        unitId,
        componentId: node.id,
        source,
      });
    },
    toggleIsolation: () => {
      graphicsRef.send(
        isIsolated
          ? { type: 'clearModelComponentIsolation', unitId, source }
          : {
              type: 'isolateModelComponent',
              unitId,
              componentId: node.id,
              source,
            },
      );
    },
    showAll: () => {
      graphicsRef.send({ type: 'showHiddenModelComponents', unitId, source });
    },
    setOpacityPercent: (value) => {
      graphicsRef.send({
        type: 'setModelComponentOpacity',
        unitId,
        componentId: node.id,
        opacity: value / 100,
        source,
      });
    },
    resetAllOpacities: () => {
      graphicsRef.send({
        type: 'resetModelComponentOpacities',
        unitId,
        source,
      });
    },
  };
}
