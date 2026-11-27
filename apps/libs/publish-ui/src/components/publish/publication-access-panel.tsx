import { Heading } from '@taucad/ui/components/heading';
import { useId, useState } from 'react';
import { Loader } from '@taucad/ui/components/loader';
import { Trash2, TriangleAlert } from 'lucide-react';
import { Button } from '@taucad/ui/components/button';
import { toast } from '@taucad/ui/components/sonner';
import { copyText } from '@taucad/ui/utils/clipboard';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@taucad/ui/components/select';
import { Tooltip, TooltipContent, TooltipTrigger } from '@taucad/ui/components/tooltip';
import { PublicationEmailTagsField, getPublicationEmailTagsError } from '#components/publish/publication-email-tags.js';

/** One person invited to a project's cloud link, as `GET /v1/projects/:id/share` lists them. */
export type PublicationAccessGrant = {
  id: string;
  recipientEmail: string;
  status: 'active' | 'revoked';
  createdAt: string;
  // oxlint-disable-next-line typescript/no-restricted-types -- mirrors API DTO where revokedAt is serialized as null while active.
  revokedAt: string | null;
  /** The invite email cannot reach this recipient; why is theirs to know, not the owner's (email bounce blueprint D5). */
  notDelivered?: boolean;
};

type PublicationAccessPanelProps = {
  readonly apiBaseUrl: string;
  /** The project whose cloud link this is; its invited people are kept on the link across every publish. */
  readonly projectId: string;
  /** The link itself, for "Copy link" when an invite email could not be sent. */
  readonly shareUrl: string;
  readonly visibility: 'private' | 'public';
  readonly grants: readonly PublicationAccessGrant[];
  // oxlint-disable-next-line react-js/boolean-prop-naming -- existing panel API copy, analogous to async loading state props.
  readonly loading?: boolean;
  // oxlint-disable-next-line react-js/boolean-prop-naming -- existing panel API copy, analogous to async mutation state props.
  readonly visibilityMutating?: boolean;
  readonly onVisibilityChange: (visibility: 'private' | 'public') => Promise<void> | void;
  /**
   * Reads the link again after its invited people changed. Resolves `false` when the link, as the pane now holds it,
   * is no longer on (sharing stopped meanwhile), so an invite's toast never offers a link that no longer works.
   */
  readonly onGrantsChanged: () => Promise<boolean | undefined> | boolean | undefined;
};

/** Rows shown before "Show all"; the list renders in the pane's one scroll area, so it never scrolls on its own. */
const collapsedRowCount = 5;

const visibilityHelp = {
  private: 'People sign in with the email address you invite.',
  public: 'Anyone who has the link can open it.',
} as const;

/**
 * What one invite came to: given access with its email sent, given access but not emailed, already had access (so
 * no email was due), or refused.
 */
type InviteOutcome = 'invited' | 'not-emailed' | 'has-access' | 'failed';

/** What an invite's toast says when sharing stopped while it ran: the grant is kept, the link does not work yet. */
const stoppedSentence = 'Sharing is stopped, so they can open the link once you publish again.';

/**
 * Who a toast is about: the one address, or how many.
 *
 * @param emails - The addresses this outcome is about.
 * @returns The address or "n people".
 */
const whoOf = (emails: readonly string[]): string =>
  emails.length === 1 ? emails[0]! : `${String(emails.length)} people`;

/**
 * The toast for one outcome of an invite, in the words of what the person did. An email that was not sent is never
 * reported as sent, and its reason (a daily limit, a bounced address, no email on this server) is not the owner's to
 * read: each one asks them to send the link themselves.
 *
 * @param emails - The addresses this outcome is about.
 * @param outcome - What happened to them.
 * @param isLinkActive - Whether the link is still on; a stopped one is never offered to copy or send.
 * @returns One sentence.
 */
const inviteToast = (emails: readonly string[], outcome: InviteOutcome, isLinkActive = true): string => {
  const who = whoOf(emails);
  if (outcome === 'failed') {
    return `Couldn't invite ${who}. Try again.`;
  }
  if (!isLinkActive) {
    return outcome === 'has-access'
      ? `${who} ${emails.length === 1 ? 'is' : 'are'} already invited. ${stoppedSentence}`
      : `Invited ${who}. ${stoppedSentence}`;
  }
  if (outcome === 'has-access') {
    return emails.length === 1
      ? `${who} already has access. Copy the link to send it again.`
      : `${who} already have access. Copy the link to send it again.`;
  }
  return outcome === 'not-emailed'
    ? `We couldn't email ${who}. Copy the link and send it yourself.`
    : `Invited ${who}.`;
};

/**
 * Says what the invites that were kept came to. A link that is on is offered to copy wherever the person has to send
 * it; once sharing stopped, the grants are reported as kept and no toast offers the stopped link.
 *
 * @param groups - The addresses invited and emailed, invited but not emailed, and already invited.
 * @param isLinkActive - Whether the link is still on, as the pane holds it after the refresh.
 * @param copyLink - Copies the link inside a toast action's press.
 */
const announceInvites = (
  groups: Readonly<{ invited: readonly string[]; notEmailed: readonly string[]; hasAccess: readonly string[] }>,
  isLinkActive: boolean,
  copyLink: () => Promise<void>,
): void => {
  const { invited, notEmailed, hasAccess } = groups;
  if (!isLinkActive) {
    const granted = [...invited, ...notEmailed];
    if (granted.length > 0) {
      toast.success(inviteToast(granted, 'invited', false));
    }
    if (hasAccess.length > 0) {
      toast.success(inviteToast(hasAccess, 'has-access', false));
    }
    return;
  }
  const copyAction = {
    label: 'Copy link',
    onClick() {
      void copyLink();
    },
  };
  if (invited.length > 0) {
    toast.success(inviteToast(invited, 'invited'));
  }
  if (hasAccess.length > 0) {
    toast.success(inviteToast(hasAccess, 'has-access'), { action: copyAction });
  }
  if (notEmailed.length > 0) {
    toast.warning(inviteToast(notEmailed, 'not-emailed'), { action: copyAction });
  }
};

/**
 * Reads what the API did with an invite's email. Only `sent` reads as invited and emailed; `not_requested` is an
 * address that already had access; `skipped`, and an answer that says nothing, never claim an email was sent.
 *
 * @param body - The `POST …/share/access` answer.
 * @returns Whether the person was emailed, already had access, or was not emailed.
 */
const inviteOutcomeOf = (body: unknown): Exclude<InviteOutcome, 'failed'> => {
  const email = typeof body === 'object' && body !== null ? (body as { email?: unknown }).email : undefined;
  const status = typeof email === 'object' && email !== null ? (email as { status?: unknown }).status : undefined;
  if (status === 'sent') {
    return 'invited';
  }
  return status === 'not_requested' ? 'has-access' : 'not-emailed';
};

/**
 * Who can open a published link: the setting, and for a link only invited people open, the invite field and the
 * people invited to it. It is the body of the Share pane's "Who can open the link" section, and renders in that pane's
 * one scroll area: its list grows rather than scrolling, and folds past five rows until the person asks for all.
 *
 * @param props - The publication, its setting and grants, and what a change does.
 * @returns The setting, the invite field and the invited list.
 */
export function PublicationAccessPanel({
  apiBaseUrl,
  projectId,
  shareUrl,
  visibility,
  grants,
  loading = false,
  visibilityMutating = false,
  onVisibilityChange,
  onGrantsChanged,
}: PublicationAccessPanelProps): React.JSX.Element {
  const [pendingEmails, setPendingEmails] = useState<string[]>([]);
  // A count, not a flag: Undo can run from its toast while an invite is still in flight.
  const [activeMutations, setActiveMutations] = useState(0);
  const mutating = activeMutations > 0;
  const [isListExpanded, setIsListExpanded] = useState(false);
  const helpId = useId();
  const endpoint = `${apiBaseUrl}/v1/projects/${encodeURIComponent(projectId)}/share/access`;
  const emailError = getPublicationEmailTagsError(pendingEmails);
  const controlsDisabled = mutating || visibilityMutating;
  const canAdd = visibility === 'private' && pendingEmails.length > 0 && !emailError && !controlsDisabled;

  /**
   * Grants one address access. The API upserts the grant by address, so asking again for a removed address makes the
   * same grant active again; `notifyRecipient` decides whether the invite email goes out, and the API only sends it to
   * an address that had no active grant.
   */
  const invite = async (email: string, notifyRecipient: boolean): Promise<Exclude<InviteOutcome, 'failed'>> => {
    // A network failure is named by its address too, never by the transport's message.
    const response = await fetch(endpoint, {
      method: 'POST',
      credentials: 'include',
      headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, notifyRecipient }),
    });
    // The failure ends at the toast below and is never reported, so no request id is recorded on it.
    if (!response.ok) {
      throw new Error(email);
    }
    return inviteOutcomeOf(await response.json().catch(() => undefined));
  };

  /* The copy starts inside the toast action's press, so a browser that needs the gesture still allows it. */
  const copyLink = async (): Promise<void> => {
    const { isCopied } = await copyText(shareUrl);
    if (isCopied) {
      toast.success('Link copied');
    } else {
      toast.error("Couldn't copy the link. Select it above and copy it.");
    }
  };

  /* Each address settles on its own: one refusal never discards the invites that worked or skips the refresh. */
  const handleAdd = async (): Promise<void> => {
    if (!canAdd) {
      return;
    }

    setActiveMutations((count) => count + 1);
    try {
      const settled = await Promise.allSettled(pendingEmails.map(async (email) => invite(email, true)));
      const outcomes = settled.map(
        (result): InviteOutcome => (result.status === 'fulfilled' ? result.value : 'failed'),
      );
      const withOutcome = (outcome: InviteOutcome): string[] =>
        pendingEmails.filter((_email, index) => outcomes[index] === outcome);
      const invited = withOutcome('invited');
      const notEmailed = withOutcome('not-emailed');
      const hasAccess = withOutcome('has-access');
      const failed = withOutcome('failed');
      setPendingEmails(failed);
      if (invited.length > 0 || notEmailed.length > 0 || hasAccess.length > 0) {
        announceInvites({ invited, notEmailed, hasAccess }, (await onGrantsChanged()) !== false, copyLink);
      }
      if (failed.length > 0) {
        toast.error(inviteToast(failed, 'failed'));
      }
    } finally {
      setActiveMutations((count) => count - 1);
    }
  };

  /* Undo puts the same grant back without a second invite email: the person was invited once already. */
  const handleRestore = async (email: string): Promise<void> => {
    setActiveMutations((count) => count + 1);
    try {
      await invite(email, false);
      await onGrantsChanged();
    } catch {
      toast.error(`Couldn't give ${email} access again. Invite them again.`);
    } finally {
      setActiveMutations((count) => count - 1);
    }
  };

  const handleRevoke = async (grant: PublicationAccessGrant): Promise<void> => {
    setActiveMutations((count) => count + 1);
    try {
      const response = await fetch(`${endpoint}/${grant.id}`, {
        method: 'DELETE',
        credentials: 'include',
        headers: { Accept: 'application/json' },
      });

      if (!response.ok) {
        throw new Error(grant.recipientEmail);
      }

      await onGrantsChanged();
      toast.success(`Removed access for ${grant.recipientEmail}.`, {
        action: {
          label: 'Undo',
          onClick() {
            void handleRestore(grant.recipientEmail);
          },
        },
      });
    } catch {
      toast.error(`Couldn't remove access for ${grant.recipientEmail}. Try again.`);
    } finally {
      setActiveMutations((count) => count - 1);
    }
  };

  const shownGrants = isListExpanded ? grants : grants.slice(0, collapsedRowCount);

  return (
    <div className='flex flex-col gap-4'>
      <div className='flex flex-col gap-2'>
        <Select
          value={visibility}
          disabled={controlsDisabled}
          onValueChange={(value) => {
            void onVisibilityChange(value as 'private' | 'public');
          }}
        >
          <SelectTrigger className='w-full' aria-label='Who can open the link' aria-describedby={helpId}>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value='private'>Only people you invite</SelectItem>
            <SelectItem value='public'>Anyone with the link</SelectItem>
          </SelectContent>
        </Select>
        <p id={helpId} className='text-xs text-muted-foreground'>
          {visibilityHelp[visibility]}
        </p>
      </div>

      {visibility === 'private' ? (
        <>
          <div className='flex flex-col gap-2'>
            <PublicationEmailTagsField
              id='publication-access-emails'
              label='Invite people by email'
              description="We'll email them the link. They sign in with this email address to open it."
              emails={pendingEmails}
              disabled={controlsDisabled}
              placeholder='teammate@example.com'
              onEmailsChange={setPendingEmails}
            />
            <div className='flex flex-wrap justify-end gap-2'>
              <Button
                type='button'
                variant='outline'
                size='sm'
                disabled={!canAdd}
                aria-busy={mutating}
                onClick={() => {
                  void handleAdd();
                }}
              >
                {mutating ? <Loader className='size-4' /> : null}
                <span>Invite</span>
              </Button>
            </div>
          </div>

          <div className='flex flex-col gap-2'>
            <div className='flex items-center justify-between gap-2'>
              {/* Who can open this link; the project's own members are Collaborators, below it (C2). */}
              <Heading level={4} variant='overline'>
                {`Invited (${String(grants.length)})`}
              </Heading>
              {loading ? <Loader className='size-4 text-muted-foreground' /> : null}
            </div>
            {grants.length === 0 && !loading ? (
              <p className='text-sm text-muted-foreground'>No one is invited yet.</p>
            ) : (
              <ul aria-label='Invited' className='flex list-none flex-col'>
                {shownGrants.map((grant) => (
                  <li key={grant.id} className='flex items-start justify-between gap-2 py-1'>
                    <div className='flex min-w-0 flex-col gap-1'>
                      <p className='text-sm [overflow-wrap:anywhere]'>{grant.recipientEmail}</p>
                      {grant.notDelivered === true ? (
                        <p className='flex items-start gap-2 text-xs text-muted-foreground'>
                          <span className='flex h-lh shrink-0 items-center'>
                            <TriangleAlert aria-hidden className='size-3.5 text-warning' />
                          </span>
                          <span>Email not delivered. Send them the link yourself.</span>
                        </p>
                      ) : null}
                    </div>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Button
                          type='button'
                          size='icon-sm'
                          variant='ghost'
                          className='shrink-0'
                          disabled={controlsDisabled}
                          aria-label={`Remove access for ${grant.recipientEmail}`}
                          onClick={() => {
                            void handleRevoke(grant);
                          }}
                        >
                          <Trash2 className='size-4' aria-hidden />
                        </Button>
                      </TooltipTrigger>
                      <TooltipContent side='left'>Remove access</TooltipContent>
                    </Tooltip>
                  </li>
                ))}
              </ul>
            )}
            {grants.length > collapsedRowCount ? (
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
                {isListExpanded ? 'Show fewer' : `Show all ${String(grants.length)}`}
              </Button>
            ) : null}
          </div>
        </>
      ) : null}
    </div>
  );
}
