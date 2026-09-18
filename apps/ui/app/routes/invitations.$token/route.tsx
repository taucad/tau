/**
 * `/invitations/:token` — accepting a project invitation (charter W5, D27).
 *
 * There is no invitation email, so this link is the whole of what an invitee
 * receives: an address they may not recognise, in an account they may not be
 * signed in to. Every branch it lands in therefore has to be a sentence a
 * stranger can act on with no other context.
 *
 * Accepting is authenticated, because it binds the invitation to an account and
 * there is no account to bind before signing in. A signed-out visitor keeps the
 * link through the app's own `redirectTo` and comes back here afterwards.
 */

import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router';
import { useQueryClient } from '@tanstack/react-query';
import { useSession } from '@better-auth-ui/react';
import { Users } from 'lucide-react';
import { Button } from '@taucad/ui/components/button';
import { Loader } from '#components/ui/loader.js';
import { ENV } from '#environment.config.js';
import { useAuthLinks } from '#hooks/use-auth-links.js';
import { authClient } from '#lib/auth-client.js';
import { cloudProjectsQueryKey, fetchCloudProjects } from '#hooks/use-cloud-projects.js';
import { useOpenCloudProject } from '#hooks/use-open-cloud-project.js';

/** What the route can end in, once the token has been offered. */
type AcceptOutcome =
  | Readonly<{ kind: 'mismatch' }>
  | Readonly<{ kind: 'unverified' }>
  | Readonly<{ kind: 'spent' }>
  | Readonly<{ kind: 'failed' }>;

/**
 * Which refusal this is, in the API's own vocabulary (W3 a2).
 *
 * Keyed on `code`, never on the status: `403` covers both an account at the
 * wrong address and an account with no verified address at all, and only one of
 * those is fixed by signing in somewhere else. A code this build has not met
 * gets the generic line rather than a guess.
 *
 * @param code - The error code the API answered with, when it carried one.
 * @returns The state to render.
 */
const outcomeForCode = (code: unknown): AcceptOutcome => {
  if (code === 'INVITATION_EMAIL_MISMATCH') {
    return { kind: 'mismatch' };
  }
  if (code === 'INVITATION_EMAIL_UNVERIFIED') {
    return { kind: 'unverified' };
  }
  if (code === 'INVITATION_NOT_FOUND') {
    return { kind: 'spent' };
  }
  return { kind: 'failed' };
};

/**
 * A centred sentence and one way onwards — the shape every refusal here takes.
 *
 * @param props - The heading, the explanation and the action.
 * @returns The panel.
 */
function InvitationNotice({
  title,
  detail,
  action,
}: {
  readonly title: string;
  readonly detail: string;
  readonly action: React.ReactNode;
}): React.JSX.Element {
  return (
    <div className='flex flex-col items-center justify-center gap-4 py-16 text-center'>
      <div className='flex size-12 items-center justify-center rounded-full bg-muted'>
        <Users className='size-6 text-muted-foreground' aria-hidden />
      </div>
      <div className='flex max-w-prose flex-col gap-1'>
        <p className='font-medium'>{title}</p>
        <p className='text-sm text-muted-foreground'>{detail}</p>
      </div>
      {action}
    </div>
  );
}

/**
 * Accept an invitation as the signed-in account, then open the project.
 *
 * @returns The route.
 */
export default function AcceptInvitation(): React.JSX.Element {
  const { token } = useParams();
  const { data: session, isPending } = useSession(authClient);
  const { signIn } = useAuthLinks();
  const navigate = useNavigate();
  const openProject = useOpenCloudProject();
  const queryClient = useQueryClient();
  const [outcome, setOutcome] = useState<AcceptOutcome>();
  /* The POST binds a membership, so it runs once per mount: React's development
     double-effect would otherwise spend the token twice and the second answer
     would race the first one's navigation. */
  const offered = useRef(false);

  useEffect(() => {
    /* F2: better-auth answers `null` for a signed-out session, not `undefined`.
       An `=== undefined` guard let a signed-out visitor spend their token on an
       unauthenticated POST and then read "could not be accepted". */
    if (token === undefined || !session || offered.current) {
      return;
    }
    offered.current = true;
    const accept = async (): Promise<void> => {
      try {
        const apiBaseUrl = ENV.TAU_API_URL.replace(/\/$/u, '');
        const response = await fetch(`${apiBaseUrl}/v1/invitations/${encodeURIComponent(token)}`, {
          method: 'POST',
          credentials: 'include',
          headers: { Accept: 'application/json' },
        });
        if (!response.ok) {
          const refused = (await response.json().catch(() => ({}))) as Readonly<{ code?: unknown }>;
          setOutcome(outcomeForCode(refused.code));
          return;
        }
        const accepted = (await response.json()) as Readonly<{ projectId?: unknown }>;
        if (typeof accepted.projectId !== 'string') {
          setOutcome({ kind: 'failed' });
          return;
        }
        /* The accept answers an id and a role, not a name — and a project created
         under a placeholder name keeps that name as its directory. The listing
         the collaboration has just joined carries the real one. */
        const listing = await fetchCloudProjects();
        /* N2: the listing this accept has just joined is the one the project
           route reads its role from. Dropping it left the opened project a frame
           with no role at all, which folds every collaborator affordance away. */
        queryClient.setQueryData(cloudProjectsQueryKey, listing);
        const listed = listing.find((project) => project.id === accepted.projectId);
        if (listed === undefined) {
          /* Accepted, but the listing did not answer: the library is where every
           reachable project is named, so that is where they are sent. */
          await navigate('/projects');
          return;
        }
        await openProject(listed);
      } catch {
        setOutcome({ kind: 'failed' });
      }
    };
    // async-iife: bootstrap -- the effect cannot await; `accept` settles every branch into state.
    void accept();
  }, [navigate, openProject, queryClient, session, token]);

  if (isPending) {
    return (
      <div
        role='status'
        aria-busy='true'
        aria-label='Checking your account'
        className='flex items-center justify-center py-16'
      >
        <Loader className='size-6 text-muted-foreground' />
      </div>
    );
  }

  if (!session) {
    return (
      <InvitationNotice
        title='Sign in to accept this invitation'
        detail='Tau records who works on a project, so it needs to know who you are before it can add you to this one.'
        action={
          <Button asChild>
            <Link to={signIn}>Sign in</Link>
          </Button>
        }
      />
    );
  }

  if (outcome?.kind === 'mismatch') {
    const address = session.user.email;
    return (
      <InvitationNotice
        title='This invitation was sent to a different email address.'
        detail={`You are signed in as ${address}. Sign in with the invited address to accept it.`}
        action={
          <Button asChild variant='outline'>
            <Link to={signIn}>Use a different account</Link>
          </Button>
        }
      />
    );
  }

  if (outcome?.kind === 'unverified') {
    return (
      <InvitationNotice
        title='Verify your email address, then open this link again.'
        detail='An invitation is issued to an address, so Tau adds you only once that address is proven to be yours.'
        action={
          <Button asChild variant='outline'>
            <Link to='/settings/account'>Go to account settings</Link>
          </Button>
        }
      />
    );
  }

  if (outcome?.kind === 'spent') {
    return (
      <InvitationNotice
        title='This invitation link is no longer valid.'
        detail='It was revoked or it has expired. Ask the project owner for a new one.'
        action={
          <Button asChild variant='outline'>
            <Link to='/projects'>Go to projects</Link>
          </Button>
        }
      />
    );
  }

  if (outcome?.kind === 'failed') {
    return (
      <InvitationNotice
        title='The invitation could not be accepted.'
        detail='Tau Cloud did not answer. Open the link again in a moment.'
        action={
          <Button asChild variant='outline'>
            <Link to='/projects'>Go to projects</Link>
          </Button>
        }
      />
    );
  }

  return (
    <div role='status' aria-busy='true' className='flex items-center justify-center gap-3 py-16'>
      <Loader className='size-6 text-muted-foreground' />
      <span className='text-sm text-muted-foreground'>Opening the invitation…</span>
    </div>
  );
}
