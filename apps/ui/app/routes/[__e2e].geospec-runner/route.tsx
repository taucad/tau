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

/** The cube-with-cylinder-cutout the chat agent authors for the replay fixture. */
const openScadModel = `cube_size = 20;
cylinder_radius = 5;

difference() {
  cube([cube_size, cube_size, cube_size], center = false);
  translate([cube_size / 2, cube_size / 2, -1])
    cylinder(h = cube_size + 2, r = cylinder_radius, $fn = 64);
}
`;

const geoSpecModel = `import { describe, expectGeo, it } from 'geospec';
import { loadModel } from 'geospec/model';

describe('main geometry', () => {
  it('should have the expected size', async () => {
    const model = await loadModel({ file: 'main.scad' });
    expectGeo(model).toHaveBoundingBox({ size: { x: 20, y: 20, z: 20 }, tolerance: 1 });
  });

  it('should be watertight', async () => {
    const model = await loadModel({ file: 'main.scad' });
    expectGeo(model).toBeWatertight();
  });
});
`;

const packageJson = JSON.stringify({ type: 'module' }, null, 2);

const seedFiles = Object.fromEntries([
  ['package.json', { content: encode(packageJson) }],
  ['main.scad', { content: encode(openScadModel) }],
  ['main.geospec.ts', { content: encode(geoSpecModel) }],
]) as Record<string, { content: Uint8Array<ArrayBuffer> }>;

const createSeedProject = (): Omit<ProjectManifest, '$schema' | 'id'> => ({
  name: 'geospec runner e2e',
  description: 'Deterministic local seed for the browser GeoSpec runner surface.',
  tags: ['e2e', 'openscad', 'geospec'],
  assets: {
    main: {
      entryPath: 'main.scad',
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

const GeoSpecRunnerDebugRoute = (): React.JSX.Element => {
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
          project: createSeedProject(),
          activeKernel: 'openscad',
          location: homeProjectCreationLocation,
          files: seedFiles,
          editorState: {
            panelState: {
              openPanels: {
                // The GeoSpec worker client is owned by the chat RPC hook, so
                // the panel must mount for the probe to exist.
                chat: true,
                files: true,
                parameters: false,
                editor: true,
              },
              panelSizes: {
                files: 260,
                editor: 460,
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

export default GeoSpecRunnerDebugRoute;
