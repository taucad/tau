import * as React from 'react';
import { useLocation, useNavigate } from 'react-router';
import type { ProjectManifest } from '@taucad/types';
import { Loader } from '#components/ui/loader.js';
import { getEnvironment } from '#environment.config.js';
import { useProjectManager } from '#hooks/use-project-manager.js';
import { projectUrl } from '#utils/project-url.utils.js';
import { homeProjectCreationLocation } from '#types/project-creation-location.types.js';

const encoder = new TextEncoder();
const encode = (text: string): Uint8Array<ArrayBuffer> => encoder.encode(text);
type FixtureKind = 'edge' | 'gltf' | 'svg';

const model3d = `import { makeBaseBox, makeCylinder } from 'replicad';

export default function main() {
  return [
    { shape: makeBaseBox(70, 10, 10).translate([-35, -5, 0]), color: '#ef4444', name: 'X arm' },
    { shape: makeBaseBox(10, 45, 14).translate([-5, -10, 0]), color: '#22c55e', name: 'Y arm' },
    { shape: makeCylinder(8, 38).translate([18, 12, 0]), color: '#3b82f6', name: 'Z tower' },
    { shape: makeBaseBox(9, 7, 6).translate([-26, 17, 13]), color: '#a3a3a3', name: 'Offset key' },
  ];
}
`;

const drawing2d = `import { draw } from 'replicad';

export default function main() {
  return [
    { shape: draw().movePointerTo([-40, -15]).hLine(75).vLine(8).hLine(-75).close(), color: '#ef4444', name: 'X datum' },
    { shape: draw().movePointerTo([-15, -30]).vLine(65).hLine(7).vLine(-65).close(), color: '#22c55e', name: 'Y datum' },
    { shape: draw().movePointerTo([18, 8]).hLine(18).vLine(14).hLine(-18).close(), color: '#3b82f6', name: 'Offset feature' },
  ];
}
`;

const secondaryModel3d = `import { makeBaseBox, makeCylinder } from 'replicad';

export default function main() {
  return [
    { shape: makeCylinder(13, 18).translate([-24, 9, 0]), color: '#06b6d4', name: 'Secondary cylinder' },
    { shape: makeBaseBox(16, 34, 7).translate([14, -22, 4]), color: '#a855f7', name: 'Secondary key' },
  ];
}
`;

const edgeLegibilityModel3d = `import { makeBaseBox } from 'replicad';

export default function main() {
  const straight = makeBaseBox(100, 12, 2).translate([-50, -36, 0]);
  const diagonal = makeBaseBox(80, 8, 2)
    .translate([-40, -4, 0])
    .rotate(45, [0, 0, 0], [0, 0, 1])
    .translate([14.98, 25, 2]);
  return [
    { shape: straight, color: '#e5e7eb', name: 'Straight gauge' },
    { shape: diagonal, color: '#e5e7eb', name: 'Diagonal gauge' },
  ];
}
`;

const seedFiles = (kind: FixtureKind): Record<string, { content: Uint8Array<ArrayBuffer> }> => ({
  'package.json': { content: encode(JSON.stringify({ type: 'module' }, null, 2)) },
  'src/main.ts': { content: encode(kind === 'svg' ? drawing2d : kind === 'edge' ? edgeLegibilityModel3d : model3d) },
  ...(kind === 'gltf' && { 'src/secondary.ts': { content: encode(secondaryModel3d) } }),
});

const seedProject = (kind: FixtureKind): Omit<ProjectManifest, '$schema' | 'id'> => ({
  name:
    kind === 'svg'
      ? 'Headless SVG Capture E2E'
      : kind === 'edge'
        ? 'Headless Edge Capture E2E'
        : 'Headless GLTF Capture E2E',
  description: 'Asymmetric deterministic fixture for canonical chat image capture.',
  tags: ['e2e', 'headless-image', kind],
  assets: { main: { entryPath: 'src/main.ts' } },
});

export const loader = async (): Promise<Response> => {
  const environment = await getEnvironment();
  if (!environment.TAU_DEBUG) {
    // oxlint-disable-next-line typescript/only-throw-error -- React Router route control-flow.
    throw new Response('Not found', { status: 404 });
  }
  return Response.json({ ok: true });
};

const HeadlessChatImageCaptureDebugRoute = (): React.JSX.Element => {
  const { createProject, isLoading } = useProjectManager();
  const navigate = useNavigate();
  const { search } = useLocation();
  const [error, setError] = React.useState<string>();
  const started = React.useRef(false);

  React.useEffect(() => {
    if (isLoading || started.current) {
      return;
    }
    started.current = true;
    const requestedKind = new URLSearchParams(search).get('kind');
    const kind: FixtureKind = requestedKind === 'svg' || requestedKind === 'edge' ? requestedKind : 'gltf';
    const seed = async (): Promise<void> => {
      try {
        const project = await createProject({
          project: seedProject(kind),
          activeModel: 'e2e-image-model',
          activeKernel: 'replicad',
          location: homeProjectCreationLocation,
          files: seedFiles(kind),
          editorState: {
            panelState: { desktopLayout: { chatOpen: true, workbenchOpen: false } },
          },
        });
        void navigate(projectUrl(project.slugs));
      } catch (seedError) {
        setError(seedError instanceof Error ? seedError.message : String(seedError));
      }
    };
    // async-iife: bootstrap -- React effects cannot await local project seeding.
    void seed();
  }, [createProject, isLoading, navigate, search]);

  return error ? <main role='alert'>{error}</main> : <Loader />;
};

export default HeadlessChatImageCaptureDebugRoute;
