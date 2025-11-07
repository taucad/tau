import { useCallback, useContext, useEffect, useState } from 'react';
import type { ActorRefFrom } from 'xstate';
import { AuthUIContext } from '@daveyplate/better-auth-ui';
import { Loader2, GitBranch } from 'lucide-react';
import type { GitRepository } from '@taucad/types';
import type { gitMachine } from '#machines/git.machine.js';
import { Button } from '#components/ui/button.js';
import { toast } from '#components/ui/sonner.js';
import { getGitHubAccessToken } from '#lib/git-auth.js';
import { cn } from '#utils/ui.utils.js';

type RepositorySelectorProperties = {
  readonly gitRef: ActorRefFrom<typeof gitMachine>;
  readonly onSelected: () => void;
  readonly onCancel: () => void;
};

export function RepositorySelector({ gitRef, onSelected, onCancel }: RepositorySelectorProperties): React.ReactNode {
  const [repositories, setRepositories] = useState<GitRepository[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [selectedRepo, setSelectedRepo] = useState<GitRepository | undefined>();
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
