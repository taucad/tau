import * as React from 'react';
import { useNavigate, useSearchParams } from 'react-router';
import type { ProjectManifest } from '@taucad/types';
import { Loader } from '#components/ui/loader.js';
import { getEnvironment } from '#environment.config.js';
import { useProjectManager } from '#hooks/use-project-manager.js';
import { projectUrl } from '#utils/project-url.utils.js';
import { homeProjectCreationLocation } from '#types/project-creation-location.types.js';

const encoder = new TextEncoder();

const encode = (text: string): Uint8Array<ArrayBuffer> => encoder.encode(text);

const boxModel = `import { makeBaseBox } from 'replicad';

export const defaultParams = {
  width: 20,
};

export default function main(parameters = defaultParams) {
  return makeBaseBox(parameters.width, 14, 8);
}
`;

const curvedModel = `import { makeBaseBox, makeSphere } from 'replicad';

export const defaultParams = {
  width: 20,
};

export default function main(parameters = defaultParams) {
  const radius = parameters.width / 2;
  return [
    { name: 'Sphere', shape: makeSphere(radius) },
    {
      name: 'Asymmetric key',
      shape: makeBaseBox(radius * 0.2, radius * 0.15, radius * 0.15).translate([
        radius * 0.88,
        -radius * 0.2,
        radius * 0.1,
      ]),
    },
  ];
}
`;

const createSeedFiles = (model: string) =>
  Object.fromEntries([
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
    ['src/main.ts', { content: encode(model) }],
  ]) as Record<string, { content: Uint8Array<ArrayBuffer> }>;

const createSeedProject = (curved: boolean): Omit<ProjectManifest, '$schema' | 'id'> => ({
  name: curved ? 'Thumbnail Curved Parity E2E' : 'Thumbnail Generation E2E',
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
  const [searchParams] = useSearchParams();
  const [error, setError] = React.useState<string>();
  const seedStarted = React.useRef(false);

  React.useEffect(() => {
    if (isLoading || seedStarted.current) {
      return;
    }
    seedStarted.current = true;

    const seed = async (): Promise<void> => {
      try {
        const curved = searchParams.get('fixture') === 'curved';
        const project = await createProject({
          project: createSeedProject(curved),
          activeKernel: 'replicad',
          location: homeProjectCreationLocation,
          files: createSeedFiles(curved ? curvedModel : boxModel),
          editorState: {
            panelState: {
              desktopLayout: { chatOpen: false, workbenchOpen: true, compactAuxiliary: 'workbench' },
            },
          },
        });

        void navigate(`${projectUrl(project.slugs)}?graphicsBackend=webgpu`);
      } catch (seedError) {
        setError(seedError instanceof Error ? seedError.message : String(seedError));
      }
    };

    void seed();
  }, [createProject, isLoading, navigate, searchParams]);

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
