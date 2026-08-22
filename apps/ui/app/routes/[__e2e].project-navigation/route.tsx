import * as React from 'react';
import { useNavigate } from 'react-router';
import type { ProjectManifest } from '@taucad/types';
import { Loader } from '#components/ui/loader.js';
import { getEnvironment } from '#environment.config.js';
import { useProjectManager } from '#hooks/use-project-manager.js';
import { projectUrl } from '#utils/project-url.utils.js';
import { homeProjectCreationLocation } from '#types/project-creation-location.types.js';

const encode = (text: string): Uint8Array<ArrayBuffer> => new TextEncoder().encode(text);
const alphaEntryPath = 'alpha.ts';
const betaEntryPath = 'beta.ts';
const model = (width: number): string => `import { makeBaseBox } from 'replicad';

export default function main() {
  return makeBaseBox(${width}, 12, 6);
}
`;

const createManifest = (name: string, entryPath: string): Omit<ProjectManifest, '$schema' | 'id'> => ({
  name,
  description: 'Deterministic project-navigation lifecycle fixture.',
  tags: ['e2e', 'navigation'],
  assets: { main: { entryPath } },
});

export const loader = async (): Promise<Response> => {
  const environment = await getEnvironment();
  if (!environment.TAU_DEBUG) {
    // oxlint-disable-next-line typescript/only-throw-error -- React Router uses thrown responses for route control flow.
    throw new Response('Not found', { status: 404 });
  }
  return Response.json({ ok: true });
};

const ProjectNavigationDebugRoute = (): React.JSX.Element => {
  const { createProject, isLoading } = useProjectManager();
  const navigate = useNavigate();
  const [error, setError] = React.useState<string>();
  const seedStarted = React.useRef(false);

  React.useEffect(() => {
    if (isLoading || seedStarted.current) {
      return;
    }
    seedStarted.current = true;

    const seed = async (): Promise<void> => {
      try {
        const projectA = await createProject({
          activeKernel: 'replicad',
          location: homeProjectCreationLocation,
          editorState: {
            panelState: {
              openPanels: { chat: true, files: true, parameters: false, editor: true },
            },
          },
          project: createManifest('Project Navigation A', alphaEntryPath),
          files: { [alphaEntryPath]: { content: encode(model(18)) } },
        });
        await createProject({
          activeKernel: 'replicad',
          location: homeProjectCreationLocation,
          editorState: {
            panelState: {
              openPanels: { chat: true, files: true, parameters: false, editor: true },
            },
          },
          project: createManifest('Project Navigation B', betaEntryPath),
          files: { [betaEntryPath]: { content: encode(model(28)) } },
        });
        void navigate(projectUrl(projectA.slugs));
      } catch (seedError) {
        setError(seedError instanceof Error ? seedError.message : String(seedError));
      }
    };
    void seed();
  }, [createProject, isLoading, navigate]);

  return error ? <div role='alert'>{error}</div> : <Loader />;
};

export default ProjectNavigationDebugRoute;
