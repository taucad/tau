import { useCallback, useState } from 'react';
import type { ActorRefFrom } from 'xstate';
import { useSelector } from '@xstate/react';
import { Sparkles, GitCommit, Upload, Download, Loader2 } from 'lucide-react';
import type { gitMachine } from '#machines/git.machine.js';
import { Button } from '#components/ui/button.js';
import { Input } from '#components/ui/input.js';
import { toast } from '#components/ui/sonner.js';
import { cn } from '#utils/ui.utils.js';

type GitWorkspaceProperties = {
  readonly gitRef: ActorRefFrom<typeof gitMachine>;
};

export function GitWorkspace({ gitRef }: GitWorkspaceProperties): React.ReactNode {
  const repository = useSelector(gitRef, (state) => state.context.repository);
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
