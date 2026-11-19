/**
 * *Collaborators* — the owner's half of a collaboration (charter W5, D27).
 *
 * `POST /v1/projects/:id/collaborators` emails the invitation and answers the
 * accept token exactly once, with `emailDelivery` saying whether the email went
 * out. Nothing stores the token afterwards, so the link this panel renders is
 * the only copy the owner has: when the email could not be sent, it is the
 * invitation, and the only way back after closing the region is to invite the
 * address again.
 *
 * It renders in the Share panel (C4, Q5): sharing is not history, so the
 * History pane keeps one line, "Shared with 2 people", read from the same
 * listing through {@link useSharedCount}.
 */

import { useEffect, useId, useRef, useState } from 'react';
import { Loader } from '@taucad/ui/components/loader';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { TriangleAlert, UserMinus } from 'lucide-react';
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@taucad/ui/components/alert-dialog';
import { Badge } from '@taucad/ui/components/badge';
import { Skeleton } from '@taucad/ui/components/skeleton';
import { SharePaneSection } from '@taucad/workbench-panes/share/share-pane';
import { ShareNotice } from '@taucad/workbench-panes/share/share-notice';
import { Button } from '@taucad/ui/components/button';
import { Input } from '@taucad/ui/components/input';
import { Label } from '@taucad/ui/components/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@taucad/ui/components/select';
import { Tooltip, TooltipContent, TooltipTrigger } from '@taucad/ui/components/tooltip';
import { CopyButton } from '@taucad/ui/components/copy-button';
import { ENV } from '#environment.config.js';
import { isDesktopTarget } from '#lib/build-target.js';
import { shareOrigin } from '#lib/share-origin.js';
import { recordApiRequestId } from '@taucad/ui-core/lib/api-request-id';
import { useProjectRole, useRevisionStatus } from '#hooks/use-revision-status.js';
import type { CollaboratorInviteEmailDelivery } from '@taucad/types/constants';

/** One row of `GET /v1/projects/:id/collaborators`. Never a token. */
type CollaboratorEntry = Readonly<{
  email: string;
  role: 'read' | 'write';
  status: 'pending' | 'accepted' | 'revoked';
  expiresAt: string;
}>;

/** What `POST …/collaborators` answers once, and only once. */
type IssuedInvitation = Readonly<{
  email: string;
  role: 'read' | 'write';
  token: string;
  expiresAt: string;
  /** Whether the invitation email went out; why it did not is not the owner's to read. */
  emailDelivery?: CollaboratorInviteEmailDelivery;
}>;

const roleLabel = (role: 'read' | 'write'): string => (role === 'write' ? 'Can edit' : 'Can view');

/** What the owner needs to know about a row: nothing once accepted. */
const statusLabel = (status: CollaboratorEntry['status']): string | undefined =>
  status === 'pending' ? 'Invite not accepted yet' : status === 'revoked' ? 'Access removed' : undefined;

/** Rows shown before "Show all"; the list renders in the pane's one scroll area, so it never scrolls on its own. */
const collapsedRowCount = 5;

const listFailureMessage = "Couldn't load collaborators. Try again.";

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
const inviteFailureMessage = (status: number, code: string | undefined, email: string): string => {
  if (status === 429 || code === 'PROJECT_INVITE_RATE_LIMITED') {
    return 'You’ve invited too many people today. Try again tomorrow.';
  }
  if (status === 400) {
    return 'Enter a valid email address.';
  }
  if (status === 403) {
    return 'Only the project owner can add collaborators.';
  }
  if (status === 404) {
    return 'This project isn’t in the cloud yet. Back it up to the cloud first.';
  }
  return `Couldn’t invite ${email}. Try again.`;
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
    throw recordApiRequestId(new Error(listFailureMessage), response);
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
    : ` It works until ${parsed.toLocaleDateString(undefined, { day: 'numeric', month: 'long', year: 'numeric' })}.`;
};

export type RevisionCollaboratorsProps = {
  /** The Tau Cloud project being shared; its id is its repository path there. */
  readonly projectId: string;
};

/**
 * Who else may work on this project, and how one more is invited: the Share pane's "Collaborators" section.
 *
 * Mounted in the Share panel for the owner alone, by {@link ProjectPeopleWithAccess}. A collaborator never sees it:
 * the routes behind it all need `owner`, and offering a control that is always
 * refused is worse than not offering it.
 *
 * @param props - The project being shared.
 * @returns The section: the invite form, the one-time link it issues, and the people list.
 */
export function RevisionCollaborators({ projectId }: RevisionCollaboratorsProps): React.JSX.Element {
  const endpoint = collaboratorsEndpoint(projectId);
  const queryClient = useQueryClient();
  const [email, setEmail] = useState('');
  const [role, setRole] = useState<'read' | 'write'>('write');
  const [issued, setIssued] = useState<IssuedInvitation>();
  const [failure, setFailure] = useState<string>();
  /* The person a removal waits to be confirmed for: access cannot be given back without a new invite link. */
  const [removal, setRemoval] = useState<CollaboratorEntry>();
  const shouldFocusHeadingRef = useRef(false);
  /* The row button that asked, so a cancelled removal hands focus back to it. */
  const removalTriggerRef = useRef<HTMLButtonElement | undefined>(undefined);

  const {
    data: people = [],
    isLoading,
    isError,
    refetch,
  } = useQuery({
    queryKey: collaboratorsKey(projectId),
    queryFn: async () => listCollaborators(projectId),
  });

  const refreshPeople = async (): Promise<void> => {
    await queryClient.invalidateQueries({ queryKey: collaboratorsKey(projectId) });
  };

  const invite = useMutation({
    async mutationFn(): Promise<IssuedInvitation> {
      const address = email.trim().toLowerCase();
      const response = await fetch(endpoint, {
        method: 'POST',
        credentials: 'include',
        headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: address, role }),
      });
      if (!response.ok) {
        const answered = (await response.json().catch(() => ({}))) as Readonly<{ code?: unknown }>;
        throw recordApiRequestId(
          new Error(
            inviteFailureMessage(
              response.status,
              typeof answered.code === 'string' ? answered.code : undefined,
              address,
            ),
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
              ? `${next.email} no longer has an invite. Add them again.`
              : `Couldn’t change the role for ${next.email}. Try again.`,
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
      /* The row's button is disabled once its person is removed, so the dialog hands focus to the heading. */
      shouldFocusHeadingRef.current = true;
      setRemoval(undefined);
      await refreshPeople();
    },
    onError(error: Error) {
      setFailure(error.message);
      setRemoval(undefined);
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
  const alert = failure ?? (isError ? listFailureMessage : undefined);
  const linkRef = useRef<HTMLInputElement>(null);
  const headingRef = useRef<HTMLHeadingElement>(null);
  const [isListExpanded, setIsListExpanded] = useState(false);
  const helpId = useId();
  useEffect(() => {
    if (issued !== undefined) {
      linkRef.current?.focus();
    }
  }, [issued]);
  const shownPeople = isListExpanded ? people : people.slice(0, collapsedRowCount);

  return (
    <SharePaneSection
      title='Collaborators'
      description='Collaborators open this project itself and see your latest changes. People with a link see only what you shared.'
      headingRef={headingRef}
    >
      <div data-slot='share-people' className='flex flex-col gap-4'>
        {/* One row, always open, and no Done: the one-time link it creates stays shown until the next invite replaces it. */}
        <form
          className='flex flex-col gap-2'
          aria-label='Add a collaborator'
          onSubmit={(event) => {
            event.preventDefault();
            if (typed !== '' && !busy) {
              invite.mutate();
            }
          }}
        >
          <div className='flex flex-wrap items-end gap-2'>
            <div className='flex min-w-40 flex-1 flex-col gap-2'>
              <Label htmlFor='collaborator-email'>Email address</Label>
              <Input
                id='collaborator-email'
                type='email'
                inputMode='email'
                autoComplete='email'
                placeholder='teammate@example.com'
                value={email}
                disabled={busy}
                aria-describedby={helpId}
                onChange={(event) => {
                  setEmail(event.target.value);
                }}
              />
            </div>
            <Select
              value={role}
              disabled={busy}
              onValueChange={(value) => {
                setRole(value === 'read' ? 'read' : 'write');
              }}
            >
              <SelectTrigger className='w-28' aria-label='Role'>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value='write'>Can edit</SelectItem>
                <SelectItem value='read'>Can view</SelectItem>
              </SelectContent>
            </Select>
            <Button type='submit' variant='outline' disabled={typed === '' || busy} aria-busy={invite.isPending}>
              {invite.isPending ? <Loader className='size-4' /> : undefined}
              <span>Invite</span>
            </Button>
          </div>
          <p id={helpId} className='text-xs text-muted-foreground'>
            They’ll need an account with this email address to accept.
          </p>
        </form>

        {/*
          The token, once (D27).

          A read-only field rather than prose, because a person who cannot use the
          clipboard still has to be able to select the whole link — and because
          the field carries the address it belongs to as its own label, so two
          invitations issued in a row can never be confused for one another.
        */}
        {issued === undefined || invitationUrl === undefined ? undefined : (
          <IssuedInviteLink
            email={issued.email}
            emailDelivery={issued.emailDelivery}
            url={invitationUrl}
            worksUntil={expiryCopy(issued.expiresAt)}
            linkRef={linkRef}
          />
        )}

        {alert === undefined ? undefined : (
          <ShareNotice
            tone='error'
            actions={
              failure === undefined && isError ? (
                <Button
                  type='button'
                  variant='outline'
                  size='sm'
                  onClick={() => {
                    void refetch();
                  }}
                >
                  Try again
                </Button>
              ) : undefined
            }
          >
            {alert}
          </ShareNotice>
        )}

        {isLoading ? (
          <div role='status' aria-busy='true' aria-label='Loading collaborators' className='flex flex-col gap-2'>
            <Skeleton aria-hidden className='h-5 w-48' />
            <Skeleton aria-hidden className='h-5 w-40' />
          </div>
        ) : people.length > 0 ? (
          <>
            <ul aria-label='Collaborators' className='flex list-none flex-col gap-3'>
              {shownPeople.map((person) => {
                const personStatus = statusLabel(person.status);
                return (
                  <li key={person.email} className='flex flex-col gap-1'>
                    <div className='flex min-w-0 items-start gap-2'>
                      <span className='min-w-0 flex-1 text-sm [overflow-wrap:anywhere]'>{person.email}</span>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <Button
                            size='icon-sm'
                            variant='ghost'
                            className='shrink-0'
                            disabled={busy || person.status === 'revoked'}
                            aria-label={`Remove access for ${person.email}`}
                            onClick={(event) => {
                              removalTriggerRef.current = event.currentTarget;
                              setRemoval(person);
                            }}
                          >
                            <UserMinus aria-hidden />
                          </Button>
                        </TooltipTrigger>
                        <TooltipContent side='left'>Remove access</TooltipContent>
                      </Tooltip>
                    </div>
                    <div className='flex flex-wrap items-center gap-2'>
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
                      {personStatus === undefined ? null : (
                        <span className='text-xs text-muted-foreground'>{personStatus}</span>
                      )}
                    </div>
                  </li>
                );
              })}
            </ul>
            {people.length > collapsedRowCount ? (
              <Button
                type='button'
                variant='ghost'
                size='sm'
                className='self-start'
                aria-expanded={isListExpanded}
                onClick={() => {
                  setIsListExpanded((expanded) => !expanded);
                }}
              >
                {isListExpanded ? 'Show fewer' : `Show all ${String(people.length)}`}
              </Button>
            ) : null}
          </>
        ) : isError ? null : (
          <p className='text-sm text-muted-foreground'>No collaborators yet.</p>
        )}
      </div>
      <RemoveCollaboratorDialog
        person={removal}
        isRemoving={revoke.isPending}
        onConfirm={(person) => {
          revoke.mutate(person.email);
        }}
        onCancel={() => {
          setRemoval(undefined);
        }}
        onCloseAutoFocus={(event) => {
          event.preventDefault();
          if (shouldFocusHeadingRef.current) {
            shouldFocusHeadingRef.current = false;
            headingRef.current?.focus();
          } else {
            removalTriggerRef.current?.focus();
          }
        }}
      />
    </SharePaneSection>
  );
}

/**
 * Asks before a person loses access (UX Rule 4): a removed collaborator can only come back through a new invite,
 * so the removal is confirmed with their address rather than undone.
 *
 * @param props - The person waiting to be removed, whether the removal is running, and what each answer does.
 * @returns The dialog, open while a person is waiting.
 */
function RemoveCollaboratorDialog({
  person,
  isRemoving,
  onConfirm,
  onCancel,
  onCloseAutoFocus,
}: {
  readonly person: CollaboratorEntry | undefined;
  readonly isRemoving: boolean;
  readonly onConfirm: (person: CollaboratorEntry) => void;
  readonly onCancel: () => void;
  readonly onCloseAutoFocus: (event: Event) => void;
}): React.JSX.Element {
  return (
    <AlertDialog
      open={person !== undefined}
      onOpenChange={(open) => {
        if (!open && !isRemoving) {
          onCancel();
        }
      }}
    >
      <AlertDialogContent onCloseAutoFocus={onCloseAutoFocus}>
        <AlertDialogHeader>
          <AlertDialogTitle>{`Remove ${person?.email ?? ''} from collaborators?`}</AlertDialogTitle>
          <AlertDialogDescription>
            {person?.status === 'pending'
              ? 'Their invite link will stop working, so they won’t get access to this project. To give them access later, invite them again.'
              : 'They’ll lose access to this project and can no longer open it. To give access back, invite them again.'}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={isRemoving}>Cancel</AlertDialogCancel>
          <Button
            type='button'
            variant='destructive'
            disabled={isRemoving}
            aria-busy={isRemoving}
            onClick={() => {
              if (person !== undefined) {
                onConfirm(person);
              }
            }}
          >
            {isRemoving ? <Loader className='size-4' /> : null}
            Remove access
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

/**
 * The token, once (D27), and whether it was emailed.
 *
 * A read-only field rather than prose, because a person who cannot use the clipboard still has to be able to select
 * the whole link — and because the field carries the address it belongs to as its own label, so two invitations issued
 * in a row can never be confused for one another. When the email went out the link is a spare copy; when it did not,
 * it is the invitation, and the owner is told to send it. Why it was not sent is not said.
 *
 * @param props - Who the link is for, what happened to its email, the link, until when it works, and the field's ref.
 * @returns The announced block holding the outcome, the link, its copy button and what to do with it.
 */
function IssuedInviteLink({
  email,
  emailDelivery,
  url,
  worksUntil,
  linkRef,
}: {
  readonly email: string;
  /** Absent reads as not sent: the block never claims an email it was not told about. */
  readonly emailDelivery: CollaboratorInviteEmailDelivery | undefined;
  readonly url: string;
  readonly worksUntil: string | undefined;
  readonly linkRef: React.Ref<HTMLInputElement>;
}): React.JSX.Element {
  const isEmailed = emailDelivery?.status === 'sent';
  return (
    <div role='status' aria-label='Invite link created' className='ph-no-capture flex flex-col gap-2'>
      {isEmailed ? (
        <p className='text-sm'>{`Invited ${email}. We emailed them.`}</p>
      ) : (
        /* The block is the live region, so the caveat is a plain row rather than a second one inside it. */
        <p className='flex items-start gap-2 text-sm'>
          <span className='flex h-lh shrink-0 items-center'>
            <TriangleAlert aria-hidden className='size-4 text-warning' />
          </span>
          <span>{`We couldn’t email ${email}. Copy the invite link and send it yourself.`}</span>
        </p>
      )}
      <Label htmlFor='collaborator-invitation-link'>{`Invite link for ${email}`}</Label>
      <div className='flex items-center gap-2'>
        <Input
          ref={linkRef}
          id='collaborator-invitation-link'
          readOnly
          className='min-w-0 flex-1 font-mono text-xs'
          value={url}
          onFocus={(event) => {
            event.target.select();
          }}
        />
        <CopyButton getText={() => url} readyToCopyText='Copy link' copiedText='Copied' size='sm' />
      </div>
      {/* The desktop shell has no inbound link path, so `app://tau` was never the answer: the invitee finishes in a
          browser and the project arrives on their desktop's next cloud listing (blueprint Finding 5, ruling Q4).
          Either way the owner sends the link. */}
      <p className='text-xs text-muted-foreground'>
        {isEmailed
          ? `We emailed them this link. It’s only shown once here.${worksUntil ?? ''}`
          : `It’s only shown once.${worksUntil ?? ''}`}
        {isDesktopTarget() ? ' It opens in a browser. After they accept, the project appears in their Tau.' : ''}
      </p>
    </div>
  );
}

/**
 * *Collaborators* in the Share panel (C4, Q5): the last section of the pane's one scroll area, under every
 * sharing method, because it belongs to the project rather than to a link.
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
  return <RevisionCollaborators projectId={projectId} />;
}
