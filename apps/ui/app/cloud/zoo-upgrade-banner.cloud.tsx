import { CircleAlert, CreditCard, RefreshCw, Sparkles } from 'lucide-react';
import { Button } from '@taucad/ui/components/button';
import { useSettingsDialog } from '#hooks/use-settings-dialog.js';

type ZooUpgradeBannerProperties = {
  readonly message: string | undefined;
  readonly onRetry: () => void;
};

/** Actionable, non-destructive Zoo execution state that leaves the project open. */
export function ZooUpgradeBanner({ message, onRetry }: ZooUpgradeBannerProperties): React.JSX.Element | undefined {
  const { open: openSettings } = useSettingsDialog();
  const proRequired = message?.includes('Zoo execution requires Pro') === true;
  const creditsRequired = message?.includes('Zoo run needs more credits') === true;
  const serviceUnavailable = message?.includes('Zoo execution is temporarily unavailable') === true;
  if (!proRequired && !creditsRequired && !serviceUnavailable) {
    return undefined;
  }

  return (
    <section
      aria-label='Zoo execution access'
      className='flex max-w-xl flex-wrap items-center gap-2 rounded-md border bg-background/90 p-2 text-sm shadow-sm backdrop-blur-sm'
    >
      {proRequired ? (
        <Sparkles aria-hidden className='size-4 shrink-0 text-primary' />
      ) : creditsRequired ? (
        <CreditCard aria-hidden className='size-4 shrink-0 text-primary' />
      ) : (
        <CircleAlert aria-hidden className='size-4 shrink-0 text-primary' />
      )}
      <p className='min-w-48 flex-1 text-muted-foreground'>{message}</p>
      {!serviceUnavailable && (
        <Button
          size='sm'
          variant='outline'
          onClick={() => {
            openSettings('billing');
          }}
        >
          {proRequired ? 'Upgrade to Pro' : 'Add credits'}
        </Button>
      )}
      <Button size='sm' variant='ghost' onClick={onRetry}>
        <RefreshCw aria-hidden className='size-3.5' />
        Retry
      </Button>
    </section>
  );
}
