import { findLinkByComponent } from '@taucad/kinematics';
import type { ActorRefFrom } from 'xstate';
import type { GeometryComponentManifest, GeometryComponentNode } from '@taucad/types';
import type { graphicsMachine } from '@taucad/viewer/machines/graphics.machine';
import type { ModelInteractionSource } from '@taucad/viewer/machines/model-interaction.machine';
import { buildGeometryComponentReference } from '@taucad/viewer/graphics/metadata/geometry-component-reference';
import { geometryReferenceToToken, useChatContextInsertion } from '#components/chat/chat-context-insertion.js';
import { useProject } from '#hooks/use-project.js';
import { useProjectWorkspace } from '#routes/w.$workspace.$project/project-workspace-context.js';

/** The part a set of verbs acts on, and where the request came from. */
export type ModelComponentActionTarget = {
  readonly manifest: GeometryComponentManifest;
  readonly node: GeometryComponentNode;
  readonly graphicsRef: ActorRefFrom<typeof graphicsMachine>;
  readonly unitId: string;
  readonly source: Extract<ModelInteractionSource, 'explorer' | 'viewer'>;
  readonly isIsolated: boolean;
};

export type ModelComponentActions = {
  readonly addToChat: () => void;
  readonly revealInExplorer: () => void;
  /** Reveal any component of the same unit, such as a group above the part. */
  readonly revealComponent: (componentId: string) => void;
  readonly showKinematics: () => void;
  readonly focusComponent: () => void;
  readonly hideComponent: () => void;
  readonly showComponent: () => void;
  readonly toggleIsolation: () => void;
  readonly showAll: () => void;
  readonly setOpacityPercent: (value: number) => void;
  readonly resetAllOpacities: () => void;
};

/**
 * The part, or the first part inside it, that belongs to a link of the unit's mechanism: what "Show kinematics"
 * reveals. `undefined` disables the item.
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
 * The part verbs shared by the part menus and the part gallery, bound to one part.
 */
export function useModelComponentActions({
  manifest,
  node,
  graphicsRef,
  unitId,
  source,
  isIsolated,
}: ModelComponentActionTarget): ModelComponentActions {
  const { addContextReferences } = useChatContextInsertion();
  const project = useProject({ enableNoContext: true });
  const workspace = useProjectWorkspace({ enableNoContext: true });
  const revealComponent = (componentId: string): void => {
    const entryPath = manifest.sourceFile;
    if (!entryPath || !project) {
      return;
    }
    graphicsRef.send({ type: 'selectModelComponent', unitId, componentId, source: 'viewer' });
    workspace?.openPanel('model');
    requestAnimationFrame(() => {
      project.editorRef.send({ type: 'revealModelComponentInExplorer', entryPath, unitId, componentId });
    });
  };

  return {
    addToChat: () => {
      const reference = buildGeometryComponentReference(manifest, node);
      if (!reference) {
        return;
      }
      addContextReferences([
        {
          id: `${reference.filePath}#${reference.componentId}`,
          label: reference.label,
          chipType: 'geometry',
          referenceToken: geometryReferenceToToken(reference),
          geometryReference: reference,
        },
      ]);
    },
    revealInExplorer: () => {
      revealComponent(node.id);
    },
    revealComponent,
    showKinematics: () => {
      const componentId = findModelComponentKinematicsTarget(manifest, node);
      if (componentId === undefined || !manifest.sourceFile || !project) {
        return;
      }
      workspace?.openPanel('kinematics');
      // The pane listens once mounted; a frame lets a newly opened pane subscribe, as Reveal in Explorer does.
      requestAnimationFrame(() => {
        project.editorRef.send({
          type: 'revealModelComponentInKinematics',
          entryPath: manifest.sourceFile!,
          unitId,
          componentId,
        });
      });
    },
    focusComponent: () => {
      graphicsRef.send({ type: 'focusModelComponent', unitId, componentId: node.id, source });
    },
    hideComponent: () => {
      graphicsRef.send({ type: 'hideModelComponent', unitId, componentId: node.id, source });
    },
    showComponent: () => {
      graphicsRef.send({ type: 'showModelComponent', unitId, componentId: node.id, source });
    },
    toggleIsolation: () => {
      graphicsRef.send(
        isIsolated
          ? { type: 'clearModelComponentIsolation', unitId, source }
          : { type: 'isolateModelComponent', unitId, componentId: node.id, source },
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
      graphicsRef.send({ type: 'resetModelComponentOpacities', unitId, source });
    },
  };
}
