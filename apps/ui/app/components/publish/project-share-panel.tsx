import { useCallback, useEffect, useId, useMemo, useRef, useState } from 'react';
import { NavLink, useLocation } from 'react-router';
import { useActorRef, useSelector } from '@xstate/react';
import { Check, ChevronDown, Link2, Loader2, RefreshCw, ShieldCheck } from 'lucide-react';
import { publicationApiCode } from '@taucad/types/constants';
import { sharePasswordLimits } from '@taucad/share/artifact';
import { formatShareUrl } from '@taucad/share/locator';
import { isShareError } from '@taucad/share/provider';
import type { ShareProviderDescriptor } from '@taucad/share/provider';
import type { ShareProjectSnapshot } from '@taucad/share/snapshot';
import { Button } from '#components/ui/button.js';
import { Input } from '#components/ui/input.js';
import { Checkbox } from '#components/ui/checkbox.js';
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
import { PublicationAccessPanel } from '#components/publish/publication-access-panel.js';
import type { PublicationAccessGrant } from '#components/publish/publication-access-panel.js';
import { ENV } from '#environment.config.js';
import { cn } from '#utils/ui.utils.js';
import { useEntitlements } from '@taucad/billing/hooks/use-entitlements';
import { openSettingsDialog } from '#hooks/use-settings-dialog.js';
import { ProBadge } from '#components/tier-badge.js';
import { ComboBoxResponsive } from '#components/ui/combobox-responsive.js';
import {
  connectGithubGist,
  getGithubGistConnectionStatus,
  parseGithubGistAuthorizationReturn,
  shareProviderRegistry,
  withBrowserShareProviderContext,
} from '#lib/share-providers.js';
import type { GithubGistConnectionStatus } from '#lib/share-providers.js';
import { SvgIcon } from '#components/icons/svg-icon.js';

export type ProjectSharePanelProps = {
  readonly projectId: string;
  readonly projectName: string;
  readonly projectDescription?: string;
  readonly projectUpdatedAt?: Date | number | string;
  readonly entryPath: string;
  readonly parameters?: Record<string, unknown>;
  readonly collectSnapshot?: (signal?: AbortSignal) => Promise<ShareProjectSnapshot>;
  readonly initialMethod?: ShareMethod;
  readonly githubAuthorizationOutcome?: 'returned' | 'cancelled' | 'failed';
};

export type ShareMethod = 'direct' | 'tau' | 'github-gist';

const isShareMethod = (value: string): value is ShareMethod =>
  value === 'direct' || value === 'tau' || value === 'github-gist';

const shareMethodDescriptors = shareProviderRegistry.descriptors.filter(
  (descriptor): descriptor is ShareProviderDescriptor & { readonly id: ShareMethod } =>
    isShareMethod(descriptor.id) && descriptor.capabilities.includes('project.publish'),
);
const shareMethodGroups = [{ name: 'Share with', items: shareMethodDescriptors }];
const getShareMethodValue = (descriptor: ShareProviderDescriptor): string => descriptor.id;

function ShareMethodIcon({ method, className }: { readonly method: ShareMethod; readonly className?: string }) {
  if (method === 'direct') {
    return <Link2 className={className} aria-hidden />;
  }
  return <SvgIcon id={method === 'tau' ? 'tau' : 'github'} className={className} aria-hidden />;
}

type ProjectShareEnvelope = {
  project: {
    id: string;
    name?: string;
    description?: string;
  };
  currentPublication?: {
    id: string;
    title: string;
    description?: string;
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

const parseProjectShareEnvelope = (value: unknown): ProjectShareEnvelope | undefined => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return undefined;
  }

  const envelope = value as Record<string, unknown>;
  const { project, snapshot, currentPublication: publication } = envelope;
  if (
    !project ||
    typeof project !== 'object' ||
    Array.isArray(project) ||
    !snapshot ||
    typeof snapshot !== 'object' ||
    Array.isArray(snapshot)
  ) {
    return undefined;
  }
  const projectRecord = project as Record<string, unknown>;
  const snapshotRecord = snapshot as Record<string, unknown>;
  if (
    typeof projectRecord['id'] !== 'string' ||
    (snapshotRecord['state'] !== 'unpublished' && snapshotRecord['state'] !== 'published-current') ||
    (snapshotRecord['lastPublishedAt'] !== undefined && typeof snapshotRecord['lastPublishedAt'] !== 'string')
  ) {
    return undefined;
  }

  let currentPublication: ProjectShareEnvelope['currentPublication'];
  if (publication !== undefined && publication !== null) {
    if (typeof publication !== 'object' || Array.isArray(publication)) {
      return undefined;
    }
    const publicationRecord = publication as Record<string, unknown>;
    const { urls, access } = publicationRecord;
    if (
      typeof publicationRecord['id'] !== 'string' ||
      typeof publicationRecord['title'] !== 'string' ||
      (publicationRecord['description'] !== undefined &&
        publicationRecord['description'] !== null &&
        typeof publicationRecord['description'] !== 'string') ||
      (publicationRecord['visibility'] !== 'private' && publicationRecord['visibility'] !== 'public') ||
      typeof publicationRecord['createdAt'] !== 'string' ||
      !urls ||
      typeof urls !== 'object' ||
      Array.isArray(urls) ||
      typeof (urls as Record<string, unknown>)['share'] !== 'string' ||
      !access ||
      typeof access !== 'object' ||
      Array.isArray(access) ||
      !Array.isArray((access as Record<string, unknown>)['grants'])
    ) {
      return undefined;
    }
    currentPublication = {
      id: publicationRecord['id'],
      title: publicationRecord['title'],
      ...(typeof publicationRecord['description'] === 'string'
        ? { description: publicationRecord['description'] }
        : {}),
      visibility: publicationRecord['visibility'],
      createdAt: publicationRecord['createdAt'],
      urls: { share: (urls as Record<string, unknown>)['share'] as string },
      access: { grants: (access as Record<string, unknown>)['grants'] as PublicationAccessGrant[] },
    };
  }
  return {
    project: {
      id: projectRecord['id'],
      ...(typeof projectRecord['name'] === 'string' ? { name: projectRecord['name'] } : {}),
      ...(typeof projectRecord['description'] === 'string' ? { description: projectRecord['description'] } : {}),
    },
    ...(currentPublication ? { currentPublication } : {}),
    snapshot: {
      state: snapshotRecord['state'],
      ...(typeof snapshotRecord['lastPublishedAt'] === 'string'
        ? { lastPublishedAt: snapshotRecord['lastPublishedAt'] }
        : {}),
    },
  };
};

/** Return the project update time in milliseconds. */
const getProjectUpdatedAtTime = (value: ProjectSharePanelProps['projectUpdatedAt']): number | undefined => {
  if (value === undefined) {
    return undefined;
  }

  const ms = value instanceof Date ? value.getTime() : new Date(value).getTime();
  return Number.isNaN(ms) ? undefined : ms;
};

const getSnapshotState = (
  envelope: ProjectShareEnvelope,
  projectUpdatedAt: ProjectSharePanelProps['projectUpdatedAt'],
): 'unpublished' | 'published-current' | 'published-stale' => {
  if (!envelope.currentPublication) {
    return 'unpublished';
  }

  /** Milliseconds. */
  const updatedAt = getProjectUpdatedAtTime(projectUpdatedAt);
  /** Milliseconds. */
  const publishedAt = new Date(envelope.currentPublication.createdAt).getTime();
  if (updatedAt !== undefined && !Number.isNaN(publishedAt) && updatedAt > publishedAt + 1000) {
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

function ShareMethodPicker({
  isDisabled = false,
  value,
  onChange,
  isPortableEnabled = true,
}: {
  readonly isDisabled?: boolean;
  readonly value: ShareMethod;
  readonly onChange: (value: ShareMethod) => void;
  readonly isPortableEnabled?: boolean;
}): React.JSX.Element | undefined {
  if (!isPortableEnabled) {
    return undefined;
  }

  const selectedDescriptor = shareMethodDescriptors.find((descriptor) => descriptor.id === value);
  if (!selectedDescriptor) {
    return undefined;
  }

  return (
    <div className='min-w-0'>
      <p className='mb-1.5 text-xs font-medium text-muted-foreground'>Share with</p>
      <ComboBoxResponsive<ShareProviderDescriptor>
        groupedItems={shareMethodGroups}
        getValue={getShareMethodValue}
        value={selectedDescriptor}
        isSearchEnabled={false}
        title='Choose sharing method'
        description='Choose where to publish or store this project.'
        popoverProperties={{ className: 'w-[var(--radix-popover-trigger-width)] min-w-56' }}
        isDisabled={() => isDisabled}
        renderLabel={(descriptor, selectedItem) => {
          if (!isShareMethod(descriptor.id)) {
            return undefined;
          }
          return (
            <span className='flex w-full min-w-0 items-center justify-between gap-3'>
              <span className='flex min-w-0 items-center gap-2'>
                <ShareMethodIcon method={descriptor.id} className='size-4 shrink-0' />
                <span className='truncate'>{descriptor.label}</span>
              </span>
              {selectedItem?.id === descriptor.id ? <Check className='size-4 shrink-0' aria-hidden /> : null}
            </span>
          );
        }}
        onSelect={(next) => {
          if (isShareMethod(next)) {
            onChange(next);
          }
        }}
      >
        <Button
          type='button'
          variant='outline'
          size='sm'
          className='w-full min-w-0 justify-between'
          disabled={isDisabled}
          aria-label={`Share with ${selectedDescriptor.label}`}
        >
          <span className='flex min-w-0 items-center gap-2'>
            <ShareMethodIcon method={selectedDescriptor.id} className='size-4 shrink-0' />
            <span className='truncate'>{selectedDescriptor.label}</span>
          </span>
          <ChevronDown className='size-4 shrink-0 text-muted-foreground' aria-hidden />
        </Button>
      </ComboBoxResponsive>
    </div>
  );
}

function SharePanelFrame({
  children,
  description,
  isDisabled = false,
  isPortableEnabled,
  method,
  onMethodChange,
}: {
  readonly children: React.ReactNode;
  readonly description: string;
  readonly isDisabled?: boolean;
  readonly isPortableEnabled: boolean;
  readonly method: ShareMethod;
  readonly onMethodChange: (value: ShareMethod) => void;
}): React.JSX.Element {
  const titleId = useId();
  return (
    <section aria-labelledby={titleId} className='flex size-full min-h-0 min-w-0 flex-col bg-background'>
      <header className='shrink-0 border-b border-border p-4'>
        <h2 id={titleId} className='text-base font-semibold'>
          Share project
        </h2>
        <p className='mt-1 text-sm text-muted-foreground'>{description}</p>
        <div className='mt-4 min-w-0'>
          <ShareMethodPicker
            isDisabled={isDisabled}
            value={method}
            onChange={onMethodChange}
            isPortableEnabled={isPortableEnabled}
          />
        </div>
      </header>
      <div className='min-h-0 flex-1 overflow-y-auto p-4'>{children}</div>
    </section>
  );
}

function PortableShareBody({
  method,
  collectSnapshot,
  signIn,
  githubAuthorizationOutcome,
  onBusyChange,
}: {
  readonly method: Exclude<ShareMethod, 'tau'>;
  readonly collectSnapshot: (signal?: AbortSignal) => Promise<ShareProjectSnapshot>;
  readonly signIn: string;
  readonly githubAuthorizationOutcome?: 'returned' | 'cancelled' | 'failed';
  readonly onBusyChange: (busy: boolean) => void;
}): React.JSX.Element {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
  const [shareUrl, setShareUrl] = useState<string>();
  const [warnings, setWarnings] = useState<ShareProjectSnapshot['warnings']>([]);
  const [githubStatus, setGithubStatus] = useState<GithubGistConnectionStatus>();
  const [encrypted, setEncrypted] = useState(false);
  const [password, setPassword] = useState('');
  const [includePassword, setIncludePassword] = useState(true);
  const [publicGist, setPublicGist] = useState(false);
  const operationRef = useRef<AbortController | undefined>(undefined);
  const { ticked: copied, trigger: triggerCopiedTick } = useTickAnimation();

  useEffect(() => {
    onBusyChange(busy);
  }, [busy, onBusyChange]);
  useEffect(() => {
    return () => {
      operationRef.current?.abort();
    };
  }, []);
  useEffect(() => {
    let cancelled = false;
    setShareUrl(undefined);
    setError(undefined);
    setWarnings([]);
    if (method === 'github-gist') {
      setGithubStatus(undefined);
      const loadConnection = async (): Promise<void> => {
        try {
          const status = await getGithubGistConnectionStatus();
          if (!cancelled) {
            setGithubStatus(status);
          }
        } catch {
          if (!cancelled) {
            setError('Could not check the GitHub connection. Try again.');
          }
        }
      };
      // async-iife: bootstrap
      void loadConnection();
    }
    return () => {
      cancelled = true;
    };
  }, [method]);

  const publish = async (): Promise<void> => {
    const controller = new AbortController();
    operationRef.current?.abort();
    operationRef.current = controller;
    setBusy(true);
    setError(undefined);
    try {
      if (shareUrl) {
        await navigator.clipboard.writeText(shareUrl);
        triggerCopiedTick();
        toast.success('Link copied');
        return;
      }
      const provider = await shareProviderRegistry.load(method);
      const providerPublish = provider.publish;
      if (!providerPublish) {
        throw new Error('This sharing method cannot publish projects.');
      }
      const snapshot = await collectSnapshot(controller.signal);
      setWarnings(snapshot.warnings);
      const url = await withBrowserShareProviderContext(async (context) => {
        const publication = await providerPublish(
          {
            snapshot,
            protection: encrypted ? { kind: 'password', password, includePassword } : { kind: 'none' },
            visibility: method === 'github-gist' && publicGist ? 'public' : 'unlisted',
            signal: controller.signal,
          },
          context,
        );
        return formatShareUrl({
          origin: context.origin,
          locator: publication.locator,
          secrets: publication.secrets,
        });
      });
      setShareUrl(url);
      try {
        await navigator.clipboard.writeText(url);
        triggerCopiedTick();
        toast.success(method === 'direct' ? 'Direct link copied' : 'GitHub Gist link copied');
      } catch {
        setError('The link was created but clipboard access was denied. Copy it below.');
      }
    } catch (error) {
      if (isShareError(error) && error.code === 'SHARE_PERMISSION_REQUIRED') {
        setGithubStatus('permission-required');
      } else if (isShareError(error) && error.code === 'SHARE_AUTH_REQUIRED') {
        setGithubStatus('not-connected');
      }
      setError(error instanceof Error ? error.message : 'Sharing failed.');
    } finally {
      if (operationRef.current === controller) {
        operationRef.current = undefined;
      }
      setBusy(false);
    }
  };

  const connect = async (): Promise<void> => {
    setBusy(true);
    setError(undefined);
    try {
      await connectGithubGist({
        returnUrl: globalThis.location.href,
        surface: 'editor',
      });
    } catch (error) {
      setError(error instanceof Error ? error.message : 'GitHub authorization failed.');
      setBusy(false);
    }
  };

  const isDirect = method === 'direct';
  const passwordBytes = new TextEncoder().encode(password.normalize('NFC')).byteLength;
  const passwordValid =
    !encrypted || (passwordBytes >= sharePasswordLimits.minBytes && passwordBytes <= sharePasswordLimits.maxBytes);
  const needsConnection = !isDirect && githubStatus !== 'connected';
  const connectionLabel =
    githubStatus === 'permission-required'
      ? 'Allow Gist access'
      : githubStatus === 'not-connected'
        ? 'Connect GitHub'
        : 'Sign in';
  return (
    <div className='flex flex-col gap-4'>
      <div className='rounded-lg border bg-muted/30 p-4'>
        <div className='flex items-start gap-3'>
          {isDirect ? (
            <ShieldCheck className='mt-0.5 size-5 text-primary' aria-hidden />
          ) : (
            <SvgIcon id='github' className='mt-0.5 size-5' aria-hidden />
          )}
          <div className='min-w-0 text-sm'>
            <p className='font-medium'>{encrypted ? 'Password-encrypted in your browser' : 'No upload through Tau'}</p>
            <p className='mt-1 text-muted-foreground'>
              {encrypted
                ? 'The password can travel in the link or be shared separately. Files remain in memory until download or remix.'
                : isDirect
                  ? 'The compressed project stays in the URL. Anyone with the link can open it.'
                  : 'GitHub stores the compressed project; Tau only opens it in memory.'}
            </p>
          </div>
        </div>
      </div>
      <div className='flex flex-col gap-3'>
        <div className='flex items-start gap-2'>
          <Checkbox
            id='portable-share-encrypted'
            checked={encrypted}
            disabled={busy || Boolean(shareUrl)}
            onCheckedChange={(checked) => {
              setEncrypted(checked === true);
            }}
          />
          <Label htmlFor='portable-share-encrypted' className='font-normal'>
            Encrypt with a password
          </Label>
        </div>
        {encrypted ? (
          <div className='ml-6 flex flex-col gap-3'>
            <div className='flex flex-col gap-2'>
              <Label htmlFor='portable-share-password'>Password</Label>
              <Input
                id='portable-share-password'
                type='password'
                autoComplete='new-password'
                value={password}
                disabled={busy || Boolean(shareUrl)}
                aria-invalid={password.length > 0 && !passwordValid}
                onChange={(event) => {
                  setPassword(event.target.value);
                }}
              />
              <p className='text-xs text-muted-foreground'>
                Use {sharePasswordLimits.minBytes}–{sharePasswordLimits.maxBytes} UTF-8 bytes ({passwordBytes} entered).
              </p>
            </div>
            <div className='flex items-start gap-2'>
              <Checkbox
                id='portable-share-include-password'
                checked={includePassword}
                disabled={busy || Boolean(shareUrl)}
                onCheckedChange={(checked) => {
                  setIncludePassword(checked === true);
                }}
              />
              <Label htmlFor='portable-share-include-password' className='font-normal'>
                Include password in the link
              </Label>
            </div>
          </div>
        ) : null}
        {isDirect ? null : (
          <div className='flex items-start gap-2'>
            <Checkbox
              id='portable-share-public-gist'
              checked={publicGist}
              disabled={busy || Boolean(shareUrl)}
              onCheckedChange={(checked) => {
                setPublicGist(checked === true);
              }}
            />
            <Label htmlFor='portable-share-public-gist' className='font-normal'>
              Publish as a public Gist
            </Label>
          </div>
        )}
      </div>
      {isDirect ? (
        <p className='text-sm text-purple dark:text-purple/70'>Sign in to persist a Tau-hosted share.</p>
      ) : null}
      {!isDirect && githubAuthorizationOutcome ? (
        <div className='rounded-md border border-purple/30 bg-purple/10 px-3 py-2 text-sm text-purple dark:text-purple/80'>
          {githubAuthorizationOutcome === 'returned'
            ? 'GitHub authorization returned. Checking Gist access…'
            : githubAuthorizationOutcome === 'cancelled'
              ? 'GitHub Gist access was not granted.'
              : 'GitHub authorization could not be completed. Try again.'}
        </div>
      ) : null}
      {!isDirect && githubStatus && githubStatus !== 'connected' ? (
        <div className='rounded-md border border-purple/30 bg-purple/10 px-3 py-2 text-sm text-purple dark:text-purple/80'>
          {githubStatus === 'signed-out'
            ? 'Sign in to Tau before connecting GitHub.'
            : githubStatus === 'permission-required'
              ? 'GitHub is connected, but Tau needs Gist access before it can publish.'
              : 'Connect GitHub to create a Gist.'}
        </div>
      ) : null}
      {error ? (
        <div className='rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive'>
          {error}
        </div>
      ) : null}
      {warnings.length > 0 ? (
        <div className='border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-300 rounded-md border px-3 py-2 text-sm'>
          Shared with {warnings.length} unresolved {warnings.length === 1 ? 'dependency' : 'dependencies'}.
        </div>
      ) : null}
      {shareUrl ? <Input aria-label='Share link' readOnly value={shareUrl} /> : null}
      <div className='flex flex-wrap justify-end gap-2'>
        {!isDirect && githubStatus === 'signed-out' ? (
          <Button asChild>
            <NavLink to={signIn}>Sign in</NavLink>
          </Button>
        ) : (
          <Button
            type='button'
            disabled={busy || !passwordValid || (!isDirect && githubStatus === undefined)}
            onClick={() => {
              void (needsConnection ? connect() : publish());
            }}
          >
            {busy ? (
              <Loader2 className='size-4 animate-spin' aria-hidden />
            ) : copied ? (
              <Check className='size-3.5' aria-hidden />
            ) : isDirect ? (
              <Link2 className='size-3.5' aria-hidden />
            ) : (
              <SvgIcon id='github' className='size-3.5' aria-hidden />
            )}
            <span>
              {needsConnection
                ? connectionLabel
                : shareUrl
                  ? 'Copy link'
                  : isDirect
                    ? 'Copy direct link'
                    : 'Create Gist and copy link'}
            </span>
          </Button>
        )}
      </div>
    </div>
  );
}

export function ProjectSharePanel(properties: ProjectSharePanelProps): React.JSX.Element {
  const {
    projectId,
    projectName,
    projectDescription = '',
    projectUpdatedAt,
    entryPath,
    parameters,
    collectSnapshot,
    initialMethod,
    githubAuthorizationOutcome,
  } = properties;
  const { pathname, search } = useLocation();
  const [shareMethod, setShareMethod] = useState<ShareMethod>(initialMethod ?? (collectSnapshot ? 'direct' : 'tau'));
  const [portableBusy, setPortableBusy] = useState(false);
  const { fileManagerRef } = useFileManager();
  const signInReturnTo = useMemo(() => {
    const authorizationReturn = parseGithubGistAuthorizationReturn(search);
    const parameters = new URLSearchParams(authorizationReturn?.remainingSearch ?? search);
    parameters.set('workbench', 'share');
    parameters.set('shareProvider', shareMethod);
    return `${pathname}?${parameters.toString()}`;
  }, [pathname, search, shareMethod]);
  const { signIn } = useAuthLinks({ redirectTo: signInReturnTo });
  const publishRef = useActorRef(publishMachine, {
    input: {
      fileManagerRef,
      projectId,
      projectName,
      entryPath,
      parameters,
      ...(collectSnapshot
        ? {
            collectFiles: async (signal: AbortSignal) => {
              const snapshot = await collectSnapshot(signal);
              return new Map(snapshot.files.map((file) => [file.path, file.content]));
            },
          }
        : {}),
    },
  });

  const publishState = useSelector(publishRef, (state) => state.value);
  const publishShareUrl = useSelector(publishRef, (state) => state.context.shareUrl);
  const publishError = useSelector(publishRef, (state) => state.context.error);

  const apiBaseUrl = useMemo(() => ENV.TAU_API_URL.replace(/\/$/u, ''), []);
  const [envelope, setEnvelope] = useState<ProjectShareEnvelope>();
  const [loadingEnvelope, setLoadingEnvelope] = useState(false);
  const [envelopeError, setEnvelopeError] = useState<string | undefined>();
  const [visibility, setVisibility] = useState<PublishVisibility>('private');
  const entitlements = useEntitlements();
  const { canCreatePrivateShares } = entitlements;
  // Free tier publishes public-only (T4/T5/AD11); derived so an async
  // entitlements load never strands a locked selection in form state.
  const effectiveVisibility: PublishVisibility = canCreatePrivateShares ? visibility : 'public';
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
    if (shareMethod === 'tau') {
      void loadEnvelope();
    }
  }, [loadEnvelope, shareMethod]);

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
  const sharedEmailError = effectiveVisibility === 'private' ? getPublicationEmailTagsError(sharedEmails) : undefined;
  const canPublish = title.trim().length > 0 && !sharedEmailError && !busy;
  const formattedError = formatPublishError(publishError);
  const snapshotState = useMemo(
    () => (envelope ? getSnapshotState(envelope, projectUpdatedAt) : 'unpublished'),
    [envelope, projectUpdatedAt],
  );

  if (shareMethod !== 'tau' && collectSnapshot) {
    return (
      <SharePanelFrame
        method={shareMethod}
        isDisabled={portableBusy}
        onMethodChange={setShareMethod}
        isPortableEnabled
        description={
          shareMethod === 'direct'
            ? 'Create a self-contained link that works without a Tau account or storage.'
            : 'Store a portable project artifact in a revision-pinned GitHub Gist.'
        }
      >
        <PortableShareBody
          method={shareMethod}
          collectSnapshot={collectSnapshot}
          signIn={signIn}
          githubAuthorizationOutcome={githubAuthorizationOutcome}
          onBusyChange={setPortableBusy}
        />
      </SharePanelFrame>
    );
  }

  const handlePublish = (): void => {
    publishRef.send({
      type: 'publish',
      visibility: effectiveVisibility,
      title: title.trim(),
      ...(description.trim() === '' ? {} : { description: description.trim() }),
      ...(effectiveVisibility === 'private' && sharedEmails.length > 0 ? { sharedEmails } : {}),
    });
  };

  const handleVisibilityChange = async (nextVisibility: PublishVisibility): Promise<void> => {
    const publication = envelope?.currentPublication;
    if (!publication || publication.visibility === nextVisibility || visibilityMutating) {
      return;
    }
    // Switching TO private is Pro-gated (T4/T5); the server 403s anyway — route
    // the user to the upgrade surface instead of a failing request.
    if (nextVisibility === 'private' && !canCreatePrivateShares) {
      openSettingsDialog('billing');
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
    const signInRequired = envelopeError === 'SIGN_IN_REQUIRED';
    return (
      <SharePanelFrame
        method={shareMethod}
        isDisabled={busy || visibilityMutating}
        onMethodChange={setShareMethod}
        isPortableEnabled={Boolean(collectSnapshot)}
        description={
          signInRequired ? 'Sign in to persist this project with Tau.' : 'Tau-hosted sharing is unavailable right now.'
        }
      >
        <div className='flex flex-col gap-4'>
          <div
            className={cn(
              'rounded-md border px-3 py-2 text-sm',
              signInRequired
                ? 'border-purple/30 bg-purple/10 text-purple dark:text-purple/80'
                : 'border-border bg-muted/40 text-muted-foreground',
            )}
          >
            {signInRequired
              ? 'A Tau account keeps this hosted share available over time.'
              : 'Check your connection and try again.'}
          </div>
          <div className='flex justify-end'>
            {signInRequired ? (
              <Button asChild>
                <NavLink to={signIn}>Sign in</NavLink>
              </Button>
            ) : (
              <Button type='button' onClick={() => void loadEnvelope()}>
                Try again
              </Button>
            )}
          </div>
        </div>
      </SharePanelFrame>
    );
  }

  if (loadingEnvelope) {
    return (
      <SharePanelFrame
        method={shareMethod}
        isDisabled={busy}
        onMethodChange={setShareMethod}
        isPortableEnabled={Boolean(collectSnapshot)}
        description='Loading sharing settings…'
      >
        <div className='flex min-h-36 items-center justify-center'>
          <Loader2 className='size-5 animate-spin text-muted-foreground' aria-hidden />
        </div>
      </SharePanelFrame>
    );
  }

  const publication = envelope?.currentPublication;

  if (publication) {
    return (
      <SharePanelFrame
        method={shareMethod}
        isDisabled={busy || visibilityMutating}
        onMethodChange={setShareMethod}
        isPortableEnabled={Boolean(collectSnapshot)}
        description={getSnapshotCopy(snapshotState)}
      >
        <div className='flex flex-col gap-4'>
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

          <div className='flex justify-end'>
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
          </div>
        </div>
      </SharePanelFrame>
    );
  }

  return (
    <SharePanelFrame
      method={shareMethod}
      isDisabled={busy}
      onMethodChange={setShareMethod}
      isPortableEnabled={Boolean(collectSnapshot)}
      description={`${getSnapshotCopy('unpublished')} Uploads up to ${publishMaxFiles} files (${publishMaxTotalBytes / (1024 * 1024)} MiB total, ${publishMaxFileBytes / (1024 * 1024)} MiB per file).`}
    >
      <div className='flex flex-col gap-4'>
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
              value={effectiveVisibility}
              disabled={busy}
              onValueChange={(value) => {
                setVisibility(value as PublishVisibility);
              }}
              className='flex flex-col gap-2'
            >
              <div className='flex items-center gap-2'>
                <RadioGroupItem value='private' id='share-vis-private' disabled={!canCreatePrivateShares} />
                <Label
                  htmlFor='share-vis-private'
                  className={cn('font-normal', !canCreatePrivateShares && 'text-muted-foreground')}
                >
                  Private (only you and people you share with)
                </Label>
                {canCreatePrivateShares ? undefined : (
                  <button
                    type='button'
                    className='inline-flex items-center gap-1 text-xs text-muted-foreground underline-offset-2 hover:underline'
                    onClick={() => {
                      openSettingsDialog('billing');
                    }}
                  >
                    <ProBadge />
                    Upgrade
                  </button>
                )}
              </div>
              <div className='flex items-center gap-2'>
                <RadioGroupItem value='public' id='share-vis-public' />
                <Label htmlFor='share-vis-public' className='font-normal'>
                  Public
                </Label>
              </div>
            </RadioGroup>
          </div>
          {effectiveVisibility === 'private' ? (
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

        <div className='flex justify-end'>
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
        </div>
      </div>
    </SharePanelFrame>
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
