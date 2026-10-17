import { useQuery } from '@tanstack/react-query';
import { useSettingsDialog } from '#hooks/use-settings-dialog.js';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { ComponentType, ReactNode } from 'react';
import { NavLink, useLocation } from 'react-router';
import { Check, Link2, Loader2, RefreshCw, ShieldCheck } from 'lucide-react';
import { sharePasswordLimits } from '@taucad/share/artifact';
import { formatShareUrl } from '@taucad/share/locator';
import type { ShareLocator } from '@taucad/share/locator';
import { isShareError } from '@taucad/share/provider';
import type { ShareProtection, ShareProviderDescriptor } from '@taucad/share/provider';
import type { ShareProjectSnapshot } from '@taucad/share/snapshot';
import { Button } from '@taucad/ui/components/button';
import { Input } from '@taucad/ui/components/input';
import { Textarea } from '@taucad/ui/components/textarea';
import { Label } from '@taucad/ui/components/label';
import { RadioGroup, RadioGroupItem } from '@taucad/ui/components/radio-group';
import { WorkbenchPanesHostProvider } from '@taucad/workbench-panes/host/workbench-host';
import type { WorkbenchPanesHost, WorkbenchUnit } from '@taucad/workbench-panes/host/workbench-host';
import { SharePane, SharePaneFrame } from '@taucad/workbench-panes/share/share-pane';
import type {
  ShareLinkContext,
  ShareLinkExtension,
  ShareLinkMethod,
  ShareLinkOutcome,
  ShareLinkRequest,
  ShareMethodIcon,
  ShareMethodSource,
  ShareSource,
} from '@taucad/workbench-panes/share/share-source';
import { toast } from '#components/ui/sonner.js';
import { useAuthLinks } from '#hooks/use-auth-links.js';
import { useCookie } from '#hooks/use-cookie.js';
import { cookieName } from '#constants/cookie.constants.js';
import { GithubGistManagement } from '#components/share/github-gist-management.js';
import { useTickAnimation } from '@taucad/ui/hooks/use-tick-animation';
import type { PublishDraft, PublishFacet, PublishVisibility } from '@taucad/revisions';
import { useRevisionCommands, useRevisionStatus } from '#hooks/use-revision-status.js';
import { PublicationEmailTagsField, getPublicationEmailTagsError } from '#components/publish/publication-email-tags.js';
import { PublicationAccessPanel } from '#components/publish/publication-access-panel.js';
import type { PublicationAccessGrant } from '#components/publish/publication-access-panel.js';
import { ENV } from '#environment.config.js';
import { cn } from '@taucad/ui/utils/cn';
import { CommercialUpgradeLabel, useCommercialFeatures } from '#cloud/commercial-features.js';
import {
  awaitGithubGistConnection,
  connectGithubGist,
  getGithubGistConnectionStatus,
  parseGithubGistAuthorizationReturn,
  shareProviderRegistry,
  withBrowserShareProviderContext,
} from '#lib/share-providers.js';
import { SvgIcon } from '#components/icons/svg-icon.js';
import { isDesktopTarget } from '#lib/build-target.js';

/**
 * What wraps the shared Share pane with the host it reads: the project's workbench host in the workbench, or a
 * stand-alone host with no units.
 */
export type ProjectShareHost = ComponentType<{
  readonly source: ShareSource;
  readonly children: ReactNode;
}>;

export type ProjectSharePanelProps = {
  readonly projectId: string;
  readonly projectName: string;
  readonly projectDescription?: string;
  readonly projectUpdatedAt?: Date | number | string;
  readonly entryPath: string;
  readonly collectSnapshot?: (signal?: AbortSignal) => Promise<ShareProjectSnapshot>;
  readonly initialMethod?: ShareMethod;
  readonly githubAuthorizationOutcome?: 'returned' | 'cancelled' | 'failed';
  readonly githubAuthorizationFailure?: string;
  /** The host the pane reads; a stand-alone host with no units when absent. */
  readonly host?: ProjectShareHost;
};

export type ShareMethod = 'direct' | 'tau' | 'github-gist';

const isShareMethod = (value: string): value is ShareMethod =>
  value === 'direct' || value === 'tau' || value === 'github-gist';

const shareMethodDescriptors = shareProviderRegistry.descriptors.filter(
  (descriptor): descriptor is ShareProviderDescriptor & { readonly id: ShareMethod } =>
    isShareMethod(descriptor.id) && descriptor.capabilities.includes('project.publish'),
);

/**
 * The sharing method this panel opens on.
 *
 * A method named by the link (a GitHub return, a sign-in return) or chosen in
 * this panel wins; otherwise the one this person chose last time (R8), as long
 * as the panel still offers it; otherwise a direct link. A panel that cannot
 * collect a snapshot offers only the hosted link.
 *
 * @param chosen - The method named by the link or picked in this panel.
 * @param remembered - The stored preference, unvalidated.
 * @param isPortableEnabled - Whether portable methods can collect a snapshot here.
 * @returns The method to show.
 */
const resolveShareMethod = (
  chosen: ShareMethod | undefined,
  remembered: unknown,
  isPortableEnabled: boolean,
): ShareMethod => {
  if (!isPortableEnabled) {
    return 'tau';
  }
  if (chosen) {
    return chosen;
  }
  const offered = shareMethodDescriptors.find((descriptor) => descriptor.id === remembered);
  return offered?.id ?? 'direct';
};

const DirectIcon: ShareMethodIcon = Link2;
const TauIcon: ShareMethodIcon = ({ className }) => <SvgIcon id='tau' className={className} aria-hidden />;
const GithubIcon: ShareMethodIcon = ({ className }) => <SvgIcon id='github' className={className} aria-hidden />;

const noUnits = (): readonly WorkbenchUnit[] => [];

/** The pane's host outside the workbench: no units, only this source. */
function StandaloneShareHost({
  source,
  children,
}: {
  readonly source: ShareSource;
  readonly children: ReactNode;
}): React.JSX.Element {
  const host = useMemo((): WorkbenchPanesHost => ({ useUnits: noUnits, share: source }), [source]);
  return <WorkbenchPanesHostProvider value={host}>{children}</WorkbenchPanesHostProvider>;
}

type ProjectShareEnvelope = {
  project: {
    id: string;
    name?: string;
    description?: string;
  };
  currentPublication?: {
    id: string;
    tag: string;
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

/** Before the worker has answered, the dialog renders as an idle dialog. */
const emptyPublishFacet: PublishFacet = {
  phase: 'idle',
  tags: [],
  publicationId: undefined,
  shareUrl: undefined,
  error: undefined,
};

/**
 * The next free `v<n>` for a project that already has some names.
 *
 * @param names - Names this project already uses.
 * @returns A name nothing in the project holds.
 */
export const nextVersionName = (names: readonly string[]): string => {
  const taken = new Set(names);
  let index = 1;
  while (taken.has(`v${String(index)}`)) {
    index += 1;
  }
  return `v${String(index)}`;
};

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
      typeof publicationRecord['tag'] !== 'string' ||
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
      tag: publicationRecord['tag'],
      title: publicationRecord['title'],
      ...(typeof publicationRecord['description'] === 'string'
        ? { description: publicationRecord['description'] }
        : {}),
      visibility: publicationRecord['visibility'],
      createdAt: publicationRecord['createdAt'],
      urls: { share: (urls as Record<string, unknown>)['share'] as string },
      access: {
        grants: (access as Record<string, unknown>)['grants'] as PublicationAccessGrant[],
      },
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

type PortableMethod = Exclude<ShareMethod, 'tau'>;

const describeWarnings = (warnings: ShareProjectSnapshot['warnings']): string | undefined =>
  warnings.length > 0
    ? `Shared with ${String(warnings.length)} unresolved ${warnings.length === 1 ? 'dependency' : 'dependencies'}.`
    : undefined;

const failureMessage = (failure: unknown): string => (failure instanceof Error ? failure.message : 'Sharing failed.');

type PortablePublication = {
  readonly locator: ShareLocator;
  readonly protection: ShareProtection;
};

type PortableResult =
  | (PortablePublication & {
      readonly url: string;
      readonly warning: string | undefined;
    })
  | { readonly failure: unknown; readonly warning: string | undefined };

/**
 * Collect the snapshot and publish it through one portable provider.
 *
 * @param method - The provider.
 * @param collectSnapshot - Collects the project snapshot.
 * @param request - The protection and options the person chose.
 * @returns The link and what it points at, or the failure; either with the snapshot's warning once it was collected.
 */
const publishPortable = async (
  method: PortableMethod,
  collectSnapshot: (signal?: AbortSignal) => Promise<ShareProjectSnapshot>,
  { protection, options, signal }: ShareLinkRequest,
): Promise<PortableResult> => {
  let warning: string | undefined;
  try {
    const provider = await shareProviderRegistry.load(method);
    const providerPublish = provider.publish;
    if (!providerPublish) {
      throw new Error('This sharing method cannot publish projects.');
    }
    const snapshot = await collectSnapshot(signal);
    warning = describeWarnings(snapshot.warnings);
    const { url, locator } = await withBrowserShareProviderContext(async (context) => {
      const published = await providerPublish(
        {
          snapshot,
          protection,
          visibility: method === 'github-gist' && options['public-gist'] === true ? 'public' : 'unlisted',
          signal,
        },
        context,
      );
      return {
        url: formatShareUrl({
          origin: context.origin,
          locator: published.locator,
          secrets: published.secrets,
        }),
        locator: published.locator,
      };
    });
    return { url, locator, protection, warning };
  } catch (error) {
    return { failure: error, warning };
  }
};

const featureCalloutClassName =
  'rounded-md border border-feature/30 bg-feature/10 px-3 py-2 text-sm text-feature dark:text-feature/80';

type GithubGistExtensionOptions = {
  readonly collectSnapshot: (signal?: AbortSignal) => Promise<ShareProjectSnapshot>;
  readonly signIn: string;
  readonly githubAuthorizationOutcome?: 'returned' | 'cancelled' | 'failed';
  readonly githubAuthorizationFailure?: string;
};

/**
 * The GitHub Gist method's part of the link body: the Gist connection it needs before sharing, the browser grant on
 * desktop, and management of the Gist this panel made (R8).
 *
 * @param context - The link body's state.
 * @param options - The snapshot collector, the sign-in link and the outcome of a GitHub return.
 * @returns What the body adds.
 */
function useGithubGistExtension(
  context: ShareLinkContext,
  { collectSnapshot, signIn, githubAuthorizationOutcome, githubAuthorizationFailure }: GithubGistExtensionOptions,
): ShareLinkExtension {
  const { setBusy, setError, setShareUrl, reset, focusPrimary } = context;
  /* The Gist this panel made, so it can be managed where it was made (R8). */
  const [publication, setPublication] = useState<PortablePublication>();
  const settings = useSettingsDialog();
  const githubCapability = useQuery({
    queryKey: ['github', 'gist-status'],
    queryFn: getGithubGistConnectionStatus,
    retry: false,
    staleTime: 0,
  });
  const githubStatus = githubCapability.data;
  /* D16c: desktop runs the Gist grant in the system browser and waits here for it. */
  const [browserConsent, setBrowserConsent] = useState<'waiting' | 'cancelled' | 'timed-out'>();
  const consentRef = useRef<AbortController | undefined>(undefined);

  /* The Cancel that was clicked unmounts; focus returns to the button that started the grant. */
  useEffect(() => {
    if (browserConsent === 'cancelled') {
      focusPrimary();
    }
  }, [browserConsent, focusPrimary]);
  useEffect(
    () => () => {
      consentRef.current?.abort();
    },
    [],
  );

  const connect = async (): Promise<void> => {
    setBusy(true);
    setError(undefined);
    setBrowserConsent(undefined);
    try {
      const handoff = await connectGithubGist({
        returnUrl: globalThis.location.href,
        surface: 'editor',
      });
      if (handoff === 'redirect') {
        return;
      }
      const consent = new AbortController();
      consentRef.current = consent;
      setBrowserConsent('waiting');
      const connected = await awaitGithubGistConnection(consent.signal);
      if (consent.signal.aborted) {
        return;
      }
      consentRef.current = undefined;
      setBrowserConsent(connected ? undefined : 'timed-out');
      if (connected) {
        await githubCapability.refetch();
      }
      setBusy(false);
    } catch (error) {
      setError(error instanceof Error ? error.message : 'GitHub authorization failed.');
      setBusy(false);
    }
  };

  const cancelBrowserConsent = (): void => {
    consentRef.current?.abort();
    consentRef.current = undefined;
    setBrowserConsent('cancelled');
    setBusy(false);
  };

  /* Unpublished: the link is gone, so the panel offers to make a new one. */
  const forgetPublication = (): void => {
    setPublication(undefined);
    reset();
  };

  const share = async (request: ShareLinkRequest): Promise<ShareLinkOutcome> => {
    const result = await publishPortable('github-gist', collectSnapshot, request);
    if ('failure' in result) {
      if (
        isShareError(result.failure) &&
        (result.failure.code === 'SHARE_PERMISSION_REQUIRED' || result.failure.code === 'SHARE_AUTH_REQUIRED')
      ) {
        void githubCapability.refetch();
      }
      return { error: failureMessage(result.failure), warning: result.warning };
    }
    setPublication({ locator: result.locator, protection: result.protection });
    return { url: result.url, warning: result.warning };
  };

  const needsConnection = githubStatus !== 'connected';
  const connectionLabel =
    githubStatus === 'disabled'
      ? 'Manage Gist sharing'
      : githubStatus === 'reconnect-required'
        ? 'Reconnect GitHub'
        : githubStatus === 'permission-required'
          ? 'Allow Gist access'
          : githubStatus === 'not-connected'
            ? 'Connect GitHub'
            : 'Sign in';

  return {
    error: githubCapability.error ? 'Could not check the GitHub connection. Try again.' : undefined,
    isPending: githubStatus === undefined,
    share,
    callouts: (
      <>
        {/* `returned` is the wait for the status check, so it goes once that answers:
         * connected needs no words, and anything else has its own line below. */}
        {githubAuthorizationOutcome && !(githubAuthorizationOutcome === 'returned' && githubStatus !== undefined) ? (
          <div className={featureCalloutClassName}>
            {githubAuthorizationOutcome === 'returned'
              ? 'GitHub authorization returned. Checking Gist access…'
              : githubAuthorizationOutcome === 'cancelled'
                ? 'GitHub Gist access was not granted.'
                : (githubAuthorizationFailure ?? 'GitHub authorization could not be completed. Try again.')}
          </div>
        ) : null}
        {browserConsent ? (
          <div role='status' className={featureCalloutClassName}>
            {browserConsent === 'waiting'
              ? 'Finish in your browser. Tau continues here once GitHub grants Gist access.'
              : browserConsent === 'cancelled'
                ? 'Stopped waiting for your browser. Gist access was not changed here.'
                : 'Gist access did not arrive within 10 minutes. Try again.'}
          </div>
        ) : null}
        {githubStatus && githubStatus !== 'connected' && browserConsent !== 'waiting' ? (
          <div className={featureCalloutClassName}>
            {githubStatus === 'disabled'
              ? 'Gist sharing is off in Tau. Enable it in Security settings to share again.'
              : githubStatus === 'reconnect-required'
                ? 'Reconnect GitHub to verify access before sharing.'
                : githubStatus === 'signed-out'
                  ? 'Sign in to Tau before connecting GitHub.'
                  : githubStatus === 'permission-required'
                    ? 'GitHub is connected, but Tau needs Gist access before it can publish.'
                    : 'Connect GitHub to create a Gist.'}
          </div>
        ) : null}
      </>
    ),
    actions: (
      <>
        {publication && githubStatus === 'connected' ? (
          <GithubGistManagement
            locator={publication.locator}
            protection={publication.protection}
            collectSnapshot={collectSnapshot}
            onRepublished={setShareUrl}
            onUnpublished={forgetPublication}
            surface='editor'
          />
        ) : null}
        {browserConsent === 'waiting' ? (
          <Button type='button' variant='ghost' onClick={cancelBrowserConsent}>
            Cancel
          </Button>
        ) : null}
      </>
    ),
    primary:
      githubStatus === 'signed-out'
        ? {
            element: (
              <Button asChild>
                <NavLink to={signIn}>Sign in</NavLink>
              </Button>
            ),
          }
        : needsConnection
          ? {
              label: connectionLabel,
              onActivate: () => {
                if (githubStatus === 'disabled') {
                  settings.open('security', 'github-permissions');
                } else {
                  void connect();
                }
              },
            }
          : undefined,
  };
}

/**
 * The direct link and GitHub Gist methods over one snapshot collector.
 *
 * @param options - The snapshot collector, the sign-in link and the outcome of a GitHub return.
 * @returns The two link methods, in registry order.
 */
const usePortableShareMethods = (
  options: GithubGistExtensionOptions,
): Readonly<Record<PortableMethod, ShareLinkMethod>> => {
  const { collectSnapshot, signIn, githubAuthorizationOutcome, githubAuthorizationFailure } = options;
  return useMemo(() => {
    const labelOf = (id: ShareMethod): string =>
      shareMethodDescriptors.find((descriptor) => descriptor.id === id)?.label ?? id;
    const encryption = {
      minBytes: sharePasswordLimits.minBytes,
      maxBytes: sharePasswordLimits.maxBytes,
      notice: {
        title: `Password-encrypted ${isDesktopTarget() ? 'on your computer' : 'in your browser'}`,
        text: 'The password can travel in the link or be shared separately. Files remain in memory until download or remix.',
      },
    };
    const extensionOptions = {
      collectSnapshot,
      signIn,
      githubAuthorizationOutcome,
      githubAuthorizationFailure,
    };
    const portableShare =
      (method: PortableMethod) =>
      async (request: ShareLinkRequest): Promise<ShareLinkOutcome> => {
        const result = await publishPortable(method, collectSnapshot, request);
        return 'failure' in result
          ? { error: failureMessage(result.failure), warning: result.warning }
          : { url: result.url, warning: result.warning };
      };
    return {
      direct: {
        kind: 'link',
        id: 'direct',
        label: labelOf('direct'),
        icon: DirectIcon,
        description: 'Create a self-contained link that works without a Tau account or storage.',
        notice: {
          icon: <ShieldCheck className='mt-0.5 size-5 text-primary' aria-hidden />,
          title: 'No upload through Tau',
          text: 'The compressed project stays in the URL. Anyone with the link can open it.',
        },
        encryption,
        action: { label: 'Copy direct link', icon: DirectIcon },
        copiedMessage: 'Direct link copied',
        share: portableShare('direct'),
      },
      'github-gist': {
        kind: 'link',
        id: 'github-gist',
        label: labelOf('github-gist'),
        icon: GithubIcon,
        description: 'Store a portable project artifact in a revision-pinned GitHub Gist.',
        notice: {
          icon: <SvgIcon id='github' className='mt-0.5 size-5' aria-hidden />,
          title: 'Stored on GitHub',
          text: 'Tau sends the compressed project to GitHub using your Gist connection.',
        },
        encryption,
        options: [{ id: 'public-gist', label: 'Publish as a public Gist' }],
        action: { label: 'Create Gist and copy link', icon: GithubIcon },
        copiedMessage: 'GitHub Gist link copied',
        /* The pane keys a body by method and calls this once per render of it, so it is a hook of that body. */
        // oxlint-disable-next-line react-hooks/rules-of-hooks -- called by the link body as its own hook.
        useExtension: (context) => useGithubGistExtension(context, extensionOptions),
        share: portableShare('github-gist'),
      },
    };
  }, [collectSnapshot, githubAuthorizationFailure, githubAuthorizationOutcome, signIn]);
};

type TauShareOptions = {
  readonly projectId: string;
  readonly projectName: string;
  readonly projectDescription: string;
  readonly projectUpdatedAt: ProjectSharePanelProps['projectUpdatedAt'];
  readonly entryPath: string;
  readonly isActive: boolean;
  readonly signIn: string;
};

/**
 * The Tau-hosted link: the project's own `publish.machine` and its publication envelope.
 *
 * Its state lives with the panel rather than in the method's body, so a draft survives choosing another method and
 * coming back, as it did before the pane moved into `@taucad/workbench-panes`.
 *
 * @param options - The project, whether the hosted method is the one shown, and the sign-in link.
 * @returns What the pane draws for the method.
 */
function useTauShareBody(options: TauShareOptions): () => React.JSX.Element {
  const { projectId, projectName, projectDescription, projectUpdatedAt, entryPath, isActive, signIn } = options;
  /*
   * Publishing is the project's own `publish.machine`, invoked by the revision
   * root in the file-manager worker (A38, S32). This panel holds no actor: it
   * sends the root's events and renders the facet the projection carries, so
   * `tau publish` and this dialog are one implementation reached two ways.
   */
  const status = useRevisionStatus();
  const publishFacet = status?.publish ?? emptyPublishFacet;
  const commands = useRevisionCommands();
  const publishShareUrl = publishFacet.shareUrl;
  const publishError = publishFacet.error;

  const apiBaseUrl = useMemo(() => ENV.TAU_API_URL.replace(/\/$/u, ''), []);
  const [envelope, setEnvelope] = useState<ProjectShareEnvelope>();
  const [loadingEnvelope, setLoadingEnvelope] = useState(false);
  const [envelopeError, setEnvelopeError] = useState<string | undefined>();
  const [visibility, setVisibility] = useState<PublishVisibility>('private');
  const { canCreatePrivateShares, isResolved: isPlanResolved, requestUpgrade } = useCommercialFeatures();
  // Free tier publishes public-only (T4/T5/AD11); derived so an async
  // entitlements load never strands a locked selection in form state.
  const effectiveVisibility: PublishVisibility = canCreatePrivateShares ? visibility : 'public';
  /*
   * The named version this publication points at (S32, A21, D11).
   *
   * Defaulted to the next free `v<n>` so the common case is one click, and
   * offered as a list of the project's existing names so re-publishing a name
   * is a choice rather than a guess. A native `datalist` rather than a combobox
   * widget: the field accepts a new name as readily as an existing one.
   */
  const existingNames = publishFacet.tags.map((tag: PublishFacet['tags'][number]) => tag.name);
  /* Derived, not synchronized: the field shows the next free name until a person
   * types one, so the names arriving from the worker never need an effect. */
  const [chosenName, setChosenName] = useState<string>();
  const versionName = chosenName ?? nextVersionName(existingNames);
  const [title, setTitle] = useState(projectName);
  const [description, setDescription] = useState(projectDescription);
  const [sharedEmails, setSharedEmails] = useState<string[]>([]);
  const [visibilityMutating, setVisibilityMutating] = useState(false);
  const [publishingAnother, setPublishingAnother] = useState(false);
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
    if (isActive) {
      queueMicrotask(() => {
        // oxlint-disable-next-line no-void -- `loadEnvelope` reports its own failures into panel state.
        void loadEnvelope();
      });
    }
  }, [loadEnvelope, isActive]);

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
        setPublishingAnother(false);
        commands.resetPublish();
      }
    };

    void finishPublish();

    return () => {
      cancelled = true;
    };
  }, [commands, loadEnvelope, publishShareUrl, triggerCopiedTick]);

  const busy = publishFacet.phase === 'working';
  const sharedEmailError = effectiveVisibility === 'private' ? getPublicationEmailTagsError(sharedEmails) : undefined;
  const canPublish = title.trim().length > 0 && versionName.trim().length > 0 && !sharedEmailError && !busy;
  const snapshotState = useMemo(
    () => (envelope ? getSnapshotState(envelope, projectUpdatedAt) : 'unpublished'),
    [envelope, projectUpdatedAt],
  );

  /**
   * Publish is one gesture: open the dialog's machine on this project's names
   * and confirm the draft. The machine holds the confirm until it has read the
   * names, so nothing here waits.
   *
   * @param draft - Everything only a person decides.
   */
  const sendPublish = (draft: PublishDraft): void => {
    commands.publishProject(draft.tag);
    commands.confirmPublish(draft);
  };

  const handlePublish = (): void => {
    sendPublish({
      tag: versionName.trim(),
      projectName,
      entryPath,
      visibility: effectiveVisibility,
      title: title.trim(),
      ...(description.trim() === '' ? {} : { description: description.trim() }),
      ...(effectiveVisibility === 'private' && sharedEmails.length > 0 ? { sharedEmails } : {}),
      ...(effectiveVisibility === 'private' && sharedEmails.length > 0 ? { notifyRecipients: true } : {}),
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
      requestUpgrade();
      return;
    }

    setVisibilityMutating(true);
    try {
      const response = await fetch(`${apiBaseUrl}/v1/publications/${publication.id}/visibility`, {
        method: 'PATCH',
        credentials: 'include',
        headers: {
          Accept: 'application/json',
          'Content-Type': 'application/json',
        },
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

    sendPublish({
      tag: publication.tag,
      projectName,
      entryPath,
      visibility: publication.visibility,
      title: publication.title,
      ...(publication.description ? { description: publication.description } : {}),
    });
  };

  return () => {
    if (envelopeError) {
      const signInRequired = envelopeError === 'SIGN_IN_REQUIRED';
      return (
        <SharePaneFrame
          isDisabled={busy || visibilityMutating}
          description={
            signInRequired
              ? 'Sign in to persist this project with Tau.'
              : 'Tau-hosted sharing is unavailable right now.'
          }
        >
          <div className='flex flex-col gap-4'>
            <div
              className={cn(
                'rounded-md border px-3 py-2 text-sm',
                signInRequired
                  ? 'border-feature/30 bg-feature/10 text-feature dark:text-feature/80'
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
                <Button
                  type='button'
                  onClick={() => {
                    // oxlint-disable-next-line no-void -- ditto.
                    void loadEnvelope();
                  }}
                >
                  Try again
                </Button>
              )}
            </div>
          </div>
        </SharePaneFrame>
      );
    }

    if (loadingEnvelope) {
      return (
        <SharePaneFrame isDisabled={busy} description='Loading sharing settings…'>
          <div className='flex min-h-36 items-center justify-center'>
            <Loader2 className='size-5 spin-glyph text-muted-foreground' aria-hidden />
          </div>
        </SharePaneFrame>
      );
    }

    const publication = envelope?.currentPublication;

    if (publication && !publishingAnother) {
      return (
        <SharePaneFrame isDisabled={busy || visibilityMutating} description={getSnapshotCopy(snapshotState)}>
          <div className='flex flex-col gap-4'>
            <div className='flex flex-col gap-4'>
              <div>
                <h3 className='truncate text-sm font-medium'>{publication.title}</h3>
                <p className='mt-1 text-xs text-muted-foreground'>Version {publication.tag}</p>
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

            {publishError === undefined ? null : <PublishErrorCallout message={publishError} signIn={signIn} />}

            <div className='flex flex-wrap justify-end gap-2'>
              <Button
                type='button'
                variant='outline'
                disabled={busy || visibilityMutating}
                onClick={() => {
                  setPublishingAnother(true);
                }}
              >
                Publish another version
              </Button>
              <Button type='button' disabled={busy || visibilityMutating} onClick={handleRepublish}>
                {busy ? (
                  <Loader2 className='size-4 spin-glyph' aria-hidden />
                ) : copied ? (
                  <Check className='size-3.5' aria-hidden />
                ) : (
                  <RefreshCw className='size-3.5' aria-hidden />
                )}
                <span>
                  {snapshotState === 'published-stale'
                    ? 'Republish this version and copy link'
                    : 'Republish this version'}
                </span>
              </Button>
            </div>
          </div>
        </SharePaneFrame>
      );
    }

    return (
      <SharePaneFrame
        isDisabled={busy}
        description={`${getSnapshotCopy('unpublished')} The version you name is backed up to the cloud and served from there.`}
      >
        <div className='flex flex-col gap-4'>
          <div className='flex flex-col gap-4'>
            <div className='flex flex-col gap-2'>
              <Label htmlFor='share-version'>Version name</Label>
              <Input
                id='share-version'
                list='share-version-options'
                value={versionName}
                disabled={busy}
                onChange={(event) => {
                  setChosenName(event.target.value);
                }}
              />
              <datalist id='share-version-options'>
                {existingNames.map((name: string) => (
                  <option key={name} value={name} />
                ))}
              </datalist>
              <p className='text-xs text-muted-foreground'>
                People who open your link see this version. Publishing again with the same name moves the link forward.
              </p>
            </div>
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
                  {canCreatePrivateShares || !isPlanResolved ? undefined : (
                    <button
                      type='button'
                      className='inline-flex items-center gap-1 text-xs text-muted-foreground underline-offset-2 hover:underline'
                      onClick={() => {
                        requestUpgrade();
                      }}
                    >
                      <CommercialUpgradeLabel />
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

          {publishError === undefined ? null : <PublishErrorCallout message={publishError} signIn={signIn} />}

          <div className='flex justify-end'>
            <Button type='button' disabled={!canPublish} onClick={handlePublish}>
              {busy ? (
                <>
                  <Loader2 className='size-4 spin-glyph' aria-hidden />
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
      </SharePaneFrame>
    );
  };
}

/**
 * The Share pane's source over this project: the direct link and GitHub Gist when a snapshot can be collected, and
 * the Tau-hosted link, with the method choice remembered in a cookie (R8).
 *
 * @param properties - The project and how to collect its snapshot.
 * @returns The source.
 */
export function useProjectShareSource(properties: Omit<ProjectSharePanelProps, 'host'>): ShareSource {
  const {
    projectId,
    projectName,
    projectDescription = '',
    projectUpdatedAt,
    entryPath,
    collectSnapshot,
    initialMethod,
    githubAuthorizationOutcome,
    githubAuthorizationFailure,
  } = properties;
  const { pathname, search } = useLocation();
  const [chosenMethod, setChosenMethod] = useState<ShareMethod | undefined>(initialMethod);
  const [rememberedMethod, setRememberedMethod] = useCookie<unknown>(cookieName.shareProvider, undefined);
  const shareMethod = resolveShareMethod(chosenMethod, rememberedMethod, Boolean(collectSnapshot));
  const setShareMethod = useCallback(
    (next: string): void => {
      if (isShareMethod(next)) {
        setChosenMethod(next);
        setRememberedMethod(next);
      }
    },
    [setRememberedMethod],
  );
  const signInReturnTo = useMemo(() => {
    const authorizationReturn = parseGithubGistAuthorizationReturn(search);
    const parameters = new URLSearchParams(authorizationReturn?.remainingSearch ?? search);
    parameters.set('workbench', 'share');
    parameters.set('shareProvider', shareMethod);
    return `${pathname}?${parameters.toString()}`;
  }, [pathname, search, shareMethod]);
  const { signIn } = useAuthLinks({ redirectTo: signInReturnTo });
  const portable = usePortableShareMethods({
    collectSnapshot: collectSnapshot ?? missingSnapshot,
    signIn,
    githubAuthorizationOutcome,
    githubAuthorizationFailure,
  });
  const renderTau = useTauShareBody({
    projectId,
    projectName,
    projectDescription,
    projectUpdatedAt,
    entryPath,
    isActive: shareMethod === 'tau',
    signIn,
  });

  return useMemo((): ShareSource => {
    const methods = shareMethodDescriptors.flatMap((descriptor): ShareMethodSource[] => {
      if (descriptor.id === 'tau') {
        return [
          {
            kind: 'custom',
            id: 'tau',
            label: descriptor.label,
            icon: TauIcon,
            render: renderTau,
          },
        ];
      }
      return collectSnapshot ? [{ ...portable[descriptor.id], label: descriptor.label }] : [];
    });
    return {
      methods,
      method: shareMethod,
      onMethodChange: setShareMethod,
      notify: (message) => {
        toast.success(message);
      },
    };
  }, [collectSnapshot, portable, renderTau, setShareMethod, shareMethod]);
}

const missingSnapshot = async (): Promise<ShareProjectSnapshot> => {
  throw new Error('The project snapshot is unavailable.');
};

function ProjectSharePanelBody({
  host: Host = StandaloneShareHost,
  ...properties
}: ProjectSharePanelProps): React.JSX.Element {
  const source = useProjectShareSource(properties);
  return (
    <Host source={source}>
      <SharePane />
    </Host>
  );
}

export function ProjectSharePanel(properties: ProjectSharePanelProps): React.JSX.Element {
  return (
    <ProjectSharePanelBody
      key={`${properties.projectId}\0${properties.projectName}\0${properties.projectDescription ?? ''}`}
      {...properties}
    />
  );
}

/**
 * One refusal, in the words the machine already put it in (A18).
 *
 * The panel no longer translates codes into copy: the sentence is written where
 * the failure is known — the worker for an API refusal, the machine for a push
 * or a name — so there is one place to read and one place to change.
 *
 * @param properties - The sentence, and where signing in leads.
 * @returns The callout.
 */
function PublishErrorCallout({
  message,
  signIn,
}: {
  readonly message: string;
  readonly signIn: string;
}): React.JSX.Element {
  const signInRequired = message.startsWith('Sign in');
  return (
    <div
      role='alert'
      className={cn(
        'rounded-md border px-3 py-2 text-sm',
        signInRequired ? 'border-feature/30 bg-feature/10' : 'border-feature/40 bg-feature/10',
      )}
    >
      <div className={cn('font-medium', signInRequired ? 'text-feature dark:text-feature/70' : 'text-feature')}>
        {message}
      </div>
      {signInRequired ? (
        <Button asChild className='mt-3' size='sm'>
          <NavLink to={signIn}>Sign in</NavLink>
        </Button>
      ) : null}
    </div>
  );
}
