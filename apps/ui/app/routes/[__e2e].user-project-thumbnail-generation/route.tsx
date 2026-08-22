import * as React from 'react';
import { useNavigate } from 'react-router';
import type { ProjectManifest } from '@taucad/types';
import { Loader } from '#components/ui/loader.js';
import { getEnvironment } from '#environment.config.js';
import { useProjectManager } from '#hooks/use-project-manager.js';
import { projectUrl } from '#utils/project-url.utils.js';
import { homeProjectCreationLocation } from '#types/project-creation-location.types.js';

const encoder = new TextEncoder();

const encode = (text: string): Uint8Array<ArrayBuffer> => encoder.encode(text);

const replicadModel = `import { makeBaseBox } from 'replicad';

export const defaultParams = {
  width: 20,
};

export default function main(parameters = defaultParams) {
  return makeBaseBox(parameters.width, 14, 8);
}
`;

const seedFiles = Object.fromEntries([
  [
    'package.json',
    {
      content: encode(
        JSON.stringify(
          {
            type: 'module',
          },
          null,
          2,
        ),
      ),
    },
  ],
  ['src/main.ts', { content: encode(replicadModel) }],
]) as Record<string, { content: Uint8Array<ArrayBuffer> }>;

const createSeedProject = (): Omit<ProjectManifest, '$schema' | 'id'> => ({
  name: 'Thumbnail Generation E2E',
  description: 'Deterministic nested-entry fixture for user-project thumbnail generation.',
  tags: ['e2e', 'replicad', 'thumbnail'],
  assets: {
    main: {
      entryPath: 'src/main.ts',
    },
  },
});

export const loader = async (): Promise<Response> => {
  const environment = await getEnvironment();

  if (!environment.TAU_DEBUG) {
    // oxlint-disable-next-line typescript/only-throw-error -- React Router uses thrown Response objects for route control-flow.
    throw new Response('Not found', { status: 404 });
  }

  return Response.json({ ok: true });
};

const UserProjectThumbnailGenerationDebugRoute = (): React.JSX.Element => {
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
        const project = await createProject({
          project: createSeedProject(),
          activeKernel: 'replicad',
          location: homeProjectCreationLocation,
          files: seedFiles,
          editorState: {
            panelState: {
              openPanels: {
                chat: false,
                files: false,
                parameters: true,
                editor: true,
              },
            },
          },
        });

        void navigate(projectUrl(project.slugs));
      } catch (seedError) {
        setError(seedError instanceof Error ? seedError.message : String(seedError));
      }
    };

    void seed();
  }, [createProject, isLoading, navigate]);

  if (error) {
    return (
      <main className='flex min-h-screen items-center justify-center bg-background p-6'>
        <div role='alert' className='max-w-lg rounded-md border bg-card p-4 text-sm text-card-foreground shadow-sm'>
          {error}
        </div>
      </main>
    );
  }

  return (
    <main className='flex min-h-screen items-center justify-center bg-background'>
      <Loader />
    </main>
  );
};

export default UserProjectThumbnailGenerationDebugRoute;
