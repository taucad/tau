import { useState } from 'react';
import { Plus } from 'lucide-react';
import { Button } from '@taucad/ui/components/button';
import { TopupModal } from '@taucad/billing-ui/components/billing/topup-modal';

/** Contextual top-up default for mid-chat exhaustion (F7): $25. */
const chatErrorDefaultTopupCents = 2500;

/**
 * Add credits on the out-of-credits card: the top-up dialog, which takes a saved card or a new one, so the fix is one
 * click with or without a card on file. A Cloud-only leaf (the Cloud chunk carries it to the adaptive facade).
 *
 * @param properties - The button's variant.
 * @returns The action and its dialog.
 */
export function AddCreditsAction({
  variant = 'default',
}: {
  /** The note above the composer uses the quieter outline; the card's primary fix is filled. */
  readonly variant?: 'default' | 'outline';
} = {}): React.JSX.Element {
  const [isTopupOpen, setIsTopupOpen] = useState(false);
  return (
    <>
      <Button
        variant={variant}
        size='xs'
        onClick={() => {
          setIsTopupOpen(true);
        }}
      >
        <Plus className='size-3.5' />
        Add credits
      </Button>
      <TopupModal
        isOpen={isTopupOpen}
        onOpenChange={setIsTopupOpen}
        defaultAmountCents={chatErrorDefaultTopupCents}
        returnNote='Your message will be here when you’re back.'
      />
    </>
  );
}
