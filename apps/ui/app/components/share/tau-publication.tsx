import { lazy, Suspense, useEffect, useState } from 'react';
import type { LoaderFunctionArgs, MetaFunction } from 'react-router';
import { data, isRouteErrorResponse, useLoaderData, useRouteError } from 'react-router';
import { useSession } from '@better-auth-ui/react';
import { authClient } from '#lib/auth-client.js';
import { ENV, getEnvironment } from '#environment.config.js';
import { cacheTag, cdnBackedSsrRouteHeaders } from '#lib/react-router.lib.js';
import { SharedWorkerGate } from '#hooks/use-file-manager.js';
import { Loader } from '#components/ui/loader.js';
import { ErrorPage } from '#components/error-page.js';
import { PublicationLockScreen, parsePublicationLockPayload } from '#components/share/publication-lock-screen.js';
import type { PublicationLockReason, PublicationLockScreenVariant } from '#components/share/publication-lock-screen.js';
import { parsePublicationRecord, publicationFileFetchInit } from '#components/share/parsed-publication.js';
import type { ParsedPublication } from '#components/share/parsed-publication.js';
import { useViewPing } from '#components/share/use-view-ping.js';
import { ClientOnly } from '#components/ui/utils/client-only.js';

const SharedProjectWorkbench = lazy(async () => {
  const module = await import('#components/share/shared-project-workbench.js');
  return { default: module.SharedProjectWorkbench };
});

export type PublicationRouteLoaderData = {
  publication: Record<string, unknown>;
  viewerRole: 'owner' | 'grantee' | 'public';
  urls: {
    view: string;
    share: string;
    og: string;
    thumbnail: string;
  };
  manifest: {
    version: 1;
    projectId: string;
    entryPath: string;
    files: Record<string, string>;
    kernels: string[];
    runtime: string;
    parameters: Record<string, unknown>;
    createdAt: string;
  };
  files: Record<string, string>;
};

function throwPublicationLock(reason: PublicationLockReason, httpStatus: number): never {
  // oxlint-disable-next-line typescript-eslint/only-throw-error -- React Router uses Response throws as control-flow
  throw new Response(JSON.stringify({ reason }), {
    status: httpStatus,
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'private, no-store' },
  });
}

export const loadPublication = async ({ request, params }: LoaderFunctionArgs): Promise<unknown> => {
  const publicationId = params['id'];
  if (publicationId === undefined || publicationId === '') {
    throwPublicationLock('not-found', 404);
  }

  const environment = await getEnvironment();
  const apiBase = environment.TAU_API_URL.replace(/\/$/, '');

  const maybeResponse = await fetch(`${apiBase}/v1/publications/${publicationId}`, {
    headers: {
      Accept: 'application/json',
      Cookie: request.headers.get('Cookie') ?? '',
    },
  }).catch(() => undefined);

  if (maybeResponse === undefined) {
    throwPublicationLock('service-unavailable', 503);
  }
  const response = maybeResponse;

  if (response.status === 401) {
    throwPublicationLock('sign-in-required', 401);
  }

  if (response.status === 404) {
    throwPublicationLock('not-found', 404);
  }

  if (response.status === 410) {
    throwPublicationLock('unpublished', 410);
  }

  if (response.status === 429) {
    throwPublicationLock('rate-limited', 429);
  }

  if (response.status === 403) {
    throwPublicationLock('forbidden', 403);
  }

  if (!response.ok) {
    throwPublicationLock('service-unavailable', 503);
  }

  const body = (await response.json().catch(() => {
    throwPublicationLock('service-unavailable', 503);
  })) as PublicationRouteLoaderData;

  // Forward upstream Set-Cookie (tau_view_id issuance) to the browser.
  const upstreamSetCookie = response.headers.get('set-cookie');
  const publication = parsePublicationRecord(body.publication, body.viewerRole);
  const responseHeaders =
    publication?.visibility === 'private'
      ? new Headers({ 'Cache-Control': 'private, no-store' })
      : new Headers(cdnBackedSsrRouteHeaders(cacheTag.publicationViewer, 'long'));
  if (upstreamSetCookie !== null) {
    responseHeaders.append('Set-Cookie', upstreamSetCookie);
  }

  return data(body, { headers: responseHeaders });
};

export const publicationMeta: MetaFunction<typeof loadPublication> = ({ loaderData }) => {
  if (!loaderData) {
    return [];
  }

  const dataRecord = loaderData as unknown as PublicationRouteLoaderData;
  const publication = parsePublicationRecord(dataRecord.publication, dataRecord.viewerRole);
  if (!publication) {
    return [];
  }

  const tags: Array<{ title: string } | { name: string; content: string } | { property: string; content: string }> = [
    { title: publication.title },
    { property: 'og:title', content: publication.title },
  ];

  const thumbnail = dataRecord.files['thumbnail.webp'];
  if (thumbnail) {
    tags.push(
      { property: 'og:image', content: thumbnail },
      { name: 'twitter:card', content: 'summary_large_image' },
      { name: 'twitter:image', content: thumbnail },
    );
  }

  if (publication.description) {
    tags.push({ property: 'og:description', content: publication.description });
  }

  if (publication.visibility === 'private') {
    tags.push({ name: 'robots', content: 'noindex' });
    tags.push({ name: 'referrer', content: 'no-referrer' });
  }

  return tags;
};

const PublicationViewPingMount = ({ publicationId }: { readonly publicationId: string }): React.ReactNode => {
  return <PublicationViewPingInner publicationId={publicationId} apiBase={ENV.TAU_API_URL} />;
};

const PublicationViewPingInner = ({
  publicationId,
  apiBase,
}: {
  readonly publicationId: string;
  readonly apiBase: string;
}): React.ReactNode => {
  useViewPing({ publicationId, apiBaseUrl: apiBase });
  return null;
};

export const PublicationInteractiveSurface = ({
  data,
  publication,
  archive,
  shouldTrackView = true,
  hydratedFiles,
  shareUrl,
  sourceLabel,
  managementActions,
}: {
  readonly data: PublicationRouteLoaderData;
  readonly publication: ParsedPublication;
  readonly archive?: Uint8Array<ArrayBuffer>;
  readonly shouldTrackView?: boolean;
  readonly hydratedFiles?: Record<string, { content: Uint8Array<ArrayBuffer> }>;
  readonly shareUrl?: string;
  readonly sourceLabel?: string;
  readonly managementActions?: React.ReactNode;
}): React.JSX.Element => {
  const [filesRecord, setFilesRecord] = useState<Record<string, { content: Uint8Array<ArrayBuffer> }> | undefined>(
    hydratedFiles,
  );
  const [fetchError, setFetchError] = useState<Error | undefined>();

  useEffect(() => {
    let cancelled = false;

    const loadFiles = async (): Promise<void> => {
      if (hydratedFiles) {
        setFilesRecord(hydratedFiles);
        return;
      }
      try {
        const pairs = await Promise.all(
          Object.entries(data.files).map(async ([path, blobUrl]) => {
            const response = await fetch(blobUrl, publicationFileFetchInit(publication.visibility));
            if (!response.ok) {
              throw new Error(`Failed to fetch ${path} (${response.status})`);
            }

            const buffer = await response.arrayBuffer();

            return [path, { content: new Uint8Array(buffer) }] as const;
          }),
        );

        if (cancelled) {
          return;
        }

        setFilesRecord(Object.fromEntries(pairs));
      } catch (error) {
        if (!cancelled) {
          setFetchError(error instanceof Error ? error : new Error(String(error)));
        }
      }
    };
    // async-iife: bootstrap
    void loadFiles();

    return () => {
      cancelled = true;
    };
  }, [data.files, hydratedFiles, publication.visibility]);

  if (fetchError) {
    return <PublicationLockScreen variant='filesUnavailable' isInline />;
  }

  if (!filesRecord) {
    return (
      <div className='flex size-full flex-col items-center justify-center gap-2 text-muted-foreground'>
        <Loader className='size-8' />
        <span className='text-sm'>Loading sources…</span>
      </div>
    );
  }

  return (
    <>
      {shouldTrackView ? <PublicationViewPingMount publicationId={publication.id} /> : null}
      <ClientOnly
        fallback={
          <div className='flex h-dvh items-center justify-center bg-background'>
            <Loader className='size-8' />
          </div>
        }
      >
        <Suspense
          fallback={
            <div className='flex h-dvh items-center justify-center bg-background'>
              <Loader className='size-8' />
            </div>
          }
        >
          <SharedProjectWorkbench
            projectId={data.manifest.projectId}
            publication={publication}
            hydratedFiles={filesRecord}
            archive={archive}
            shareUrl={shareUrl}
            sourceLabel={sourceLabel}
            managementActions={managementActions}
          />
        </Suspense>
      </ClientOnly>
    </>
  );
};

export default function PublicationViewRoute(): React.JSX.Element {
  const loaderData = useLoaderData<PublicationRouteLoaderData>();
  const publication = parsePublicationRecord(loaderData.publication, loaderData.viewerRole);

  if (!publication) {
    return (
      <div className='flex h-dvh w-full flex-col bg-background'>
        <PublicationLockScreen variant='serviceUnavailable' />
      </div>
    );
  }

  return (
    <SharedWorkerGate>
      <PublicationInteractiveSurface data={loaderData} publication={publication} />
    </SharedWorkerGate>
  );
}

function publicationLockReasonToVariant(
  reason: Exclude<PublicationLockReason, 'forbidden'>,
): PublicationLockScreenVariant {
  switch (reason) {
    case 'sign-in-required': {
      return 'signInRequired';
    }

    case 'not-found': {
      return 'notFound';
    }

    case 'unpublished': {
      return 'unpublished';
    }

    case 'rate-limited': {
      return 'rateLimited';
    }

    case 'service-unavailable': {
      return 'serviceUnavailable';
    }

    default: {
      const exhaustive: never = reason;
      throw new Error(`Unhandled lock reason: ${String(exhaustive)}`);
    }
  }
}

function PublicationRouteLockBoundary({ reason }: { readonly reason: PublicationLockReason }): React.JSX.Element {
  const { data: session, isPending } = useSession(authClient);

  if (reason === 'forbidden' && isPending) {
    return (
      <div className='flex min-h-dvh w-full flex-col items-center justify-center bg-background'>
        <Loader className='size-8 text-muted-foreground' />
      </div>
    );
  }

  const variant: PublicationLockScreenVariant =
    reason === 'forbidden' ? (session ? 'accessDenied' : 'signInRequired') : publicationLockReasonToVariant(reason);

  return (
    <div className='flex min-h-dvh w-full flex-col bg-background'>
      <PublicationLockScreen variant={variant} />
    </div>
  );
}

export function ErrorBoundary(): React.JSX.Element {
  const error = useRouteError();

  if (isRouteErrorResponse(error)) {
    const reason = parsePublicationLockPayload(error.data);
    if (reason) {
      return <PublicationRouteLockBoundary reason={reason} />;
    }
  }

  return <ErrorPage />;
}
