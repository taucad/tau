/**
 * `/s/:slug` inside the desktop shell — where `tau://s/<slug>` lands (R4).
 *
 * The web route at this path is server-rendered: its `loader` resolves a Tau
 * publication through the API with the visitor's cookie, and SSR is what gives
 * a shared link its title, its Open Graph card and its crawlable body. SPA mode
 * admits no `loader` at all, so the desktop build serves this path from its own
 * module instead of degrading the web one — the desktop manifest points the
 * route's file here (`apps/ui/desktop/app/routes.ts`).
 *
 * What changes is only where the publication comes from. `apps/desktop`'s main
 * process injects the bearer credential into every renderer request bound for
 * the API (`src/main/header-injection.ts`), so the renderer fetches the same
 * `/v1/publications/<id>` the web loader fetches and needs no second transport.
 * Everything else is the shipped surface: a portable share (`direct`, a Gist, a
 * builtin) already resolves entirely in the browser, and both branches end in
 * the same read-only workbench the web shows.
 *
 * ponytail: the web `route.tsx` is imported for its portable surface rather
 * than having that surface moved to a third module. The rule the manifest
 * states — a desktop-reachable module must not drag an excluded route's server
 * code into the SPA graph — is about what the graph gains, and it gains
 * nothing here: the builtin catalog is already in it through
 * `#lib/builtin-share-provider.js`, and `#environment.config.js` through every
 * route that reads `ENV`. What remains is two dead function bodies (`loader`
 * and `loadPublication`), and splitting `loadPublication` out of a component
 * module is blueprint P-R4's, not this package's.
 *
 * ponytail: no `clientLoader`. SPA mode permits `HydrateFallback` only on the
 * root route, and this route's whole entry path is a cold `window.loadURL` from
 * main — so a loader would leave the person looking at an empty shell while it
 * resolved. Resolving in the component is what renders "Opening shared
 * project…" the moment the window lands.
 */

import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router';
import { CircleAlert, Link2, LogIn } from 'lucide-react';
import { parseShareSlug } from '@taucad/share/locator';
import { Button } from '@taucad/ui/components/button';
import { Loader } from '#components/ui/loader.js';
import { PublicationLockScreen } from '#components/share/publication-lock-screen.js';
import type { PublicationLockScreenVariant } from '#components/share/publication-lock-screen.js';
import { parsePublicationRecord } from '#components/share/parsed-publication.js';
import {
  ErrorBoundary as PublicationErrorBoundary,
  PublicationInteractiveSurface,
} from '#components/share/tau-publication.js';
import type { PublicationRouteLoaderData } from '#components/share/tau-publication.js';
import { PortableShareSurface } from '#routes/s.$slug/route.js';
import { requireClientEnvironmentUrl } from '#environment.config.js';
import { useAuthLinks } from '#hooks/use-auth-links.js';
import { SharedWorkerGate } from '#hooks/use-file-manager.js';
import type { Handle } from '#types/matches.types.js';

export const handle: Handle = { enablePageWrapper: false };

/** What this route can end in, once the slug has been resolved. */
export type DesktopShareOutcome =
  /** A provider the browser resolves on its own: `direct`, a Gist, a builtin. */
  | { readonly kind: 'portable' }
  /** A Tau publication this account may read. */
  | { readonly kind: 'publication'; readonly data: PublicationRouteLoaderData }
  /** The publication is private and this shell has no session. */
  | { readonly kind: 'signed-out' }
  /** The owner withdrew the publication. */
  | { readonly kind: 'unpublished' }
  /** Nothing in the slug identifies a share. */
  | { readonly kind: 'unopenable' }
  /**
   * An outcome the deep-link canvas never drew — a typo'd id, another
   * account's private publication, a rate limit, an API that did not answer.
   * The shipped lock screen already says each of these, in the same words the
   * web says them, so the desktop says nothing new.
   */
  | { readonly kind: 'locked'; readonly variant: PublicationLockScreenVariant };

/**
 * Resolve one `/s/:slug` for the desktop shell.
 *
 * Mirrors the status vocabulary of the web loader (`loadPublication` in
 * `#components/share/tau-publication.js`) so both builds answer the same API
 * the same way. Never rejects: every failure is one of the outcomes.
 *
 * @param slug - The share slug from the route parameters.
 * @returns What the route should show.
 */
export const resolveDesktopShare = async (slug: string | undefined): Promise<DesktopShareOutcome> => {
  if (slug === undefined || slug === '') {
    return { kind: 'unopenable' };
  }

  let publicationId: string;
  try {
    const locator = parseShareSlug(slug);
    if (locator.providerId !== 'tau') {
      return { kind: 'portable' };
    }
    if (locator.reference === undefined || locator.reference === '') {
      return { kind: 'unopenable' };
    }
    publicationId = locator.reference;
  } catch {
    /* `parseShareSlug` throws for anything that does not name its provider,
       which the shell's parser cannot tell apart from a real slug. */
    return { kind: 'unopenable' };
  }

  const response = await fetch(`${requireClientEnvironmentUrl('TAU_API_URL')}/v1/publications/${publicationId}`, {
    headers: { Accept: 'application/json' },
    /* Cookies never leave `app://tau`; main attaches the bearer. Kept for the
       same reason every other client-side API call in this app keeps it: the
       API allows this origin with credentials, and nothing here should be the
       one call that behaves differently. */
    credentials: 'include',
  }).catch(() => undefined);

  if (response === undefined) {
    return { kind: 'locked', variant: 'serviceUnavailable' };
  }
  if (response.status === 401) {
    return { kind: 'signed-out' };
  }
  if (response.status === 410) {
    return { kind: 'unpublished' };
  }
  if (response.status === 403) {
    return { kind: 'locked', variant: 'accessDenied' };
  }
  if (response.status === 404) {
    return { kind: 'locked', variant: 'notFound' };
  }
  if (response.status === 429) {
    return { kind: 'locked', variant: 'rateLimited' };
  }
  if (!response.ok) {
    return { kind: 'locked', variant: 'serviceUnavailable' };
  }

  const body = (await response.json().catch(() => undefined)) as PublicationRouteLoaderData | undefined;
  return body === undefined ? { kind: 'locked', variant: 'serviceUnavailable' } : { kind: 'publication', data: body };
};

/**
 * A centred sentence and one way onwards, full-bleed.
 *
 * ponytail: `InvitationNotice`'s geometry, written out rather than imported —
 * it is a private component of `/invitations/:token`, and lifting it would
 * change a shipped route this package does not own. Extract it the third time
 * something needs it.
 *
 * @param props - The icon, the heading, the explanation and the action.
 * @returns The page.
 */
function ShareNotice({
  icon,
  title,
  detail,
  action,
}: {
  readonly icon: React.ReactNode;
  readonly title: string;
  readonly detail: string;
  readonly action: React.ReactNode;
}): React.JSX.Element {
  return (
    <main className='flex min-h-dvh items-center justify-center bg-background p-6'>
      <div className='flex flex-col items-center justify-center gap-4 text-center'>
        <div className='flex size-12 items-center justify-center rounded-full bg-muted'>{icon}</div>
        <div className='flex max-w-prose flex-col gap-1'>
          <p className='font-medium'>{title}</p>
          <p className='text-sm text-muted-foreground'>{detail}</p>
        </div>
        {action}
      </div>
    </main>
  );
}

/**
 * The signed-out outcome, holding the link across the browser sign-in.
 *
 * `/auth/sign-in` is one of the destinations the desktop shell owns
 * (`useShellAuthHandoff` in `#providers/auth-provider.js`): landing on it opens
 * the system browser, and the `redirectTo` this link carries is what brings the
 * shell back to `/s/:slug` once the session arrives — the same handoff
 * `/invitations/:token` uses.
 *
 * @returns The page.
 */
function SignedOutNotice(): React.JSX.Element {
  const { signIn } = useAuthLinks();
  return (
    <ShareNotice
      icon={<LogIn className='size-6 text-muted-foreground' aria-hidden />}
      title='Sign in to open this link.'
      detail='Sign-in opens in your browser. Tau Desktop keeps the link and opens it once you are signed in.'
      action={
        <Button asChild>
          <Link to={signIn}>Sign in</Link>
        </Button>
      }
    />
  );
}

/** The one way onwards from a link that will never open. */
const goToProjects = (
  <Button variant='outline' asChild>
    <Link to='/projects'>Go to projects</Link>
  </Button>
);

/**
 * The shared file a `tau://s/<slug>` link names, in the desktop shell.
 *
 * @returns The route.
 */
export default function DesktopShareRoute(): React.JSX.Element {
  const { slug } = useParams();
  const [outcome, setOutcome] = useState<DesktopShareOutcome>();

  useEffect(() => {
    let cancelled = false;
    const resolve = async (): Promise<void> => {
      setOutcome(undefined);
      const resolved = await resolveDesktopShare(slug);
      if (!cancelled) {
        setOutcome(resolved);
      }
    };
    // async-iife: bootstrap
    void resolve();
    return () => {
      cancelled = true;
    };
  }, [slug]);

  if (outcome === undefined) {
    return (
      <main
        role='status'
        aria-busy='true'
        className='flex min-h-dvh flex-col items-center justify-center gap-3 bg-background text-muted-foreground'
      >
        <Loader className='size-8' />
        <p className='text-sm'>Opening shared project…</p>
      </main>
    );
  }

  switch (outcome.kind) {
    case 'portable': {
      return <PortableShareSurface />;
    }
    case 'publication': {
      const publication = parsePublicationRecord(outcome.data.publication, outcome.data.viewerRole);
      return publication ? (
        <SharedWorkerGate>
          <PublicationInteractiveSurface data={outcome.data} publication={publication} />
        </SharedWorkerGate>
      ) : (
        <div className='flex h-dvh w-full flex-col bg-background'>
          <PublicationLockScreen variant='serviceUnavailable' />
        </div>
      );
    }
    case 'signed-out': {
      return <SignedOutNotice />;
    }
    case 'unpublished': {
      return (
        <ShareNotice
          icon={<Link2 className='size-6 text-muted-foreground' aria-hidden />}
          title='This share link is no longer valid.'
          detail='The owner unpublished it. Ask them for a new link.'
          action={goToProjects}
        />
      );
    }
    case 'unopenable': {
      return (
        <ShareNotice
          icon={<CircleAlert className='size-6 text-muted-foreground' aria-hidden />}
          title='Tau cannot open this link.'
          detail='It is not a project, invitation, import or sign-in link. Check the link you were sent.'
          action={goToProjects}
        />
      );
    }
    case 'locked': {
      return (
        <div className='flex min-h-dvh w-full flex-col bg-background'>
          <PublicationLockScreen variant={outcome.variant} />
        </div>
      );
    }
  }
}

export const ErrorBoundary = (): React.JSX.Element => <PublicationErrorBoundary />;
