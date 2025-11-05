import { useCallback, useContext, useEffect, useState } from 'react';
import { useSelector } from '@xstate/react';
import { AuthUIContext } from '@daveyplate/better-auth-ui';
import { Sparkles, GitBranch, GitCommit, Upload, Download, Loader2 } from 'lucide-react';
import type { GitRepository } from '@taucad/types';
import { Tooltip, TooltipTrigger, TooltipContent } from '#components/ui/tooltip.js';
import { Button } from '#components/ui/button.js';
import { Input } from '#components/ui/input.js';
import { toast } from '#components/ui/sonner.js';
import { SvgIcon } from '#components/icons/svg-icon.js';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from '#components/ui/sheet.js';
import { requestGitHubRepoAccess, hasGitHubRepoAccess, getGitHubAccessToken } from '#lib/git-auth.js';
import { useBuild } from '#hooks/use-build.js';
import { cn } from '#utils/ui.utils.js';

export function BuildGitConnector(): React.ReactNode {
  const [isSheetOpen, setIsSheetOpen] = useState(false);
  const [step, setStep] = useState<'check-auth' | 'login' | 'request-scopes' | 'select-repo' | 'connected' | 'error'>(
    'check-auth',
  );
  const [errorMessage, setErrorMessage] = useState<string | undefined>();
  const { hooks } = useContext(AuthUIContext);
  const { data: session } = hooks.useSession();
  const { gitRef } = useBuild();

  const repository = useSelector(gitRef, (state) => state.context.repository);

  const handleConnect = useCallback(async () => {
    setIsSheetOpen(true);
    setErrorMessage(undefined);

    try {
      // Step 1: Check if user is signed in
      if (!session?.user) {
        setStep('login');
        return;
      }

      // Step 2: Check if GitHub account is linked
      const hasAccess = await hasGitHubRepoAccess();

      if (hasAccess) {
        // User has access
        if (repository) {
          setStep('connected');
        } else {
          setStep('select-repo');
        }
      } else {
        // Show UI to request repository scopes
        setStep('request-scopes');
      }
    } catch (error) {
      const errorMessage_ = error instanceof Error ? error.message : 'Failed to connect to GitHub';
      setErrorMessage(errorMessage_);
      setStep('error');
    }
  }, [session, repository]);

  const handleRequestScopes = useCallback(async () => {
    try {
      await requestGitHubRepoAccess();
      toast.success('GitHub repository access granted');
      setStep('select-repo');
    } catch (error) {
      const errorMessage_ = error instanceof Error ? error.message : 'Failed to grant repository access';
      setErrorMessage(errorMessage_);
      setStep('error');
    }
  }, []);

  return (
    <>
      <Tooltip>
        <TooltipTrigger asChild>
          <Button variant="outline" size="icon" className="hidden md:flex" onClick={handleConnect}>
            <SvgIcon id="github" />
          </Button>
        </TooltipTrigger>
        <TooltipContent>Connect to Git</TooltipContent>
      </Tooltip>

      <Sheet open={isSheetOpen} onOpenChange={setIsSheetOpen}>
        <SheetContent side="right" className="flex w-full flex-col sm:max-w-2xl">
          <SheetHeader>
            <SheetTitle>Git Integration</SheetTitle>
            <SheetDescription>Connect your build to a GitHub repository for version control</SheetDescription>
          </SheetHeader>

          <div className="flex flex-1 flex-col overflow-hidden py-4">
            {step === 'check-auth' && <CheckingAuth />}
            {step === 'login' && (
              <LoginPrompt
                onClose={() => {
                  setIsSheetOpen(false);
                }}
              />
            )}
            {step === 'request-scopes' && (
              <RequestScopes
                onGrant={handleRequestScopes}
                onCancel={() => {
                  setIsSheetOpen(false);
                }}
              />
            )}
            {step === 'select-repo' && (
              <RepositorySelector
                onSelected={() => {
                  setStep('connected');
                }}
                onCancel={() => {
                  setIsSheetOpen(false);
                }}
              />
            )}
            {step === 'connected' && <GitWorkspace repository={repository} />}
            {step === 'error' && (
              <ErrorState
                message={errorMessage}
                onRetry={() => {
                  setErrorMessage(undefined);
                  setStep('check-auth');
                  void handleConnect();
                }}
                onClose={() => {
                  setIsSheetOpen(false);
                  setErrorMessage(undefined);
                  setStep('check-auth');
                }}
              />
            )}
          </div>
        </SheetContent>
      </Sheet>
    </>
  );
}

function CheckingAuth(): React.ReactNode {
  return (
    <div className="flex flex-col items-center justify-center gap-4 py-12">
      <Loader2 className="size-8 animate-spin text-muted-foreground" />
      <p className="text-sm text-muted-foreground">Checking authentication...</p>
    </div>
  );
}

type LoginPromptProperties = {
  readonly onClose: () => void;
};

function LoginPrompt({ onClose }: LoginPromptProperties): React.ReactNode {
  return (
    <div className="flex flex-col gap-6">
      <div className="rounded-md border bg-muted/30 p-4">
        <h4 className="text-lg font-semibold">Sign in with GitHub</h4>
        <p className="mt-2 text-sm text-muted-foreground">
          To use Git integration, you need to sign in with your GitHub account.
        </p>
      </div>
      <div className="flex flex-col gap-3">
        <p className="text-sm font-medium">What you&apos;ll need:</p>
        <ul className="ml-4 space-y-2 text-sm text-muted-foreground">
          <li className="list-disc">A GitHub account</li>
          <li className="list-disc">Permission to access your repositories</li>
        </ul>
      </div>
      <div className="flex gap-2">
        <Button asChild className="w-full">
          <a href="/auth/sign-in">Sign in with GitHub</a>
        </Button>
        <Button variant="outline" onClick={onClose}>
          Cancel
        </Button>
      </div>
    </div>
  );
}

type RequestScopesProperties = {
  readonly onGrant: () => void;
  readonly onCancel: () => void;
};

function RequestScopes({ onGrant, onCancel }: RequestScopesProperties): React.ReactNode {
  return (
    <div className="flex flex-col gap-6">
      <div className="rounded-md border bg-muted/30 p-4">
        <h4 className="text-lg font-semibold">Grant Repository Access</h4>
        <p className="mt-2 text-sm text-muted-foreground">
          To enable Git synchronization, we need additional permissions to access your GitHub repositories.
        </p>
      </div>

      <div className="space-y-4 rounded-md border p-4">
        <h4 className="text-sm font-semibold">Requested Permissions:</h4>
        <ul className="space-y-3">
          <li className="flex gap-3">
            <span className="text-green-500 font-mono text-xs">✓</span>
            <div className="flex-1">
              <p className="text-sm font-medium">Repository Access (repo)</p>
              <p className="text-xs text-muted-foreground">
                Read and write access to your repositories for version control operations
              </p>
            </div>
          </li>
        </ul>
      </div>

      <div className="border-yellow-500/50 bg-yellow-500/10 rounded-md border p-4">
        <p className="text-yellow-600 text-sm">
          <strong>Note:</strong> A popup window will open for you to authorize these permissions. Please allow popups
          for this site if prompted.
        </p>
      </div>

      <div className="flex gap-2">
        <Button className="flex-1" onClick={onGrant}>
          Grant Access
        </Button>
        <Button variant="outline" onClick={onCancel}>
          Cancel
        </Button>
      </div>
    </div>
  );
}

type RepositorySelectorProperties = {
  readonly onSelected: () => void;
  readonly onCancel: () => void;
};

function RepositorySelector({ onSelected, onCancel }: RepositorySelectorProperties): React.ReactNode {
  const [repositories, setRepositories] = useState<GitRepository[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [selectedRepo, setSelectedRepo] = useState<GitRepository | undefined>();
  const { gitRef } = useBuild();
  const { hooks } = useContext(AuthUIContext);
  const { data: session } = hooks.useSession();

  useEffect(() => {
    async function fetchRepositories(): Promise<void> {
      try {
        const token = await getGitHubAccessToken();
        const response = await fetch('https://api.github.com/user/repos?per_page=100&sort=updated', {
          headers: {
            Authorization: `Bearer ${token}`,

            Accept: 'application/vnd.github.v3+json',
          },
        });

        if (!response.ok) {
          throw new Error('Failed to fetch repositories');
        }

        const data = (await response.json()) as Array<{
          owner: { login: string };
          name: string;
          clone_url: string;
          default_branch?: string;
          private: boolean;
        }>;
        const repos: GitRepository[] = data.map((repo) => ({
          owner: repo.owner.login,
          name: repo.name,
          url: repo.clone_url,
          branch: repo.default_branch ?? 'main',
          isPrivate: repo.private,
        }));

        setRepositories(repos);
      } catch {
        toast.error('Failed to load repositories');
      } finally {
        setIsLoading(false);
      }
    }

    void fetchRepositories();
  }, []);

  const handleSelectRepo = useCallback(
    async (repo: GitRepository) => {
      setSelectedRepo(repo);

      try {
        const token = await getGitHubAccessToken();

        // Send authenticate event
        gitRef.send({
          type: 'authenticate',
          accessToken: token,
          username: session?.user.name ?? 'user',
          email: session?.user.email ?? 'user@example.com',
        });

        // Send repository selection
        gitRef.send({
          type: 'selectRepository',
          repository: repo,
        });

        toast.success(`Connected to ${repo.owner}/${repo.name}`);
        onSelected();
      } catch {
        toast.error('Failed to connect repository');
      }
    },
    [onSelected, session, gitRef],
  );

  if (isLoading) {
    return (
      <div className="flex flex-col items-center justify-center gap-4 py-12">
        <Loader2 className="size-8 animate-spin text-muted-foreground" />
        <p className="text-sm text-muted-foreground">Loading repositories...</p>
      </div>
    );
  }

  return (
    <div className="mx-4 flex h-full flex-1 flex-col gap-4">
      <div className="flex items-center justify-between">
        <h4 className="text-sm font-semibold">Select Repository</h4>
        <Button size="sm" variant="outline" onClick={onCancel}>
          Cancel
        </Button>
      </div>
      <div className="flex max-h-[500px] flex-col gap-2 overflow-y-auto">
        {repositories.map((repo) => (
          <button
            key={`${repo.owner}/${repo.name}`}
            type="button"
            className={cn(
              'flex items-center justify-between rounded-md border p-3 text-left transition-colors hover:bg-muted',
              selectedRepo?.name === repo.name && 'border-primary bg-muted',
            )}
            onClick={() => {
              void handleSelectRepo(repo);
            }}
          >
            <div className="flex flex-col gap-1">
              <span className="text-sm font-medium">
                {repo.owner}/{repo.name}
              </span>
              <span className="text-xs text-muted-foreground">
                {repo.branch} • {repo.isPrivate ? 'Private' : 'Public'}
              </span>
            </div>
            <GitBranch className="size-4 text-muted-foreground" />
          </button>
        ))}
      </div>
    </div>
  );
}

type GitWorkspaceProperties = {
  readonly repository: GitRepository | undefined;
};

function GitWorkspace({ repository }: GitWorkspaceProperties): React.ReactNode {
  const { gitRef } = useBuild();

  const fileStatuses = useSelector(gitRef, (state) => state.context.fileStatuses);
  const stagedFiles = useSelector(gitRef, (state) => state.context.stagedFiles);

  const [commitMessage, setCommitMessage] = useState('');
  const [isGeneratingMessage, setIsGeneratingMessage] = useState(false);

  const unstagedFiles = [...fileStatuses.entries()]
    .filter(([path, status]) => !stagedFiles.has(path) && status.status !== 'clean')
    .map(([, status]) => status);

  const stagedFilesList = [...fileStatuses.entries()]
    .filter(([path]) => stagedFiles.has(path))
    .map(([, status]) => status);

  const handleStageFile = useCallback(
    (path: string) => {
      gitRef.send({ type: 'stageFile', path });
    },
    [gitRef],
  );

  const handleUnstageFile = useCallback(
    (path: string) => {
      gitRef.send({ type: 'unstageFile', path });
    },
    [gitRef],
  );

  const handleCommit = useCallback(() => {
    if (!commitMessage.trim()) {
      toast.error('Please enter a commit message');
      return;
    }

    gitRef.send({ type: 'commit', message: commitMessage });
    setCommitMessage('');
    toast.success('Changes committed');
  }, [commitMessage, gitRef]);

  const handlePush = useCallback(() => {
    gitRef.send({ type: 'push' });
    toast.success('Pushing to remote...');
  }, [gitRef]);

  const handlePull = useCallback(() => {
    gitRef.send({ type: 'pull' });
    toast.success('Pulling from remote...');
  }, [gitRef]);

  const handleGenerateCommitMessage = useCallback(async () => {
    setIsGeneratingMessage(true);
    try {
      const filesSummary = stagedFilesList.map((file) => `- ${file.path} (${file.status})`).join('\n');

      const response = await fetch('/v1/chat/generate-commit', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          files: filesSummary,
        }),
      });

      if (!response.ok) {
        throw new Error('Failed to generate commit message');
      }

      const data = (await response.json()) as { message: string };
      setCommitMessage(data.message);
    } catch {
      toast.error('Failed to generate commit message');
    } finally {
      setIsGeneratingMessage(false);
    }
  }, [stagedFilesList]);

  return (
    <div className="flex flex-1 flex-col gap-4 overflow-hidden">
      {/* Repository Info */}
      {repository ? (
        <div className="flex items-center justify-between rounded-md border p-3">
          <div className="flex flex-col gap-1">
            <span className="text-sm font-medium">
              {repository.owner}/{repository.name}
            </span>
            <span className="text-xs text-muted-foreground">{repository.branch}</span>
          </div>
          <div className="flex gap-1">
            <Button size="sm" variant="ghost" onClick={handlePull}>
              <Download className="mr-1 size-3" />
              Pull
            </Button>
            <Button
              size="sm"
              variant="ghost"
              onClick={() => {
                gitRef.send({ type: 'disconnect' });
              }}
            >
              Disconnect
            </Button>
          </div>
        </div>
      ) : null}

      {/* Changes Section */}
      <div className="flex flex-1 flex-col gap-3 overflow-y-auto">
        <div className="flex flex-col gap-2">
          <h4 className="text-sm font-semibold">Changes</h4>
          <div className="max-h-48 overflow-y-auto rounded-md border">
            {unstagedFiles.length > 0 ? (
              <div className="divide-y">
                {unstagedFiles.map((file) => (
                  <FileStatusItem key={file.path} file={file} onStage={handleStageFile} />
                ))}
              </div>
            ) : (
              <div className="p-4 text-center text-sm text-muted-foreground">No changes</div>
            )}
          </div>
        </div>

        <div className="flex flex-col gap-2">
          <h4 className="text-sm font-semibold">Staged Changes</h4>
          <div className="max-h-48 overflow-y-auto rounded-md border">
            {stagedFilesList.length > 0 ? (
              <div className="divide-y">
                {stagedFilesList.map((file) => (
                  <FileStatusItem key={file.path} file={file} onUnstage={handleUnstageFile} />
                ))}
              </div>
            ) : (
              <div className="p-4 text-center text-sm text-muted-foreground">No staged changes</div>
            )}
          </div>
        </div>

        {/* Commit Section */}
        {stagedFilesList.length > 0 ? (
          <div className="flex flex-col gap-3">
            <div className="flex gap-2">
              <Input
                value={commitMessage}
                placeholder="Enter commit message..."
                className="flex-1"
                onChange={(event) => {
                  setCommitMessage(event.target.value);
                }}
                onKeyDown={(event) => {
                  if (event.key === 'Enter' && commitMessage.trim()) {
                    handleCommit();
                  }
                }}
              />
              <Button
                size="icon"
                variant="outline"
                disabled={isGeneratingMessage || stagedFilesList.length === 0}
                title="Generate commit message with AI"
                onClick={handleGenerateCommitMessage}
              >
                {isGeneratingMessage ? <Loader2 className="size-4 animate-spin" /> : <Sparkles className="size-4" />}
              </Button>
            </div>
            <div className="flex gap-2">
              <Button disabled={!commitMessage.trim()} className="flex-1" onClick={handleCommit}>
                <GitCommit className="mr-2 size-4" />
                Commit
              </Button>
              <Button variant="outline" onClick={handlePush}>
                <Upload className="mr-2 size-4" />
                Push
              </Button>
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}

type FileStatusItemProperties = {
  readonly file: { path: string; status: string; staged: boolean };
  readonly onStage?: (path: string) => void;
  readonly onUnstage?: (path: string) => void;
};

function FileStatusItem({ file, onStage, onUnstage }: FileStatusItemProperties): React.ReactNode {
  const statusColorMap = {
    modified: 'text-yellow-500',
    added: 'text-green-500',
    deleted: 'text-red-500',
    untracked: 'text-blue-500',
    clean: 'text-muted-foreground',
  } as const;

  const statusLabelMap = {
    modified: 'M',
    added: 'A',
    deleted: 'D',
    untracked: 'U',
    clean: ' ',
  } as const;

  // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition -- Fallback for unknown status values
  const statusColor = statusColorMap[file.status as keyof typeof statusColorMap] || 'text-muted-foreground';
  // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition -- Fallback for unknown status values
  const statusLabel = statusLabelMap[file.status as keyof typeof statusLabelMap] || '?';

  const hasStageAction = Boolean(onStage);
  const hasUnstageAction = Boolean(onUnstage);

  return (
    <div className="flex items-center justify-between p-2 transition-colors hover:bg-muted">
      <div className="flex flex-1 items-center gap-2">
        <span className={cn('w-4 font-mono text-xs font-semibold', statusColor)}>{statusLabel}</span>
        <span className="truncate text-sm">{file.path}</span>
      </div>
      {hasStageAction && onStage ? (
        <Button
          size="sm"
          variant="ghost"
          className="h-7 px-2 text-xs"
          onClick={() => {
            onStage(file.path);
          }}
        >
          Stage
        </Button>
      ) : null}
      {hasUnstageAction && onUnstage ? (
        <Button
          size="sm"
          variant="ghost"
          className="h-7 px-2 text-xs"
          onClick={() => {
            onUnstage(file.path);
          }}
        >
          Unstage
        </Button>
      ) : null}
    </div>
  );
}

type ErrorStateProperties = {
  readonly message: string | undefined;
  readonly onRetry: () => void;
  readonly onClose: () => void;
};

function ErrorState({ message, onRetry, onClose }: ErrorStateProperties): React.ReactNode {
  return (
    <div className="flex flex-col gap-6">
      <div className="rounded-md border border-destructive/50 bg-destructive/10 p-4">
        <h4 className="text-lg font-semibold text-destructive">Connection Failed</h4>
        <p className="mt-2 text-sm text-destructive/80">{message}</p>
      </div>

      <div className="space-y-3 rounded-md border bg-muted/30 p-4">
        <h4 className="text-sm font-semibold">Troubleshooting Steps:</h4>
        <ul className="ml-4 space-y-2 text-sm text-muted-foreground">
          <li className="list-disc">
            <strong>Not signed in?</strong> Sign in to your GitHub account first
          </li>
          <li className="list-disc">
            <strong>No GitHub account linked?</strong> Link your GitHub account in Settings
          </li>
          <li className="list-disc">
            <strong>Popup blocked?</strong> Allow popups for this site and try again
          </li>
          <li className="list-disc">
            <strong>Network error?</strong> Check your internet connection
          </li>
        </ul>
      </div>

      <div className="flex gap-2">
        <Button onClick={onRetry}>Try Again</Button>
        <Button variant="outline" onClick={onClose}>
          Close
        </Button>
      </div>
    </div>
  );
}
