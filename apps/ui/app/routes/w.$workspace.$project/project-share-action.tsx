import { useCallback, useEffect, useMemo, useState } from 'react';
import { useLocation, useNavigate } from 'react-router';
import { Share2 } from 'lucide-react';
import { useSelector } from '@xstate/react';
import { waitFor } from 'xstate';
import type { ShareProjectSnapshot, ShareSnapshotFileRole } from '@taucad/share/snapshot';
import { getActiveGroupValues, parameterEntryPath, projectToManifest, serializeProjectManifest } from '@taucad/types';
import { Button } from '#components/ui/button.js';
import { ProjectSharePanel } from '#components/publish/project-share-panel.js';
import type { ShareMethod } from '#components/publish/project-share-panel.js';
import { Tooltip, TooltipContent, TooltipTrigger } from '#components/ui/tooltip.js';
import { useFileManager } from '#hooks/use-file-manager.js';
import { useProject } from '#hooks/use-project.js';
import { useProjects } from '#hooks/use-projects.js';
import { parseGithubGistAuthorizationReturn } from '#lib/share-providers.js';
import { useProjectWorkspace } from '#routes/w.$workspace.$project/project-workspace-context.js';
import { encodeTextFile } from '#utils/filesystem.utils.js';
import { serializeParameterEntry } from '#utils/parameter-config.utils.js';

type ProjectShareNavigationIntent = {
  readonly shouldOpen: boolean;
  readonly initialMethod?: ShareMethod;
  readonly githubAuthorizationOutcome?: 'returned' | 'cancelled' | 'failed';
  readonly remainingSearch: string;
};

const shareMethods: readonly ShareMethod[] = ['direct', 'tau', 'github-gist'];

export const parseProjectShareNavigationIntent = (search: string): ProjectShareNavigationIntent => {
  const parameters = new URLSearchParams(search);
  const requestedMethod = parameters.get('shareProvider');
  const initialMethod = shareMethods.find((method) => method === requestedMethod);
  const githubAuthorization = parseGithubGistAuthorizationReturn(search);
  const shouldOpen = parameters.get('workbench') === 'share' || githubAuthorization !== undefined;

  if (parameters.get('workbench') === 'share') {
    parameters.delete('workbench');
  }
  if (initialMethod) {
    parameters.delete('shareProvider');
  }
  if (githubAuthorization) {
    parameters.delete('shareAuth');
    parameters.delete('error');
    parameters.delete('error_description');
  }
  const remaining = parameters.toString();
  return {
    shouldOpen,
    ...(initialMethod ? { initialMethod } : githubAuthorization ? { initialMethod: 'github-gist' } : {}),
    ...(githubAuthorization ? { githubAuthorizationOutcome: githubAuthorization.outcome } : {}),
    remainingSearch: remaining ? `?${remaining}` : '',
  };
};

const hashBytes = async (content: Uint8Array<ArrayBuffer>): Promise<string> =>
  [...new Uint8Array(await crypto.subtle.digest('SHA-256', content))]
    .map((value) => value.toString(16).padStart(2, '0'))
    .join('');

export function ProjectShareRouteIntent(): undefined {
  const { search } = useLocation();
  const { openPanel } = useProjectWorkspace();

  useEffect(() => {
    if (parseProjectShareNavigationIntent(search).shouldOpen) {
      openPanel('share');
    }
  }, [openPanel, search]);

  return undefined;
}

export function ProjectShareWorkbenchPanel(): React.JSX.Element {
  const location = useLocation();
  const navigate = useNavigate();
  const [navigationIntent] = useState(() => parseProjectShareNavigationIntent(location.search));
  const { parameterEntries, projectId, projectRef } = useProject();
  const { client: fileClient } = useFileManager();
  const { projects } = useProjects();
  const project = useSelector(projectRef, (state) => state.context.project);
  const projectUpdatedAt = projects.find((candidate) => candidate.id === projectId)?.lastActivityAt;

  useEffect(() => {
    if (!navigationIntent.shouldOpen) {
      return;
    }
    void navigate(`${location.pathname}${navigationIntent.remainingSearch}${location.hash}`, { replace: true });
  }, [location.hash, location.pathname, navigate, navigationIntent]);

  const collectSnapshot = useCallback(
    async (signal?: AbortSignal): Promise<ShareProjectSnapshot> => {
      if (!project) {
        throw new Error('The project metadata is unavailable.');
      }
      signal?.throwIfAborted();
      const { entryPath, thumbnail } = project.assets.main;
      let geometryUnit = projectRef.getSnapshot().context.geometryUnits.get(entryPath);
      if (!geometryUnit) {
        projectRef.send({ type: 'createGeometryUnit', entryPath });
        const projectState = await waitFor(
          projectRef,
          (candidate) => candidate.context.geometryUnits.has(entryPath) || candidate.matches('error'),
          { signal },
        );
        geometryUnit = projectState.context.geometryUnits.get(entryPath);
      }
      if (!geometryUnit) {
        throw new Error('The main runtime is unavailable.');
      }
      const state = await waitFor(
        geometryUnit,
        (candidate) => Boolean(candidate.context.kernelClient) || candidate.matches('error'),
        { signal },
      );
      const client = state.context.kernelClient;
      if (!client) {
        throw new Error('The main runtime could not be connected.');
      }
      const readmePath = await fileClient
        .readdir(`/projects/${projectId}`)
        .then((paths) => paths.find((path) => path.toLocaleLowerCase('en-US') === 'readme.md'))
        .catch(() => undefined);
      signal?.throwIfAborted();
      const result = await client.snapshotSource({
        source: { path: entryPath },
        additionalPaths: [
          { path: 'tau.json', required: true },
          { path: 'package.json', required: false },
          ...(readmePath ? [{ path: readmePath, required: false }] : []),
          ...(thumbnail ? [{ path: thumbnail, required: false }] : []),
        ],
        signal,
      });
      if (!result.success) {
        throw new Error(result.issues[0]?.message ?? 'The project source snapshot could not be collected.');
      }
      const role = (value: (typeof result.data.files)[number]['role']): ShareSnapshotFileRole =>
        value === 'additional' ? 'project-metadata' : value;
      const manifestContent = serializeProjectManifest(projectToManifest(project));
      const parameterEntry = parameterEntries.get(entryPath);
      const parameterContent = parameterEntry ? encodeTextFile(serializeParameterEntry(parameterEntry)) : undefined;
      const files = result.data.files
        .filter(
          ({ path }) =>
            path !== 'tau.json' && path !== '.tau' && !path.startsWith('.tau/') && !path.startsWith('node_modules/'),
        )
        .map((file) => ({ ...file, role: role(file.role) }));
      files.push({
        path: 'tau.json',
        content: manifestContent,
        sha256: await hashBytes(manifestContent),
        role: 'project-metadata',
      });
      if (parameterContent) {
        files.push({
          path: parameterEntryPath(entryPath),
          content: parameterContent,
          sha256: await hashBytes(parameterContent),
          role: 'project-metadata',
        });
      }
      return {
        entryPath: result.data.entryPath,
        files,
        warnings: result.data.unresolvedPaths.map((path) => ({
          code: 'UNRESOLVED_DEPENDENCY',
          message: `The runtime could not resolve ${path}.`,
        })),
      };
    },
    [fileClient, parameterEntries, project, projectId, projectRef],
  );

  const entryPath = project?.assets.main.entryPath ?? '';
  const parameters = useMemo(
    () => getActiveGroupValues(parameterEntries.get(entryPath)),
    [entryPath, parameterEntries],
  );

  return (
    <ProjectSharePanel
      key={projectId}
      projectId={projectId}
      projectName={project?.name ?? 'Untitled'}
      projectDescription={project?.description ?? ''}
      projectUpdatedAt={projectUpdatedAt}
      entryPath={entryPath}
      parameters={parameters}
      collectSnapshot={collectSnapshot}
      initialMethod={navigationIntent.initialMethod}
      githubAuthorizationOutcome={navigationIntent.githubAuthorizationOutcome}
    />
  );
}

export function ProjectShareAction(): React.JSX.Element {
  const { openPanel } = useProjectWorkspace();

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          variant='ghost'
          size='xs'
          className='max-md:size-8'
          onClick={() => {
            openPanel('share');
          }}
        >
          <Share2 className='size-3.5' aria-hidden />
          <span className='sr-only @xl/viewer:hidden'>Share</span>
          <span className='hidden @xl/viewer:inline'>Share</span>
        </Button>
      </TooltipTrigger>
      <TooltipContent>Share project</TooltipContent>
    </Tooltip>
  );
}
