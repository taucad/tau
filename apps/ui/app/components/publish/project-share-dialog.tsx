import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { NavLink } from 'react-router';
import { useActorRef, useSelector } from '@xstate/react';
import { Check, Link2, Loader2, RefreshCw } from 'lucide-react';
import { publicationApiCode } from '@taucad/types/constants';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '#components/ui/dialog.js';
import { Button } from '#components/ui/button.js';
import { Input } from '#components/ui/input.js';
import { Textarea } from '#components/ui/textarea.js';
import { Label } from '#components/ui/label.js';
import { RadioGroup, RadioGroupItem } from '#components/ui/radio-group.js';
import { toast } from '#components/ui/sonner.js';
import { useFileManager } from '#hooks/use-file-manager.js';
import { useAuthLinks } from '#hooks/use-auth-links.js';
import { useTickAnimation } from '#hooks/use-tick-animation.js';
import type { PublishVisibility } from '#machines/publish.machine.js';
import { publishMachine, isPublishUploadError } from '#machines/publish.machine.js';
import { publishMaxFiles, publishMaxFileBytes, publishMaxTotalBytes } from '#utils/publish.utils.js';
import { PublicationEmailTagsField, getPublicationEmailTagsError } from '#components/publish/publication-email-tags.js';
import { PublicationAccessPanel, type PublicationAccessGrant } from '#components/publish/publication-access-panel.js';
import { ENV } from '#environment.config.js';
import { cn } from '#utils/ui.utils.js';

export type ProjectShareDialogProps = {
  // oxlint-disable-next-line react-js/boolean-prop-naming -- mirrors Radix Dialog `open` prop on `<Dialog.Root>`
  readonly open: boolean;
  readonly onOpenChange: (open: boolean) => void;
  readonly projectId: string;
  readonly projectName: string;
  readonly projectDescription?: string;
  readonly projectUpdatedAt?: Date | number | string;
  readonly entryFile: string;
  readonly parameters?: Record<string, unknown>;
};

type ProjectShareEnvelope = {
  project: {
    id: string;
    name: string | null;
    description: string | null;
  };
  currentPublication: null | {
    id: string;
    title: string;
    description: string | null;
    visibility: PublishVisibility;
    createdAt: string;
    urls: {
      share: string;
    };
    access: {
      grants: PublicationAccessGrant[];
    };
  };
  snapshot: {
    state: 'unpublished' | 'published-current';
    lastPublishedAt?: string;
  };
};

type FormattedPublishError = {
  headline: string;
  detail?: string;
  showSignIn?: boolean;
};

export function formatPublishError(error: Error | undefined): FormattedPublishError {
  if (!error) {
    return { headline: 'Something went wrong' };
  }

  if (isPublishUploadError(error)) {
    if (error.networkFault) {
      return {
        headline: "Couldn't reach the server",
        detail: 'Check your connection and try again.',
      };
    }

    if (error.message === 'INVALID_RESPONSE') {
      return {
        headline: 'Something went wrong on our end',
        detail: 'Try again in a moment.',
      };
    }

    if (error.status === 401) {
      return {
        headline: 'Sign in to share',
        detail: 'You must be signed in to share this project.',
        showSignIn: true,
      };
    }

    if (error.status === 403 && error.apiCode === publicationApiCode.PROJECT_FORBIDDEN) {
      return { headline: 'This project is owned by another user' };
    }

    if (error.status === 413) {
      return {
        headline: 'Project too large',
        detail: `Total upload exceeds ${publishMaxTotalBytes / (1024 * 1024)} MiB.`,
      };
    }

    if (error.status !== undefined && error.status >= 500) {
      return {
        headline: 'Something went wrong on our end',
        detail: 'Try again in a moment.',
      };
    }

    if (error.status === 400) {
      return {
        headline: 'Share payload was invalid',
        detail: 'Reload the page and try again.',
      };
    }

    return { headline: 'Sharing failed' };
  }

  const { message } = error;
  const fileTooLargePrefix = `${publicationApiCode.FILE_TOO_LARGE}:`;
  if (message.startsWith(fileTooLargePrefix)) {
    const path = message.slice(fileTooLargePrefix.length);
    return {
      headline: 'File too large',
      detail: path ? `Reduce size of ${path} (max ${publishMaxFileBytes / (1024 * 1024)} MiB per file).` : undefined,
    };
  }

  if (message === publicationApiCode.PAYLOAD_TOO_LARGE) {
    return {
      headline: 'Project too large',
      detail: `Total upload exceeds ${publishMaxTotalBytes / (1024 * 1024)} MiB.`,
    };
  }

  if (message === publicationApiCode.TOO_MANY_FILES) {
    return {
      headline: 'Too many files',
      detail: `Sharing allows up to ${publishMaxFiles} files.`,
    };
  }

  return { headline: message };
}

const parseProjectShareEnvelope = (value: unknown): ProjectShareEnvelope | null => {
  if (!value || typeof value !== 'object') {
    return null;
  }

  const envelope = value as ProjectShareEnvelope;
  if (!envelope.project || !envelope.snapshot) {
    return null;
  }

  if (envelope.currentPublication !== null) {
    const publication = envelope.currentPublication;
    if (
      typeof publication?.id !== 'string' ||
      typeof publication.title !== 'string' ||
      (publication.visibility !== 'private' && publication.visibility !== 'public') ||
      typeof publication.createdAt !== 'string' ||
      typeof publication.urls?.share !== 'string' ||
      !Array.isArray(publication.access?.grants)
    ) {
      return null;
    }
  }

  return envelope;
};

const getProjectUpdatedAtMs = (value: ProjectShareDialogProps['projectUpdatedAt']): number | undefined => {
  if (value === undefined) {
    return undefined;
  }

  const ms = value instanceof Date ? value.getTime() : new Date(value).getTime();
  return Number.isNaN(ms) ? undefined : ms;
};

const getSnapshotState = (
  envelope: ProjectShareEnvelope,
  projectUpdatedAt: ProjectShareDialogProps['projectUpdatedAt'],
): 'unpublished' | 'published-current' | 'published-stale' => {
  if (!envelope.currentPublication) {
    return 'unpublished';
  }

  const updatedAtMs = getProjectUpdatedAtMs(projectUpdatedAt);
  const publishedAtMs = new Date(envelope.currentPublication.createdAt).getTime();
  if (updatedAtMs !== undefined && !Number.isNaN(publishedAtMs) && updatedAtMs > publishedAtMs + 1000) {
    return 'published-stale';
  }

  return 'published-current';
};

const getSnapshotCopy = (state: 'unpublished' | 'published-current' | 'published-stale'): string => {
  if (state === 'published-stale') {
    return 'Your project has unpublished changes. People with this link see the previous shared snapshot.';
  }

  if (state === 'published-current') {
    return 'People with the link see the current shared snapshot.';
  }

  return 'Publish a snapshot to create a shareable viewer link.';
};

type ProjectShareDialogBodyProps = Omit<ProjectShareDialogProps, 'open' | 'onOpenChange'> & {
  readonly onRequestClose: () => void;
};

function ProjectShareDialogBody(properties: ProjectShareDialogBodyProps): React.JSX.Element {
  const {
    projectId,
    projectName,
    projectDescription = '',
    projectUpdatedAt,
    entryFile,
    parameters,
    onRequestClose,
  } = properties;
  const { fileManagerRef } = useFileManager();
  const { signIn } = useAuthLinks();
  const publishRef = useActorRef(publishMachine, {
    input: {
      fileManagerRef,
      projectId,
      projectName,
      entryFile,
      parameters,
    },
  });

  const publishState = useSelector(publishRef, (state) => state.value);
  const publishShareUrl = useSelector(publishRef, (state) => state.context.shareUrl);
  const publishError = useSelector(publishRef, (state) => state.context.error);

  const apiBaseUrl = useMemo(() => ENV.TAU_API_URL.replace(/\/$/u, ''), []);
  const [envelope, setEnvelope] = useState<ProjectShareEnvelope | null>(null);
  const [loadingEnvelope, setLoadingEnvelope] = useState(false);
  const [envelopeError, setEnvelopeError] = useState<string | undefined>();
  const [visibility, setVisibility] = useState<PublishVisibility>('private');
  const [title, setTitle] = useState(projectName);
  const [description, setDescription] = useState(projectDescription);
  const [sharedEmails, setSharedEmails] = useState<string[]>([]);
  const [visibilityMutating, setVisibilityMutating] = useState(false);
  const lastHandledShareUrlRef = useRef<string | undefined>(undefined);
  const { ticked: copied, trigger: triggerCopiedTick } = useTickAnimation();

  const loadEnvelope = useCallback(async (): Promise<void> => {
    setLoadingEnvelope(true);
    setEnvelopeError(undefined);
    try {
      const response = await fetch(`${apiBaseUrl}/v1/projects/${projectId}/share`, {
        credentials: 'include',
        headers: { Accept: 'application/json' },
      });

      if (!response.ok) {
        throw new Error(response.status === 401 ? 'SIGN_IN_REQUIRED' : 'SHARE_ENVELOPE_FAILED');
      }

      const nextEnvelope = parseProjectShareEnvelope(await response.json());
      if (!nextEnvelope) {
        throw new Error('INVALID_SHARE_ENVELOPE');
      }

      setEnvelope(nextEnvelope);
    } catch (error) {
      setEnvelopeError(error instanceof Error ? error.message : 'SHARE_ENVELOPE_FAILED');
    } finally {
      setLoadingEnvelope(false);
    }
  }, [apiBaseUrl, projectId]);

  useEffect(() => {
    void loadEnvelope();
  }, [loadEnvelope]);

  useEffect(() => {
    publishRef.send({ type: 'reset' });
    setTitle(projectName);
    setDescription(projectDescription);
    setVisibility('private');
    setSharedEmails([]);
    setVisibilityMutating(false);
    lastHandledShareUrlRef.current = undefined;
  }, [projectId, projectName, projectDescription, publishRef]);

  useEffect(() => {
    if (!publishShareUrl || lastHandledShareUrlRef.current === publishShareUrl) {
      return;
    }

    lastHandledShareUrlRef.current = publishShareUrl;
    let cancelled = false;
    const finishPublish = async (): Promise<void> => {
      try {
        await navigator.clipboard.writeText(publishShareUrl);
        if (!cancelled) {
          toast.success('Link copied');
          triggerCopiedTick();
        }
      } catch {
        if (!cancelled) {
          toast.error('Could not copy link');
        }
      }

      if (!cancelled) {
        await loadEnvelope();
        publishRef.send({ type: 'reset' });
      }
    };

    void finishPublish();

    return () => {
      cancelled = true;
    };
  }, [loadEnvelope, publishRef, publishShareUrl, triggerCopiedTick]);

  const busy = publishState === 'collectingFiles' || publishState === 'uploading';
  const sharedEmailError = visibility === 'private' ? getPublicationEmailTagsError(sharedEmails) : undefined;
  const canPublish = title.trim().length > 0 && !sharedEmailError && !busy;
  const formattedError = formatPublishError(publishError);
  const snapshotState = useMemo(
    () => (envelope ? getSnapshotState(envelope, projectUpdatedAt) : 'unpublished'),
    [envelope, projectUpdatedAt],
  );

  const handlePublish = (): void => {
    publishRef.send({
      type: 'publish',
      visibility,
      title: title.trim(),
      ...(description.trim() === '' ? {} : { description: description.trim() }),
      ...(visibility === 'private' && sharedEmails.length > 0 ? { sharedEmails } : {}),
    });
  };

  const handleVisibilityChange = async (nextVisibility: PublishVisibility): Promise<void> => {
    const publication = envelope?.currentPublication;
    if (!publication || publication.visibility === nextVisibility || visibilityMutating) {
      return;
    }

    setVisibilityMutating(true);
    try {
      const response = await fetch(`${apiBaseUrl}/v1/publications/${publication.id}/visibility`, {
        method: 'PATCH',
        credentials: 'include',
        headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
        body: JSON.stringify({ visibility: nextVisibility }),
      });

      if (!response.ok) {
        throw new Error('VISIBILITY_UPDATE_FAILED');
      }

      await loadEnvelope();
      toast.success('Visibility updated');
    } catch {
      toast.error('Could not update visibility');
    } finally {
      setVisibilityMutating(false);
    }
  };

  const handleRepublish = (): void => {
    const publication = envelope?.currentPublication;
    if (!publication) {
      return;
    }

    publishRef.send({
      type: 'publish',
      visibility: publication.visibility,
      title: publication.title,
      ...(publication.description ? { description: publication.description } : {}),
    });
  };

  if (envelopeError) {
    return (
      <>
        <DialogHeader>
          <DialogTitle>Share project</DialogTitle>
          <DialogDescription>We could not load sharing settings for this project.</DialogDescription>
        </DialogHeader>
        <div className='rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive'>
          {envelopeError === 'SIGN_IN_REQUIRED' ? 'Sign in to share this project.' : 'Sharing settings failed to load.'}
        </div>
        <DialogFooter>
          {envelopeError === 'SIGN_IN_REQUIRED' ? (
            <Button asChild>
              <NavLink to={signIn}>Sign in</NavLink>
            </Button>
          ) : (
            <Button type='button' onClick={() => void loadEnvelope()}>
              Try again
            </Button>
          )}
        </DialogFooter>
      </>
    );
  }

  if (loadingEnvelope) {
    return (
      <>
        <DialogHeader>
          <DialogTitle>Share project</DialogTitle>
          <DialogDescription>Loading sharing settings…</DialogDescription>
        </DialogHeader>
        <div className='flex min-h-36 items-center justify-center'>
          <Loader2 className='size-5 animate-spin text-muted-foreground' aria-hidden />
        </div>
      </>
    );
  }

  const publication = envelope?.currentPublication ?? null;

  if (publication) {
    return (
      <>
        <DialogHeader>
          <DialogTitle>Share project</DialogTitle>
          <DialogDescription>{getSnapshotCopy(snapshotState)}</DialogDescription>
        </DialogHeader>

        <div className='flex flex-col gap-4'>
          <div>
            <h3 className='truncate text-sm font-medium'>{publication.title}</h3>
            {publication.description ? (
              <p className='mt-1 line-clamp-2 text-sm text-muted-foreground'>{publication.description}</p>
            ) : null}
          </div>
          <PublicationAccessPanel
            apiBaseUrl={apiBaseUrl}
            publicationId={publication.id}
            shareUrl={publication.urls.share}
            visibility={publication.visibility}
            visibilityMutating={visibilityMutating}
            grants={publication.access.grants.filter((grant) => grant.status === 'active')}
            onVisibilityChange={handleVisibilityChange}
            onGrantsChanged={loadEnvelope}
          />
        </div>

        {publishState === 'error' && publishError ? (
          <PublishErrorCallout formattedError={formattedError} signIn={signIn} />
        ) : null}

        <DialogFooter>
          <Button type='button' variant='outline' onClick={onRequestClose}>
            Done
          </Button>
          <Button type='button' disabled={busy || visibilityMutating} onClick={handleRepublish}>
            {busy ? (
              <Loader2 className='size-4 animate-spin' aria-hidden />
            ) : copied ? (
              <Check className='size-3.5' aria-hidden />
            ) : (
              <RefreshCw className='size-3.5' aria-hidden />
            )}
            <span>{snapshotState === 'published-stale' ? 'Republish and copy link' : 'Republish'}</span>
          </Button>
        </DialogFooter>
      </>
    );
  }

  return (
    <>
      <DialogHeader>
        <DialogTitle>Share project</DialogTitle>
        <DialogDescription>
          {getSnapshotCopy('unpublished')} Uploads up to {publishMaxFiles} files ({publishMaxTotalBytes / (1024 * 1024)}{' '}
          MiB total, {publishMaxFileBytes / (1024 * 1024)} MiB per file).
        </DialogDescription>
      </DialogHeader>

      <div className='flex flex-col gap-4'>
        <div className='flex flex-col gap-2'>
          <Label htmlFor='share-title'>Title</Label>
          <Input
            id='share-title'
            value={title}
            disabled={busy}
            onChange={(event) => {
              setTitle(event.target.value);
            }}
          />
        </div>
        <div className='flex flex-col gap-2'>
          <Label htmlFor='share-description'>Description (optional)</Label>
          <Textarea
            id='share-description'
            value={description}
            disabled={busy}
            rows={3}
            onChange={(event) => {
              setDescription(event.target.value);
            }}
          />
        </div>
        <div className='flex flex-col gap-2'>
          <Label>Visibility</Label>
          <RadioGroup
            value={visibility}
            disabled={busy}
            onValueChange={(value) => {
              setVisibility(value as PublishVisibility);
            }}
            className='flex flex-col gap-2'
          >
            <div className='flex items-center gap-2'>
              <RadioGroupItem value='private' id='share-vis-private' />
              <Label htmlFor='share-vis-private' className='font-normal'>
                Private (only you and people you share with)
              </Label>
            </div>
            <div className='flex items-center gap-2'>
              <RadioGroupItem value='public' id='share-vis-public' />
              <Label htmlFor='share-vis-public' className='font-normal'>
                Public
              </Label>
            </div>
          </RadioGroup>
        </div>
        {visibility === 'private' ? (
          <PublicationEmailTagsField
            id='share-shared-emails'
            label='Share with specific emails (optional)'
            emails={sharedEmails}
            disabled={busy}
            placeholder='teammate@example.com'
            onEmailsChange={setSharedEmails}
          />
        ) : null}
      </div>

      {publishState === 'error' && publishError ? (
        <PublishErrorCallout formattedError={formattedError} signIn={signIn} />
      ) : null}

      <DialogFooter>
        <Button type='button' variant='outline' onClick={onRequestClose}>
          Cancel
        </Button>
        <Button type='button' disabled={!canPublish} onClick={handlePublish}>
          {busy ? (
            <>
              <Loader2 className='size-4 animate-spin' aria-hidden />
              <span>Publishing…</span>
            </>
          ) : (
            <>
              {copied ? <Check className='size-3.5' aria-hidden /> : <Link2 className='size-3.5' aria-hidden />}
              <span>Publish and copy link</span>
            </>
          )}
        </Button>
      </DialogFooter>
    </>
  );
}

function PublishErrorCallout({
  formattedError,
  signIn,
}: {
  readonly formattedError: FormattedPublishError;
  readonly signIn: string;
}): React.JSX.Element {
  return (
    <div
      className={cn(
        'rounded-md border px-3 py-2 text-sm',
        formattedError.showSignIn ? 'border-purple/30 bg-purple/10' : 'border-destructive/40 bg-destructive/10',
      )}
    >
      <div
        className={cn(
          'font-medium',
          formattedError.showSignIn ? 'text-purple dark:text-purple/70' : 'text-destructive',
        )}
      >
        {formattedError.headline}
      </div>
      {formattedError.detail ? (
        <div
          className={cn(
            'mt-1',
            formattedError.showSignIn ? 'text-purple/90 dark:text-purple/55' : 'text-muted-foreground',
          )}
        >
          {formattedError.detail}
        </div>
      ) : null}
      {formattedError.showSignIn ? (
        <Button asChild className='mt-3' size='sm'>
          <NavLink to={signIn}>Sign in</NavLink>
        </Button>
      ) : null}
    </div>
  );
}

export function ProjectShareDialog({
  open,
  onOpenChange,
  projectId,
  projectName,
  projectDescription,
  projectUpdatedAt,
  entryFile,
  parameters,
}: ProjectShareDialogProps): React.JSX.Element {
  const handleRequestClose = useCallback(() => {
    onOpenChange(false);
  }, [onOpenChange]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className='w-[calc(100%-2rem)] max-w-lg min-w-0 sm:w-full'>
        {open ? (
          <ProjectShareDialogBody
            key={projectId}
            projectId={projectId}
            projectName={projectName}
            projectDescription={projectDescription}
            projectUpdatedAt={projectUpdatedAt}
            entryFile={entryFile}
            parameters={parameters}
            onRequestClose={handleRequestClose}
          />
        ) : null}
      </DialogContent>
    </Dialog>
  );
}
