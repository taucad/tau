import { Suspense, useEffect, useState } from 'react';
import type { LoaderFunctionArgs, MetaFunction } from 'react-router';
import { data, isRouteErrorResponse, useLoaderData, useRouteError } from 'react-router';
import { Loader } from '@taucad/ui/components/loader';
import {
  parsePublicationLockPayload,
  PublicationLockScreen as PublicationLockScreenView,
} from '#components/share/publication-lock-screen.js';
import type { PublicationLockReason, PublicationLockScreenVariant } from '#components/share/publication-lock-screen.js';
import { parsePublicationRecord, publicationFileFetchInit } from '#components/share/parsed-publication.js';
import type { ParsedPublication } from '#components/share/parsed-publication.js';
import { usePublicationViewerServices } from '#components/share/publication-viewer-services.js';
import { ClientOnly } from '@taucad/ui/components/client-only';

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

/** A project's cloud link id, `shr_…`: the reference in `/s/tau~shr_…`. */
const projectShareIdPattern = /^shr_[\w-]+$/u;

/*
 * Never stored by a shared cache: a cloud link shows the version last published and stops working on Stop sharing,
 * so a stored copy would show an old version, or a link that no longer works, for as long as it lived.
 */
const viewerHeaders = { 'Cache-Control': 'private, no-store' } as const;

/** The lock screen with the app's auth links, which return to the page it is shown on. */
function PublicationLockScreen({
  variant,
  isInline,
}: {
  readonly variant: PublicationLockScreenVariant;
  readonly isInline?: boolean;
}): React.JSX.Element {
  const { useAuthLinks } = usePublicationViewerServices();
  const authLinks = useAuthLinks();

  return <PublicationLockScreenView variant={variant} authLinks={authLinks} isInline={isInline} />;
}

function throwPublicationLock(reason: PublicationLockReason, httpStatus: number): never {
  // oxlint-disable-next-line typescript-eslint/only-throw-error -- React Router uses Response throws as control-flow
  throw new Response(JSON.stringify({ reason }), {
    status: httpStatus,
    headers: { 'Content-Type': 'application/json', ...viewerHeaders },
  });
}

/** The `/s/$slug` loader of a cloud link. */
export type PublicationLoader = (args: LoaderFunctionArgs) => Promise<unknown>;

/**
 * The loader that reads a cloud link for the viewer: `GET /v1/shares/<shareId>` with the visitor's cookie. Only a link
 * id opens; an old per-version link (`tau~pub_…`) is not found, as is anything else, without asking the API.
 *
 * @param apiBaseUrl - The Tau API origin, read only once the link id is known to be one.
 * @returns The loader; it resolves to the viewer payload, never stored by a shared cache.
 */
export const createPublicationLoader =
  (apiBaseUrl: () => Promise<string>): PublicationLoader =>
  async ({ request, params }) => {
    const shareId = params['id'];
    if (shareId === undefined || !projectShareIdPattern.test(shareId)) {
      throwPublicationLock('not-found', 404);
    }

    const apiOrigin = await apiBaseUrl();
    const apiBase = apiOrigin.replace(/\/$/, '');

    const maybeResponse = await fetch(`${apiBase}/v1/shares/${shareId}`, {
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

    return data(body, { headers: new Headers(viewerHeaders) });
  };

export const publicationMeta: MetaFunction<PublicationLoader> = ({ loaderData }) => {
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
  const { sharedProjectWorkbench: SharedProjectWorkbench } = usePublicationViewerServices();
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
          shouldTrackView={shouldTrackView}
          projectId={data.manifest.projectId}
          kernel={data.manifest.kernels[0]}
          publication={publication}
          hydratedFiles={filesRecord}
          archive={archive}
          shareUrl={shareUrl}
          sourceLabel={sourceLabel}
          managementActions={managementActions}
        />
      </Suspense>
    </ClientOnly>
  );
};

export function PublicationViewRoute(): React.JSX.Element {
  const { workerGate: WorkerGate } = usePublicationViewerServices();
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
    <WorkerGate>
      <PublicationInteractiveSurface data={loaderData} publication={publication} />
    </WorkerGate>
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
  const { useSession } = usePublicationViewerServices();
  const { data: session, isPending } = useSession();

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

export function PublicationErrorBoundary(): React.JSX.Element {
  const { errorPage: ErrorPage } = usePublicationViewerServices();
  const error = useRouteError();

  if (isRouteErrorResponse(error)) {
    const reason = parsePublicationLockPayload(error.data);
    if (reason) {
      return <PublicationRouteLockBoundary reason={reason} />;
    }
  }

  return <ErrorPage />;
}
