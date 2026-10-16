import {
  createModelComponentGraphicsActions,
  findModelComponentKinematicsTarget,
} from '@taucad/workbench-panes/component-menu/component-actions';
import type {
  ModelComponentActionTarget,
  ModelComponentHostActions,
} from '@taucad/workbench-panes/component-menu/component-actions';
import { buildGeometryComponentReference } from '@taucad/viewer/graphics/metadata/geometry-component-reference';
import { geometryReferenceToToken, useChatContextInsertion } from '#components/chat/chat-context-insertion.js';
import { useProject } from '#hooks/use-project.js';
import { useProjectWorkspace } from '#routes/w.$workspace.$project/project-workspace-context.js';

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

type RevealTarget = Pick<ModelComponentActionTarget, 'manifest' | 'graphicsRef' | 'unitId'>;

/** The app's project-bound part verbs: chat, and the Model and Kinematics panes. */
export type ModelComponentProjectActions = Required<
  Pick<ModelComponentHostActions, 'addToChat' | 'revealInExplorer' | 'showKinematics'>
> & {
  readonly revealComponent: (target: RevealTarget, componentId: string) => void;
};

/**
 * The app's part verbs for the shared part menus (`@taucad/workbench-panes/component-menu`), bound to the project's
 * chat, editor and workspace panels.
 */
export function useModelComponentProjectActions(): ModelComponentProjectActions {
  const { addContextReferences } = useChatContextInsertion();
  const project = useProject({ enableNoContext: true });
  const workspace = useProjectWorkspace({ enableNoContext: true });
  const revealComponent = ({ manifest, graphicsRef, unitId }: RevealTarget, componentId: string): void => {
    const entryPath = manifest.sourceFile;
    if (!entryPath || !project) {
      return;
    }
    graphicsRef.send({
      type: 'selectModelComponent',
      unitId,
      componentId,
      source: 'viewer',
    });
    workspace?.openPanel('model');
    requestAnimationFrame(() => {
      project.editorRef.send({
        type: 'revealModelComponentInExplorer',
        entryPath,
        unitId,
        componentId,
      });
    });
  };

  return {
    addToChat: (reference) => {
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
    revealInExplorer: (target) => {
      revealComponent(target, target.node.id);
    },
    revealComponent,
    showKinematics: ({ manifest, unitId }, componentId) => {
      const entryPath = manifest.sourceFile;
      if (!entryPath || !project) {
        return;
      }
      workspace?.openPanel('kinematics');
      // The pane listens once mounted; a frame lets a newly opened pane subscribe, as Reveal in Explorer does.
      requestAnimationFrame(() => {
        project.editorRef.send({
          type: 'revealModelComponentInKinematics',
          entryPath,
          unitId,
          componentId,
        });
      });
    },
  };
}

/**
 * The part verbs shared by the part menus and the part gallery, bound to one part.
 */
export function useModelComponentActions(target: ModelComponentActionTarget): ModelComponentActions {
  const project = useModelComponentProjectActions();
  const { manifest, node } = target;

  return {
    addToChat: () => {
      const reference = buildGeometryComponentReference(manifest, node);
      if (reference) {
        project.addToChat(reference, target);
      }
    },
    revealInExplorer: () => {
      project.revealInExplorer(target);
    },
    revealComponent: (componentId) => {
      project.revealComponent(target, componentId);
    },
    showKinematics: () => {
      const componentId = findModelComponentKinematicsTarget(manifest, node);
      if (componentId !== undefined) {
        project.showKinematics(target, componentId);
      }
    },
    ...createModelComponentGraphicsActions(target),
  };
}
