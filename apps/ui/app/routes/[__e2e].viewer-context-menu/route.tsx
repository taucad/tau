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

const entryPath = 'src/main.ts';

const replicadModel = `import { makeBaseBox } from 'replicad';

export default function main() {
  return [
    { shape: makeBaseBox(16, 18, 8).translate([-18, -9, -4]), name: 'Left box', color: '#22c55e' },
    { shape: makeBaseBox(16, 18, 8).translate([2, -9, -4]), name: 'Right box', color: '#3b82f6' },
  ];
}
`;

const packageJson = JSON.stringify(
  {
    type: 'module',
  },
  null,
  2,
);

const seedFiles = Object.fromEntries([
  ['package.json', { content: encode(packageJson) }],
  [entryPath, { content: encode(replicadModel) }],
]) as Record<string, { content: Uint8Array<ArrayBuffer> }>;

const createSeedProject = (): Omit<ProjectManifest, '$schema' | 'id'> => ({
  name: 'viewer context menu e2e',
  description: 'Deterministic local seed for the chat viewer right-click context menu.',
  tags: ['e2e', 'replicad'],
  assets: {
    main: {
      entryPath,
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

const ViewerContextMenuDebugRoute = (): React.JSX.Element => {
  const { createProject } = useProjectManager();
  const navigate = useNavigate();
  const [error, setError] = React.useState<string | undefined>(undefined);
  const seedStarted = React.useRef(false);

  React.useEffect(() => {
    if (seedStarted.current) {
      return;
    }
    seedStarted.current = true;

    const seed = async (): Promise<void> => {
      try {
        const project = await createProject({
          location: homeProjectCreationLocation,
          project: createSeedProject(),
          activeKernel: 'replicad',
          files: seedFiles,
          editorState: {
            panelState: {
              openPanels: {
                chat: false,
                files: false,
                explorer: false,
                kernel: false,
                parameters: false,
                editor: false,
                converter: false,
                details: false,
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
  }, [createProject, navigate]);

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

export default ViewerContextMenuDebugRoute;
