import { CadPreviewProvider } from '#hooks/use-cad-preview.js';
import { ProjectCardCadPreview, projectCardVerticalFieldOfView } from '#components/project-card.js';
import type { ProjectFiles } from '#constants/project-examples.js';

/*
 * A community card's live model preview, in its own chunk, loaded when a card's preview is first turned on
 * (progressive loading PL5): the preview's CAD and graphics machines, the units catalog and the kernel options are
 * not on Home's interactive tier.
 */

/**
 * A community card's live model preview: an ephemeral CAD preview of the example's files.
 *
 * @param props - The example's id, main file and files.
 * @returns The preview.
 */
export function CommunityCardLivePreview({
  projectId,
  mainFile,
  files,
}: {
  readonly projectId: string;
  readonly mainFile: string;
  readonly files: ProjectFiles;
}): React.JSX.Element {
  return (
    <CadPreviewProvider
      projectId={projectId}
      mainFile={mainFile}
      files={files}
      initialVerticalFieldOfView={projectCardVerticalFieldOfView}
    >
      <ProjectCardCadPreview />
    </CadPreviewProvider>
  );
}
