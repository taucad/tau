import { Heading } from '@taucad/ui/components/heading';
import { useId, useState } from 'react';
import { Loader } from '@taucad/ui/components/loader';
import { Trash2, TriangleAlert } from 'lucide-react';
import { Button } from '@taucad/ui/components/button';
import { toast } from '@taucad/ui/components/sonner';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@taucad/ui/components/select';
import { Tooltip, TooltipContent, TooltipTrigger } from '@taucad/ui/components/tooltip';
import { PublicationEmailTagsField, getPublicationEmailTagsError } from '#components/publish/publication-email-tags.js';

export type PublicationAccessGrant = {
  id: string;
  publicationId: string;
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
  readonly publicationId: string;
  readonly visibility: 'private' | 'public';
  readonly grants: readonly PublicationAccessGrant[];
  // oxlint-disable-next-line react-js/boolean-prop-naming -- existing panel API copy, analogous to async loading state props.
  readonly loading?: boolean;
  // oxlint-disable-next-line react-js/boolean-prop-naming -- existing panel API copy, analogous to async mutation state props.
  readonly visibilityMutating?: boolean;
  readonly onVisibilityChange: (visibility: 'private' | 'public') => Promise<void> | void;
  readonly onGrantsChanged: () => Promise<void> | void;
};

/** Rows shown before "Show all"; the list renders in the pane's one scroll area, so it never scrolls on its own. */
const collapsedRowCount = 5;

const visibilityHelp = {
  private: 'People sign in with the email address you invite.',
  public: 'Anyone who has the link can open it.',
} as const;

/**
 * The toast for an invite: the one address, or how many, in the words of what the person did.
 *
 * @param emails - The addresses this outcome is about.
 * @param hasFailed - Whether these addresses failed.
 * @returns One sentence.
 */
const inviteToast = (emails: readonly string[], hasFailed: boolean): string => {
  const who = emails.length === 1 ? emails[0]! : `${String(emails.length)} people`;
  return hasFailed ? `Couldn't invite ${who}. Try again.` : `Invited ${who}.`;
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
  publicationId,
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
  const endpoint = `${apiBaseUrl}/v1/publications/${publicationId}/access`;
  const emailError = getPublicationEmailTagsError(pendingEmails);
  const controlsDisabled = mutating || visibilityMutating;
  const canAdd = visibility === 'private' && pendingEmails.length > 0 && !emailError && !controlsDisabled;

  /**
   * Grants one address access. The API upserts the grant by address, so asking again for a removed address makes the
   * same grant active again; `notifyRecipient` decides whether the invite email goes out, and the API only sends it to
   * an address that had no active grant.
   */
  const invite = async (email: string, notifyRecipient: boolean): Promise<void> => {
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
  };

  /* Each address settles on its own: one refusal never discards the invites that worked or skips the refresh. */
  const handleAdd = async (): Promise<void> => {
    if (!canAdd) {
      return;
    }

    setActiveMutations((count) => count + 1);
    try {
      const outcomes = await Promise.allSettled(pendingEmails.map(async (email) => invite(email, true)));
      const failed = pendingEmails.filter((_email, index) => outcomes[index]?.status === 'rejected');
      const invited = pendingEmails.filter((_email, index) => outcomes[index]?.status === 'fulfilled');
      setPendingEmails(failed);
      if (invited.length > 0) {
        await onGrantsChanged();
        toast.success(inviteToast(invited, false));
      }
      if (failed.length > 0) {
        toast.error(inviteToast(failed, true));
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
              description="They'll get an email with the link."
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
