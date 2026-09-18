/**
 * *People with access* — the owner's half of a collaboration (charter W5, D27).
 *
 * There is no invitation email. `POST /v1/projects/:id/collaborators` answers
 * the accept token exactly once and nothing stores it afterwards, so the link
 * this panel renders **is** the invitation: if an owner closes the region
 * without copying it, the only way back is to invite the address again.
 *
 * Its own file because the Sync region is already the one module three lanes
 * edit, and because everything here is network-bound while the region is
 * deliberately presentational.
 */

import { useEffect, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { AlertTriangle, Loader2, Trash2 } from 'lucide-react';
import { Badge } from '@taucad/ui/components/badge';
import { Button } from '@taucad/ui/components/button';
import { Input } from '@taucad/ui/components/input';
import { Label } from '@taucad/ui/components/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@taucad/ui/components/select';
import { Tooltip, TooltipContent, TooltipTrigger } from '@taucad/ui/components/tooltip';
import { CopyButton } from '#components/copy-button.js';
import { ENV } from '#environment.config.js';

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
  return 'The invitation could not be created. Try again.';
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
 * Mounted by the Sync region for the owner alone. A collaborator never sees it:
 * the routes behind it all need `owner`, and offering a control that is always
 * refused is worse than not offering it.
 *
 * @param props - The project being shared.
 * @returns The invite form, the one-time link it issues, and the people list.
 */
export function RevisionCollaborators({ projectId }: RevisionCollaboratorsProps): React.JSX.Element {
  const endpoint = `${ENV.TAU_API_URL.replace(/\/$/u, '')}/v1/projects/${encodeURIComponent(projectId)}/collaborators`;
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
    queryKey: ['project-collaborators', projectId],
    async queryFn(): Promise<readonly CollaboratorEntry[]> {
      const response = await fetch(endpoint, { credentials: 'include', headers: { Accept: 'application/json' } });
      if (!response.ok) {
        /* F4: a listing nobody could read is not an empty one. Answering `[]`
           told an owner "nobody else has access" while a collaborator with a
           live membership was sitting behind a 500. */
        throw new Error('The list of people with access could not be loaded.');
      }
      const body: unknown = await response.json();
      // oxlint-disable-next-line @typescript-eslint/consistent-type-assertions -- the owner-only route's own DTO, narrowed by the array check.
      return Array.isArray(body) ? (body as readonly CollaboratorEntry[]) : [];
    },
  });

  const refreshPeople = async (): Promise<void> => {
    await queryClient.invalidateQueries({ queryKey: ['project-collaborators', projectId] });
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
        throw new Error(
          inviteFailureMessage(response.status, typeof answered.code === 'string' ? answered.code : undefined),
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
        throw new Error(
          response.status === 404
            ? `${next.email} has no invitation to change.`
            : `The role for ${next.email} could not be changed. Try again.`,
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
        throw new Error(`Access for ${address} could not be revoked. Try again.`);
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
    issued === undefined ? undefined : new URL(`/invitations/${issued.token}`, globalThis.location.origin).toString();

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
    <div className='flex flex-col gap-3 rounded-md border bg-card p-3'>
      <h4
        ref={headingRef}
        tabIndex={-1}
        className='text-xs font-medium text-muted-foreground focus-visible:focus-outline'
      >
        People with access
      </h4>

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
            className='min-w-48 flex-1'
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
            <SelectTrigger className='w-32' aria-label='Invitation role'>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value='write'>Can edit</SelectItem>
              <SelectItem value='read'>Can view</SelectItem>
            </SelectContent>
          </Select>
          <Button
            size='sm'
            disabled={typed === '' || busy}
            onClick={() => {
              invite.mutate();
            }}
          >
            {invite.isPending ? <Loader2 className='size-4 animate-spin' aria-hidden /> : undefined}
            <span>Create invitation</span>
          </Button>
        </div>
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
          className='flex flex-col gap-2 rounded-md border border-dashed p-2'
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
          <p className='text-xs text-muted-foreground'>Tau does not email this link. Send it to them yourself.</p>
          {expiryCopy(issued.expiresAt) === undefined ? undefined : (
            <p className='text-xs text-muted-foreground'>{expiryCopy(issued.expiresAt)}</p>
          )}
        </div>
      )}

      {alert === undefined ? undefined : (
        <p role='alert' className='flex items-center gap-2 text-sm'>
          <AlertTriangle aria-hidden className='size-4 shrink-0 text-destructive' />
          <span>{alert}</span>
        </p>
      )}

      {isLoading || isError || people.length > 0 ? (
        <ul aria-label='People with access' className='flex list-none flex-col gap-1'>
          {people.map((person) => (
            <li key={person.email} className='flex items-center gap-2'>
              <span className='min-w-0 flex-1 truncate text-sm'>{person.email}</span>
              {person.status === 'revoked' ? (
                <Badge variant='secondary'>{roleLabel(person.role)}</Badge>
              ) : (
                <Select
                  value={person.role}
                  disabled={busy}
                  onValueChange={(value) => {
                    changeRole.mutate({ email: person.email, role: value === 'read' ? 'read' : 'write' });
                  }}
                >
                  <SelectTrigger size='sm' className='w-28' aria-label={`Role for ${person.email}`}>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value='write'>Can edit</SelectItem>
                    <SelectItem value='read'>Can view</SelectItem>
                  </SelectContent>
                </Select>
              )}
              <span className='text-xs text-muted-foreground'>{statusLabel(person.status)}</span>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    size='icon'
                    variant='ghost'
                    disabled={busy || person.status === 'revoked'}
                    aria-label={`Revoke ${person.email}`}
                    onClick={() => {
                      revoke.mutate(person.email);
                    }}
                  >
                    <Trash2 className='size-4' aria-hidden />
                  </Button>
                </TooltipTrigger>
                <TooltipContent side='left'>Revoke access</TooltipContent>
              </Tooltip>
            </li>
          ))}
        </ul>
      ) : (
        <p className='text-xs text-muted-foreground'>Nobody else has access to this project.</p>
      )}
    </div>
  );
}
