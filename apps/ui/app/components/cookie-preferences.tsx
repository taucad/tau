import { useState } from 'react';
import { Cookie } from 'lucide-react';
import { DropdownMenuItem } from '@taucad/ui/components/dropdown-menu';
import { writeConsent } from '@taucad/consent';
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
import { useCookieConsent } from '#hooks/use-cookie-consent.js';
import { isGlobalPrivacyControlEnabled } from '#lib/global-privacy-control.lib.js';
import { legalUrl } from '#lib/legal-url.js';

/**
 * Help-menu entry that opens the dialog. The desktop override (`cookie-preferences.desktop.tsx`) renders none.
 */
export function CookiePreferencesMenuItem({ onSelect }: { readonly onSelect: () => void }): React.JSX.Element {
  return (
    <DropdownMenuItem onSelect={onSelect}>
      <Cookie />
      Cookie preferences
    </DropdownMenuItem>
  );
}

function CookiePreferencesContent({
  onOpenChange,
}: {
  readonly onOpenChange: (open: boolean) => void;
}): React.JSX.Element {
  const consentStatus = useCookieConsent();
  const globalPrivacyControl = isGlobalPrivacyControlEnabled();
  const [analyticsEnabled, setAnalyticsEnabled] = useState(consentStatus === 'accepted');

  return (
    <DialogContent>
      <DialogHeader>
        <DialogTitle>Cookie preferences</DialogTitle>
        <DialogDescription>
          Tau uses optional analytics only after you allow it. Your choice also applies to the Tau website.{' '}
          <a href={legalUrl('cookies')} target='_blank' rel='noopener noreferrer' className='underline'>
            Learn more
          </a>
        </DialogDescription>
      </DialogHeader>

      <div className='flex flex-col gap-4'>
        <div className='flex items-start gap-3'>
          <Checkbox checked disabled id='essential-storage' className='mt-0.5' />
          <div className='flex flex-col gap-1'>
            <Label htmlFor='essential-storage' className='font-medium'>
              Essential storage
            </Label>
            <p className='text-sm text-muted-foreground'>Keeps you signed in and remembers this choice.</p>
          </div>
        </div>

        <Separator />

        <div className='flex items-start gap-3'>
          <Checkbox
            checked={analyticsEnabled && !globalPrivacyControl}
            disabled={globalPrivacyControl}
            id='product-analytics'
            className='mt-0.5'
            onCheckedChange={(checked) => {
              setAnalyticsEnabled(checked === true);
            }}
          />
          <div className='flex flex-col gap-1'>
            <Label htmlFor='product-analytics' className='font-medium'>
              Product analytics
            </Label>
            <p className='text-sm text-muted-foreground'>
              Helps improve Tau through PostHog, including session recording.
            </p>
            {globalPrivacyControl ? (
              <p className='text-sm text-muted-foreground'>
                Your browser’s Global Privacy Control signal turns analytics off.
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
        <Button
          onClick={() => {
            writeConsent(analyticsEnabled && !globalPrivacyControl ? 'accepted' : 'declined');
            onOpenChange(false);
          }}
        >
          Save
        </Button>
      </DialogFooter>
    </DialogContent>
  );
}

/**
 * Review or change the optional-analytics decision shared with the website (`@taucad/consent`).
 * Opened from Help → Cookie preferences.
 */
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
