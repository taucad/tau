import { memo } from 'react';
import type React from 'react';
import { CreditCard } from 'lucide-react';
import { cn } from '@taucad/ui/utils/cn';
import { FundedSurface } from '#cloud/cloud-surface.js';
import { useChatComposer } from '#hooks/active-chat-provider.js';
import { useCreditStanding } from '#hooks/use-credit-standing.js';
import { useIdentity } from '#hooks/use-identity.js';

/**
 * One line above the chat composer while a signed-in account has no credits and the composer would send to a Tau model,
 * so the person can add credits before writing a long prompt. An external agent runs on the person's own account, so
 * it needs no credits and gets no note. The caller hides it while a card already says the same (a refused send).
 *
 * @param properties - Whether a card in the chat already covers it, and layout classes.
 * @returns The note, or nothing.
 */
export const ChatCreditsNotice = memo(function ({
  className,
  isCovered = false,
}: {
  readonly className?: string;
  /** A visible chat card already says what this note would. */
  readonly isCovered?: boolean;
}): React.ReactNode {
  const isSignedIn = useIdentity().state === 'verified';
  const standing = useCreditStanding();
  const isExternalAgent = useChatComposer().execution.execution.kind !== 'tau';
  if (isCovered || !isSignedIn || isExternalAgent || standing?.isEmpty !== true) {
    return null;
  }
  return (
    <FundedSurface
      fallback={null}
      render={(cloud) => (
        <div
          role='status'
          className={cn('flex items-center gap-2 rounded-md border bg-muted/40 px-2 py-1.5 text-xs', className)}
        >
          <CreditCard aria-hidden className='size-3.5 shrink-0 text-feature' />
          <span className='min-w-0 flex-1 text-muted-foreground'>You don’t have any credits yet.</span>
          <cloud.AddCreditsAction variant='outline' />
        </div>
      )}
    />
  );
});
