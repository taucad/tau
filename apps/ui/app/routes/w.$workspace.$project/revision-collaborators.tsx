/**
 * *People with access* — the owner's half of a collaboration (charter W5, D27).
 *
 * There is no invitation email. `POST /v1/projects/:id/collaborators` answers
 * the accept token exactly once and nothing stores it afterwards, so the link
 * this panel renders **is** the invitation: if an owner closes the region
 * without copying it, the only way back is to invite the address again.
 *
 * It renders in the Share panel (C4, Q5): sharing is not history, so the
 * History pane keeps one line, "Shared with 2 people", read from the same
 * listing through {@link useSharedCount}.
 */

import { Heading } from '@taucad/ui/components/heading';
import { useEffect, useRef, useState } from 'react';
import { Loader } from '@taucad/ui/components/loader';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { AlertTriangle, UserMinus } from 'lucide-react';
import { Badge } from '@taucad/ui/components/badge';
import { Button } from '@taucad/ui/components/button';
import { Input } from '@taucad/ui/components/input';
import { Label } from '@taucad/ui/components/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@taucad/ui/components/select';
import { Tooltip, TooltipContent, TooltipTrigger } from '@taucad/ui/components/tooltip';
import { CopyButton } from '@taucad/ui/components/copy-button';
import { ENV } from '#environment.config.js';
import { isDesktopTarget } from '#lib/build-target.js';
import { shareOrigin } from '#lib/share-origin.js';
import { recordApiRequestId } from '#lib/api-request-id.js';
import { useProjectRole, useRevisionStatus } from '#hooks/use-revision-status.js';

/** One row of `GET /v1/projects/:id/collaborators`. Never a token. */
type CollaboratorEntry = Readonly<{
  email: string;
  role: 'read' | 'write';
  status: 'pending' | 'accepted' | 'revoked';
  expiresAt: string;
}>;

/** What `POST …/collaborators` answers once, and only once. */
type IssuedInvitation = Readonly<{ email: string; role: 'read' | 'write'; token: string; expiresAt: string }>;

const roleLabel = (role: 'read' | 'write'): string => (role === 'write' ? 'Can edit' : 'Can view');

const statusLabel = (status: CollaboratorEntry['status']): string =>
  status === 'accepted' ? 'Accepted' : status === 'revoked' ? 'Revoked' : 'Invited';

/**
 * The refusal, in the words of the person who caused it.
 *
 * Keyed on the API's own codes, because the status alone cannot tell a mistyped
 * address from a project this account does not own.
 *
 * @param status - The HTTP status the API answered.
 * @param code - The error code in its body, when it carried one.
 * @returns One sentence naming what happened and what to do next.
 */
const inviteFailureMessage = (status: number, code: string | undefined): string => {
  if (status === 429 || code === 'PROJECT_INVITE_RATE_LIMITED') {
    return 'Too many invitations today. Try again tomorrow.';
  }
  if (status === 400) {
    return 'Enter a valid email address.';
  }
  if (status === 403) {
    return 'Only the project owner can invite people.';
  }
  if (status === 404) {
    return 'This project is not on Tau Cloud yet. Connect the backup first.';
  }
  return 'Couldn’t create the invite. Try again.';
};

const collaboratorsEndpoint = (projectId: string): string =>
  `${ENV.TAU_API_URL.replace(/\/$/u, '')}/v1/projects/${encodeURIComponent(projectId)}/collaborators`;

const collaboratorsKey = (projectId: string): readonly string[] => ['project-collaborators', projectId];

const listCollaborators = async (projectId: string): Promise<readonly CollaboratorEntry[]> => {
  const response = await fetch(collaboratorsEndpoint(projectId), {
    credentials: 'include',
    headers: { Accept: 'application/json' },
  });
  if (!response.ok) {
    /* F4: a listing nobody could read is not an empty one. Answering `[]`
       told an owner "nobody else has access" while a collaborator with a
       live membership was sitting behind a 500. */
    throw recordApiRequestId(new Error('The list of people with access could not be loaded.'), response);
  }
  const body: unknown = await response.json();
  // oxlint-disable-next-line @typescript-eslint/consistent-type-assertions -- the owner-only route's own DTO, narrowed by the array check.
  return Array.isArray(body) ? (body as readonly CollaboratorEntry[]) : [];
};

/**
 * How many people the project is shared with, for the History pane's backup
 * line (C4). The owner's listing alone, so it is read only where the owner
 * sees it; anyone else has no count, and the line says nothing.
 *
 * @param projectId - The Tau Cloud project, when there is one.
 * @param isEnabled - Whether this viewer may read the listing.
 * @returns The number of people invited or accepted, or `undefined` while unknown.
 */
export const useSharedCount = (projectId: string | undefined, isEnabled: boolean): number | undefined => {
  const { data } = useQuery({
    queryKey: collaboratorsKey(projectId ?? ''),
    enabled: isEnabled && projectId !== undefined,
    queryFn: async () => listCollaborators(projectId ?? ''),
  });
  return data?.filter((person) => person.status !== 'revoked').length;
};

/** Reads as a date rather than as a timestamp; an invalid one says nothing at all. */
const expiryCopy = (isoDate: string): string | undefined => {
  const parsed = new Date(isoDate);
  return Number.isNaN(parsed.getTime())
    ? undefined
    : `This link works until ${parsed.toLocaleDateString(undefined, { day: 'numeric', month: 'long', year: 'numeric' })}.`;
};

export type RevisionCollaboratorsProps = {
  /** The Tau Cloud project being shared; its id is its repository path there. */
  readonly projectId: string;
};

/**
 * Who else may work on this project, and how one more is invited.
 *
 * Mounted in the Share panel for the owner alone, by {@link ProjectPeopleWithAccess}. A collaborator never sees it:
 * the routes behind it all need `owner`, and offering a control that is always
 * refused is worse than not offering it.
 *
 * @param props - The project being shared.
 * @returns The invite form, the one-time link it issues, and the people list.
 */
export function RevisionCollaborators({ projectId }: RevisionCollaboratorsProps): React.JSX.Element {
  const endpoint = collaboratorsEndpoint(projectId);
  const queryClient = useQueryClient();
  const [email, setEmail] = useState('');
  const [role, setRole] = useState<'read' | 'write'>('write');
  const [issued, setIssued] = useState<IssuedInvitation>();
  const [failure, setFailure] = useState<string>();

  const {
    data: people = [],
    isLoading,
    isError,
  } = useQuery({
    queryKey: collaboratorsKey(projectId),
    queryFn: async () => listCollaborators(projectId),
  });

  const refreshPeople = async (): Promise<void> => {
    await queryClient.invalidateQueries({ queryKey: collaboratorsKey(projectId) });
  };

  const invite = useMutation({
    async mutationFn(): Promise<IssuedInvitation> {
      const response = await fetch(endpoint, {
        method: 'POST',
        credentials: 'include',
        headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: email.trim().toLowerCase(), role }),
      });
      if (!response.ok) {
        const answered = (await response.json().catch(() => ({}))) as Readonly<{ code?: unknown }>;
        throw recordApiRequestId(
          new Error(
            inviteFailureMessage(response.status, typeof answered.code === 'string' ? answered.code : undefined),
          ),
          response,
        );
      }
      // oxlint-disable-next-line @typescript-eslint/consistent-type-assertions -- the route's own DTO.
      return (await response.json()) as IssuedInvitation;
    },
    async onSuccess(invitation) {
      setIssued(invitation);
      setFailure(undefined);
      setEmail('');
      await refreshPeople();
    },
    onError(error: Error) {
      setIssued(undefined);
      setFailure(error.message);
    },
  });

  /* W3 a2: a role change is its own verb. Re-inviting used to be how an owner
     changed one, which minted a token the invitee did not need and broke the
     link they were already holding. */
  const changeRole = useMutation({
    async mutationFn(next: Readonly<{ email: string; role: 'read' | 'write' }>): Promise<void> {
      const response = await fetch(`${endpoint}/${encodeURIComponent(next.email)}`, {
        method: 'PATCH',
        credentials: 'include',
        headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
        body: JSON.stringify({ role: next.role }),
      });
      if (!response.ok) {
        throw recordApiRequestId(
          new Error(
            response.status === 404
              ? `${next.email} has no invitation to change.`
              : `The role for ${next.email} could not be changed. Try again.`,
          ),
          response,
        );
      }
    },
    async onSuccess() {
      setFailure(undefined);
      await refreshPeople();
    },
    onError(error: Error) {
      setFailure(error.message);
    },
  });

  const revoke = useMutation({
    async mutationFn(address: string): Promise<void> {
      const response = await fetch(`${endpoint}/${encodeURIComponent(address)}`, {
        method: 'DELETE',
        credentials: 'include',
        headers: { Accept: 'application/json' },
      });
      if (!response.ok) {
        throw recordApiRequestId(new Error(`Couldn’t remove access for ${address}. Try again.`), response);
      }
    },
    async onSuccess() {
      setFailure(undefined);
      await refreshPeople();
      headingRef.current?.focus();
    },
    onError(error: Error) {
      setFailure(error.message);
    },
  });

  const busy = invite.isPending || revoke.isPending || changeRole.isPending;
  const typed = email.trim().toLowerCase();
  /* The link is only ever rendered from the token held in this component's
     state; it is never written to storage, a query cache or a log (I8). */
  const invitationUrl =
    issued === undefined ? undefined : new URL(`/invitations/${issued.token}`, shareOrigin()).toString();

  /*
   * F5: where the gesture leaves a keyboard.
   *
   * A new invitation is announced and takes focus, because the one-time link is
   * the whole product of the gesture and nothing else will show it again. A
   * revoke takes focus to the heading, because the button the click came from
   * disappears with the row it revoked and focus would otherwise fall to
   * `<body>` — the defect review R15 fixed on the disconnect confirmation.
   */
  /* One alert, whichever went wrong: a mutation the owner started, or the
     listing that never arrived. Two regions would announce twice. */
  const alert = failure ?? (isError ? 'The list of people with access could not be loaded.' : undefined);
  const linkRef = useRef<HTMLInputElement>(null);
  const headingRef = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    if (issued !== undefined) {
      linkRef.current?.focus();
    }
  }, [issued]);

  return (
    <div className='flex flex-col gap-3'>
      <Heading level={3} variant='label' ref={headingRef} tabIndex={-1} className='focus-visible:focus-outline'>
        People with access
      </Heading>

      <div className='flex flex-col gap-2'>
        <Label htmlFor='collaborator-email' className='text-sm font-normal'>
          Invite by email
        </Label>
        <div className='flex flex-wrap items-center gap-2'>
          <Input
            id='collaborator-email'
            type='email'
            inputMode='email'
            autoComplete='email'
            className='min-w-40 flex-1'
            placeholder='teammate@example.com'
            value={email}
            disabled={busy}
            onChange={(event) => {
              setEmail(event.target.value);
            }}
          />
          <Select
            value={role}
            disabled={busy}
            onValueChange={(value) => {
              setRole(value === 'read' ? 'read' : 'write');
            }}
          >
            <SelectTrigger className='w-28' aria-label='Invitation role'>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value='write'>Can edit</SelectItem>
              <SelectItem value='read'>Can view</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <Button
          size='sm'
          className='self-end'
          disabled={typed === '' || busy}
          onClick={() => {
            invite.mutate();
          }}
        >
          {invite.isPending ? <Loader className='size-4' /> : undefined}
          <span>Create invite link</span>
        </Button>
      </div>

      {/*
        The token, once (D27).

        A read-only field rather than prose, because a person who cannot use the
        clipboard still has to be able to select the whole link — and because
        the field carries the address it belongs to as its own label, so two
        invitations issued in a row can never be confused for one another.
      */}
      {issued === undefined || invitationUrl === undefined ? undefined : (
        <div
          role='status'
          aria-label='Invitation created'
          className='ph-no-capture flex flex-col gap-2 rounded-md border border-dashed p-2'
        >
          <Label htmlFor='collaborator-invitation-link' className='text-sm font-normal'>
            {`Invitation link for ${issued.email}`}
          </Label>
          <div className='flex items-center gap-2'>
            <Input
              ref={linkRef}
              id='collaborator-invitation-link'
              readOnly
              className='min-w-0 flex-1 font-mono text-xs'
              value={invitationUrl}
              onFocus={(event) => {
                event.target.select();
              }}
            />
            <CopyButton getText={() => invitationUrl} readyToCopyText='Copy link' copiedText='Copied' size='sm' />
          </div>
          {/* The desktop shell has no inbound link path, so `app://tau` was
              never the answer: the invitee finishes in a browser and the
              project arrives on their desktop's next cloud listing (blueprint
              Finding 5, ruling Q4). Either way the owner sends the link. */}
          <p className='text-xs text-muted-foreground'>
            {isDesktopTarget()
              ? 'This link opens in the browser. Once they accept, the project appears in their Tau.'
              : 'Tau does not email this link. Send it to them yourself.'}
          </p>
          {expiryCopy(issued.expiresAt) === undefined ? undefined : (
            <p className='text-xs text-muted-foreground'>{expiryCopy(issued.expiresAt)}</p>
          )}
        </div>
      )}

      {alert === undefined ? undefined : (
        <p role='alert' className='flex items-center gap-2 text-sm'>
          <AlertTriangle aria-hidden className='size-4 shrink-0 text-feature' />
          <span>{alert}</span>
        </p>
      )}

      {isLoading || isError || people.length > 0 ? (
        <ul aria-label='People with access' className='flex list-none flex-col rounded-md border'>
          {people.map((person) => (
            <li key={person.email} className='flex flex-col gap-1 border-b px-3 py-2 last:border-b-0'>
              <div className='flex min-w-0 items-center gap-2'>
                <span className='min-w-0 flex-1 truncate text-sm'>{person.email}</span>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      size='icon-xs'
                      variant='ghost'
                      className='-mr-1 shrink-0'
                      disabled={busy || person.status === 'revoked'}
                      aria-label={`Remove access for ${person.email}`}
                      onClick={() => {
                        revoke.mutate(person.email);
                      }}
                    >
                      <UserMinus aria-hidden />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent side='left'>Remove access</TooltipContent>
                </Tooltip>
              </div>
              <div className='flex items-center gap-2'>
                {person.status === 'revoked' ? (
                  <Badge variant='secondary'>{roleLabel(person.role)}</Badge>
                ) : (
                  <Select
                    size='sm'
                    value={person.role}
                    disabled={busy}
                    onValueChange={(value) => {
                      changeRole.mutate({ email: person.email, role: value === 'read' ? 'read' : 'write' });
                    }}
                  >
                    <SelectTrigger className='w-28' aria-label={`Role for ${person.email}`}>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value='write'>Can edit</SelectItem>
                      <SelectItem value='read'>Can view</SelectItem>
                    </SelectContent>
                  </Select>
                )}
                <span className='text-xs text-muted-foreground'>{statusLabel(person.status)}</span>
              </div>
            </li>
          ))}
        </ul>
      ) : (
        <p className='text-xs text-muted-foreground'>Nobody else has access to this project.</p>
      )}
    </div>
  );
}

/**
 * *People with access* in the Share panel (C4, Q5).
 *
 * The owner alone: every route behind the list needs `owner`, so a
 * collaborator would only meet a refusal. Tau Cloud alone, too (N4) — a
 * GitHub-backed project has an owner but no cloud project to invite anybody
 * to, and a project with no backup has neither.
 *
 * @param props - The project being shared.
 * @returns The section, or nothing for anyone who cannot invite.
 */
export function ProjectPeopleWithAccess({ projectId }: RevisionCollaboratorsProps): React.JSX.Element | undefined {
  const status = useRevisionStatus();
  const role = useProjectRole();
  if (role !== 'owner' || status?.remote.kind !== 'tau' || status.remote.phase !== 'connected') {
    return undefined;
  }
  return (
    <section
      aria-label='People with access'
      data-slot='share-people'
      className='max-h-[50%] shrink-0 overflow-y-auto border-t border-border bg-background p-4'
    >
      <RevisionCollaborators projectId={projectId} />
    </section>
  );
}
