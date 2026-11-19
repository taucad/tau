import { useQuery } from '@tanstack/react-query';
import { Loader } from '@taucad/ui/components/loader';
import { copyText } from '@taucad/ui/utils/clipboard';
import type { CopyTextOutcome } from '@taucad/ui/utils/clipboard';
import { Skeleton } from '@taucad/ui/components/skeleton';
import { WaitIndicator } from '@taucad/ui/components/wait-indicator';
import { useCallback, useEffect, useId, useMemo, useRef, useState } from 'react';
import type { ComponentType, ReactNode } from 'react';
import { NavLink, useLocation } from 'react-router';
import { Check, Cloud, Link2 } from 'lucide-react';
import { sharePasswordLimits } from '@taucad/share/artifact';
import { formatShareUrl } from '@taucad/share/locator';
import type { ShareLocator } from '@taucad/share/locator';
import { isShareError } from '@taucad/share/provider';
import type { ShareProtection, ShareProviderDescriptor } from '@taucad/share/provider';
import type { ShareProjectSnapshot } from '@taucad/share/snapshot';
import { Button } from '@taucad/ui/components/button';
import { Input } from '@taucad/ui/components/input';
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@taucad/ui/components/alert-dialog';
import { Label } from '@taucad/ui/components/label';
import { RadioGroup, RadioGroupItem } from '@taucad/ui/components/radio-group';
import { WorkbenchPanesHostProvider } from '@taucad/workbench-panes/host/workbench-host';
import type { WorkbenchPanesHost, WorkbenchUnit } from '@taucad/workbench-panes/host/workbench-host';
import { SharePane, SharePaneFrame, SharePaneSection } from '@taucad/workbench-panes/share/share-pane';
import { ShareNotice } from '@taucad/workbench-panes/share/share-notice';
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
import { toast } from '@taucad/ui/components/sonner';
import { GithubGistManagement } from '#components/share/github-gist-management.js';
import { GithubGistServicesProvider } from '#components/share/github-gist-services.js';
import { useTickAnimation } from '@taucad/ui/hooks/use-tick-animation';
import { publishFailureMessage, versionNumberOfTag } from '@taucad/revisions';
import type {
  PublishDraft,
  PublishFacet,
  PublishVisibility,
  RevisionDivergence,
  RevisionStatusProjection,
} from '@taucad/revisions';
import type { ProjectShare, ProjectShareEnvelope } from '@taucad/types';
import { PublicationAccessPanel } from '#components/publish/publication-access-panel.js';
import { shareEnvelopeFailureOf } from '#components/publish/share-envelope-state.js';
import { useProjectShareServices } from '#components/publish/project-share-services.js';
import type { ProjectShareServices } from '#components/publish/project-share-services.js';
import { cn } from '@taucad/ui/utils/cn';
import { SvgIcon } from '@taucad/ui-kit/icons/svg-icon';
import { recordApiRequestId } from '@taucad/ui-core/lib/api-request-id';

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
  readonly entryPath: string;
  readonly collectSnapshot?: (signal?: AbortSignal) => Promise<ShareProjectSnapshot>;
  readonly initialMethod?: ShareMethod;
  readonly githubAuthorizationOutcome?: 'returned' | 'cancelled' | 'failed';
  readonly githubAuthorizationFailure?: string;
  /** The host the pane reads; a stand-alone host with no units when absent. */
  readonly host?: ProjectShareHost;
  /** Sections drawn after the chosen method's, under every method, inside the pane's one scroll area. */
  readonly extraSections?: ReactNode;
};

/**
 * What a snapshot collector throws for a project with no model file, and the sentence the pane shows for it. One
 * constant, so the pane recognizes the failure without copying its words.
 */
export const missingModelFileMessage = 'This project has no model file to share yet.';

export type ShareMethod = 'direct' | 'tau' | 'github-gist';

const isShareMethod = (value: string): value is ShareMethod =>
  value === 'direct' || value === 'tau' || value === 'github-gist';

type ShareMethodDescriptor = ShareProviderDescriptor & { readonly id: ShareMethod };

/**
 * The registry's methods this panel can publish with, in registry order.
 *
 * @param descriptors - The share provider registry's descriptors.
 * @returns The publish-capable methods the panel offers.
 */
const shareMethodDescriptorsOf = (descriptors: readonly ShareProviderDescriptor[]): readonly ShareMethodDescriptor[] =>
  descriptors.filter(
    (descriptor): descriptor is ShareMethodDescriptor =>
      isShareMethod(descriptor.id) && descriptor.capabilities.includes('project.publish'),
  );

/**
 * The sharing method this panel opens on.
 *
 * A method named by the link (a GitHub return, a sign-in return) or chosen in
 * this panel wins; otherwise the one this person chose last time (R8), as long
 * as the panel still offers it; otherwise a direct link. A panel that cannot
 * collect a snapshot offers only the cloud link.
 *
 * @param shareMethodDescriptors - The methods the panel offers.
 * @returns The resolver: from the method named by the link or picked in this panel, the stored preference
 *   (unvalidated) and whether portable methods can collect a snapshot here, the method to show.
 */
const resolveShareMethodFrom =
  (shareMethodDescriptors: readonly ShareMethodDescriptor[]) =>
  (chosen: ShareMethod | undefined, remembered: unknown, isPortableEnabled: boolean): ShareMethod => {
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
const TauCloudIcon: ShareMethodIcon = Cloud;
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

/** Before the worker has answered, the dialog renders as an idle dialog. */
const emptyPublishFacet: PublishFacet = {
  phase: 'idle',
  tags: [],
  publicationId: undefined,
  shareUrl: undefined,
  error: undefined,
};

/**
 * How the panel names the version a link shows: `V3 · Ready for print` (B6). The link records the version's tag,
 * `v<number>`; the number comes from it and the name from the project's own versions, never from the tag itself.
 *
 * @param tag - The version's tag.
 * @param versions - The project's versions, as the publish facet read them.
 * @returns The phrase.
 */
export const publishedVersionLabel = (tag: string, versions: PublishFacet['tags']): string => {
  const number = versionNumberOfTag(tag);
  if (number === undefined) {
    return 'An earlier version';
  }
  const name = versions.find((version) => version.number === number)?.name;
  return name === undefined ? `V${String(number)}` : `V${String(number)} · ${name}`;
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

// oxlint-disable-next-line typescript/no-restricted-types -- the cloud link wire format uses null.
const isNullableString = (value: unknown): value is string | null => value === null || typeof value === 'string';

/** One invited person, as the link's `access.grants` lists them. */
const isAccessGrant = (value: unknown): value is ProjectShare['access']['grants'][number] =>
  isRecord(value) &&
  typeof value['id'] === 'string' &&
  typeof value['recipientEmail'] === 'string' &&
  (value['status'] === 'active' || value['status'] === 'revoked') &&
  typeof value['createdAt'] === 'string' &&
  isNullableString(value['revokedAt']) &&
  (value['notDelivered'] === undefined || typeof value['notDelivered'] === 'boolean');

/**
 * Reads the project's cloud link as `GET`/`PATCH /v1/projects/:id/share` answer it.
 *
 * @param value - The parsed body, or its `share`.
 * @returns The link, or `undefined` when the body is not one.
 */
const parseProjectShare = (value: unknown): ProjectShare | undefined => {
  if (!isRecord(value)) {
    return undefined;
  }
  const { id, url, visibility, status, stoppedAt, publishedAt, currentVersion, access } = value;
  if (
    typeof id !== 'string' ||
    typeof url !== 'string' ||
    (visibility !== 'private' && visibility !== 'public') ||
    (status !== 'active' && status !== 'stopped') ||
    !isNullableString(stoppedAt) ||
    !isNullableString(publishedAt) ||
    !isRecord(access) ||
    !Array.isArray(access['grants'])
  ) {
    return undefined;
  }
  const grants: unknown[] = access['grants'];
  if (!grants.every((grant) => isAccessGrant(grant))) {
    return undefined;
  }
  let version: ProjectShare['currentVersion'] = null;
  if (currentVersion !== null && currentVersion !== undefined) {
    if (
      !isRecord(currentVersion) ||
      typeof currentVersion['publicationId'] !== 'string' ||
      typeof currentVersion['tag'] !== 'string' ||
      typeof currentVersion['revisionId'] !== 'string'
    ) {
      return undefined;
    }
    version = {
      publicationId: currentVersion['publicationId'],
      tag: currentVersion['tag'],
      revisionId: currentVersion['revisionId'],
    };
  }
  return {
    id,
    url,
    visibility,
    status,
    stoppedAt,
    publishedAt,
    currentVersion: version,
    access: { grants: grants.filter((grant) => isAccessGrant(grant)) },
  };
};

/**
 * Reads `GET /v1/projects/:id/share`: the project and its link, `null` before its first publish.
 *
 * @param value - The parsed body.
 * @returns The envelope, or `undefined` when the body is not one.
 */
const parseProjectShareEnvelope = (value: unknown): ProjectShareEnvelope | undefined => {
  if (!isRecord(value) || !isRecord(value['project'])) {
    return undefined;
  }
  const { project } = value;
  if (typeof project['id'] !== 'string') {
    return undefined;
  }
  const share = value['share'] === null || value['share'] === undefined ? null : parseProjectShare(value['share']);
  if (share === undefined) {
    return undefined;
  }
  return {
    project: {
      id: project['id'],
      name: typeof project['name'] === 'string' ? project['name'] : null,
      description: typeof project['description'] === 'string' ? project['description'] : null,
    },
    share,
  };
};

/** The branch a publish names the head of (`publish.machine`'s default). */
const publishedBranch = 'main';

/**
 * The head of `main`: the selected line's head on `main`, else the branch list's.
 *
 * @param status - The project's revision status.
 * @returns The head, or `undefined` when neither knows it.
 */
const headOfMainOf = (status: RevisionStatusProjection | undefined): string | undefined =>
  status === undefined
    ? undefined
    : status.line.kind === 'branch' && status.line.name === publishedBranch
      ? status.headRevisionId
      : status.branches.find((branch) => branch.name === publishedBranch)?.head;

/**
 * How the head of `main` stands to the revision the link shows, as the revision graph counts it.
 * `pending` while the count is read; `missing` when it could not be read, which is what a revision this device does
 * not have yet answers.
 */
type LinkRelation = RevisionDivergence | 'pending' | 'missing';

/**
 * Whether the link shows what a publish would publish now: the head of `main`, compared with the revision the link's
 * version names. It is exact rather than a timestamp guess. `changed` needs the graph to say the link's revision is
 * behind the head: when this device is the one behind (the link shows a version published elsewhere, or one it does
 * not have yet), a publish would take the link back, so the link reads `elsewhere`. Off `main`, the head comes from
 * the branch list. When the status has not answered or neither knows the head, the relation cannot be told and the
 * answer is `unknown`: a publish then could take the link back, so it is not offered. A link that shows no version
 * yet (`empty`) has nothing a publish could take back, and publishing is the only way to give it one.
 *
 * @param status - The project's revision status.
 * @param publishedRevisionId - The revision the link shows.
 * @param relation - How the head of `main` stands to that revision; read only when the two differ.
 * @returns `current`, `changed`, `elsewhere`, `checking` (the graph has not answered yet), `empty` or `unknown`.
 */
const linkFreshnessOf = (
  status: RevisionStatusProjection | undefined,
  publishedRevisionId: string | undefined,
  relation: LinkRelation,
): 'current' | 'changed' | 'elsewhere' | 'checking' | 'empty' | 'unknown' => {
  if (status === undefined) {
    return 'unknown';
  }
  if (publishedRevisionId === undefined) {
    return 'empty';
  }
  const head = headOfMainOf(status);
  if (head === undefined) {
    return 'unknown';
  }
  if (head === publishedRevisionId) {
    return 'current';
  }
  if (relation === 'pending') {
    return 'checking';
  }
  return relation !== 'missing' && relation.behind === 0 && relation.ahead > 0 ? 'changed' : 'elsewhere';
};

/**
 * Who a publish from the not-shared form names as able to open the link, and what the form shows.
 *
 * A publish names only what the person picked, so the server keeps the link's own setting (private for a first
 * publish). A Free plan's first publish names public as the default for a link it makes: private is not theirs to
 * choose, and a link made meanwhile (on another device) keeps its own setting. A first publish before the plan is
 * known shows no setting: private would be refused on the Free plan and public is not the person's to assume, so
 * they pick one before publishing.
 *
 * @param args - The link (absent before the first publish), the person's pick, and what the plan allows.
 * @returns The draft's audience fields, the setting the form shows, and whether it waits for a pick.
 */
const publishAudienceOf = (args: {
  readonly share: ProjectShare | undefined;
  readonly chosen: PublishVisibility | undefined;
  readonly isPrivateAllowed: boolean;
  readonly isPlanResolved: boolean;
}): {
  readonly audience: Pick<PublishDraft, 'visibility' | 'defaultVisibility'>;
  readonly effectiveVisibility: PublishVisibility | undefined;
  readonly isAwaitingAudience: boolean;
} => {
  const { share, chosen, isPrivateAllowed, isPlanResolved } = args;
  // A pick the plan no longer allows (the entitlements answered after it) is dropped rather than sent.
  const picked = chosen === 'private' && !isPrivateAllowed ? undefined : chosen;
  if (picked !== undefined) {
    return { audience: { visibility: picked }, effectiveVisibility: picked, isAwaitingAudience: false };
  }
  if (share === undefined && !isPlanResolved) {
    return { audience: {}, effectiveVisibility: undefined, isAwaitingAudience: true };
  }
  if (!isPrivateAllowed) {
    return {
      audience: share === undefined ? { defaultVisibility: 'public' } : {},
      effectiveVisibility: 'public',
      isAwaitingAudience: false,
    };
  }
  return { audience: {}, effectiveVisibility: share?.visibility ?? 'private', isAwaitingAudience: false };
};

type PortableMethod = Exclude<ShareMethod, 'tau'>;

/**
 * The sentence for imported files the link leaves out: the model may not build for whoever opens it.
 *
 * @param warnings - The snapshot's warnings, one per import that could not be resolved.
 * @returns The sentence, or `undefined` when nothing was left out.
 */
const describeWarnings = (warnings: ShareProjectSnapshot['warnings']): string | undefined => {
  if (warnings.length === 0) {
    return undefined;
  }
  return warnings.length === 1
    ? "1 imported file couldn't be found and isn't in the link. The model may not build for people who open it."
    : `${String(warnings.length)} imported files couldn't be found and aren't in the link. The model may not build for people who open it.`;
};

const isMissingModelFile = (failure: unknown): boolean =>
  failure instanceof Error && failure.message === missingModelFileMessage;

/**
 * The direct link's sentence for a failure: no model file and too large have their own; anything else is a failure to
 * try again. Provider messages never reach the pane.
 *
 * @param failure - What the share threw.
 * @returns One sentence.
 */
const directFailureMessage = (failure: unknown): string => {
  if (isMissingModelFile(failure)) {
    return missingModelFileMessage;
  }
  if (isShareError(failure) && failure.code === 'SHARE_ARTIFACT_LIMIT') {
    return 'This project is too large for a direct link. Use a cloud link or a GitHub Gist instead.';
  }
  return "Couldn't create the link. Try again.";
};

/**
 * The GitHub Gist's sentence for a failure, by its share error code.
 *
 * @param failure - What the share threw.
 * @returns One sentence.
 */
const gistFailureMessage = (failure: unknown): string => {
  if (isMissingModelFile(failure)) {
    return missingModelFileMessage;
  }
  switch (isShareError(failure) ? failure.code : undefined) {
    case 'SHARE_ARTIFACT_LIMIT': {
      return 'This project is too large for a GitHub Gist. Use a cloud link instead.';
    }
    case 'SHARE_AUTH_REQUIRED': {
      return 'Reconnect GitHub before sharing.';
    }
    case 'SHARE_PERMISSION_REQUIRED': {
      return "GitHub didn't allow access to your Gists. Allow Gist access, then try again.";
    }
    case 'SHARE_PROVIDER_UNAVAILABLE': {
      return "Couldn't reach GitHub. Try again.";
    }
    default: {
      return "Couldn't create the Gist. Try again.";
    }
  }
};

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
 * @param services - The app's share provider registry and browser provider context.
 * @returns The publish: from the provider, the snapshot collector and the protection and options the person chose,
 *   the link and what it points at, or the failure; either with the snapshot's warning once it was collected.
 */
const publishPortableWith =
  ({ shareProviderRegistry, withBrowserShareProviderContext }: ProjectShareServices) =>
  async (
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

const stoppedWaitingSentence = "Stopped waiting for your browser. Your GitHub connection hasn't changed.";
const timedOutSentence = "GitHub didn't confirm within 10 minutes. Try again.";
const copyRefusedSentence = 'Select the link and copy it.';

type GithubGistExtensionOptions = {
  readonly services: ProjectShareServices;
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
 * @param options - The app's services, the snapshot collector, the sign-in link and the outcome of a GitHub return.
 * @returns What the body adds.
 */
function useGithubGistExtension(
  context: ShareLinkContext,
  {
    services,
    collectSnapshot,
    signIn,
    githubAuthorizationOutcome,
    githubAuthorizationFailure,
  }: GithubGistExtensionOptions,
): ShareLinkExtension {
  const { useSettingsDialog, getGithubGistConnectionStatus, connectGithubGist, awaitGithubGistConnection } = services;
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

  /* The Stop waiting that was clicked unmounts; focus returns to the button that started the grant. */
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
    } catch {
      setError("Couldn't connect GitHub. Try again.");
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
    const result = await publishPortableWith(services)('github-gist', collectSnapshot, request);
    if ('failure' in result) {
      if (
        isShareError(result.failure) &&
        (result.failure.code === 'SHARE_PERMISSION_REQUIRED' || result.failure.code === 'SHARE_AUTH_REQUIRED')
      ) {
        void githubCapability.refetch();
      }
      return { error: gistFailureMessage(result.failure), warning: result.warning };
    }
    setPublication({ locator: result.locator, protection: result.protection });
    return { url: result.url, warning: result.warning };
  };

  const isChecking = githubStatus === undefined && !githubCapability.isError;
  const connectionLabel =
    githubStatus === 'disabled'
      ? 'Manage Gist sharing'
      : githubStatus === 'reconnect-required'
        ? 'Reconnect GitHub'
        : githubStatus === 'permission-required'
          ? 'Allow Gist access'
          : 'Connect GitHub';
  const connectionSentence =
    githubStatus === 'disabled'
      ? 'Gist sharing is turned off. Turn it on in Security settings.'
      : githubStatus === 'reconnect-required'
        ? 'Reconnect GitHub before sharing.'
        : githubStatus === 'signed-out'
          ? 'Sign in to Tau before connecting GitHub.'
          : githubStatus === 'permission-required'
            ? 'GitHub is connected, but Tau needs permission to create Gists.'
            : 'Connect GitHub to create a Gist.';

  return {
    error: githubCapability.isError ? "Couldn't check your GitHub connection. Try again." : undefined,
    isPending: isChecking,
    share,
    callouts: (
      <>
        {/* A return from GitHub waits for the status check like any other open, so one wait line covers both. */}
        {isChecking ? <WaitIndicator active label='Checking your GitHub connection' /> : null}
        {githubAuthorizationOutcome === 'cancelled' ? (
          <ShareNotice tone='info'>GitHub Gist access was not granted.</ShareNotice>
        ) : null}
        {githubAuthorizationOutcome === 'failed' ? (
          <ShareNotice tone='error'>{githubAuthorizationFailure ?? "Couldn't connect GitHub. Try again."}</ShareNotice>
        ) : null}
        {browserConsent === 'waiting' ? (
          <ShareNotice tone='info' role='status'>
            Finish connecting in your browser. This pane updates when GitHub confirms.
          </ShareNotice>
        ) : browserConsent === 'cancelled' ? (
          <ShareNotice tone='info'>{stoppedWaitingSentence}</ShareNotice>
        ) : browserConsent === 'timed-out' ? (
          <ShareNotice tone='error'>{timedOutSentence}</ShareNotice>
        ) : null}
        {githubStatus && githubStatus !== 'connected' && browserConsent !== 'waiting' ? (
          <ShareNotice tone='info'>{connectionSentence}</ShareNotice>
        ) : null}
      </>
    ),
    actions: (
      <>
        {publication && githubStatus === 'connected' ? (
          <GithubGistServicesProvider value={services}>
            <GithubGistManagement
              locator={publication.locator}
              protection={publication.protection}
              collectSnapshot={collectSnapshot}
              shareUrl={context.shareUrl}
              onRepublished={setShareUrl}
              onUnpublished={forgetPublication}
              surface='editor'
            />
          </GithubGistServicesProvider>
        ) : null}
        {browserConsent === 'waiting' ? (
          <Button type='button' variant='ghost' onClick={cancelBrowserConsent}>
            Stop waiting
          </Button>
        ) : null}
      </>
    ),
    primary:
      githubStatus === 'signed-out'
        ? {
            element: (
              <Button asChild>
                <NavLink to={signIn}>Sign in to Tau</NavLink>
              </Button>
            ),
          }
        : githubCapability.isError
          ? {
              label: 'Try again',
              onActivate: () => {
                void githubCapability.refetch();
              },
            }
          : githubStatus !== undefined && githubStatus !== 'connected'
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
 * @param options - The app's services, the methods offered, the snapshot collector, the sign-in link and the outcome
 *   of a GitHub return.
 * @returns The two link methods, in registry order.
 */
const usePortableShareMethods = (
  options: GithubGistExtensionOptions & { readonly shareMethodDescriptors: readonly ShareMethodDescriptor[] },
): Readonly<Record<PortableMethod, ShareLinkMethod>> => {
  const {
    services,
    shareMethodDescriptors,
    collectSnapshot,
    signIn,
    githubAuthorizationOutcome,
    githubAuthorizationFailure,
  } = options;
  return useMemo(() => {
    const labelOf = (id: ShareMethod): string =>
      shareMethodDescriptors.find((descriptor) => descriptor.id === id)?.label ?? id;
    const encryption = {
      minBytes: sharePasswordLimits.minBytes,
      maxBytes: sharePasswordLimits.maxBytes,
    };
    const extensionOptions = {
      services,
      collectSnapshot,
      signIn,
      githubAuthorizationOutcome,
      githubAuthorizationFailure,
    };
    const portableShare =
      (method: PortableMethod) =>
      async (request: ShareLinkRequest): Promise<ShareLinkOutcome> => {
        const result = await publishPortableWith(services)(method, collectSnapshot, request);
        return 'failure' in result
          ? {
              error: (method === 'direct' ? directFailureMessage : gistFailureMessage)(result.failure),
              warning: result.warning,
            }
          : { url: result.url, warning: result.warning };
      };
    return {
      direct: {
        kind: 'link',
        id: 'direct',
        label: labelOf('direct'),
        icon: DirectIcon,
        description: 'The whole project travels in the link, so anyone with the link can open it. Nothing is uploaded.',
        encryption,
        /* The link is the project as it is now, so every press builds it again and nothing is held. */
        shouldRemakeLink: true,
        action: { label: 'Copy link', icon: DirectIcon },
        share: portableShare('direct'),
      },
      'github-gist': {
        kind: 'link',
        id: 'github-gist',
        label: labelOf('github-gist'),
        icon: GithubIcon,
        description: 'Tau stores the project in a Gist on your GitHub account.',
        encryption,
        options: [
          {
            id: 'public-gist',
            label: 'Publish as a public Gist',
            description:
              'A public Gist is listed on your GitHub profile. Otherwise only people with the link can find it.',
          },
        ],
        action: { label: 'Create Gist and copy link', icon: GithubIcon },
        /* The pane keys a body by method and calls this once per render of it, so it is a hook of that body. */
        // oxlint-disable-next-line react-hooks/rules-of-hooks -- called by the link body as its own hook.
        useExtension: (context) => useGithubGistExtension(context, extensionOptions),
        share: portableShare('github-gist'),
      },
    };
  }, [
    collectSnapshot,
    githubAuthorizationFailure,
    githubAuthorizationOutcome,
    services,
    shareMethodDescriptors,
    signIn,
  ]);
};

type TauShareOptions = {
  readonly projectId: string;
  readonly projectName: string;
  readonly projectDescription: string;
  readonly entryPath: string;
  readonly isActive: boolean;
  readonly signIn: string;
  /** Chooses the direct link, which needs no account; absent when the pane does not offer one. */
  readonly onUseDirectLink: (() => void) | undefined;
};

/** Where focus goes after the control that had it went away. */
type CloudFocusTarget = 'copy-link' | 'share-link' | 'publish';

/**
 * The link a publish press is waiting for. The press starts the copy with a promise of the link (`copyText`), so the
 * browser counts it as the person's gesture however long the publish takes; the publish settles the promise.
 */
type PendingPublishCopy = Readonly<{
  resolve: (url: string) => void;
  reject: (reason: Error) => void;
  /** The copy's outcome, or `undefined` when the publish failed and nothing was copied. */
  copying: Promise<CopyTextOutcome | undefined>;
}>;

/**
 * A copy's outcome, or `undefined` when the text it waited for never came.
 *
 * @param copying - The copy, as `copyText` started it.
 * @returns What it did, never a rejection.
 */
const outcomeOf = async (copying: Promise<CopyTextOutcome>): Promise<CopyTextOutcome | undefined> => {
  try {
    return await copying;
  } catch {
    return undefined;
  }
};

/**
 * Starts copying the link a publish will make. Call it inside the press.
 *
 * @returns How the publish settles the link, and the copy's outcome.
 */
const startPublishCopy = (): PendingPublishCopy => {
  const settle: Pick<PendingPublishCopy, 'resolve' | 'reject'> = { resolve: () => undefined, reject: () => undefined };
  const link = new Promise<string>((resolve, reject) => {
    Object.assign(settle, { resolve, reject });
  });
  return {
    resolve(url) {
      settle.resolve(url);
    },
    reject(reason) {
      settle.reject(reason);
    },
    copying: outcomeOf(copyText(link)),
  };
};

/**
 * A version's number for a sentence, `V3`, without its name: the name can repeat words around it.
 *
 * @param tag - The version's tag.
 * @returns `V<number>`, or `undefined` when the tag names no number.
 */
const versionNumberLabel = (tag: string): string | undefined => {
  const number = versionNumberOfTag(tag);
  return number === undefined ? undefined : `V${String(number)}`;
};

/**
 * What a Publish changes says once the link is read again. The version is named only when the link still points at
 * the one this publish made (another device may have published since), and only a link that is on shows it.
 *
 * @param share - The link as read after the publish.
 * @param publishedId - The version row the publish made or re-pointed.
 * @returns The toast's sentence.
 */
const publishedChangesSentence = (share: ProjectShare | undefined, publishedId: string | undefined): string => {
  const current = share?.currentVersion;
  const version =
    current === undefined || current === null || current.publicationId !== publishedId
      ? undefined
      : versionNumberLabel(current.tag);
  if (version === undefined) {
    return 'Published.';
  }
  return share?.status === 'active' ? `Published ${version}. The link now shows it.` : `Published ${version}.`;
};

/**
 * A date as people read it, `12 Nov 2026`.
 *
 * @param isoDate - When the link last changed what it shows.
 * @returns The date, or `undefined` for one that does not parse.
 */
const publishedDate = (isoDate: string): string | undefined => {
  const parsed = new Date(isoDate);
  return Number.isNaN(parsed.getTime())
    ? undefined
    : parsed.toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });
};

/**
 * The cloud link body while it cannot proceed: signed out, unreachable, or no cloud copy. One titled notice and its
 * actions.
 *
 * @param props - Why it cannot proceed, the sign-in link, how to retry, and how to choose a direct link.
 * @returns The notice.
 */
function CloudLinkUnavailable({
  failure,
  signIn,
  onRetry,
  onUseDirectLink,
}: {
  readonly failure: ReturnType<typeof shareEnvelopeFailureOf>;
  readonly signIn: string;
  readonly onRetry: () => void;
  readonly onUseDirectLink: (() => void) | undefined;
}): React.JSX.Element {
  const useDirectLink =
    onUseDirectLink === undefined ? undefined : (
      <Button type='button' variant='outline' onClick={onUseDirectLink}>
        Use a direct link
      </Button>
    );
  if (failure === 'sign-in') {
    return (
      <ShareNotice
        tone='info'
        title='Sign in to create a cloud link'
        actions={
          <>
            {useDirectLink}
            <Button asChild>
              <NavLink to={signIn}>Sign in</NavLink>
            </Button>
          </>
        }
      >
        Cloud links are saved to your account.
      </ShareNotice>
    );
  }
  if (failure === 'absent') {
    return (
      <ShareNotice tone='info' title="This project isn't in the cloud" actions={useDirectLink}>
        {onUseDirectLink === undefined
          ? 'A cloud link needs the project to be in the cloud. Duplicate the project and share the copy.'
          : 'A cloud link needs the project to be in the cloud. Use a direct link or a GitHub Gist instead, or duplicate the project and share the copy.'}
      </ShareNotice>
    );
  }
  return (
    <ShareNotice
      tone='error'
      title="Couldn't load this project's cloud link"
      actions={
        <Button type='button' onClick={onRetry}>
          Try again
        </Button>
      }
    >
      Check your connection, then try again.
    </ShareNotice>
  );
}

/**
 * The cloud link body's first load, drawn as the form it becomes. Later reloads keep what is on screen.
 *
 * @returns The skeleton, announced once.
 */
function CloudLinkSkeleton(): React.JSX.Element {
  return (
    <div role='status' aria-busy='true' aria-label='Loading cloud link' className='flex flex-col gap-4'>
      <Skeleton aria-hidden className='h-5 w-36' />
      <Skeleton aria-hidden className='h-9 w-full' />
      <Skeleton aria-hidden className='h-5 w-48' />
      <Skeleton aria-hidden className='h-5 w-44' />
      <div className='flex justify-end'>
        <Skeleton aria-hidden className='h-8 w-40' />
      </div>
    </div>
  );
}

/**
 * Asks before the link stops working for everyone (UX Rule 4): it cannot be undone from the pane, only turned back on
 * by publishing again.
 *
 * @param props - Whether it is open, whether the stop is running, and what each answer does.
 * @returns The dialog.
 */
function StopSharingDialog({
  isOpen,
  isStopping,
  onConfirm,
  onCancel,
  onCloseAutoFocus,
}: {
  readonly isOpen: boolean;
  readonly isStopping: boolean;
  readonly onConfirm: () => void;
  readonly onCancel: () => void;
  readonly onCloseAutoFocus: (event: Event) => void;
}): React.JSX.Element {
  return (
    <AlertDialog
      open={isOpen}
      onOpenChange={(open) => {
        if (!open && !isStopping) {
          onCancel();
        }
      }}
    >
      <AlertDialogContent onCloseAutoFocus={onCloseAutoFocus}>
        <AlertDialogHeader>
          <AlertDialogTitle>Stop sharing this project?</AlertDialogTitle>
          <AlertDialogDescription>
            The link stops working for everyone, including people you invited. Anyone who already opened it may still
            have a copy. Publishing again turns the same link back on.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={isStopping}>Cancel</AlertDialogCancel>
          <Button type='button' variant='destructive' disabled={isStopping} aria-busy={isStopping} onClick={onConfirm}>
            {isStopping ? <Loader className='size-4' /> : null}
            Stop sharing
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

/**
 * The cloud link: the project's one stable link, which always shows the version last published (the project's own
 * `publish.machine`), who can open it, and Stop sharing.
 *
 * Its state lives with the panel rather than in the method's body, so a choice survives choosing another method and
 * coming back, as it did before the pane moved into `@taucad/workbench-panes`.
 *
 * @param options - The project, whether the cloud link method is the one shown, the sign-in link and how to choose a
 * direct link.
 * @returns What the pane draws for the method.
 */
function useTauShareBody(options: TauShareOptions): () => React.JSX.Element {
  const { projectId, projectName, projectDescription, entryPath, isActive, signIn, onUseDirectLink } = options;
  /*
   * Publishing is the project's own `publish.machine`, invoked by the revision
   * root in the file-manager worker (A38, S32). This panel holds no actor: it
   * sends the root's events and renders the facet the projection carries, so
   * `tau publish` and this pane are one implementation reached two ways.
   */
  const {
    apiBaseUrl: readApiBaseUrl,
    useRevisionStatus,
    useRevisionCommands,
    useRevisionClient,
    useCommercialFeatures,
    commercialUpgradeLabel: CommercialUpgradeLabel,
  } = useProjectShareServices();
  const status = useRevisionStatus();
  const publishFacet = status?.publish ?? emptyPublishFacet;
  const commands = useRevisionCommands();
  const publishShareUrl = publishFacet.shareUrl;
  const publishSucceeded = publishFacet.phase === 'success';
  /* The version row the publish that just succeeded made or re-pointed, which names it apart from a later publish. */
  const publishedId = publishSucceeded ? publishFacet.publicationId : undefined;
  const publishError = publishFacet.error;

  const apiBaseUrl = useMemo(() => readApiBaseUrl().replace(/\/$/u, ''), [readApiBaseUrl]);
  const shareEndpoint = `${apiBaseUrl}/v1/projects/${encodeURIComponent(projectId)}/share`;
  const [envelope, setEnvelope] = useState<ProjectShareEnvelope>();
  /* A reload keeps the content on screen; only the invited list says it is refreshing. */
  const [loadingEnvelope, setLoadingEnvelope] = useState(false);
  /* Why the envelope read failed, as the cloud state it says (W30): a deleted copy is not a network fault (#2304). */
  const [envelopeFailure, setEnvelopeFailure] = useState<ReturnType<typeof shareEnvelopeFailureOf>>();
  /* What the person picked before a publish; the link's own setting until they pick. */
  const [chosenVisibility, setChosenVisibility] = useState<PublishVisibility>();
  const plan = useCommercialFeatures();
  const isPlanResolved = plan.isResolved;
  /* C1: only a resolved plan can refuse private; an unresolved one sends the person's choice and the API decides. */
  const isPrivateRefused = plan.isResolved && !plan.canCreatePrivateShares;
  const [visibilityMutating, setVisibilityMutating] = useState(false);
  const [isStopDialogOpen, setIsStopDialogOpen] = useState(false);
  const [isStopping, setIsStopping] = useState(false);
  const [isCopyRefused, setIsCopyRefused] = useState(false);
  const [focusTarget, setFocusTarget] = useState<CloudFocusTarget>();
  const lastHandledShareUrlRef = useRef<string | undefined>(undefined);
  const pendingCopyRef = useRef<PendingPublishCopy | undefined>(undefined);
  /* Whether the stop dialog closed because the link stopped, so focus goes to the publish button that replaced it. */
  const hasStoppedRef = useRef(false);
  const linkRef = useRef<HTMLInputElement>(null);
  const copyLinkRef = useRef<HTMLButtonElement>(null);
  const publishRef = useRef<HTMLButtonElement>(null);
  const stopSharingRef = useRef<HTMLButtonElement>(null);
  const { ticked: copied, trigger: triggerCopiedTick } = useTickAnimation();
  const visibilityLabelId = useId();

  /* Whether the link's revision is behind the head of `main`: one bounded graph count, read only when they differ. */
  const revisionClient = useRevisionClient();
  const headOfMain = headOfMainOf(status);
  const publishedRevisionId = envelope?.share?.currentVersion?.revisionId;
  const linkRelationQuery = useQuery({
    queryKey: ['revisions', projectId, 'divergence', headOfMain, publishedRevisionId],
    queryFn: async () => {
      if (revisionClient === undefined || headOfMain === undefined || publishedRevisionId === undefined) {
        throw new Error('NO_LINK_RELATION');
      }
      return revisionClient.divergence(headOfMain, publishedRevisionId);
    },
    enabled:
      revisionClient !== undefined &&
      headOfMain !== undefined &&
      publishedRevisionId !== undefined &&
      headOfMain !== publishedRevisionId,
    retry: false,
  });
  const linkRelation: LinkRelation =
    linkRelationQuery.data ?? (linkRelationQuery.status === 'error' ? 'missing' : 'pending');

  /* Each read takes a number; only the latest may set what the pane shows, so an earlier read that answers late
     (an invite's refresh racing Stop sharing's) never puts back a link that has since changed. */
  const envelopeGenerationRef = useRef(0);
  /* The link as the pane last accepted it, for a caller that awaited a read another one overtook. */
  const acceptedEnvelopeRef = useRef<ProjectShareEnvelope>(undefined);
  const loadEnvelope = useCallback(async (): Promise<ProjectShareEnvelope | undefined> => {
    envelopeGenerationRef.current += 1;
    const generation = envelopeGenerationRef.current;
    const isLatest = (): boolean => generation === envelopeGenerationRef.current;
    setLoadingEnvelope(true);
    setEnvelopeFailure(undefined);
    let status: number | undefined;
    try {
      const response = await fetch(shareEndpoint, {
        credentials: 'include',
        headers: { Accept: 'application/json' },
      });

      if (!response.ok) {
        status = response.status;
        throw recordApiRequestId(new Error('SHARE_ENVELOPE_FAILED'), response);
      }

      const nextEnvelope = parseProjectShareEnvelope(await response.json());
      if (!nextEnvelope) {
        throw new Error('INVALID_SHARE_ENVELOPE');
      }

      if (isLatest()) {
        acceptedEnvelopeRef.current = nextEnvelope;
        setEnvelope(nextEnvelope);
      }
      return nextEnvelope;
    } catch {
      if (isLatest()) {
        setEnvelopeFailure(shareEnvelopeFailureOf(status));
      }
      return undefined;
    } finally {
      if (isLatest()) {
        setLoadingEnvelope(false);
      }
    }
  }, [shareEndpoint]);

  useEffect(() => {
    if (isActive) {
      queueMicrotask(() => {
        // oxlint-disable-next-line no-void -- `loadEnvelope` reports its own failures into panel state.
        void loadEnvelope();
      });
    }
  }, [loadEnvelope, isActive]);

  /* Focus follows the gesture only when the control it came from went away: a publish or a stop. */
  useEffect(() => {
    if (focusTarget === undefined) {
      return;
    }
    const target =
      focusTarget === 'copy-link'
        ? copyLinkRef.current
        : focusTarget === 'share-link'
          ? linkRef.current
          : publishRef.current;
    if (target !== null) {
      target.focus();
      if (focusTarget === 'share-link') {
        linkRef.current?.select();
      }
      setFocusTarget(undefined);
    }
  });

  /* A publish that failed or a pane that went away never brings the link, so the copy waiting on it is let go. */
  useEffect(() => {
    if (publishError !== undefined) {
      pendingCopyRef.current?.reject(new Error(publishError));
      pendingCopyRef.current = undefined;
    }
  }, [publishError]);
  useEffect(
    () => () => {
      pendingCopyRef.current?.reject(new Error('The Share pane closed.'));
      pendingCopyRef.current = undefined;
    },
    [],
  );

  useEffect(() => {
    /*
     * One publish is one stay in `success`: the reset after it returns the machine to idle while the link is kept, so the
     * marker clears outside `success` and the next publish is handled even when it brings the same link — which, with
     * one link per project, is every publish.
     */
    if (!publishSucceeded || !publishShareUrl) {
      lastHandledShareUrlRef.current = undefined;
      return;
    }
    if (lastHandledShareUrlRef.current === publishShareUrl) {
      return;
    }

    lastHandledShareUrlRef.current = publishShareUrl;
    const pending = pendingCopyRef.current;
    pendingCopyRef.current = undefined;
    pending?.resolve(publishShareUrl);
    let cancelled = false;
    const finishPublish = async (): Promise<void> => {
      /* The choice is saved on the link now; a later publish starts from the link's own setting. */
      setChosenVisibility(undefined);
      if (pending === undefined) {
        /* Publish changes: the link did not change, so nothing is copied. The toast names the version only when the
           link still points at the one this publish made: another device may have published after it. */
        const next = await loadEnvelope();
        if (!cancelled) {
          toast.success(publishedChangesSentence(next?.share ?? undefined, publishedId));
          setIsCopyRefused(false);
        }
      } else {
        const outcome = await pending.copying;
        if (!cancelled) {
          if (outcome?.isCopied === true) {
            toast.success('Published. Link copied');
            triggerCopiedTick();
          } else {
            toast.success('Published');
          }
          setIsCopyRefused(outcome?.isCopied === false);
          await loadEnvelope();
        }
        if (!cancelled) {
          setFocusTarget(outcome?.isCopied === false ? 'share-link' : 'copy-link');
        }
      }
      if (!cancelled) {
        if (pending === undefined) {
          /* The Publish changes button goes away with its notice. */
          setFocusTarget('copy-link');
        }
        commands.resetPublish();
      }
    };

    void finishPublish();

    return () => {
      cancelled = true;
    };
  }, [commands, loadEnvelope, publishShareUrl, publishSucceeded, publishedId, triggerCopiedTick]);

  const busy = publishFacet.phase === 'working';

  /**
   * Publish is one gesture: open the machine on this project's names and confirm the draft. The machine holds the
   * confirm until it has read the names, so nothing here waits. The version is never named here: the worker names it
   * (`Shared Nov 19`), and an entry that already is a version is published under its own name.
   *
   * @param audience - Who can open the link: `visibility` the person picked (absent keeps the link's setting), and
   *   `defaultVisibility` the setting a link this publish makes takes, which never changes a link made since.
   * @param shouldCopy - Whether the press copies the link the publish brings.
   */
  const sendPublish = (audience: Pick<PublishDraft, 'visibility' | 'defaultVisibility'>, shouldCopy: boolean): void => {
    /* The copy starts here, inside the press; the publish below settles the link it copies. */
    pendingCopyRef.current?.reject(new Error('Another publish started.'));
    pendingCopyRef.current = shouldCopy ? startPublishCopy() : undefined;
    setIsCopyRefused(false);
    const draft: PublishDraft = {
      tag: '',
      isAutoNamed: true,
      projectName,
      entryPath,
      ...(projectDescription.trim() === '' ? {} : { description: projectDescription.trim() }),
      ...(audience.visibility === undefined ? {} : { visibility: audience.visibility }),
      ...(audience.defaultVisibility === undefined ? {} : { defaultVisibility: audience.defaultVisibility }),
    };
    commands.publishProject();
    commands.confirmPublish(draft);
  };

  const handleVisibilityChange = async (nextVisibility: PublishVisibility): Promise<void> => {
    const share = envelope?.share;
    if (!share || share.visibility === nextVisibility || visibilityMutating) {
      return;
    }
    // Switching TO private is Pro-gated (T4/T5); the server 403s anyway — route
    // the user to the upgrade surface instead of a failing request.
    if (nextVisibility === 'private' && plan.isResolved && !plan.canCreatePrivateShares) {
      plan.requestUpgrade();
      return;
    }

    setVisibilityMutating(true);
    try {
      const response = await fetch(shareEndpoint, {
        method: 'PATCH',
        credentials: 'include',
        headers: {
          Accept: 'application/json',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ visibility: nextVisibility }),
      });

      if (!response.ok) {
        throw recordApiRequestId(new Error('VISIBILITY_UPDATE_FAILED'), response);
      }

      setChosenVisibility(undefined);
      await loadEnvelope();
      toast.success(
        nextVisibility === 'private'
          ? 'Only people you invite can open the link now.'
          : 'Anyone with the link can open it now.',
      );
    } catch {
      toast.error("Couldn't change who can open the link. Try again.");
    } finally {
      setVisibilityMutating(false);
    }
  };

  /* Stop sharing works on every plan: the link answers "no longer shared" on the next request, for everyone. */
  const handleStopSharing = async (): Promise<void> => {
    setIsStopping(true);
    try {
      const response = await fetch(shareEndpoint, {
        method: 'DELETE',
        credentials: 'include',
        headers: { Accept: 'application/json' },
      });
      if (!response.ok) {
        throw recordApiRequestId(new Error('STOP_SHARING_FAILED'), response);
      }
      hasStoppedRef.current = true;
      /* The server stopped it: hold that here too, so a refresh that fails (and its Try again) never shows the link. */
      const stoppedAt = new Date().toISOString();
      const markStopped = (current: ProjectShareEnvelope | undefined): ProjectShareEnvelope | undefined =>
        current?.share ? { ...current, share: { ...current.share, status: 'stopped', stoppedAt } } : current;
      acceptedEnvelopeRef.current = markStopped(acceptedEnvelopeRef.current);
      setEnvelope(markStopped);
      setIsStopDialogOpen(false);
      setIsCopyRefused(false);
      toast.success('Stopped sharing. The link no longer works.');
      await loadEnvelope();
      setFocusTarget('publish');
    } catch {
      setIsStopDialogOpen(false);
      toast.error("Couldn't stop sharing. Try again.");
    } finally {
      setIsStopping(false);
    }
  };

  /* The copy starts inside the press, before any await, so a browser that needs the gesture still allows it. */
  const copyPublishedLink = async (url: string): Promise<void> => {
    const copying = copyText(url);
    setIsCopyRefused(false);
    const { isCopied } = await copying;
    if (isCopied) {
      triggerCopiedTick();
      toast.success('Link copied');
    } else {
      setIsCopyRefused(true);
      linkRef.current?.focus();
      linkRef.current?.select();
    }
  };

  const copyIcon = copied ? <Check className='size-3.5' aria-hidden /> : <Link2 className='size-3.5' aria-hidden />;

  /* No link yet, or a stopped one: choose who can open it and publish. Publishing turns a stopped link back on. */
  const notShared = (share: ProjectShare | undefined): React.JSX.Element => {
    // Only people you invite needs the Pro plan to choose (T4/T5/AD11), but a link that is already private keeps
    // it after the plan lapses (T16), so its own setting stays on offer. Until the plan is known nothing is locked.
    const isPrivateAllowed = !isPrivateRefused || share?.visibility === 'private';
    const { audience, effectiveVisibility, isAwaitingAudience } = publishAudienceOf({
      share,
      chosen: chosenVisibility,
      isPrivateAllowed,
      isPlanResolved,
    });
    return (
      <SharePaneFrame isDisabled={busy}>
        <SharePaneSection
          title='Link'
          description='People who open the link see the version you publish. Tau keeps a copy so the link works anywhere.'
        >
          {share?.status === 'stopped' ? (
            <ShareNotice tone='info' title='Sharing is stopped'>
              You stopped sharing this project. Publishing turns the same link back on, for the same people.
            </ShareNotice>
          ) : null}
          <form
            className='flex flex-col gap-4'
            onSubmit={(event) => {
              event.preventDefault();
              if (!busy && !isAwaitingAudience) {
                sendPublish(audience, true);
              }
            }}
          >
            <div className='flex flex-col gap-2'>
              <Label id={visibilityLabelId}>Who can open the link</Label>
              <RadioGroup
                value={effectiveVisibility ?? ''}
                disabled={busy}
                aria-labelledby={visibilityLabelId}
                onValueChange={(value) => {
                  setChosenVisibility(value as PublishVisibility);
                }}
                className='flex flex-col gap-2'
              >
                <div className='flex flex-wrap items-center gap-2'>
                  <RadioGroupItem value='private' id='share-vis-private' disabled={!isPrivateAllowed} />
                  <Label
                    htmlFor='share-vis-private'
                    /* A 16px radio's label is its 24px target under a coarse pointer (I3). */
                    className={cn('font-normal pointer-coarse:min-h-6', !isPrivateAllowed && 'text-muted-foreground')}
                  >
                    Only people you invite
                  </Label>
                  {isPrivateAllowed ? undefined : (
                    <button
                      type='button'
                      className='inline-flex items-center gap-1 text-xs text-muted-foreground underline-offset-2 hover:underline pointer-coarse:min-h-6'
                      onClick={() => {
                        plan.requestUpgrade();
                      }}
                    >
                      <CommercialUpgradeLabel />
                    </button>
                  )}
                </div>
                <div className='flex items-center gap-2'>
                  <RadioGroupItem value='public' id='share-vis-public' />
                  <Label htmlFor='share-vis-public' className='font-normal pointer-coarse:min-h-6'>
                    Anyone with the link
                  </Label>
                </div>
              </RadioGroup>
            </div>

            {busy ? (
              <p role='status' className='sr-only'>
                Publishing…
              </p>
            ) : null}
            {publishError === undefined ? null : (
              <PublishErrorNotice
                message={publishError}
                signIn={signIn}
                onPublishPublic={() => {
                  setChosenVisibility('public');
                  sendPublish({ visibility: 'public' }, true);
                }}
              />
            )}

            <div className='flex flex-wrap justify-end gap-2'>
              <Button ref={publishRef} type='submit' disabled={busy || isAwaitingAudience} aria-busy={busy}>
                {busy ? (
                  <>
                    <Loader className='size-4' />
                    <span>Publishing…</span>
                  </>
                ) : (
                  <>
                    {copyIcon}
                    <span>Publish and copy link</span>
                  </>
                )}
              </Button>
            </div>
          </form>
        </SharePaneSection>
      </SharePaneFrame>
    );
  };

  /* The link is on: copy it, publish what changed since, choose who can open it, or stop sharing. */
  const shared = (share: ProjectShare): React.JSX.Element => {
    const version = share.currentVersion;
    const versionLabel = version === null ? undefined : publishedVersionLabel(version.tag, publishFacet.tags);
    const versionNumber = version === null ? undefined : versionNumberLabel(version.tag);
    const date = share.publishedAt === null ? undefined : publishedDate(share.publishedAt);
    const freshness = linkFreshnessOf(status, version?.revisionId, linkRelation);
    const isDisabled = busy || visibilityMutating || isStopping;
    const publishChanges = (
      <Button
        type='button'
        variant='outline'
        disabled={isDisabled}
        aria-busy={busy}
        onClick={() => {
          sendPublish({}, false);
        }}
      >
        {busy ? <Loader className='size-4' /> : null}
        <span>{busy ? 'Publishing…' : 'Publish changes'}</span>
      </Button>
    );
    return (
      <SharePaneFrame isDisabled={isDisabled}>
        <SharePaneSection title='Link'>
          <Input
            ref={linkRef}
            aria-label='Share link'
            readOnly
            value={share.url}
            onFocus={(event) => {
              event.target.select();
            }}
          />
          {versionLabel === undefined ? null : (
            <p className='text-sm [overflow-wrap:anywhere] text-muted-foreground'>
              {'Shows '}
              <span className='font-medium text-foreground'>{versionLabel}</span>
              {date === undefined ? '.' : `, published ${date}.`}
            </p>
          )}
          {freshness === 'changed' ? (
            <ShareNotice tone='info' actions={publishChanges}>
              {versionNumber === undefined
                ? "You've changed this project since you published it. People who open the link still see the published version."
                : `You've changed this project since you published ${versionNumber}. People who open the link still see ${versionNumber}.`}
            </ShareNotice>
          ) : null}
          {isCopyRefused ? <ShareNotice tone='info'>{copyRefusedSentence}</ShareNotice> : null}
          {busy ? (
            <p role='status' className='sr-only'>
              Publishing…
            </p>
          ) : null}
          {publishError === undefined ? null : (
            <PublishErrorNotice
              message={publishError}
              signIn={signIn}
              onPublishPublic={() => {
                setChosenVisibility('public');
                sendPublish({ visibility: 'public' }, true);
              }}
            />
          )}
          <div className='flex flex-wrap justify-end gap-2'>
            {/* A link with no version yet is given one without the sentence. Where the head of `main` is not known,
                or this device is behind the version the link shows, a publish could take the link back: none. */}
            {freshness === 'empty' ? publishChanges : null}
            <Button
              ref={copyLinkRef}
              type='button'
              onClick={() => {
                void copyPublishedLink(share.url);
              }}
            >
              {copyIcon}
              <span>Copy link</span>
            </Button>
          </div>
        </SharePaneSection>
        <SharePaneSection title='Who can open the link'>
          <PublicationAccessPanel
            apiBaseUrl={apiBaseUrl}
            projectId={projectId}
            shareUrl={share.url}
            visibility={share.visibility}
            loading={loadingEnvelope}
            visibilityMutating={visibilityMutating}
            grants={share.access.grants.filter((grant) => grant.status === 'active')}
            onVisibilityChange={handleVisibilityChange}
            onGrantsChanged={async () => {
              await loadEnvelope();
              /* The accepted link, not this read's: a Stop sharing that answered after it has the last word. */
              return acceptedEnvelopeRef.current?.share?.status === 'active';
            }}
          />
          <div className='flex justify-start'>
            <Button
              ref={stopSharingRef}
              type='button'
              variant='ghost'
              disabled={isDisabled}
              onClick={() => {
                hasStoppedRef.current = false;
                setIsStopDialogOpen(true);
              }}
            >
              Stop sharing…
            </Button>
          </div>
        </SharePaneSection>
        <StopSharingDialog
          isOpen={isStopDialogOpen}
          isStopping={isStopping}
          onConfirm={() => {
            void handleStopSharing();
          }}
          onCancel={() => {
            setIsStopDialogOpen(false);
          }}
          onCloseAutoFocus={(event) => {
            event.preventDefault();
            if (!hasStoppedRef.current) {
              stopSharingRef.current?.focus();
            }
          }}
        />
      </SharePaneFrame>
    );
  };

  return () => {
    if (envelopeFailure !== undefined) {
      return (
        <SharePaneFrame isDisabled={busy || visibilityMutating}>
          <SharePaneSection>
            <CloudLinkUnavailable
              failure={envelopeFailure}
              signIn={signIn}
              onUseDirectLink={onUseDirectLink}
              onRetry={() => {
                // oxlint-disable-next-line no-void -- `loadEnvelope` reports its own failures into panel state.
                void loadEnvelope();
              }}
            />
          </SharePaneSection>
        </SharePaneFrame>
      );
    }

    if (envelope === undefined) {
      return (
        <SharePaneFrame isDisabled={busy}>
          <SharePaneSection>
            <CloudLinkSkeleton />
          </SharePaneSection>
        </SharePaneFrame>
      );
    }

    const { share } = envelope;
    return share === null || share.status === 'stopped' ? notShared(share ?? undefined) : shared(share);
  };
}

/**
 * The Share pane's source over this project: the direct link and GitHub Gist when a snapshot can be collected, and
 * the cloud link, with the method choice remembered in a cookie (R8).
 *
 * @param properties - The project and how to collect its snapshot.
 * @returns The source.
 */
export function useProjectShareSource(properties: Omit<ProjectSharePanelProps, 'host' | 'extraSections'>): ShareSource {
  const {
    projectId,
    projectName,
    projectDescription = '',
    entryPath,
    collectSnapshot,
    initialMethod,
    githubAuthorizationOutcome,
    githubAuthorizationFailure,
  } = properties;
  const services = useProjectShareServices();
  const { useShareMethodPreference, useAuthLinks, parseGithubGistAuthorizationReturn } = services;
  const shareMethodDescriptors = useMemo(
    () => shareMethodDescriptorsOf(services.shareProviderRegistry.descriptors),
    [services.shareProviderRegistry.descriptors],
  );
  const { pathname, search } = useLocation();
  const [chosenMethod, setChosenMethod] = useState<ShareMethod | undefined>(initialMethod);
  const [rememberedMethod, setRememberedMethod] = useShareMethodPreference();
  const shareMethod = resolveShareMethodFrom(shareMethodDescriptors)(
    chosenMethod,
    rememberedMethod,
    Boolean(collectSnapshot),
  );
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
  }, [parseGithubGistAuthorizationReturn, pathname, search, shareMethod]);
  const { signIn } = useAuthLinks({ redirectTo: signInReturnTo });
  const portable = usePortableShareMethods({
    services,
    shareMethodDescriptors,
    collectSnapshot: collectSnapshot ?? missingSnapshot,
    signIn,
    githubAuthorizationOutcome,
    githubAuthorizationFailure,
  });
  const renderTau = useTauShareBody({
    projectId,
    projectName,
    projectDescription,
    entryPath,
    isActive: shareMethod === 'tau',
    signIn,
    onUseDirectLink: collectSnapshot
      ? () => {
          setShareMethod('direct');
        }
      : undefined,
  });

  return useMemo((): ShareSource => {
    const methods = shareMethodDescriptors.flatMap((descriptor): ShareMethodSource[] => {
      if (descriptor.id === 'tau') {
        return [
          {
            kind: 'custom',
            id: 'tau',
            label: descriptor.label,
            icon: TauCloudIcon,
            description: 'One link that always shows the version you last published.',
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
  }, [collectSnapshot, portable, renderTau, setShareMethod, shareMethod, shareMethodDescriptors]);
}

const missingSnapshot = async (): Promise<ShareProjectSnapshot> => {
  throw new Error('The project snapshot is unavailable.');
};

function ProjectSharePanelBody({
  host: Host = StandaloneShareHost,
  extraSections,
  ...properties
}: ProjectSharePanelProps): React.JSX.Element {
  const source = useProjectShareSource(properties);
  return (
    <Host source={source}>
      <SharePane extraSections={extraSections} />
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
 * @returns The error notice, with a Sign in button when the sentence asks for it.
 */
/** What the API's plan refusal of a private link reads as (`@taucad/revisions` owns the sentence). */
const privateLinkRefusal = publishFailureMessage(403, 'ENTITLEMENT_REQUIRED');

function PublishErrorNotice({
  message,
  signIn,
  onPublishPublic,
}: {
  readonly message: string;
  readonly signIn: string;
  /** The one action a plan refusal offers (C1): publish the link for anyone instead. */
  readonly onPublishPublic: () => void;
}): React.JSX.Element {
  return (
    <ShareNotice
      tone='error'
      actions={
        message === privateLinkRefusal ? (
          <Button type='button' variant='outline' size='sm' onClick={onPublishPublic}>
            Publish as public
          </Button>
        ) : message.startsWith('Sign in') ? (
          <Button asChild variant='outline' size='sm'>
            <NavLink to={signIn}>Sign in</NavLink>
          </Button>
        ) : undefined
      }
    >
      {message}
    </ShareNotice>
  );
}
