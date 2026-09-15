import { useState } from 'react';
import { CookieIcon } from 'lucide-react';
import { Link } from 'react-router';
import { useCookieConsent } from '#hooks/use-cookie-consent.js';
import { isGlobalPrivacyControlEnabled } from '#lib/cookie-consent.lib.js';
import { Button } from '@taucad/ui/components/button';
import { Checkbox } from '@taucad/ui/components/checkbox';
import { Label } from '@taucad/ui/components/label';
import { Separator } from '@taucad/ui/components/separator';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@taucad/ui/components/dialog';

export function CookiePreferencesDialog({
  isOpen,
  onOpenChange,
}: {
  readonly isOpen: boolean;
  readonly onOpenChange: (open: boolean) => void;
}): React.JSX.Element {
  return (
    <Dialog open={isOpen} onOpenChange={onOpenChange}>
      {isOpen ? <CookiePreferencesContent onOpenChange={onOpenChange} /> : null}
    </Dialog>
  );
}

const CookiePreferencesContent = ({
  onOpenChange,
}: {
  readonly onOpenChange: (open: boolean) => void;
}): React.JSX.Element => {
  const [consentStatus, setConsentStatus] = useCookieConsent();
  const globalPrivacyControl = isGlobalPrivacyControlEnabled();
  const [analyticsEnabled, setAnalyticsEnabled] = useState(consentStatus === 'accepted');

  const handleSaveSettings = (): void => {
    setConsentStatus(analyticsEnabled && !globalPrivacyControl ? 'accepted' : 'declined');
    onOpenChange(false);
  };

  return (
    <DialogContent>
      <DialogHeader>
        <DialogTitle>Cookie preferences</DialogTitle>
        <DialogDescription>
          Tau uses optional analytics only after you allow it.{' '}
          <Link to='/legal/privacy' className='underline hover:text-foreground'>
            Learn more
          </Link>
        </DialogDescription>
      </DialogHeader>

      <div className='flex flex-col gap-4'>
        <div className='flex items-start gap-3'>
          <Checkbox checked disabled id='essential' className='mt-0.5' />
          <div className='flex flex-col gap-1'>
            <Label htmlFor='essential' className='font-medium'>
              Essential storage
            </Label>
            <p className='text-sm text-muted-foreground'>Keeps the website secure and remembers your consent.</p>
          </div>
        </div>

        <Separator />

        <div className='flex items-start gap-3'>
          <Checkbox
            checked={analyticsEnabled && !globalPrivacyControl}
            disabled={globalPrivacyControl}
            id='analytics'
            className='mt-0.5'
            onCheckedChange={(checked) => {
              setAnalyticsEnabled(checked === true);
            }}
          />
          <div className='flex flex-col gap-1'>
            <Label htmlFor='analytics' className='font-medium'>
              Product analytics
            </Label>
            <p className='text-sm text-muted-foreground'>
              Helps Tau understand website usage through PostHog. This may use cookies and session recording.
            </p>
            {globalPrivacyControl ? (
              <p className='text-sm text-muted-foreground'>
                Your browser’s Global Privacy Control signal disables analytics.
              </p>
            ) : null}
          </div>
        </div>
      </div>

      <DialogFooter>
        <Button
          variant='outline'
          onClick={() => {
            onOpenChange(false);
          }}
        >
          Cancel
        </Button>
        <Button variant='outline' onClick={handleSaveSettings}>
          Save settings
        </Button>
      </DialogFooter>
    </DialogContent>
  );
};

export function CookieConsent(): React.JSX.Element | undefined {
  const [consentStatus, setConsentStatus] = useCookieConsent();
  const [isDialogOpen, setIsDialogOpen] = useState(false);

  if (consentStatus !== 'unknown') {
    return undefined;
  }

  return (
    <>
      <div className='fixed right-2 bottom-2 z-50 max-w-sm animate-in duration-300 fade-in slide-in-from-bottom-4 max-sm:left-2'>
        <div className='flex flex-col gap-2 rounded-lg border bg-card p-4 shadow-md'>
          <div className='flex items-start justify-between'>
            <h3 className='font-semibold'>Cookies</h3>
            <CookieIcon className='size-4 shrink-0 text-muted-foreground' />
          </div>
          <p className='text-sm text-muted-foreground'>Allow optional PostHog analytics to help improve Tau?</p>
          <div className='flex items-center justify-between'>
            <Button
              variant='link'
              size='sm'
              className='-mb-2 -ml-3'
              onClick={() => {
                setIsDialogOpen(true);
              }}
            >
              Manage
            </Button>
            <div className='flex items-center gap-2'>
              <Button
                variant='outline'
                size='sm'
                onClick={() => {
                  setConsentStatus('declined');
                }}
              >
                Decline
              </Button>
              <Button
                variant='outline'
                size='sm'
                onClick={() => {
                  setConsentStatus('accepted');
                }}
              >
                Accept
              </Button>
            </div>
          </div>
        </div>
      </div>
      <CookiePreferencesDialog isOpen={isDialogOpen} onOpenChange={setIsDialogOpen} />
    </>
  );
}
