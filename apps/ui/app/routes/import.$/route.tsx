import { useLoaderData, useLocation, useNavigate } from 'react-router';
import type { MetaDescriptor } from 'react-router';
import { useEffect, useRef, useState, useCallback, useMemo } from 'react';
import { useActorRef, useSelector } from '@xstate/react';
import { AlertCircle, X, XCircle } from 'lucide-react';
import { fromSafeAsync } from '#lib/xstate.lib.js';
// oxlint-disable-next-line import/extensions -- React Router generates this virtual route-type module.
import type { Route } from './+types/route.js';
import type { Handle } from '#types/matches.types.js';
import { importGitHubMachine } from '#machines/import-github.machine.js';
import { importDiskMachine } from '#machines/import-disk.machine.js';
import { Loader } from '#components/ui/loader.js';
import { Progress } from '@taucad/ui/components/progress';
import { Button } from '@taucad/ui/components/button';
import { Input } from '@taucad/ui/components/input';
import { SvgIcon } from '#components/icons/svg-icon.js';
import { formatFileSize } from '#components/geometry/converter/converter-utils.js';
import { useProjectManager } from '#hooks/use-project-manager.js';
import { useProjectCreationLocationError } from '#hooks/use-project-creation-location-error.js';
import { RepositoryCard } from '#routes/import.$/repository-card.js';
import { BranchSelector } from '#routes/import.$/branch-selector.js';
import { FileSelector, createStaticDataSource } from '#components/files/file-selector.js';
import { SuggestedClones } from '#routes/import.$/suggested-clones.js';
import { UploadCard } from '#routes/import.$/upload-card.js';
import {
  describeGitHubImport,
  resolveGitHubImportTarget,
  supportedKernelExtensions,
  findMainFile,
} from '#routes/import.$/import.utils.js';
import type { GitHubRepoInfo } from '#routes/import.$/import.utils.js';
import { ImportErrorView } from '#routes/import.$/import-error-view.js';
import { ImportProcessingView } from '#routes/import.$/import-processing-view.js';
import { ImportMainFileView } from '#routes/import.$/import-main-file-view.js';
import { inspect } from '#machines/inspector.js';
import { CopyButton } from '#components/copy-button.js';
import { createImportedProjectFiles } from '#utils/file-reader.utils.js';
import { projectUrl } from '#utils/project-url.utils.js';
import { useProjectSlugs } from '#hooks/use-project-slug-route.js';
import { useSearchParameter } from '#hooks/use-search-parameter.js';
import { flagParameter } from '#utils/search-parameter.codecs.js';
import { desktopBridge } from '#filesystem/desktop-bridge.js';
import { parseProjectManifestBytes, projectToManifest, serializeProjectManifest } from '@taucad/types';
import { largeObjectThresholdBytes } from '@taucad/revisions';
import { idPrefix } from '@taucad/types/constants';
import { generatePrefixedId } from '@taucad/utils/id';
import { GithubRepositoryPicker } from '#components/github/github-repository-picker.js';
import type { GithubRepositorySelection } from '#components/github/github-repository-picker.js';
import { prepareLinkedGithubImport } from '#lib/github-linked-import.js';
import { githubProjectBinding } from '#lib/github-project-binding.js';
import { shareOrigin } from '#lib/share-origin.js';

export const handle: Handle = {
  enableOverflowY: true,
};

const readSplatPath = (params: Record<string, string | undefined>): string => params['*'] ?? '';

/** Compare import URLs across the protocol spellings `/import/*` accepts. */
const normalizeImportUrl = (url: string): string =>
  url
    .replace('/import/https%3A%2F%2Fgithub.com/', '/import/github.com/')
    .replace('/import/https%3A//github.com/', '/import/github.com/')
    .replace('/import/https://github.com/', '/import/github.com/')
    .replace('/import/https:/github.com/', '/import/github.com/');

const linkedSetupBranch = (repositoryName: string): string => {
  const slug = repositoryName
    .normalize('NFKC')
    .replaceAll(/[^\p{L}\p{N}._-]+/gu, '-')
    .replaceAll(/^[.-]+|[.-]+$/gu, '')
    .slice(0, 220);
  return `tau/${slug || 'project'}`;
};

/**
 * Derived from the URL, never from loader data: a `clientLoader` route has no
 * data during the server render, so reading `loaderData` here would cost the
 * per-repository title on exactly the cold external-link arrival that needs it.
 *
 * @param args - React Router meta arguments.
 * @returns The document meta descriptors.
 */
export function meta({ params, location }: Route.MetaArgs): MetaDescriptor[] {
  const target = resolveGitHubImportTarget(readSplatPath(params), location.search);
  if (!target?.owner) {
    return [{ title: 'Import from GitHub into Tau' }];
  }

  const { title, description } = describeGitHubImport(target);
  return [{ title, description }];
}

/**
 * Splat route loader for /import/*
 *
 * Handles path-based GitHub URLs like:
 * - /import/https://github.com/owner/repo
 * - /import/https://github.com/owner/repo?ref=main&main=file.scad
 *
 * A `clientLoader`, not a `loader`: this is pure URL parsing with no I/O, and
 * React Router SPA mode (`ui:build:desktop`) bans server `loader` exports.
 */
// oxlint-disable-next-line @typescript-eslint/explicit-module-boundary-types -- inferred type
export function clientLoader({ request, params }: Route.ClientLoaderArgs) {
  const target = resolveGitHubImportTarget(readSplatPath(params), new URL(request.url).search);
  if (!target) {
    throw new Error('Invalid GitHub URL. Only github.com repositories are supported.');
  }

  return target satisfies GitHubRepoInfo;
}

type ImportMode = 'github' | 'disk';

// oxlint-disable-next-line complexity -- TODO: consider refactoring.
export default function ImportRoute(): React.JSX.Element {
  const { owner, repo, ref, mainFile } = useLoaderData<typeof clientLoader>();
  const navigate = useNavigate();
  const projectManager = useProjectManager();
  const presentLocationError = useProjectCreationLocationError();
  const [linkedSelection, setLinkedSelection] = useState<GithubRepositorySelection>();
  const [linkedMainFile, setLinkedMainFile] = useState('');
  const [linkedTargetBranch, setLinkedTargetBranch] = useState('');
  const [linkedBusy, setLinkedBusy] = useState(false);
  const [linkedError, setLinkedError] = useState<string>();
  const [linkedReviewBlocked, setLinkedReviewBlocked] = useState(false);
  const [linkedSyncChats, setLinkedSyncChats] = useState(true);

  // Track active import mode
  const [activeMode, setActiveMode] = useState<ImportMode | undefined>(undefined);

  // Create GitHub import machine actor
  const gitHubActorRef = useActorRef(
    importGitHubMachine.provide({
      actors: {
        createProjectActor: fromSafeAsync(async ({ input }) => {
          const projectFiles = createImportedProjectFiles(input.files, input.mainFile);

          try {
            const project = await projectManager.createProject({
              project: {
                name: `${input.owner}/${input.repo}`,
                description: `Imported from GitHub: https://github.com/${input.owner}/${input.repo}`,
                tags: [],
                assets: {
                  main: {
                    entryPath: input.mainFile,
                  },
                },
              },
              files: projectFiles,
            });

            return { type: 'projectCreated', projectId: project.id };
          } catch (error) {
            presentLocationError(error);
            throw error;
          }
        }),
      },
    }),
    {
      input: {
        owner,
        repo,
        ref,
        mainFile,
      },
      inspect,
    },
  );

  // Create Disk import machine actor
  const diskActorRef = useActorRef(
    importDiskMachine.provide({
      actors: {
        createProjectActor: fromSafeAsync(async ({ input }) => {
          const projectFiles = createImportedProjectFiles(input.files, input.mainFile);

          try {
            const project = await projectManager.createProject({
              project: {
                name: input.importName,
                description: `Imported from disk`,
                tags: [],
                assets: {
                  main: {
                    entryPath: input.mainFile,
                  },
                },
              },
              files: projectFiles,
            });

            return { type: 'projectCreated', projectId: project.id };
          } catch (error) {
            presentLocationError(error);
            throw error;
          }
        }),
      },
    }),
    {
      input: {},
      inspect,
    },
  );

  // GitHub machine selectors
  const gitHubState = useSelector(gitHubActorRef, (snapshot) => snapshot);
  const downloadProgress = useSelector(
    gitHubActorRef,
    (snapshot) => snapshot.context.downloadProgress as { loaded: number; total: number },
  );
  const gitHubExtractProgress = useSelector(
    gitHubActorRef,
    (snapshot) => snapshot.context.extractProgress as { processed: number; total: number },
  );
  const gitHubError = useSelector(gitHubActorRef, (snapshot) => snapshot.context.error);
  const gitHubProjectId = useSelector(gitHubActorRef, (snapshot) => snapshot.context.projectId);
  const gitHubFiles = useSelector(gitHubActorRef, (snapshot) => snapshot.context.files);
  const gitHubSelectedMainFile = useSelector(gitHubActorRef, (snapshot) => snapshot.context.selectedMainFile);
  const requestedMainFile = useSelector(gitHubActorRef, (snapshot) => snapshot.context.requestedMainFile);
  const repoUrl = useSelector(gitHubActorRef, (snapshot) => snapshot.context.repoUrl);
  const repoOwner = useSelector(gitHubActorRef, (snapshot) => snapshot.context.owner);
  const repoName = useSelector(gitHubActorRef, (snapshot) => snapshot.context.repo);
  const repoMetadata = useSelector(gitHubActorRef, (snapshot) => snapshot.context.repoMetadata);
  const branches = useSelector(gitHubActorRef, (snapshot) => snapshot.context.branches);
  const selectedBranch = useSelector(gitHubActorRef, (snapshot) => snapshot.context.selectedBranch);
  const repoFiles = useSelector(gitHubActorRef, (snapshot) => snapshot.context.repoFiles);
  const repoFilesDataSource = useMemo(() => createStaticDataSource(repoFiles), [repoFiles]);
  const linkedFilesDataSource = useMemo(
    () =>
      createStaticDataSource(
        linkedSelection?.files
          .filter(({ path }) => supportedKernelExtensions.some((extension) => path.endsWith(extension)))
          .map(({ path, size }) => ({ path, size })) ?? [],
      ),
    [linkedSelection],
  );
  const linkedMainFileSupported = supportedKernelExtensions.some((extension) => linkedMainFile.endsWith(extension));
  const linkedManifest = useMemo(
    () => (linkedSelection?.manifest === undefined ? undefined : parseProjectManifestBytes(linkedSelection.manifest)),
    [linkedSelection],
  );
  const linkedNeedsSetup =
    linkedSelection !== undefined &&
    (linkedSelection.branch.head === undefined ||
      linkedManifest?.success !== true ||
      linkedManifest.data.assets.main.entryPath !== linkedMainFile ||
      (linkedManifest.data.syncChats !== false) !== linkedSyncChats);
  const isLoadingFiles = useSelector(gitHubActorRef, (snapshot) => snapshot.context.isLoadingFiles);
  const fetchErrors = useSelector(gitHubActorRef, (snapshot) => snapshot.context.fetchErrors);
  const hasMoreBranches = useSelector(gitHubActorRef, (snapshot) => snapshot.context.hasMoreBranches);
  const isLoadingMoreBranches = useSelector(gitHubActorRef, (snapshot) => snapshot.context.isLoadingMoreBranches);

  // Disk machine selectors
  const diskState = useSelector(diskActorRef, (snapshot) => snapshot);
  const diskFiles = useSelector(diskActorRef, (snapshot) => snapshot.context.files);
  const diskImportName = useSelector(diskActorRef, (snapshot) => snapshot.context.importName);
  const diskSelectedMainFile = useSelector(diskActorRef, (snapshot) => snapshot.context.selectedMainFile);
  const diskProgress = useSelector(diskActorRef, (snapshot) => snapshot.context.progress);
  const diskError = useSelector(diskActorRef, (snapshot) => snapshot.context.error);
  const diskProjectId = useSelector(diskActorRef, (snapshot) => snapshot.context.projectId);

  // Track if this is the initial mount to avoid syncing on first render
  const isInitialMount = useRef(true);
  const location = useLocation();
  const [isDesktopOpen, clearDesktopOpen] = useSearchParameter('desktop-open', flagParameter);
  const currentUrl = `${location.pathname}${location.search}`;
  /* The machine owns the import URL, so its own writes must not bounce back in
   * through `syncLocation`: that would flip `urlFromNavigation` and swallow the
   * history push the machine raises once a repository resolves. */
  const machineUrl = useRef<string | undefined>(undefined);

  useEffect(() => {
    if (!isDesktopOpen) {
      return;
    }
    let active = true;
    const consumeDesktopFiles = async (): Promise<void> => {
      try {
        const bridge = desktopBridge();
        if (bridge === undefined) {
          return;
        }
        const opened = await bridge.openFiles.consume();
        if (!active || opened.length === 0) {
          return;
        }
        setActiveMode('disk');
        diskActorRef.send({
          type: 'processFiles',
          files: opened.map((file) => new File([file.bytes], file.name)),
        });
        clearDesktopOpen(false);
      } catch (error) {
        if (active) {
          diskActorRef.send({
            type: 'externalError',
            error: error instanceof Error ? error : new Error(String(error)),
          });
        }
      }
    };
    // async-iife: bootstrap -- the desktop handoff is scoped to this route lifetime.
    void consumeDesktopFiles();
    return () => {
      active = false;
    };
  }, [clearDesktopOpen, diskActorRef, isDesktopOpen]);

  // Sync location changes to machine (for back/forward navigation)
  // This is the single source of truth for URL → Machine state
  useEffect(() => {
    if (machineUrl.current !== undefined && normalizeImportUrl(machineUrl.current) === normalizeImportUrl(currentUrl)) {
      // One-shot: a later visit to the same URL is real navigation to sync.
      machineUrl.current = undefined;
      isInitialMount.current = false;
      return;
    }
    // Skip on initial mount - let the loader data initialize the machine
    if (isInitialMount.current) {
      isInitialMount.current = false;
      // But still send initial location to ensure machine has correct state
      gitHubActorRef.send({
        type: 'syncLocation',
        owner,
        repo,
        ref,
        mainFile,
      });
      return;
    }

    // Send location changes to machine
    gitHubActorRef.send({
      type: 'syncLocation',
      owner,
      repo,
      ref,
      mainFile,
    });
  }, [owner, repo, ref, mainFile, gitHubActorRef, currentUrl]);

  /* Through the router, never `history.*` (D3): a raw history write left React
   * Router's location stale, so nothing downstream of `useLocation` saw the
   * repository the machine had just resolved. */
  useEffect(() => {
    const send = (url: string, replace: boolean): void => {
      if (normalizeImportUrl(currentUrl) === normalizeImportUrl(url)) {
        return;
      }
      machineUrl.current = url;
      void navigate(url, { replace, preventScrollReset: true });
    };
    const replaced = gitHubActorRef.on('urlReplaced', (event) => {
      send(event.url, true);
    });
    const pushed = gitHubActorRef.on('urlPushed', (event) => {
      send(event.url, false);
    });

    return () => {
      replaced.unsubscribe();
      pushed.unsubscribe();
    };
  }, [currentUrl, gitHubActorRef, navigate]);

  // Navigate when GitHub project is created. The import machines carry only the
  // `proj_` id, so the canonical URL comes from the listing once discovery has
  // published the new directory (L1) — there is no id-addressed URL to ride.
  const gitHubSlugs = useProjectSlugs(gitHubProjectId);
  useEffect(() => {
    if (gitHubState.matches('success') && gitHubSlugs.status === 'resolved') {
      void navigate(projectUrl(gitHubSlugs.value));
    }
  }, [gitHubState, gitHubSlugs, navigate]);

  // Navigate when Disk project is created
  const diskSlugs = useProjectSlugs(diskProjectId);
  useEffect(() => {
    if (diskState.matches('success') && diskSlugs.status === 'resolved') {
      void navigate(projectUrl(diskSlugs.value));
    }
  }, [diskState, diskSlugs, navigate]);

  // Disk import handlers
  const handleFilesSelected = useCallback(
    (files: FileList | File[]) => {
      setActiveMode('disk');
      diskActorRef.send({ type: 'processFiles', files });
    },
    [diskActorRef],
  );

  const handleFolderSelected = useCallback(
    (files: FileList) => {
      setActiveMode('disk');
      diskActorRef.send({ type: 'processFiles', files });
    },
    [diskActorRef],
  );

  const handleZipSelected = useCallback(
    (file: File) => {
      setActiveMode('disk');
      diskActorRef.send({ type: 'processZip', file });
    },
    [diskActorRef],
  );

  const handleDataTransfer = useCallback(
    (items: DataTransferItemList) => {
      setActiveMode('disk');
      diskActorRef.send({ type: 'processDataTransfer', items });
    },
    [diskActorRef],
  );

  const handleDirectoryHandleSelected = useCallback(
    (handle: FileSystemDirectoryHandle) => {
      setActiveMode('disk');
      diskActorRef.send({ type: 'processDirectoryHandle', handle });
    },
    [diskActorRef],
  );

  const reviewLinkedRepository = useCallback((selection: GithubRepositorySelection): void => {
    const manifest = selection.manifest === undefined ? undefined : parseProjectManifestBytes(selection.manifest);
    const paths = selection.files.map((file) => file.path);
    const supportedPaths = paths.filter((path) =>
      supportedKernelExtensions.some((extension) => path.endsWith(extension)),
    );
    const manifestMain = manifest?.success === true ? manifest.data.assets.main.entryPath : undefined;
    const unsupportedLargeBlob = selection.files.find((file) => file.size >= largeObjectThresholdBytes);
    setLinkedSelection(selection);
    setLinkedMainFile(
      manifestMain !== undefined && supportedPaths.includes(manifestMain)
        ? manifestMain
        : (findMainFile(supportedPaths) ?? (paths.length === 0 ? 'main.scad' : '')),
    );
    setLinkedTargetBranch(
      manifest?.success === true ? selection.branch.name : linkedSetupBranch(selection.repository.name),
    );
    setLinkedSyncChats(manifest?.success === true ? manifest.data.syncChats !== false : true);
    setLinkedReviewBlocked(manifest?.success === false || unsupportedLargeBlob !== undefined);
    setLinkedError(
      manifest?.success === false
        ? 'This repository has an invalid tau.json. Fix or remove it before importing as a linked project.'
        : unsupportedLargeBlob === undefined
          ? undefined
          : `${unsupportedLargeBlob.path} is a large ordinary Git blob. Track it with Git LFS in GitHub before importing so Tau can preserve repository identity.`,
    );
  }, []);

  const importLinkedRepository = useCallback(async (): Promise<void> => {
    if (linkedSelection === undefined || linkedMainFile === '' || linkedTargetBranch === '') {
      return;
    }
    setLinkedBusy(true);
    setLinkedError(undefined);
    try {
      const parsed =
        linkedSelection.manifest === undefined ? undefined : parseProjectManifestBytes(linkedSelection.manifest);
      const imported = parsed?.success === true ? parsed.data : undefined;
      const projectId = imported?.id ?? generatePrefixedId(idPrefix.project);
      const projectData =
        imported === undefined
          ? {
              name: linkedSelection.repository.fullName,
              description:
                linkedSelection.repository.description ?? `Imported from ${linkedSelection.repository.htmlUrl}`,
              tags: [],
              assets: { main: { entryPath: linkedMainFile } },
              ...(linkedSyncChats ? {} : { syncChats: false }),
            }
          : {
              name: imported.name,
              description: imported.description,
              tags: imported.tags,
              assets: { ...imported.assets, main: { ...imported.assets.main, entryPath: linkedMainFile } },
              ...(linkedSyncChats ? {} : { syncChats: false }),
              ...(imported.syncLargeExports === undefined ? {} : { syncLargeExports: imported.syncLargeExports }),
            };
      const preserveManifest =
        parsed?.success === true &&
        parsed.data.assets.main.entryPath === linkedMainFile &&
        (parsed.data.syncChats !== false) === linkedSyncChats;
      const prepared = await prepareLinkedGithubImport({
        selection: linkedSelection,
        targetBranch: linkedTargetBranch,
        manifest:
          preserveManifest && linkedSelection.manifest !== undefined
            ? linkedSelection.manifest
            : serializeProjectManifest(projectToManifest({ ...projectData, id: projectId })),
        mainFile: linkedMainFile,
      });
      const created = await projectManager.createProject({
        id: projectId,
        project: projectData,
        files: prepared.files,
        chat: false,
      });
      githubProjectBinding.set(created.id, {
        connectionId: linkedSelection.connection.id,
        repositoryId: linkedSelection.repository.id,
        repositoryUrl: linkedSelection.repository.cloneUrl,
        generation: prepared.generation,
      });
      void navigate(projectUrl(created.slugs));
    } catch (error) {
      presentLocationError(error);
      setLinkedError(error instanceof Error ? error.message : 'The linked project could not be imported.');
    } finally {
      setLinkedBusy(false);
    }
  }, [
    linkedMainFile,
    linkedSelection,
    linkedSyncChats,
    linkedTargetBranch,
    navigate,
    presentLocationError,
    projectManager,
  ]);

  // Determine if disk import is active
  const isDiskActive =
    activeMode === 'disk' ||
    diskState.matches('reading') ||
    diskState.matches('readingDataTransfer') ||
    diskState.matches('readingDirectoryHandle') ||
    diskState.matches('extracting') ||
    diskState.matches('selectingMainFile') ||
    diskState.matches('creating');

  // Show disk import selecting main file view
  if (isDiskActive && diskState.matches('selectingMainFile')) {
    return (
      <ImportMainFileView
        title='Review Import'
        subtitle={diskImportName}
        files={diskFiles}
        selectedMainFile={diskSelectedMainFile}
        variant='disk'
        repo={diskImportName}
        onSelectMainFile={(file) => {
          diskActorRef.send({ type: 'selectMainFile', file });
        }}
        onConfirm={() => {
          diskActorRef.send({ type: 'confirmImport' });
        }}
        onCancel={() => {
          diskActorRef.send({ type: 'reset' });
          setActiveMode(undefined);
        }}
      />
    );
  }

  // Show disk import processing/extracting view
  if (
    isDiskActive &&
    (diskState.matches('reading') ||
      diskState.matches('readingDataTransfer') ||
      diskState.matches('readingDirectoryHandle') ||
      diskState.matches('extracting') ||
      diskState.matches('creating'))
  ) {
    const isReading =
      diskState.matches('reading') ||
      diskState.matches('readingDataTransfer') ||
      diskState.matches('readingDirectoryHandle');
    const isExtracting = diskState.matches('extracting');
    const isCreating = diskState.matches('creating');

    const title = isReading ? 'Reading Files' : isExtracting ? 'Extracting ZIP' : 'Creating Project';
    const statusText = isReading ? 'Reading files...' : isExtracting ? 'Extracting files...' : 'Creating project...';

    return (
      <ImportProcessingView
        title={title}
        statusText={statusText}
        progress={diskProgress}
        variant='disk'
        onCancel={
          isCreating
            ? undefined
            : () => {
                diskActorRef.send({ type: 'reset' });
                setActiveMode(undefined);
              }
        }
      />
    );
  }

  // Show disk import error view
  if (isDiskActive && diskState.matches('error')) {
    return (
      <ImportErrorView
        error={diskError}
        onRetry={() => {
          diskActorRef.send({ type: 'retry' });
          setActiveMode(undefined);
        }}
      />
    );
  }

  // GitHub import flow (existing logic)
  switch (true) {
    case gitHubState.matches('enteringDetails') ||
      gitHubState.matches('checkingRepo') ||
      gitHubState.matches('fetchingRepoInfo') ||
      gitHubState.matches('loadingMoreBranches') ||
      gitHubState.matches('fetchingFiles'): {
      const isValidRepo = repoOwner.length > 0 && repoName.length > 0;
      const isCheckingOrFetching = gitHubState.matches('checkingRepo') || gitHubState.matches('fetchingRepoInfo');
      const isFetchingFiles = gitHubState.matches('fetchingFiles');

      return (
        <div className='flex min-h-full flex-col items-center justify-start px-4 pt-6 pb-16 md:justify-center md:pt-8'>
          <div className='w-full max-w-4xl space-y-6'>
            <div className='flex flex-col items-center gap-4'>
              <div className='text-center'>
                <h1 className='text-2xl font-semibold'>Import Project</h1>
                <p className='text-sm text-muted-foreground'>Import from GitHub or upload from your computer</p>
              </div>
            </div>

            {/* Side-by-side cards when no valid repo */}
            {isValidRepo ? (
              <div className='space-y-4'>
                {/* Repository URL Input */}
                <div className='space-y-2 rounded-lg border bg-sidebar p-6'>
                  <label htmlFor='repo-url' className='text-sm font-medium'>
                    Repository URL
                  </label>
                  <div className='group relative'>
                    <Input
                      id='repo-url'
                      type='url'
                      placeholder='https://github.com/owner/repo'
                      value={repoUrl}
                      className='pr-8 font-mono text-sm'
                      onChange={(event) => {
                        gitHubActorRef.send({ type: 'updateRepoUrl', url: event.target.value });
                      }}
                    />
                    {repoUrl.length > 0 ? (
                      <Button
                        variant='secondary'
                        size='icon'
                        className='absolute top-1/2 right-1.5 size-5 -translate-y-1/2 bg-neutral/10 p-0 text-muted-foreground hover:text-foreground'
                        type='button'
                        aria-label='Clear URL'
                        onClick={() => {
                          gitHubActorRef.send({ type: 'updateRepoUrl', url: '' });
                        }}
                      >
                        <X className='size-3.5' />
                      </Button>
                    ) : undefined}
                  </div>
                </div>

                <RepositoryCard
                  metadata={repoMetadata}
                  owner={repoOwner}
                  repo={repoName}
                  isLoading={isCheckingOrFetching}
                />

                {/* Validation Feedback */}
                {!isCheckingOrFetching && !repoMetadata ? (
                  <div className='flex items-start gap-3 rounded-lg border border-warning/50 bg-warning/10 p-4 text-warning'>
                    <AlertCircle className='size-5 shrink-0' />
                    <div className='flex flex-col gap-1'>
                      <div className='font-semibold'>Repository Not Found</div>
                      <div className='text-sm'>
                        The repository may not exist, be private, or you may not have access to it. Please check the URL
                        and try again.
                      </div>
                    </div>
                  </div>
                ) : undefined}

                {!isCheckingOrFetching && repoMetadata?.isPrivate ? (
                  <div className='border-info/50 bg-info/10 text-info flex items-start gap-3 rounded-lg border p-4'>
                    <AlertCircle className='size-5 shrink-0' />
                    <div className='flex flex-col gap-1'>
                      <div className='font-semibold'>Private Repository</div>
                      <div className='text-sm'>
                        This is a private repository. Make sure you have access permissions to import it.
                      </div>
                    </div>
                  </div>
                ) : undefined}

                {/* Branch & Main File Selectors - Show grid when we have data or errors */}
                {repoMetadata &&
                !isCheckingOrFetching &&
                (branches.length > 0 ||
                  repoFiles.length > 0 ||
                  isLoadingFiles ||
                  fetchErrors.branches !== undefined ||
                  fetchErrors.files !== undefined) ? (
                  <div className='grid grid-cols-1 gap-4 md:grid-cols-2'>
                    {/* Branch Selector or Error */}
                    {branches.length > 0 ? (
                      <div className='space-y-2 rounded-lg border bg-sidebar p-6'>
                        <label className='text-sm font-medium'>Branch</label>
                        <BranchSelector
                          branches={branches}
                          selectedBranch={selectedBranch}
                          isLoadingMore={isLoadingMoreBranches}
                          onSelect={(branch) => {
                            gitHubActorRef.send({ type: 'selectBranch', branch });
                          }}
                          onLoadMore={
                            hasMoreBranches
                              ? () => {
                                  gitHubActorRef.send({ type: 'loadMoreBranches' });
                                }
                              : undefined
                          }
                        />
                      </div>
                    ) : fetchErrors.branches ? (
                      <div className='flex items-start gap-3 rounded-lg border border-warning/50 bg-warning/10 p-4 text-warning'>
                        <AlertCircle className='size-5 shrink-0' />
                        <div className='flex flex-col gap-1'>
                          <div className='text-sm font-medium'>Could not fetch branches</div>
                          <div className='text-xs opacity-80'>
                            Import will use the <span className='font-semibold'>{selectedBranch}</span> branch.
                          </div>
                        </div>
                      </div>
                    ) : undefined}

                    {/* Main File Selector or Error */}
                    {repoFiles.length > 0 || isLoadingFiles ? (
                      <div className='space-y-2 rounded-lg border bg-sidebar p-6'>
                        <label className='text-sm font-medium'>Main File</label>
                        <FileSelector
                          dataSource={repoFilesDataSource}
                          selectedFile={gitHubSelectedMainFile}
                          isLoading={isLoadingFiles}
                          popoverProperties={{
                            side: 'top',
                          }}
                          onSelect={(file) => {
                            gitHubActorRef.send({ type: 'selectMainFile', file });
                          }}
                        />
                      </div>
                    ) : fetchErrors.files ? (
                      <div className='flex items-start gap-3 rounded-lg border border-warning/50 bg-warning/10 p-4 text-warning'>
                        <AlertCircle className='size-5 shrink-0' />
                        <div className='flex flex-col gap-1'>
                          <div className='text-sm font-medium'>Could not list files</div>
                          <div className='text-xs opacity-80'>You can still proceed with the import.</div>
                        </div>
                      </div>
                    ) : undefined}
                  </div>
                ) : undefined}

                {/* Start Import Button and Short Link */}
                <div className='flex gap-2'>
                  <Button
                    className='flex-1'
                    size='lg'
                    disabled={isCheckingOrFetching || isFetchingFiles || !repoMetadata}
                    onClick={() => {
                      setActiveMode('github');
                      gitHubActorRef.send({ type: 'startImport' });
                    }}
                  >
                    Start Import
                  </Button>
                  <CopyButton
                    size='icon'
                    className='size-11'
                    variant='outline'
                    tooltip='Copy short link'
                    readyToCopyText=''
                    copiedText=''
                    getText={() => {
                      // Build short URL with /i instead of /import
                      // Use repoUrl from machine context (not browser URL) to avoid https:/ normalization
                      const parameters = new URLSearchParams();

                      if (selectedBranch && selectedBranch !== 'main') {
                        parameters.set('ref', selectedBranch);
                      }

                      const queryString = parameters.size > 0 ? `?${parameters.toString()}` : '';

                      /* Not `location.origin`: on desktop that is `app://tau`,
                         which nobody can open and which does not even route
                         `/i/*` (desktop-share-links blueprint, L3). */
                      return `${shareOrigin()}/i/${repoUrl}${queryString}`;
                    }}
                  />
                </div>
              </div>
            ) : (
              <>
                <div className='grid grid-cols-1 gap-4 md:grid-cols-2'>
                  {/* GitHub Import Card */}
                  <div className='space-y-2 rounded-lg border bg-sidebar p-6'>
                    <div className='mb-4 flex items-center gap-3'>
                      <div className='flex size-10 items-center justify-center rounded-full bg-linear-to-br from-primary/20 to-primary/10'>
                        <SvgIcon id='github' className='size-5 text-primary' />
                      </div>
                      <div>
                        <h2 className='font-medium'>Import from GitHub</h2>
                        <p className='text-xs text-muted-foreground'>Enter a repository URL</p>
                      </div>
                    </div>

                    <GithubRepositoryPicker actionLabel='Review import' onSelect={reviewLinkedRepository} />

                    <div className='flex items-center gap-3 py-2 text-xs text-muted-foreground' aria-hidden>
                      <span className='h-px flex-1 bg-border' />
                      <span>or import a public copy — no Git history or sync</span>
                      <span className='h-px flex-1 bg-border' />
                    </div>

                    <div className='group relative'>
                      <label htmlFor='repo-url' className='sr-only'>
                        Public GitHub repository URL
                      </label>
                      <Input
                        id='repo-url'
                        type='url'
                        placeholder='https://github.com/owner/repo'
                        value={repoUrl}
                        className='pr-8 font-mono text-sm'
                        onChange={(event) => {
                          setActiveMode('github');
                          gitHubActorRef.send({ type: 'updateRepoUrl', url: event.target.value });
                        }}
                      />
                      {repoUrl.length > 0 ? (
                        <Button
                          variant='secondary'
                          size='icon'
                          className='absolute top-1/2 right-1.5 size-5 -translate-y-1/2 bg-neutral/10 p-0 text-muted-foreground hover:text-foreground'
                          type='button'
                          aria-label='Clear URL'
                          onClick={() => {
                            gitHubActorRef.send({ type: 'updateRepoUrl', url: '' });
                          }}
                        >
                          <X className='size-3.5' />
                        </Button>
                      ) : undefined}
                    </div>
                  </div>

                  {/* Disk Upload Card */}
                  <UploadCard
                    onDataTransfer={handleDataTransfer}
                    onDirectoryHandleSelected={handleDirectoryHandleSelected}
                    onFilesSelected={handleFilesSelected}
                    onFolderSelected={handleFolderSelected}
                    onZipSelected={handleZipSelected}
                  />
                </div>

                {linkedSelection === undefined ? undefined : (
                  <section
                    aria-labelledby='linked-import-review'
                    className='space-y-4 rounded-lg border bg-sidebar p-6'
                  >
                    <div>
                      <h2 id='linked-import-review' className='font-medium'>
                        Review linked import
                      </h2>
                      <p className='text-sm text-muted-foreground'>
                        {linkedSelection.repository.fullName} at {linkedSelection.branch.name} ·{' '}
                        {linkedSelection.repository.access === 'write' ? 'future revisions can push' : 'read-only'}
                      </p>
                    </div>
                    <div className='grid grid-cols-1 gap-4 md:grid-cols-2'>
                      <div className='space-y-2'>
                        <label className='text-sm font-medium'>Main file</label>
                        {linkedSelection.files.length === 0 ? (
                          <Input
                            aria-label='New main file'
                            value={linkedMainFile}
                            onChange={(event) => {
                              setLinkedMainFile(event.target.value);
                            }}
                          />
                        ) : (
                          <FileSelector
                            dataSource={linkedFilesDataSource}
                            selectedFile={linkedMainFile}
                            onSelect={setLinkedMainFile}
                          />
                        )}
                      </div>
                      <div className='space-y-2'>
                        <label htmlFor='linked-target-branch' className='text-sm font-medium'>
                          Local and sync branch
                        </label>
                        <Input
                          id='linked-target-branch'
                          value={linkedTargetBranch}
                          onChange={(event) => {
                            setLinkedTargetBranch(event.target.value);
                          }}
                        />
                      </div>
                    </div>
                    <p className='text-xs text-muted-foreground'>
                      Tau will preserve the selected branch’s commits, tracked files, executable modes, and Git remote.
                      {linkedSelection.repository.access === 'write'
                        ? ' Future revisions sync automatically.'
                        : ' This repository is linked read-only; local revisions remain available.'}
                    </p>
                    <div className='rounded-md border p-3 text-xs text-muted-foreground'>
                      <p>
                        {linkedNeedsSetup ? (
                          <>
                            Setup change: add or update <span className='font-mono'>tau.json</span>
                            {linkedSelection.files.length === 0 ? ` and create ${linkedMainFile}` : ''}.
                          </>
                        ) : (
                          'Setup change: none; the local branch will point at the selected GitHub commit.'
                        )}
                      </p>
                      <p>Commit author: {linkedSelection.connection.login} using GitHub’s no-reply address.</p>
                      <p>Repository visibility: {linkedSelection.repository.visibility}.</p>
                    </div>
                    <label className='flex items-center gap-2 text-sm'>
                      <input
                        type='checkbox'
                        checked={linkedSyncChats}
                        onChange={(event) => {
                          setLinkedSyncChats(event.target.checked);
                        }}
                      />
                      Sync project chats with this repository
                    </label>
                    {linkedMainFileSupported ? undefined : (
                      <p role='alert' className='text-sm text-destructive'>
                        Choose a supported CAD source file as the project’s main file.
                      </p>
                    )}
                    {linkedError === undefined ? undefined : (
                      <p role='alert' className='text-sm text-destructive'>
                        {linkedError}
                      </p>
                    )}
                    <div className='flex gap-2'>
                      <Button
                        disabled={
                          linkedBusy ||
                          linkedReviewBlocked ||
                          !linkedMainFileSupported ||
                          linkedMainFile === '' ||
                          linkedTargetBranch === ''
                        }
                        onClick={importLinkedRepository}
                      >
                        {linkedBusy ? 'Importing and linking…' : 'Import and link'}
                      </Button>
                      <Button
                        variant='ghost'
                        disabled={linkedBusy}
                        onClick={() => {
                          setLinkedSelection(undefined);
                        }}
                      >
                        Cancel
                      </Button>
                    </div>
                  </section>
                )}

                <SuggestedClones
                  onSelect={(repository) => {
                    setActiveMode('github');
                    // Use github.com without protocol to avoid browser normalizing // to /
                    const repoUrlValue = `github.com/${repository.owner}/${repository.repo}`;
                    const parameters = new URLSearchParams();

                    if (repository.ref !== 'main') {
                      parameters.set('ref', repository.ref);
                    }

                    if (repository.mainFile) {
                      parameters.set('main', repository.mainFile);
                    }

                    const queryString = parameters.size > 0 ? `?${parameters.toString()}` : '';
                    const targetUrl = `/import/${repoUrlValue}${queryString}`;

                    // Use React Router navigate for proper history management
                    void navigate(targetUrl);
                  }}
                />
              </>
            )}
          </div>
        </div>
      );
    }

    case gitHubState.matches('selectingMainFile'): {
      const fileNames = [...gitHubFiles.keys()];
      const requestedFileWarning =
        requestedMainFile.length > 0 && !fileNames.includes(requestedMainFile)
          ? `Requested file "${requestedMainFile}" not found. Please select a main file.`
          : undefined;

      return (
        <ImportMainFileView
          title='Review Import'
          subtitle={`${owner}/${repo}${ref === 'main' ? '' : ` @ ${ref}`}`}
          requestedMainFileWarning={requestedFileWarning}
          files={gitHubFiles}
          selectedMainFile={gitHubSelectedMainFile}
          variant='github'
          owner={owner}
          repo={repo}
          onSelectMainFile={(file) => {
            gitHubActorRef.send({ type: 'selectMainFile', file });
          }}
          onConfirm={() => {
            gitHubActorRef.send({ type: 'confirmImport' });
          }}
          onCancel={() => {
            gitHubActorRef.send({ type: 'cancelReview' });
            setActiveMode(undefined);
            void navigate('/import');
          }}
        />
      );
    }

    case gitHubState.matches('error'): {
      return (
        <ImportErrorView
          error={gitHubError}
          onRetry={() => {
            gitHubActorRef.send({ type: 'retry' });
          }}
        />
      );
    }

    default: {
      return (
        <div className='flex min-h-full flex-col items-center justify-start px-4 pt-6 pb-16 md:justify-center md:pt-8'>
          <div className='w-full max-w-2xl space-y-6'>
            <div className='flex flex-col items-center gap-4'>
              <div className='flex size-16 items-center justify-center rounded-full bg-linear-to-br from-primary/20 to-primary/10'>
                <SvgIcon id='github' className='size-8 text-primary' />
              </div>

              <div className='text-center'>
                <h1 className='text-2xl font-semibold'>Importing Repository</h1>
                <p className='text-sm text-muted-foreground'>
                  {repoOwner}/{repoName}
                  {selectedBranch && selectedBranch !== 'main' ? ` @ ${selectedBranch}` : ''}
                </p>
              </div>
            </div>

            {/* Repository Preview Card (read-only) */}
            {repoMetadata ? (
              <RepositoryCard metadata={repoMetadata} owner={repoOwner} repo={repoName} isLoading={false} />
            ) : undefined}

            <div className='space-y-4'>
              {/* Downloading */}
              <div className='space-y-2'>
                <div className='flex items-center justify-between text-sm'>
                  <span className='flex items-center gap-2 font-medium'>
                    {gitHubState.matches('downloading') ? (
                      <>
                        <Loader />
                        <span>Downloading...</span>
                      </>
                    ) : (
                      '✓ Downloaded'
                    )}
                  </span>
                  {downloadProgress.loaded > 0 ? (
                    <span className='text-muted-foreground'>
                      {downloadProgress.total > 0
                        ? `${formatFileSize(downloadProgress.loaded)} / ${formatFileSize(downloadProgress.total)}`
                        : formatFileSize(downloadProgress.loaded)}
                    </span>
                  ) : undefined}
                </div>
                <Progress
                  value={
                    downloadProgress.total > 0 && downloadProgress.loaded > 0
                      ? (downloadProgress.loaded / downloadProgress.total) * 100
                      : downloadProgress.loaded > 0
                        ? undefined
                        : 0
                  }
                  className='h-2'
                />
              </div>

              {/* Extracting */}
              {(gitHubState.matches('downloading') || gitHubState.matches('creating')) &&
              downloadProgress.loaded > 0 ? (
                <div className='space-y-2'>
                  <div className='flex items-center justify-between text-sm'>
                    <span className='flex items-center gap-2 font-medium'>
                      {gitHubState.matches('creating') ? (
                        '✓ Extracted'
                      ) : (
                        <>
                          <Loader />
                          <span>Extracting files...</span>
                        </>
                      )}
                    </span>
                    {gitHubExtractProgress.total > 0 ? (
                      <span className='text-muted-foreground'>
                        {gitHubExtractProgress.processed} / {gitHubExtractProgress.total} files
                      </span>
                    ) : undefined}
                  </div>
                  <Progress
                    value={
                      gitHubExtractProgress.total > 0
                        ? (gitHubExtractProgress.processed / gitHubExtractProgress.total) * 100
                        : 0
                    }
                    className='h-2'
                  />
                </div>
              ) : undefined}

              {/* Creating */}
              {gitHubState.matches('creating') ? (
                <div className='space-y-2'>
                  <div className='flex items-center justify-between text-sm'>
                    <span className='flex items-center gap-2 font-medium'>
                      <Loader />
                      <span>Creating project...</span>
                    </span>
                  </div>
                  <Progress value={100} className='h-2' />
                </div>
              ) : undefined}

              {/* Cancel Button - show during download/extract only */}
              {gitHubState.matches('downloading') ? (
                <Button
                  variant='outline'
                  className='w-full'
                  onClick={() => {
                    gitHubActorRef.send({ type: 'cancelDownload' });
                  }}
                >
                  <XCircle className='mr-2 size-4' />
                  Cancel Import
                </Button>
              ) : undefined}
            </div>
          </div>
        </div>
      );
    }
  }
}
