import { useLoaderData, useNavigate } from 'react-router';
import type { MetaDescriptor } from 'react-router';
import { useEffect, useMemo } from 'react';
import { useActorRef, useSelector } from '@xstate/react';
import { idPrefix } from '@taucad/types/constants';
import { AlertCircle, ChevronDown, FileCode, RotateCcw, XCircle } from 'lucide-react';
import { fromPromise } from 'xstate';
// eslint-disable-next-line no-restricted-imports -- allowed for route types
import type { Route } from './+types/route.js';
import type { TreeViewElement } from '#components/magicui/file-tree.js';
import type { Handle } from '#types/matches.types.js';
import { importGitHubMachine } from '#machines/import-github.machine.js';
import { LoadingSpinner } from '#components/ui/loading-spinner.js';
import { Progress } from '#components/ui/progress.js';
import { Button } from '#components/ui/button.js';
import { Input } from '#components/ui/input.js';
import { SvgIcon } from '#components/icons/svg-icon.js';
import { Tree, Folder, File } from '#components/magicui/file-tree.js';
import { formatFileSize } from '#components/geometry/converter/converter-utils.js';
import { useBuildManager } from '#hooks/use-build-manager.js';
import { RepositoryCard } from '#routes/import/repository-card.js';
import { BranchSelector } from '#routes/import/branch-selector.js';
import { ComboBoxResponsive } from '#components/ui/combobox-responsive.js';
import { consoleInspector } from '#machines/inspector.js';
import { generatePrefixedId } from '#utils/id.utils.js';

export const handle: Handle = {
  enableOverflowY: true,
};

type GitHubRepoInfo = {
  owner: string;
  repo: string;
  ref: string;
  mainFile: string;
};

/**
 * Parse GitHub URL and extract owner/repo
 */
function parseGitHubUrl(url: string): { owner: string; repo: string } | undefined {
  try {
    const parsed = new URL(url);

    // Only allow github.com
    if (parsed.hostname !== 'github.com') {
      return undefined;
    }

    // Parse /owner/repo or /owner/repo.git
    const pathParts = parsed.pathname.split('/').filter(Boolean);
    if (pathParts.length < 2) {
      return undefined;
    }

    const [owner, repoRaw] = pathParts;
    if (!owner || !repoRaw) {
      return undefined;
    }

    const repo = repoRaw.replace(/\.git$/, '');

    return { owner, repo };
  } catch {
    return undefined;
  }
}

/**
 * Build hierarchical file tree from flat file list
 */
function buildFileTree(files: Map<string, { filename: string; content: Uint8Array }>): TreeViewElement[] {
  const fileNames = [...files.keys()];
  const tree = new Map<string, TreeViewElement>();
  const rootFolders: TreeViewElement[] = [];

  for (const filename of fileNames) {
    const parts = filename.split('/');
    let currentPath = '';

    for (let index = 0; index < parts.length; index++) {
      const part = parts[index];
      if (!part) {
        continue;
      }

      const parentPath = currentPath;
      currentPath = currentPath ? `${currentPath}/${part}` : part;
      const isFile = index === parts.length - 1;

      if (tree.has(currentPath)) {
        continue;
      }

      const element: TreeViewElement = {
        id: currentPath,
        name: part,
        isSelectable: true,
        children: isFile ? undefined : [],
      };

      tree.set(currentPath, element);

      if (parentPath) {
        const parent = tree.get(parentPath);
        parent?.children?.push(element);
      } else {
        rootFolders.push(element);
      }
    }
  }

  return rootFolders;
}

/**
 * Recursively render file tree elements
 */
function renderFileTree(elements: TreeViewElement[]): React.ReactNode {
  return elements.map((element) => {
    if (element.children && element.children.length > 0) {
      return (
        <Folder key={element.id} element={element.name} value={element.id}>
          {renderFileTree(element.children)}
        </Folder>
      );
    }

    return (
      <File key={element.id} value={element.id}>
        <span className="truncate">{element.name}</span>
      </File>
    );
  });
}

export function meta({ loaderData }: Route.MetaArgs): MetaDescriptor[] {
  const repo = `${loaderData.owner}/${loaderData.repo} ${loaderData.ref === 'main' ? '' : `@ ${loaderData.ref}`}`;
  const title = `Import ${repo} from GitHub into Tau`;
  const description = `Get started with ${repo} by importing it into Tau.`;
  return [{ title, description }];
}

/**
 * Client loader that validates GitHub URL
 */
// eslint-disable-next-line @typescript-eslint/explicit-module-boundary-types -- inferred type
export function loader({ request }: Route.LoaderArgs) {
  const url = new URL(request.url);
  const repoUrl = url.searchParams.get('repo');
  const ref = url.searchParams.get('ref') ?? 'main';
  const mainFile = url.searchParams.get('main') ?? '';

  // If no repo URL provided, return defaults for entering details state
  if (!repoUrl) {
    return {
      owner: '',
      repo: '',
      ref: 'main',
      mainFile: '',
    } satisfies GitHubRepoInfo;
  }

  const parsed = parseGitHubUrl(repoUrl);
  if (!parsed) {
    throw new Error('Invalid GitHub URL. Only github.com repositories are supported.');
  }

  return {
    owner: parsed.owner,
    repo: parsed.repo,
    ref,
    mainFile,
  } satisfies GitHubRepoInfo;
}

// eslint-disable-next-line complexity -- TODO: consider refactoring.
export default function ImportRoute(): React.JSX.Element {
  const { owner, repo, ref, mainFile } = useLoaderData<typeof loader>();
  const navigate = useNavigate();
  const buildManager = useBuildManager();

  // Create import machine actor
  const importActorRef = useActorRef(
    importGitHubMachine.provide({
      actors: {
        createBuildActor: fromPromise(async ({ input }) => {
          const buildFiles: Record<string, { content: Uint8Array }> = {};
          for (const [path, file] of input.files) {
            buildFiles[path] = { content: file.content };
          }

          const build = await buildManager.createBuild(
            {
              name: `${input.owner}/${input.repo}`,
              description: `Imported from GitHub: https://github.com/${input.owner}/${input.repo}`,
              stars: 0,
              forks: 0,
              author: {
                name: 'You',
                avatar: '/avatar-sample.png',
              },
              tags: [],
              thumbnail: '',
              chats: [
                {
                  id: generatePrefixedId(idPrefix.chat),
                  name: 'Initial design',
                  messages: [],
                  createdAt: Date.now(),
                  updatedAt: Date.now(),
                },
              ],
              assets: {
                mechanical: {
                  main: input.mainFile,
                  parameters: {},
                },
              },
            },
            buildFiles,
          );

          return { type: 'buildCreated', buildId: build.id };
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
      inspect: consoleInspector,
    },
  );

  // Select state from machine
  const state = useSelector(importActorRef, (snapshot) => snapshot);
  const downloadProgress = useSelector(
    importActorRef,
    (snapshot) => snapshot.context.downloadProgress as { loaded: number; total: number },
  );
  const extractProgress = useSelector(
    importActorRef,
    (snapshot) => snapshot.context.extractProgress as { processed: number; total: number },
  );
  const error = useSelector(importActorRef, (snapshot) => snapshot.context.error);
  const buildId = useSelector(importActorRef, (snapshot) => snapshot.context.buildId);
  const files = useSelector(importActorRef, (snapshot) => snapshot.context.files);
  const selectedMainFile = useSelector(importActorRef, (snapshot) => snapshot.context.selectedMainFile);
  const requestedMainFile = useSelector(importActorRef, (snapshot) => snapshot.context.requestedMainFile);
  const repoUrl = useSelector(importActorRef, (snapshot) => snapshot.context.repoUrl);
  const repoOwner = useSelector(importActorRef, (snapshot) => snapshot.context.owner);
  const repoName = useSelector(importActorRef, (snapshot) => snapshot.context.repo);
  const repoMetadata = useSelector(importActorRef, (snapshot) => snapshot.context.repoMetadata);
  const branches = useSelector(importActorRef, (snapshot) => snapshot.context.branches);
  const selectedBranch = useSelector(importActorRef, (snapshot) => snapshot.context.selectedBranch);
  const fetchErrors = useSelector(importActorRef, (snapshot) => snapshot.context.fetchErrors);
  const hasMoreBranches = useSelector(importActorRef, (snapshot) => snapshot.context.hasMoreBranches);
  const isLoadingMoreBranches = useSelector(importActorRef, (snapshot) => snapshot.context.isLoadingMoreBranches);

  // Navigate when build is created
  useEffect(() => {
    if (state.matches('success') && buildId) {
      void navigate(`/builds/${buildId}`);
    }
  }, [state, buildId, navigate]);

  const fileTree = useMemo(() => buildFileTree(files), [files]);

  switch (true) {
    case state.matches('enteringDetails') ||
      state.matches('checkingRepo') ||
      state.matches('fetchingRepoInfo') ||
      state.matches('loadingMoreBranches'): {
      const isValidRepo = repoOwner.length > 0 && repoName.length > 0;
      const isCheckingOrFetching = state.matches('checkingRepo') || state.matches('fetchingRepoInfo');

      return (
        <div className="flex h-full items-center justify-center px-4 pt-8 pb-16">
          <div className="w-full max-w-2xl space-y-6">
            <div className="flex flex-col items-center gap-4">
              <div className="flex size-16 items-center justify-center rounded-full bg-linear-to-br from-primary/20 to-primary/10">
                <SvgIcon id="github" className="size-8 text-primary" />
              </div>

              <div className="text-center">
                <h1 className="text-2xl font-semibold">Import from GitHub</h1>
                <p className="text-sm text-muted-foreground">Enter a GitHub repository URL to get started</p>
              </div>
            </div>

            <div className="space-y-4">
              {/* Repository URL Input */}
              <div className="space-y-2 rounded-lg border bg-sidebar p-6">
                <label htmlFor="repo-url" className="text-sm font-medium">
                  Repository URL
                </label>
                <Input
                  id="repo-url"
                  type="url"
                  placeholder="https://github.com/owner/repo"
                  value={repoUrl}
                  className="font-mono text-sm"
                  onChange={(event) => {
                    importActorRef.send({ type: 'updateRepoUrl', url: event.target.value });
                  }}
                />
              </div>

              {/* Repository Preview Card */}
              {isValidRepo ? (
                <>
                  <RepositoryCard
                    metadata={repoMetadata}
                    owner={repoOwner}
                    repo={repoName}
                    isLoading={isCheckingOrFetching}
                  />

                  {/* Validation Feedback */}
                  {!isCheckingOrFetching && !repoMetadata ? (
                    <div className="flex items-start gap-3 rounded-lg border border-warning/50 bg-warning/10 p-4 text-warning">
                      <AlertCircle className="size-5 shrink-0" />
                      <div className="flex flex-col gap-1">
                        <div className="font-semibold">Repository Not Found</div>
                        <div className="text-sm">
                          The repository may not exist, be private, or you may not have access to it. Please check the
                          URL and try again.
                        </div>
                      </div>
                    </div>
                  ) : undefined}

                  {!isCheckingOrFetching && repoMetadata?.isPrivate ? (
                    <div className="border-info/50 bg-info/10 text-info flex items-start gap-3 rounded-lg border p-4">
                      <AlertCircle className="size-5 shrink-0" />
                      <div className="flex flex-col gap-1">
                        <div className="font-semibold">Private Repository</div>
                        <div className="text-sm">
                          This is a private repository. Make sure you have access permissions to import it.
                        </div>
                      </div>
                    </div>
                  ) : undefined}

                  {/* Fetch Errors - Show warnings for non-critical failures */}
                  {repoMetadata && !isCheckingOrFetching && fetchErrors.branches ? (
                    <div className="flex items-start gap-3 rounded-lg border border-warning/50 bg-warning/10 p-4 text-warning">
                      <AlertCircle className="size-5 shrink-0" />
                      <div className="flex flex-col gap-1">
                        <div className="font-semibold">Partial Information</div>
                        <div className="text-sm">
                          <div>Could not fetch branches list</div>
                          <div className="mt-1">You can still proceed with the import.</div>
                        </div>
                      </div>
                    </div>
                  ) : undefined}

                  {/* Branch Selector */}
                  {branches.length > 0 ? (
                    <div className="space-y-2 rounded-lg border bg-sidebar p-6">
                      <label className="text-sm font-medium">Branch</label>
                      <BranchSelector
                        branches={branches}
                        selectedBranch={selectedBranch}
                        isLoadingMore={isLoadingMoreBranches}
                        onSelect={(branch) => {
                          importActorRef.send({ type: 'selectBranch', branch });
                        }}
                        onLoadMore={
                          hasMoreBranches
                            ? () => {
                                importActorRef.send({ type: 'loadMoreBranches' });
                              }
                            : undefined
                        }
                      />
                    </div>
                  ) : undefined}

                  {/* Start Import Button */}
                  <Button
                    className="w-full"
                    size="lg"
                    disabled={isCheckingOrFetching || !repoMetadata}
                    onClick={() => {
                      importActorRef.send({ type: 'startImport' });
                    }}
                  >
                    Start Import
                  </Button>
                </>
              ) : undefined}
            </div>
          </div>
        </div>
      );
    }

    case state.matches('selectingMainFile'): {
      const fileNames = [...files.keys()];

      return (
        <div className="flex h-full items-center justify-center px-4 pt-8 pb-16">
          <div className="w-full max-w-3xl space-y-6">
            <div className="flex flex-col items-center gap-4">
              <div className="flex size-16 items-center justify-center rounded-full bg-linear-to-br from-primary/20 to-primary/10">
                <SvgIcon id="github" className="size-8 text-primary" />
              </div>

              <div className="text-center">
                <h1 className="text-2xl font-semibold">Review Import</h1>
                <p className="text-sm text-muted-foreground">
                  {owner}/{repo}
                  {ref === 'main' ? '' : ` @ ${ref}`}
                </p>
                {requestedMainFile.length > 0 && !fileNames.includes(requestedMainFile) ? (
                  <p className="mt-2 text-sm text-warning">
                    Requested file &quot;{requestedMainFile}&quot; not found. Please select a main file.
                  </p>
                ) : undefined}
              </div>
            </div>

            <div className="grid gap-6 md:grid-cols-2">
              {/* Left: File Tree */}
              <div className="space-y-3">
                <h2 className="text-sm font-medium">Repository Files ({fileNames.length})</h2>
                <div className="max-h-96 overflow-auto rounded-md border bg-sidebar p-2">
                  <Tree elements={fileTree} className="h-full">
                    {renderFileTree(fileTree)}
                  </Tree>
                </div>
              </div>

              {/* Right: Main File Selection */}
              <div className="space-y-3">
                <h2 className="text-sm font-medium">Main File</h2>
                <div className="space-y-4 rounded-md border bg-sidebar p-4">
                  <ComboBoxResponsive
                    groupedItems={[
                      {
                        name: 'Files',
                        items: fileNames.map((name) => ({ name })),
                      },
                    ]}
                    renderLabel={(file, selected) => (
                      <div className="flex items-center gap-2">
                        <FileCode className="size-4" />
                        <span className={selected?.name === file.name ? 'font-medium' : ''}>{file.name}</span>
                      </div>
                    )}
                    getValue={(file) => file.name}
                    defaultValue={selectedMainFile ? { name: selectedMainFile } : undefined}
                    placeholder="Select main file..."
                    searchPlaceHolder="Search files..."
                    title="Select Main File"
                    description="Choose the main entry file for your project"
                    emptyListMessage="No files found"
                    withVirtualization={fileNames.length > 50}
                    virtualizationHeight={300}
                    className="w-full"
                    onSelect={(filename) => {
                      importActorRef.send({ type: 'selectMainFile', filename });
                    }}
                  >
                    <Button variant="outline" className="w-full justify-between">
                      {selectedMainFile ? (
                        <span className="truncate">{selectedMainFile}</span>
                      ) : (
                        <span className="text-muted-foreground">Select main file...</span>
                      )}
                      <ChevronDown className="size-4 shrink-0" />
                    </Button>
                  </ComboBoxResponsive>

                  {selectedMainFile ? (
                    <div className="rounded-md bg-muted/50 p-3 text-xs">
                      <div className="font-medium">Selected:</div>
                      <div className="mt-1 break-all text-muted-foreground">{selectedMainFile}</div>
                    </div>
                  ) : undefined}

                  <Button
                    className="w-full"
                    disabled={!selectedMainFile}
                    onClick={() => {
                      importActorRef.send({ type: 'confirmImport' });
                    }}
                  >
                    Import Project
                  </Button>
                </div>
              </div>
            </div>
          </div>
        </div>
      );
    }

    case state.matches('error'): {
      return (
        <div className="flex h-full items-center justify-center px-4">
          <div className="w-full max-w-md space-y-4">
            <div className="flex items-start gap-3 rounded-lg border border-destructive/50 bg-destructive/10 p-4 text-destructive">
              <AlertCircle className="size-5 shrink-0" />
              <div className="flex flex-col gap-1">
                <div className="font-semibold">Import Failed</div>
                <div className="text-sm">{error?.message ?? 'Unknown error occurred'}</div>
              </div>
            </div>

            <div className="flex gap-2">
              <Button
                variant="default"
                className="flex-1"
                onClick={() => {
                  importActorRef.send({ type: 'retry' });
                }}
              >
                <RotateCcw className="mr-2 size-4" />
                Restart
              </Button>
              <Button asChild variant="outline" className="flex-1">
                <a href="/">Back to Home</a>
              </Button>
            </div>
          </div>
        </div>
      );
    }

    default: {
      return (
        <div className="flex h-full items-center justify-center px-4 pt-8 pb-16">
          <div className="w-full max-w-2xl space-y-6">
            <div className="flex flex-col items-center gap-4">
              <div className="flex size-16 items-center justify-center rounded-full bg-linear-to-br from-primary/20 to-primary/10">
                <SvgIcon id="github" className="size-8 text-primary" />
              </div>

              <div className="text-center">
                <h1 className="text-2xl font-semibold">Importing Repository</h1>
                <p className="text-sm text-muted-foreground">
                  {repoOwner}/{repoName}
                  {selectedBranch && selectedBranch !== 'main' ? ` @ ${selectedBranch}` : ''}
                </p>
              </div>
            </div>

            {/* Repository Preview Card (read-only) */}
            {repoMetadata ? (
              <RepositoryCard metadata={repoMetadata} owner={repoOwner} repo={repoName} isLoading={false} />
            ) : undefined}

            <div className="space-y-4">
              {/* Downloading */}
              <div className="space-y-2">
                <div className="flex items-center justify-between text-sm">
                  <span className="flex items-center gap-2 font-medium">
                    {state.matches('downloading') ? (
                      <>
                        <LoadingSpinner />
                        <span>Downloading...</span>
                      </>
                    ) : (
                      '✓ Downloaded'
                    )}
                  </span>
                  {downloadProgress.loaded > 0 ? (
                    <span className="text-muted-foreground">
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
                  className="h-2"
                />
              </div>

              {/* Extracting */}
              {(state.matches('extracting') || state.matches('creating')) && downloadProgress.loaded > 0 ? (
                <div className="space-y-2">
                  <div className="flex items-center justify-between text-sm">
                    <span className="flex items-center gap-2 font-medium">
                      {state.matches('extracting') ? (
                        <>
                          <LoadingSpinner />
                          <span>Extracting files...</span>
                        </>
                      ) : (
                        '✓ Extracted'
                      )}
                    </span>
                    {extractProgress.total > 0 ? (
                      <span className="text-muted-foreground">
                        {extractProgress.processed} / {extractProgress.total} files
                      </span>
                    ) : undefined}
                  </div>
                  <Progress
                    value={extractProgress.total > 0 ? (extractProgress.processed / extractProgress.total) * 100 : 0}
                    className="h-2"
                  />
                </div>
              ) : undefined}

              {/* Creating */}
              {state.matches('creating') ? (
                <div className="space-y-2">
                  <div className="flex items-center justify-between text-sm">
                    <span className="flex items-center gap-2 font-medium">
                      <LoadingSpinner />
                      <span>Creating build...</span>
                    </span>
                  </div>
                  <Progress value={100} className="h-2" />
                </div>
              ) : undefined}

              {/* Cancel Button - show during download/extract only */}
              {state.matches('downloading') || state.matches('extracting') ? (
                <Button
                  variant="outline"
                  className="w-full"
                  onClick={() => {
                    importActorRef.send({ type: 'cancelDownload' });
                  }}
                >
                  <XCircle className="mr-2 size-4" />
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
