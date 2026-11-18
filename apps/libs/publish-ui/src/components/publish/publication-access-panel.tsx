import { Heading } from '@taucad/ui/components/heading';
import { useState } from 'react';
import { Loader } from '@taucad/ui/components/loader';
import { Trash2 } from 'lucide-react';
import { Button } from '@taucad/ui/components/button';
import { CopyButton } from '@taucad/ui/components/copy-button';
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
  readonly shareUrl: string;
  readonly visibility: 'private' | 'public';
  readonly grants: readonly PublicationAccessGrant[];
  // oxlint-disable-next-line react-js/boolean-prop-naming -- existing panel API copy, analogous to async loading state props.
  readonly loading?: boolean;
  // oxlint-disable-next-line react-js/boolean-prop-naming -- existing panel API copy, analogous to async mutation state props.
  readonly visibilityMutating?: boolean;
  readonly onVisibilityChange: (visibility: 'private' | 'public') => Promise<void> | void;
  readonly onGrantsChanged: () => Promise<void> | void;
};

export function PublicationAccessPanel({
  apiBaseUrl,
  publicationId,
  shareUrl,
  visibility,
  grants,
  loading = false,
  visibilityMutating = false,
  onVisibilityChange,
  onGrantsChanged,
}: PublicationAccessPanelProps): React.JSX.Element {
  const [pendingEmails, setPendingEmails] = useState<string[]>([]);
  const [mutating, setMutating] = useState(false);
  const endpoint = `${apiBaseUrl}/v1/publications/${publicationId}/access`;
  const emailError = getPublicationEmailTagsError(pendingEmails);
  const controlsDisabled = mutating || visibilityMutating;
  const canAdd = visibility === 'private' && pendingEmails.length > 0 && !emailError && !controlsDisabled;

  const handleAdd = async (): Promise<void> => {
    if (!canAdd) {
      return;
    }

    setMutating(true);
    try {
      await Promise.all(
        pendingEmails.map(async (email) => {
          const response = await fetch(endpoint, {
            method: 'POST',
            credentials: 'include',
            headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
            body: JSON.stringify({ email }),
          });

          // The failure ends at the toast below and is never reported, so no request id is recorded on it.
          if (!response.ok) {
            throw new Error(email);
          }
        }),
      );
      setPendingEmails([]);
      await onGrantsChanged();
      toast.success('Invite sent');
    } catch (error) {
      const failedEmail = error instanceof Error ? error.message : 'a person';
      toast.error(`Couldn't invite ${failedEmail}. Try again.`);
    } finally {
      setMutating(false);
    }
  };

  const handleRevoke = async (grant: PublicationAccessGrant): Promise<void> => {
    setMutating(true);
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
      toast.success('Access removed');
    } catch (error) {
      const failedEmail = error instanceof Error ? error.message : 'that person';
      toast.error(`Couldn't remove access for ${failedEmail}. Try again.`);
    } finally {
      setMutating(false);
    }
  };

  return (
    <div className='flex flex-col gap-4'>
      <div className='flex items-center justify-between gap-3 rounded-md border px-3 py-2'>
        <div className='min-w-0'>
          <p className='text-sm font-medium'>Link</p>
          <p className='truncate text-xs text-muted-foreground'>{shareUrl}</p>
        </div>
        <CopyButton getText={() => shareUrl} readyToCopyText='Copy link' copiedText='Copied' size='sm' />
      </div>

      <div className='flex items-center justify-between rounded-md border px-3 py-2'>
        <div className='min-w-0'>
          <p className='text-sm font-medium'>Who can open the link</p>
        </div>
        <Select
          value={visibility}
          disabled={controlsDisabled}
          onValueChange={(value) => {
            void onVisibilityChange(value as 'private' | 'public');
          }}
        >
          <SelectTrigger className='w-52' aria-label='Who can open the link'>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value='private'>Only people you invite</SelectItem>
            <SelectItem value='public'>Anyone with the link</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {visibility === 'private' ? (
        <div className='flex flex-col gap-2'>
          <PublicationEmailTagsField
            id='publication-access-emails'
            label='Invite people by email'
            emails={pendingEmails}
            disabled={controlsDisabled}
            placeholder='teammate@example.com'
            onEmailsChange={setPendingEmails}
          />
          <Button
            type='button'
            size='sm'
            className='self-end'
            disabled={!canAdd}
            onClick={() => {
              void handleAdd();
            }}
          >
            {mutating ? <Loader className='size-4' /> : null}
            <span>Invite</span>
          </Button>
        </div>
      ) : null}

      <div className='flex flex-col gap-2'>
        <div className='flex items-center justify-between'>
          {/* Who can open this link; the project's own members are People with access, below it (C2). */}
          <Heading level={3} variant='label'>
            People invited to this link
          </Heading>
          {loading ? <Loader className='size-4 text-muted-foreground' /> : null}
        </div>
        {grants.length === 0 && !loading ? (
          <p className='rounded-md border border-dashed px-3 py-4 text-sm text-muted-foreground'>
            No one is invited yet.
          </p>
        ) : (
          <div className='max-h-56 overflow-y-auto rounded-md border'>
            {grants.map((grant) => (
              <div
                key={grant.id}
                className='flex items-center justify-between gap-3 border-b px-3 py-2 last:border-b-0'
              >
                <div className='min-w-0'>
                  <p className='truncate text-sm'>{grant.recipientEmail}</p>
                  <p className='text-xs text-muted-foreground'>
                    Can view
                    {grant.notDelivered === true ? ' · Email not delivered' : ''}
                  </p>
                </div>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      type='button'
                      size='icon'
                      variant='ghost'
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
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
