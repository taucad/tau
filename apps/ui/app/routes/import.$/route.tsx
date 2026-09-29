import { PageContent } from '#components/layout/page-content.js';
import { PageHeader } from '#components/layout/page-header.js';
import { Link, useLoaderData, useLocation, useNavigate } from 'react-router';
import type { MetaDescriptor } from 'react-router';
import { useEffect, useId, useRef, useState, useCallback, useMemo } from 'react';
import { useActorRef, useSelector } from '@xstate/react';
import { ArrowRight, X } from 'lucide-react';
import { fromSafeAsync } from '#lib/xstate.lib.js';
import type { MachineActors } from '#lib/xstate.lib.js';
// oxlint-disable-next-line import/extensions -- React Router generates this virtual route-type module.
import type { Route } from './+types/route.js';
import type { Handle } from '#types/matches.types.js';
import { importGitHubMachine } from '#machines/import-github.machine.js';
import { importDiskMachine } from '#machines/import-disk.machine.js';
import { PageNotice } from '#components/layout/page-notice.js';
import { Checkbox } from '@taucad/ui/components/checkbox';
import { Label } from '@taucad/ui/components/label';
import { Button } from '@taucad/ui/components/button';
import { Input } from '@taucad/ui/components/input';
import { useProjectManager } from '#hooks/use-project-manager.js';
import { useProjectCreationLocationError } from '#hooks/use-project-creation-location-error.js';
import { RepositoryCard } from '#routes/import.$/repository-card.js';
import { BranchSelector } from '#routes/import.$/branch-selector.js';
import { FileSelector, createStaticDataSource } from '#components/files/file-selector.js';
import { SuggestedClones } from '#routes/import.$/suggested-clones.js';
import { UploadCard } from '#routes/import.$/upload-card.js';
import {
  describeGitHubImport,
  parseGitHubUrl,
  normalizeGitHubUrl,
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
import { OpenInDesktop } from '#components/desktop/open-in-desktop.js';
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
import { GithubRepositoryPicker, useGithubConnectionAvailable } from '#components/github/github-repository-picker.js';
import type { GithubRepositorySelection } from '#components/github/github-repository-picker.js';
import { prepareLinkedGithubImport } from '#lib/github-linked-import.js';
import { githubNoreplyAuthor, githubProjectBinding } from '#lib/github-project-binding.js';
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
    return [{ title: 'Import · Tau' }];
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
  const [arrivalRepository] = useState({ owner, repo });
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
  const githubConnectionAvailable = useGithubConnectionAvailable();
  const branchLabelId = useId();
  const mainFileLabelId = useId();
  const linkedMainFileLabelId = useId();

  // Track active import mode
  const [activeMode, setActiveMode] = useState<ImportMode | undefined>(undefined);
  const [localOperation, setLocalOperation] = useState<'read' | 'extract'>('read');
  const [repoUrlDraft, setRepoUrlDraft] = useState<string>();
  const repoUrlInput = useRef<HTMLInputElement>(null);
  const repoUrlHintId = useId();

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
      } satisfies Partial<MachineActors<typeof importGitHubMachine>>,
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
      } satisfies Partial<MachineActors<typeof importDiskMachine>>,
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
  /* D19: a tau.json id already on this device can only be opened, never imported twice. */
  const linkedManifestId = linkedManifest?.success === true ? linkedManifest.data.id : undefined;
  const linkedExisting = useProjectSlugs(linkedManifestId);
  const linkedExistingBlocks = linkedManifestId !== undefined && linkedExisting.status !== 'not-found';
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
        setLocalOperation('read');
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
      setLocalOperation('read');
      diskActorRef.send({ type: 'processFiles', files });
    },
    [diskActorRef],
  );

  const handleFolderSelected = useCallback(
    (files: FileList) => {
      setActiveMode('disk');
      setLocalOperation('read');
      diskActorRef.send({ type: 'processFiles', files });
    },
    [diskActorRef],
  );

  const handleZipSelected = useCallback(
    (file: File) => {
      setActiveMode('disk');
      setLocalOperation('extract');
      diskActorRef.send({ type: 'processZip', file });
    },
    [diskActorRef],
  );

  const handleDataTransfer = useCallback(
    (items: DataTransferItemList) => {
      setActiveMode('disk');
      setLocalOperation('read');
      diskActorRef.send({ type: 'processDataTransfer', items });
    },
    [diskActorRef],
  );

  const handleDirectoryHandleSelected = useCallback(
    (handle: FileSystemDirectoryHandle) => {
      setActiveMode('disk');
      setLocalOperation('read');
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
    if (linkedSelection === undefined || linkedMainFile === '' || linkedTargetBranch.trim() === '') {
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
        author: githubNoreplyAuthor(linkedSelection.connection.subject, linkedSelection.connection.login),
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

  const publicRepoUrl = repoUrlDraft ?? repoUrl;
  const canReviewRepository = parseGitHubUrl(normalizeGitHubUrl(publicRepoUrl.trim())) !== undefined;
  const cancelRepositoryReview = (): void => {
    setRepoUrlDraft(repoUrl);
    setLinkedSelection(undefined);
    setActiveMode(undefined);
    gitHubActorRef.send({ type: 'updateRepoUrl', url: '' });
    requestAnimationFrame(() => repoUrlInput.current?.focus());
  };
  const reviewPublicRepository = (): void => {
    if (canReviewRepository) {
      setActiveMode('github');
      gitHubActorRef.send({ type: 'updateRepoUrl', url: normalizeGitHubUrl(publicRepoUrl.trim()) });
    }
  };

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
        title='Review import'
        subtitle={diskImportName}
        files={diskFiles}
        selectedMainFile={diskSelectedMainFile}
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
    const isCreating = diskState.matches('creating');

    return (
      <ImportProcessingView
        title={diskImportName}
        phase={isReading ? 'read' : isCreating ? 'create' : 'extract'}
        source='local'
        localOperation={localOperation}
        progress={diskProgress}
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

  if (isDiskActive && diskState.matches('success')) {
    return <ImportProcessingView isComplete title={diskImportName} source='local' phase='create' />;
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
        <PageContent className='space-y-6'>
          <PageHeader title='Import' />
          {/* Keep the shared-link offer scoped to the repository named on arrival. */}
          {arrivalRepository.owner.length > 0 &&
          arrivalRepository.owner === repoOwner &&
          arrivalRepository.repo === repoName ? (
            <OpenInDesktop continueLabel='Import in the browser' />
          ) : undefined}
          {isValidRepo ? (
            <section aria-labelledby='review-repository' className='space-y-6 border-t pt-6'>
              <div className='space-y-1'>
                <h2 id='review-repository' className='text-base font-medium'>
                  Review repository
                </h2>
                <p className='text-sm text-muted-foreground'>A copy of the chosen branch is added to your projects.</p>
              </div>
              {!isCheckingOrFetching && !repoMetadata ? (
                <PageNotice
                  title='Couldn’t open this repository'
                  message='Check the public repository address or choose a repository from your GitHub account.'
                  detail={gitHubError?.message ?? "Tau couldn't find a public repository at this address."}
                >
                  {githubConnectionAvailable === false ? undefined : (
                    <Button
                      variant='outline'
                      className='h-auto min-h-8 whitespace-normal'
                      onClick={cancelRepositoryReview}
                    >
                      Choose a private repository from GitHub
                    </Button>
                  )}
                </PageNotice>
              ) : undefined}
              <div className='grid gap-x-8 gap-y-5 md:grid-cols-[12rem_minmax(0,1fr)]'>
                <span className='text-sm font-medium'>Repository</span>
                <div className='min-w-0 space-y-4'>
                  <RepositoryCard
                    metadata={repoMetadata}
                    owner={repoOwner}
                    repo={repoName}
                    isLoading={isCheckingOrFetching}
                  />
                  {!isCheckingOrFetching && repoMetadata?.isPrivate ? (
                    <p className='text-sm text-muted-foreground'>
                      This is a private repository. Make sure you have access permissions to import it.
                    </p>
                  ) : undefined}
                </div>
                {repoMetadata && !isCheckingOrFetching ? (
                  <>
                    <span id={branchLabelId} className='text-sm font-medium'>
                      Branch
                    </span>
                    <div className='max-w-sm'>
                      {branches.length > 0 ? (
                        <BranchSelector
                          labelId={branchLabelId}
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
                      ) : fetchErrors.branches ? (
                        <p role='status' className='text-sm'>
                          Could not fetch branches. Import will use the{' '}
                          <span className='font-mono'>{selectedBranch}</span> branch.
                        </p>
                      ) : (
                        <p className='font-mono text-sm'>{selectedBranch}</p>
                      )}
                    </div>
                    <span id={mainFileLabelId} className='text-sm font-medium'>
                      Main file
                    </span>
                    <div role='group' aria-labelledby={mainFileLabelId} className='max-w-sm space-y-2'>
                      {repoFiles.length > 0 || isLoadingFiles ? (
                        <FileSelector
                          dataSource={repoFilesDataSource}
                          selectedFile={gitHubSelectedMainFile}
                          isLoading={isLoadingFiles}
                          placeholder='Select main file…'
                          title='Select main file'
                          description='Choose the main entry path for your project'
                          emptyMessage='No files found'
                          onSelect={(file) => {
                            gitHubActorRef.send({ type: 'selectMainFile', file });
                          }}
                        />
                      ) : (
                        <p className='text-sm text-muted-foreground'>
                          {fetchErrors.files
                            ? 'Could not list files. You can choose a main file after download.'
                            : 'You can choose a main file after download.'}
                        </p>
                      )}
                      {gitHubSelectedMainFile ? (
                        <p className='font-mono text-xs break-all text-muted-foreground'>{gitHubSelectedMainFile}</p>
                      ) : undefined}
                    </div>
                  </>
                ) : undefined}
                <span aria-hidden className='max-md:hidden' />
                <div className='flex flex-wrap items-center gap-2'>
                  <Button
                    disabled={isCheckingOrFetching || isFetchingFiles || !repoMetadata}
                    onClick={() => {
                      setActiveMode('github');
                      gitHubActorRef.send({ type: 'startImport' });
                    }}
                  >
                    Start import
                  </Button>
                  <CopyButton
                    size='icon'
                    variant='outline'
                    tooltip='Copy short link'
                    readyToCopyText=''
                    copiedText=''
                    getText={() => {
                      const parameters = new URLSearchParams();
                      if (selectedBranch && selectedBranch !== 'main') {
                        parameters.set('ref', selectedBranch);
                      }
                      const queryString = parameters.size > 0 ? `?${parameters.toString()}` : '';
                      return `${shareOrigin()}/i/${repoUrl}${queryString}`;
                    }}
                  />
                  <Button variant='ghost' onClick={cancelRepositoryReview}>
                    Cancel
                  </Button>
                </div>
              </div>
            </section>
          ) : linkedSelection === undefined ? (
            <>
              <div className='grid gap-8 border-t pt-6 md:grid-cols-2'>
                <section className='min-w-0 space-y-5'>
                  <div className='space-y-1'>
                    <h2 className='text-base font-medium'>GitHub repository</h2>
                    <p className='text-sm text-muted-foreground'>
                      {githubConnectionAvailable === false
                        ? 'Import a copy of a public repository.'
                        : 'Link a repository or import a public copy.'}
                    </p>
                  </div>
                  <GithubRepositoryPicker actionLabel='Review import' onSelect={reviewLinkedRepository} />
                  <form
                    className='space-y-2 pt-1'
                    onSubmit={(event) => {
                      event.preventDefault();
                      reviewPublicRepository();
                    }}
                  >
                    <label htmlFor='repo-url' className='block text-sm font-medium'>
                      Public repository URL
                    </label>
                    <div className='relative'>
                      <Input
                        ref={repoUrlInput}
                        id='repo-url'
                        type='text'
                        inputMode='url'
                        autoComplete='off'
                        spellCheck={false}
                        placeholder='https://github.com/owner/repo'
                        value={publicRepoUrl}
                        aria-describedby={repoUrlHintId}
                        className='pr-8 font-mono text-sm'
                        onChange={(event) => {
                          setRepoUrlDraft(event.target.value);
                        }}
                      />
                      {publicRepoUrl.length > 0 ? (
                        <Button
                          variant='ghost'
                          size='icon-xs'
                          className='absolute top-1/2 right-1 -translate-y-1/2'
                          type='button'
                          aria-label='Clear URL'
                          onClick={() => {
                            setRepoUrlDraft('');
                            gitHubActorRef.send({ type: 'updateRepoUrl', url: '' });
                            repoUrlInput.current?.focus();
                          }}
                        >
                          <X className='size-3.5' />
                        </Button>
                      ) : undefined}
                    </div>
                    <p id={repoUrlHintId} className='text-xs text-muted-foreground'>
                      Copies files without Git history or sync.
                    </p>
                    <Button type='submit' variant='outline' disabled={!canReviewRepository}>
                      Review repository
                      <ArrowRight />
                    </Button>
                  </form>
                </section>
                <UploadCard
                  onDataTransfer={handleDataTransfer}
                  onDirectoryHandleSelected={handleDirectoryHandleSelected}
                  onFilesSelected={handleFilesSelected}
                  onFolderSelected={handleFolderSelected}
                  onZipSelected={handleZipSelected}
                />
              </div>
              <SuggestedClones
                onSelect={(repository) => {
                  setActiveMode('github');
                  const repoUrlValue = `github.com/${repository.owner}/${repository.repo}`;
                  const parameters = new URLSearchParams();
                  if (repository.ref !== 'main') {
                    parameters.set('ref', repository.ref);
                  }
                  if (repository.mainFile) {
                    parameters.set('main', repository.mainFile);
                  }
                  const queryString = parameters.size > 0 ? `?${parameters.toString()}` : '';
                  void navigate(`/import/${repoUrlValue}${queryString}`);
                }}
              />
            </>
          ) : (
            <section aria-labelledby='linked-import-review' className='space-y-6 border-t pt-6'>
              <div className='space-y-1'>
                <h2 id='linked-import-review' className='text-base font-medium'>
                  Review linked import
                </h2>
                <p className='text-sm break-all text-muted-foreground'>
                  {linkedSelection.repository.fullName} at {linkedSelection.branch.name} ·{' '}
                  {linkedSelection.repository.access === 'write' ? 'future revisions can push' : 'read-only'}
                </p>
              </div>
              {linkedError === undefined ? undefined : (
                <PageNotice
                  title={linkedReviewBlocked ? 'Repository needs attention' : 'Import interrupted'}
                  message={
                    linkedReviewBlocked
                      ? linkedManifest?.success === false
                        ? 'Fix or remove the invalid tau.json, then choose the repository again.'
                        : 'Track large files with Git LFS, then choose the repository again.'
                      : 'Import and link did not finish. Review the details, then try Import and link again.'
                  }
                  detail={linkedError}
                />
              )}
              <div className='grid gap-x-8 gap-y-5 md:grid-cols-[12rem_minmax(0,1fr)]'>
                <label
                  id={linkedMainFileLabelId}
                  htmlFor={linkedSelection.files.length === 0 ? 'linked-main-file' : undefined}
                  className='text-sm font-medium'
                >
                  Main file
                </label>
                <div role='group' aria-labelledby={linkedMainFileLabelId} className='max-w-sm space-y-2'>
                  {linkedSelection.files.length === 0 ? (
                    <Input
                      id='linked-main-file'
                      value={linkedMainFile}
                      className='font-mono text-sm'
                      disabled={linkedBusy}
                      onChange={(event) => {
                        setLinkedMainFile(event.target.value);
                      }}
                    />
                  ) : (
                    <FileSelector
                      dataSource={linkedFilesDataSource}
                      isDisabled={linkedBusy}
                      selectedFile={linkedMainFile}
                      onSelect={setLinkedMainFile}
                    />
                  )}
                  {linkedMainFileSupported ? undefined : (
                    <p role='alert' className='text-sm'>
                      Choose a supported CAD source file as the project’s main file.
                    </p>
                  )}
                </div>
                <label htmlFor='linked-target-branch' className='text-sm font-medium'>
                  Local and sync branch
                </label>
                <div className='max-w-sm space-y-2'>
                  <Input
                    id='linked-target-branch'
                    value={linkedTargetBranch}
                    className='font-mono text-sm'
                    disabled={linkedBusy}
                    onChange={(event) => {
                      setLinkedTargetBranch(event.target.value);
                    }}
                  />
                  <p className='text-xs text-muted-foreground'>
                    Tau preserves the selected branch’s commits, tracked files, executable modes and Git remote.
                    {linkedSelection.repository.access === 'write'
                      ? ' Future revisions sync automatically.'
                      : ' This repository is linked read-only; local revisions remain available.'}
                  </p>
                </div>
                <span className='text-sm font-medium'>Chats</span>
                <div className='flex items-center gap-2'>
                  <Checkbox
                    id='linked-sync-chats'
                    checked={linkedSyncChats}
                    disabled={linkedBusy}
                    onCheckedChange={(checked) => {
                      setLinkedSyncChats(checked === true);
                    }}
                  />
                  <Label htmlFor='linked-sync-chats' className='text-sm leading-none font-normal'>
                    Sync project chats with this repository
                  </Label>
                </div>
                <span className='text-sm font-medium'>Setup change</span>
                <dl className='grid max-w-xl gap-x-4 gap-y-1 text-xs text-muted-foreground sm:grid-cols-[auto_minmax(0,1fr)]'>
                  <dt>Writes</dt>
                  <dd>
                    {linkedNeedsSetup ? (
                      <>
                        Add or update <span className='font-mono'>tau.json</span>
                        {linkedSelection.files.length === 0 ? ` and create ${linkedMainFile}` : ''}, with Tau’s{' '}
                        <span className='font-mono'>.gitignore</span> and{' '}
                        <span className='font-mono'>.gitattributes</span> entries.
                      </>
                    ) : (
                      <>
                        Tau’s <span className='font-mono'>.gitignore</span> and{' '}
                        <span className='font-mono'>.gitattributes</span> entries, only when missing.
                      </>
                    )}
                  </dd>
                  <dt>Commit author</dt>
                  <dd>{linkedSelection.connection.login} using GitHub’s no-reply address.</dd>
                  <dt>Visibility</dt>
                  <dd>{linkedSelection.repository.visibility}</dd>
                </dl>
                {linkedExisting.status === 'resolved' && linkedManifestId !== undefined ? (
                  <>
                    <span aria-hidden className='max-md:hidden' />
                    <div role='alert' className='flex flex-wrap items-center gap-3 text-sm'>
                      <span>This repository is already a project on this device.</span>
                      <Button asChild size='sm' variant='outline'>
                        <Link to={projectUrl(linkedExisting.value)}>Open project</Link>
                      </Button>
                    </div>
                  </>
                ) : undefined}
                <span aria-hidden className='max-md:hidden' />
                <div className='flex flex-wrap items-center gap-2'>
                  <Button
                    disabled={
                      linkedBusy ||
                      linkedReviewBlocked ||
                      linkedExistingBlocks ||
                      !linkedMainFileSupported ||
                      linkedMainFile === '' ||
                      linkedTargetBranch.trim() === ''
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
                      requestAnimationFrame(() => repoUrlInput.current?.focus());
                    }}
                  >
                    Cancel
                  </Button>
                </div>
              </div>
            </section>
          )}
        </PageContent>
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
          title='Review import'
          subtitle={`${owner}/${repo}${ref === 'main' ? '' : ` @ ${ref}`}`}
          requestedMainFileWarning={requestedFileWarning}
          files={gitHubFiles}
          selectedMainFile={gitHubSelectedMainFile}
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
        <ImportProcessingView
          title={`${repoOwner}/${repoName}${selectedBranch && selectedBranch !== 'main' ? ` @ ${selectedBranch}` : ''}`}
          source='github'
          phase={
            gitHubState.matches('creating') || gitHubState.matches('success')
              ? 'create'
              : gitHubExtractProgress.total > 0
                ? 'extract'
                : 'download'
          }
          isComplete={gitHubState.matches('success')}
          downloadProgress={downloadProgress}
          progress={gitHubExtractProgress}
          onCancel={
            gitHubState.matches('downloading')
              ? () => {
                  gitHubActorRef.send({ type: 'cancelDownload' });
                }
              : undefined
          }
        />
      );
    }
  }
}
