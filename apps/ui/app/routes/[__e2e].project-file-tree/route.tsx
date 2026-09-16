import * as React from 'react';
import { useNavigate, useSearchParams } from 'react-router';
import type { ProjectManifest } from '@taucad/types';
import { Loader } from '#components/ui/loader.js';
import { getEnvironment } from '#environment.config.js';
import { useProjectManager } from '#hooks/use-project-manager.js';
import { projectUrl } from '#utils/project-url.utils.js';
import { homeProjectCreationLocation } from '#types/project-creation-location.types.js';
import type { ProjectCreationLocation } from '#types/project-creation-location.types.js';

/** Same shape the project-creation-location fixture accepts: one OPFS directory name. */
const validWorkspaceFixture = /^[a-z0-9](?:[a-z0-9-]{0,62}[a-z0-9])?$/u;

/** The Anthropic-wire model the agent-host gateway fixture answers for. */
const seededModel = 'anthropic-claude-haiku-4.5';

const encoder = new TextEncoder();

const encode = (text: string): Uint8Array<ArrayBuffer> => encoder.encode(text);

const honeycombModel = `import { makeBaseBox } from 'replicad';

export const defaultParams = {
  dimensions: { width: 20, height: 14, depth: 4, rotationAngle: 45 },
  pattern: { cellSize: 3, wallThickness: 1 },
};

export default function main(params = defaultParams) {
  const { width, height, depth } = params.dimensions;
  return makeBaseBox(width, height, depth);
}
`;

const stressParameters = Object.fromEntries(
  Array.from({ length: 96 }, (_, index) => [`stressValue${String(index + 1)}`, index + 1]),
);

const boxCornerModel = `import { makeBaseBox } from 'replicad';

export const defaultParams = {
  dimensions: { width: 16, height: 12, depth: 6 },
  corner: { cornerRadius: 2, rounded: true },
  stress: ${JSON.stringify(stressParameters)},
};

export default function main(params = defaultParams) {
  const { width, height, depth } = params.dimensions;
  if (params.stress.stressValue96 > 1000) {
    throw new Error('parameter stress preview failure');
  }
  return makeBaseBox(width, height, depth);
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
  ['public/models/honeycomb.js', { content: encode(honeycombModel) }],
  ['public/models/box-corner.js', { content: encode(boxCornerModel) }],
  ['public/models/nested/strainer.js', { content: encode(honeycombModel) }],
  ['src/readme.md', { content: encode('# File tree e2e fixture\n') }],
]) as Record<string, { content: Uint8Array<ArrayBuffer> }>;

/** `?main=box-corner` seeds the 101-field stress model as the main asset for large-form probes. */
const mainEntryPathFor = (fixture: string | undefined): string =>
  fixture === 'box-corner' ? 'public/models/box-corner.js' : 'public/models/honeycomb.js';

const mebibyte = 1024 * 1024;

/**
 * The same seed, at a size a latency budget is measured against (B1).
 *
 * `?files=` adds that many small source files and `?binaryMib=` one binary of
 * that size, because W6's ceilings are stated for a project with real bulk in
 * it — a cut over five files says nothing about the one a person actually has.
 * Both default to nothing, so every existing fixture URL seeds exactly what it
 * seeded before.
 *
 * @param fileCount - Extra source files to seed.
 * @param binaryMib - Size of the single binary asset, in MiB.
 * @returns The seed map `createProject` is given.
 */
const buildSeedFiles = (fileCount: number, binaryMib: number): Record<string, { content: Uint8Array<ArrayBuffer> }> => {
  const files = { ...seedFiles };
  for (let index = 0; index < fileCount; index += 1) {
    files[`public/models/bulk/part-${String(index).padStart(4, '0')}.js`] = {
      content: encode(boxCornerModel.replace('width, height, depth', `width + ${String(index)}, height, depth`)),
    };
  }
  if (binaryMib > 0) {
    /* Incompressible bytes: a run of zeroes would be deflated away and measure
     * the compressor rather than the export it stands in for. */
    const bytes = new Uint8Array(binaryMib * mebibyte);
    crypto.getRandomValues(bytes.subarray(0, 65_536));
    for (let offset = 65_536; offset < bytes.length; offset += 65_536) {
      bytes.set(bytes.subarray(0, Math.min(65_536, bytes.length - offset)), offset);
    }
    files['public/exports/bulk.stl'] = { content: bytes };
  }
  return files;
};

/** A bounded, non-negative integer from one search parameter. */
const readCount = (value: string | null, limit: number): number => {
  const parsed = Number.parseInt(value ?? '', 10);
  return Number.isFinite(parsed) && parsed > 0 ? Math.min(parsed, limit) : 0;
};

const createSeedProject = (mainFixture: string | undefined): Omit<ProjectManifest, '$schema' | 'id'> => ({
  name: 'sgenoud/models file-tree e2e',
  description: 'Deterministic local seed for the project file tree e2e surface.',
  tags: ['e2e', 'replicad'],
  assets: {
    main: {
      entryPath: mainEntryPathFor(mainFixture),
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

const ProjectFileTreeDebugRoute = (): React.JSX.Element => {
  const { connectWorkspace, createProject } = useProjectManager();
  const navigate = useNavigate();
  const [searchParameters] = useSearchParams();
  const workspaceFixture = searchParameters.get('workspace') ?? undefined;
  /**
   * Seeds the project the way the home composer does: a pending first message
   * plus the one-shot `startupRequest` that hydration replays. That dispatch is
   * the only one that never runs `withWorkspace`, so it is the only way to
   * exercise the seeded-turn admission path end to end. Browser-host placement
   * is seeded with it because the e2e stack has no API runner (and the agent
   * picker cannot offer browser-host from the homepage, where no project exists).
   */
  const seededPrompt = searchParameters.get('prompt') ?? undefined;
  const mainFixture = searchParameters.get('main') ?? undefined;
  const bulkFileCount = readCount(searchParameters.get('files'), 2000);
  const binaryMib = readCount(searchParameters.get('binaryMib'), 64);
  /* The composer without a seeded turn: the branch picker is the only
   * always-reachable *New branch* in a one-branch project (W7 review R1), so a
   * fixture that needs branches has to be able to open the composer without
   * also starting an agent run. */
  const chatOpen = searchParameters.get('chat') === '1';
  const [error, setError] = React.useState<string | undefined>(undefined);
  const seedStarted = React.useRef(false);

  React.useEffect(() => {
    if (seedStarted.current) {
      return;
    }
    seedStarted.current = true;

    // An OPFS subdirectory handle *is* a FileSystemDirectoryHandle, so it seeds
    // a genuine webaccess workspace through production APIs without a picker.
    const resolveLocation = async (): Promise<ProjectCreationLocation> => {
      if (!workspaceFixture) {
        return homeProjectCreationLocation;
      }
      if (!validWorkspaceFixture.test(workspaceFixture)) {
        throw new Error(`Invalid workspace fixture: ${workspaceFixture}`);
      }
      const root = await navigator.storage.getDirectory();
      const connected = await connectWorkspace(await root.getDirectoryHandle(workspaceFixture, { create: true }));
      if (!connected) {
        throw new Error(`Workspace fixture ${workspaceFixture} did not connect`);
      }
      return { kind: 'workspace', workspaceId: connected.workspace.workspaceId };
    };

    const seed = async (): Promise<void> => {
      try {
        const project = await createProject({
          location: await resolveLocation(),
          project: createSeedProject(mainFixture),
          activeKernel: 'replicad',
          files: buildSeedFiles(bulkFileCount, binaryMib),
          ...(seededPrompt === undefined
            ? {}
            : {
                initialMessage: { content: seededPrompt },
                activeExecution: { kind: 'tau', model: seededModel },
              }),
          editorState: {
            panelState: {
              desktopLayout: {
                chatOpen: seededPrompt !== undefined || chatOpen,
                workbenchOpen: true,
                workbenchWidth: 460,
                compactAuxiliary: 'workbench',
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
  }, [connectWorkspace, createProject, mainFixture, navigate, workspaceFixture]);

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

export default ProjectFileTreeDebugRoute;
