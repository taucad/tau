import { useEffect, useMemo, useState } from 'react';
import type { LoaderFunctionArgs, MetaFunction } from 'react-router';
import { useLoaderData, useLocation, useParams } from 'react-router';
import { getActiveGroupValues, parameterEntryPath, parseProjectManifestBytes } from '@taucad/types';
import { findBuiltinExample } from '@taucad/tau-examples/builtin';
import { sharePasswordLimits } from '@taucad/share/artifact';
import type { ShareOpenedArtifact } from '@taucad/share/artifact';
import { parseShareSlug, parseShareUrl } from '@taucad/share/locator';
import { isShareError, ShareError } from '@taucad/share/provider';
import type { ShareProtection } from '@taucad/share/provider';
import type { ShareProjectSnapshot, ShareSnapshotFileRole } from '@taucad/share/snapshot';
import { Loader } from '#components/ui/loader.js';
import { Button } from '@taucad/ui/components/button';
import { Input } from '@taucad/ui/components/input';
import { Label } from '@taucad/ui/components/label';
import type { Handle } from '#types/matches.types.js';
import PublicationViewRoute, {
  ErrorBoundary as PublicationErrorBoundary,
  PublicationInteractiveSurface,
  loadPublication as publicationLoader,
  publicationMeta,
} from '#components/share/tau-publication.js';
import type { PublicationRouteLoaderData } from '#components/share/tau-publication.js';
import type { ParsedPublication } from '#components/share/parsed-publication.js';
import { GithubGistManagement } from '#components/share/github-gist-management.js';
import { shareProviderRegistry, withBrowserShareProviderContext } from '#lib/share-providers.js';
import { decodeTextFile } from '#utils/filesystem.utils.js';
import { parseParameterEntry } from '#utils/parameter-config.utils.js';

export const handle: Handle = { enablePageWrapper: false };

type ShareRouteLoaderData =
  | { readonly kind: 'tau' }
  | {
      readonly kind: 'portable';
      readonly builtin?: {
        readonly title: string;
        readonly description: string;
        readonly thumbnail?: string;
      };
    };

const sha256 = async (content: Uint8Array<ArrayBuffer>): Promise<string> => {
  const digest = new Uint8Array(await crypto.subtle.digest('SHA-256', content));
  return [...digest].map((byte) => byte.toString(16).padStart(2, '0')).join('');
};

const snapshotRole = (path: string, entryPath: string): ShareSnapshotFileRole => {
  if (path === entryPath) {
    return 'entry';
  }
  if (path === 'tau.json' || path === 'package.json' || path.startsWith('.tau/parameters/')) {
    return 'project-metadata';
  }
  return 'kernel-dependency';
};

const collectOpenedSnapshot = async (
  artifact: ShareOpenedArtifact,
  entryPath: string,
): Promise<ShareProjectSnapshot> => ({
  entryPath,
  files: await Promise.all(
    artifact.files.map(async (file) => ({
      ...file,
      sha256: await sha256(file.content),
      role: snapshotRole(file.path, entryPath),
    })),
  ),
  warnings: [],
});

export const loader = async (arguments_: LoaderFunctionArgs): Promise<unknown> => {
  const { slug } = arguments_.params;
  if (!slug) {
    // oxlint-disable-next-line typescript-eslint/only-throw-error -- route loaders use Response for HTTP status control.
    throw new Response('Not found', { status: 404 });
  }
  const locator = parseShareSlug(slug);
  if (locator.providerId === 'builtin') {
    const example = locator.reference ? findBuiltinExample(locator.reference) : undefined;
    if (!example) {
      // oxlint-disable-next-line typescript-eslint/only-throw-error -- route loaders use Response for HTTP status control.
      throw new Response('Not found', { status: 404 });
    }
    return {
      kind: 'portable',
      builtin: {
        title: example.manifest.name,
        description: example.manifest.description,
        ...(example.thumbnailUrl
          ? { thumbnail: new URL(example.thumbnailUrl, arguments_.request.url).toString() }
          : {}),
      },
    } satisfies ShareRouteLoaderData;
  }
  if (locator.providerId !== 'tau') {
    return { kind: 'portable' } satisfies ShareRouteLoaderData;
  }
  return publicationLoader({
    ...arguments_,
    params: { ...arguments_.params, id: locator.reference },
  });
};

export const meta: MetaFunction<typeof loader> = (arguments_) => {
  const loaderData = arguments_.loaderData as ShareRouteLoaderData | PublicationRouteLoaderData | undefined;
  if (loaderData && !('kind' in loaderData)) {
    return publicationMeta(arguments_ as Parameters<typeof publicationMeta>[0]);
  }
  if (loaderData?.kind === 'portable' && loaderData.builtin) {
    return [
      { title: `${loaderData.builtin.title} · Tau` },
      { name: 'description', content: loaderData.builtin.description },
      { property: 'og:title', content: loaderData.builtin.title },
      { property: 'og:description', content: loaderData.builtin.description },
      ...(loaderData.builtin.thumbnail ? [{ property: 'og:image', content: loaderData.builtin.thumbnail }] : []),
    ];
  }
  return [
    { title: 'Shared Tau project' },
    { name: 'robots', content: 'noindex, nofollow' },
    { name: 'referrer', content: 'no-referrer' },
  ];
};

const PortableShareSurface = (): React.JSX.Element => {
  const { slug = '' } = useParams();
  const location = useLocation();
  const [artifact, setArtifact] = useState<ShareOpenedArtifact>();
  const [error, setError] = useState<string>();
  const [sourceUrl, setSourceUrl] = useState<string>();
  const [sourceLabel, setSourceLabel] = useState('Shared project');
  const [needsPassword, setNeedsPassword] = useState(false);
  const [password, setPassword] = useState('');
  const [submittedPassword, setSubmittedPassword] = useState<string>();
  const [passwordError, setPasswordError] = useState<string>();
  const [opening, setOpening] = useState(true);
  const [protection, setProtection] = useState<ShareProtection>({ kind: 'none' });
  const [unpublished, setUnpublished] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const controller = new AbortController();
    const resolve = async (): Promise<void> => {
      setOpening(true);
      setArtifact(undefined);
      setUnpublished(false);
      setError(undefined);
      try {
        setSourceUrl(globalThis.location.href);
        const parsed = parseShareUrl({ slug, fragment: location.hash });
        const provider = await shareProviderRegistry.load(parsed.locator.providerId);
        const providerResolve = provider.resolve;
        if (!providerResolve) {
          throw new ShareError('SHARE_PROVIDER_UNAVAILABLE', 'This sharing method cannot resolve projects.');
        }
        const opened = await withBrowserShareProviderContext(async (context) =>
          providerResolve(
            {
              locator: parsed.locator,
              secrets: submittedPassword ? { ...parsed.secrets, p: submittedPassword } : parsed.secrets,
              signal: controller.signal,
            },
            context,
          ),
        );
        if (!cancelled) {
          setArtifact(opened);
          setNeedsPassword(false);
          setPasswordError(undefined);
          const passwordProtected =
            parsed.locator.providerId === 'direct'
              ? Boolean(parsed.secrets['jwe'])
              : Boolean(parsed.secrets['p'] ?? submittedPassword);
          const resolvedPassword = parsed.secrets['p'] ?? submittedPassword;
          setProtection(
            passwordProtected && resolvedPassword
              ? { kind: 'password', password: resolvedPassword, includePassword: Boolean(parsed.secrets['p']) }
              : { kind: 'none' },
          );
          setSourceLabel(`${passwordProtected ? 'Password-protected ' : ''}${provider.descriptor.label}`);
          if (passwordProtected) {
            globalThis.history.replaceState(
              globalThis.history.state,
              '',
              `${globalThis.location.pathname}${globalThis.location.search}`,
            );
          }
        }
      } catch (error) {
        if (!cancelled) {
          if (isShareError(error) && error.code === 'SHARE_PASSWORD_REQUIRED') {
            setNeedsPassword(true);
            setPasswordError(undefined);
          } else if (submittedPassword && isShareError(error) && error.code === 'SHARE_ARTIFACT_INVALID') {
            setNeedsPassword(true);
            setPasswordError('That password could not open this project.');
          } else {
            setError(error instanceof Error ? error.message : 'This share link could not be opened.');
          }
        }
      } finally {
        if (!cancelled) {
          setOpening(false);
        }
      }
    };
    void resolve();
    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [location.hash, slug, submittedPassword]);

  const passwordBytes = new TextEncoder().encode(password.normalize('NFC')).byteLength;
  const passwordValid = passwordBytes >= sharePasswordLimits.minBytes && passwordBytes <= sharePasswordLimits.maxBytes;

  const resolved = useMemo(() => {
    if (!artifact) {
      return undefined;
    }
    const manifestFile = artifact.files.find(({ path }) => path === 'tau.json');
    if (!manifestFile) {
      return undefined;
    }
    const parsed = parseProjectManifestBytes(manifestFile.content);
    if (!parsed.success || !artifact.files.some(({ path }) => path === parsed.data.assets.main.entryPath)) {
      return undefined;
    }
    const parameterFile = artifact.files.find(
      ({ path }) => path === parameterEntryPath(parsed.data.assets.main.entryPath),
    );
    let parameters: Record<string, unknown> = {};
    if (parameterFile) {
      try {
        parameters = getActiveGroupValues(parseParameterEntry(decodeTextFile(parameterFile.content)));
      } catch {
        return undefined;
      }
    }
    return {
      manifest: parsed.data,
      parameters,
      files: Object.fromEntries(artifact.files.map((file) => [file.path, { content: file.content }])),
    };
  }, [artifact]);

  if (unpublished) {
    return (
      <main className='flex min-h-dvh items-center justify-center bg-background p-6'>
        <div className='max-w-md rounded-xl border bg-card p-6 text-center'>
          <h1 className='text-lg font-semibold'>GitHub Gist unpublished</h1>
          <p className='mt-2 text-sm text-muted-foreground'>
            This Tau share and its GitHub Gist link no longer resolve.
          </p>
        </div>
      </main>
    );
  }

  if (error !== undefined || (artifact !== undefined && !resolved)) {
    return (
      <main className='flex min-h-dvh items-center justify-center bg-background p-6'>
        <div className='max-w-md rounded-xl border bg-card p-6 text-center'>
          <h1 className='text-lg font-semibold'>Unable to open this shared project</h1>
          <p className='mt-2 text-sm text-muted-foreground'>
            {error ?? 'The project manifest or entry file is invalid.'}
          </p>
        </div>
      </main>
    );
  }
  if (needsPassword && !artifact) {
    return (
      <main className='flex min-h-dvh items-center justify-center bg-background p-6'>
        <form
          className='w-full max-w-sm rounded-xl border bg-card p-6'
          onSubmit={(event) => {
            event.preventDefault();
            if (passwordValid) {
              setSubmittedPassword(password);
            }
          }}
        >
          <h1 className='text-lg font-semibold'>Password required</h1>
          <p className='mt-2 text-sm text-muted-foreground'>Enter the password shared by the project author.</p>
          <div className='mt-5 flex flex-col gap-2'>
            <Label htmlFor='shared-project-password'>Password</Label>
            <Input
              id='shared-project-password'
              type='password'
              autoComplete='current-password'
              autoFocus
              value={password}
              disabled={opening}
              aria-invalid={Boolean(passwordError)}
              onChange={(event) => {
                setPassword(event.target.value);
                setPasswordError(undefined);
              }}
            />
            <p className='text-xs text-muted-foreground'>
              {sharePasswordLimits.minBytes}–{sharePasswordLimits.maxBytes} UTF-8 bytes required.
            </p>
            {passwordError ? <p className='text-sm text-destructive'>{passwordError}</p> : null}
          </div>
          <Button className='mt-5 w-full' type='submit' disabled={!passwordValid || opening}>
            {opening ? <Loader className='size-4' /> : null}
            Open project
          </Button>
        </form>
      </main>
    );
  }
  if (!artifact || !resolved) {
    return (
      <main className='flex min-h-dvh flex-col items-center justify-center gap-3 bg-background text-muted-foreground'>
        <Loader className='size-8' />
        <p className='text-sm'>Opening shared project…</p>
      </main>
    );
  }

  const publication: ParsedPublication = {
    id: resolved.manifest.id,
    title: resolved.manifest.name,
    description: resolved.manifest.description,
    visibility: 'private',
    viewerRole: 'public',
    entryPath: resolved.manifest.assets.main.entryPath,
    ownerSnapshot: null,
    forkCount: 0,
    viewCount: 0,
    createdAt: new Date(0).toISOString(),
  };
  const data: PublicationRouteLoaderData = {
    publication: publication as unknown as Record<string, unknown>,
    viewerRole: 'public',
    urls: { view: '', share: '', og: '', thumbnail: '' },
    manifest: {
      version: 1,
      projectId: publication.id,
      entryPath: publication.entryPath,
      files: {},
      kernels: [],
      runtime: 'portable',
      parameters: resolved.parameters,
      createdAt: publication.createdAt,
    },
    files: {},
  };
  return (
    <PublicationInteractiveSurface
      data={data}
      publication={publication}
      archive={artifact.archive}
      shouldTrackView={false}
      hydratedFiles={resolved.files}
      shareUrl={sourceUrl}
      sourceLabel={sourceLabel}
      managementActions={
        parseShareSlug(slug).providerId === 'github-gist' ? (
          <GithubGistManagement
            locator={parseShareSlug(slug)}
            protection={protection}
            collectSnapshot={async () => collectOpenedSnapshot(artifact, publication.entryPath)}
            onRepublished={(url) => {
              globalThis.location.assign(url);
            }}
            onUnpublished={() => {
              setUnpublished(true);
            }}
          />
        ) : undefined
      }
    />
  );
};

export default function ShareRoute(): React.JSX.Element {
  const data = useLoaderData<ShareRouteLoaderData | PublicationRouteLoaderData>();
  return 'kind' in data && data.kind === 'portable' ? <PortableShareSurface /> : <PublicationViewRoute />;
}

export const ErrorBoundary = (): React.JSX.Element => <PublicationErrorBoundary />;
