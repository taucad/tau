import type {
  ModelComponentActionTarget,
  ModelComponentHostActions,
} from '@taucad/workbench-panes/component-menu/component-actions';
import { geometryReferenceToToken, useChatContextInsertion } from '#components/chat/chat-context-insertion.js';
import { useProject } from '#hooks/use-project.js';
import { useProjectWorkspace } from '#routes/w.$workspace.$project/project-workspace-context.js';

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
      // A pane this opens subscribes after the emit and takes it held (workbench-reveal.ts).
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
