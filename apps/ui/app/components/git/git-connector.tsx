import { useCallback, useContext, useEffect, useState } from 'react';
import { useSelector } from '@xstate/react';
import type { ActorRefFrom } from 'xstate';
import { AuthUIContext } from '@daveyplate/better-auth-ui';
import { Loader2 } from 'lucide-react';
import type { gitMachine } from '#machines/git.machine.js';
import { Button } from '#components/ui/button.js';
import { toast } from '#components/ui/sonner.js';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from '#components/ui/sheet.js';
import { requestGitHubRepoAccess, hasGitHubRepoAccess, getGitHubAccessToken } from '#lib/git-auth.js';
import { GitTrigger } from '#components/git/git-trigger.js';
import { GitWorkspace } from '#components/git/git-workspace.js';
import { RepositorySelector } from '#components/git/repository-selector.js';

type GitConnectorProperties = {
  readonly gitRef: ActorRefFrom<typeof gitMachine>;
  readonly className?: string;
  readonly triggerVariant?: 'icon' | 'button';
  readonly triggerLabel?: string;
};

export function GitConnector({
  gitRef,
  className,
  triggerVariant = 'icon',
  triggerLabel = 'Connect to Git',
}: GitConnectorProperties): React.ReactNode {
  const [isSheetOpen, setIsSheetOpen] = useState(false);
  const [step, setStep] = useState<'check-auth' | 'login' | 'request-scopes' | 'select-repo' | 'connected' | 'error'>(
    'check-auth',
  );
  const [errorMessage, setErrorMessage] = useState<string | undefined>();
  const { hooks } = useContext(AuthUIContext);
  const { data: session } = hooks.useSession();

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
      {triggerVariant === 'icon' ? (
        <GitTrigger className={className} onClick={handleConnect} />
      ) : (
        <Button variant="outline" className={className} onClick={handleConnect}>
          {triggerLabel}
        </Button>
      )}

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
                gitRef={gitRef}
                onSelected={() => {
                  setStep('connected');
                }}
                onCancel={() => {
                  setIsSheetOpen(false);
                }}
              />
            )}
            {step === 'connected' && <GitWorkspace gitRef={gitRef} />}
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
