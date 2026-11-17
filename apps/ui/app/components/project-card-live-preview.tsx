import { CadPreviewProvider } from '#hooks/use-cad-preview.js';
import { HomeFileManagerProvider, SharedWorkerGate } from '#hooks/use-file-manager.js';
import { ProjectCardCadPreview, projectCardVerticalFieldOfView } from '#components/project-card.js';

/*
 * A library card's live model preview, in its own chunk, loaded when a card's preview is first turned on (progressive
 * loading PL5): the preview's CAD and graphics machines, the units catalog and the kernel options are not on Home's
 * interactive tier. A community card's is `community-card-live-preview.tsx`.
 */

/**
 * A library card's live model preview: the project's own file manager and an ephemeral CAD preview of its main file.
 *
 * @param props - The project and its main file.
 * @returns The preview.
 */
export function ProjectCardLivePreview({
  projectId,
  mainFile,
}: {
  readonly projectId: string;
  readonly mainFile: string;
}): React.JSX.Element {
  return (
    <SharedWorkerGate>
      <HomeFileManagerProvider key={projectId} projectId={projectId} rootDirectory={`/projects/${projectId}`}>
        <CadPreviewProvider
          projectId={projectId}
          mainFile={mainFile}
          initialVerticalFieldOfView={projectCardVerticalFieldOfView}
        >
          <ProjectCardCadPreview />
        </CadPreviewProvider>
      </HomeFileManagerProvider>
    </SharedWorkerGate>
  );
}
