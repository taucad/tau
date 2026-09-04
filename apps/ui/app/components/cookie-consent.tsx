import { useState, useEffect } from 'react';
import { CookieIcon } from 'lucide-react';
import { Link } from 'react-router';
import { useAnalytics, useCookieConsent } from '#hooks/use-analytics.js';
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

/**
 * Detects if Global Privacy Control (GPC) is enabled in the browser.
 * GPC is a browser signal that indicates the user's preference to opt out of tracking.
 * @see https://globalprivacycontrol.org
 */
function isGlobalPrivacyControlEnabled(): boolean {
  if (typeof navigator === 'undefined') {
    return false;
  }

  // Navigator.globalPrivacyControl is the standard GPC signal
  return (navigator as Navigator & { globalPrivacyControl?: boolean }).globalPrivacyControl === true;
}

/**
 * Cookie preferences dialog component.
 * Can be used standalone to allow users to manage their cookie preferences.
 */
export function CookiePreferencesDialog({
  isOpen,
  onOpenChange,
}: {
  readonly isOpen: boolean;
  readonly onOpenChange: (open: boolean) => void;
}): React.JSX.Element {
  const analytics = useAnalytics();
  const [, setConsentStatus] = useCookieConsent();
  // Default to false for GDPR compliance - optional cookies must not be pre-selected
  const [analyticsEnabled, setAnalyticsEnabled] = useState(analytics.get_explicit_consent_status() === 'granted');
  const [wasOpen, setWasOpen] = useState(isOpen);

  if (isOpen !== wasOpen) {
    setWasOpen(isOpen);
    if (isOpen) {
      setAnalyticsEnabled(analytics.get_explicit_consent_status() === 'granted');
    }
  }

  const handleSaveSettings = (): void => {
    if (analyticsEnabled) {
      analytics.opt_in_capturing();
      setConsentStatus('granted');
    } else {
      analytics.opt_out_capturing();
      setConsentStatus('denied');
    }

    onOpenChange(false);
  };

  const handleCancel = (): void => {
    onOpenChange(false);
  };

  return (
    <Dialog open={isOpen} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Cookie preferences</DialogTitle>
          <DialogDescription>
            We use cookies to analyze site usage and improve your experience.{' '}
            <Link to='/legal/privacy' className='underline hover:text-foreground'>
              Learn more
            </Link>
          </DialogDescription>
        </DialogHeader>

        <div className='flex flex-col gap-4'>
          {/* Essential cookies - always enabled */}
          <div className='flex items-start gap-3'>
            <Checkbox checked disabled id='essential' className='mt-0.5' />
            <div className='flex flex-col gap-1'>
              <Label htmlFor='essential' className='font-medium'>
                Essential Cookies
              </Label>
              <p className='text-sm text-muted-foreground'>
                Enable basic functions like page navigation and access to secure areas of the website. Without these
                cookies, the website cannot function properly.
              </p>
            </div>
          </div>

          <Separator />

          {/* Product analytics - toggleable */}
          <div className='flex items-start gap-3'>
            <Checkbox
              checked={analyticsEnabled}
              id='analytics'
              className='mt-0.5'
              onCheckedChange={(checked) => {
                setAnalyticsEnabled(checked === true);
              }}
            />
            <div className='flex flex-col gap-1'>
              <Label htmlFor='analytics' className='font-medium'>
                Analytics
              </Label>
              <p className='text-sm text-muted-foreground'>
                Cookies used to collect information about how you use the website. This data helps us improve the site
                and your experience.
              </p>
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button variant='outline' onClick={handleCancel}>
            Cancel
          </Button>
          <Button onClick={handleSaveSettings}>Save settings</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/**
 * Cookie consent banner component.
 *
 * Displays a floating banner in the bottom-right corner when consent
 * has not been given, with options to accept, decline, or manage preferences.
 */
export function CookieConsent(): React.JSX.Element | undefined {
  const analytics = useAnalytics();
  const [consentStatus, setConsentStatus] = useCookieConsent();
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [isVisible, setIsVisible] = useState(false);

  // Honor Global Privacy Control (GPC) signal
  // If GPC is enabled and consent is pending, automatically opt out of analytics
  useEffect(() => {
    if (consentStatus === 'pending' && isGlobalPrivacyControlEnabled()) {
      analytics.opt_out_capturing();
      setConsentStatus('denied');
    }
  }, [analytics, consentStatus, setConsentStatus]);

  // Delay showing the banner by 2 seconds
  useEffect(() => {
    if (consentStatus !== 'pending') {
      return;
    }

    const timer = setTimeout(() => {
      setIsVisible(true);
    }, 2000);

    return () => {
      clearTimeout(timer);
    };
  }, [consentStatus]);

  // Sync PostHog consent state with our cookie on mount and when consent changes
  useEffect(() => {
    if (consentStatus === 'granted') {
      analytics.opt_in_capturing();
    } else if (consentStatus === 'denied') {
      analytics.opt_out_capturing();
    }
  }, [analytics, consentStatus]);

  const handleAccept = (): void => {
    setConsentStatus('granted');
  };

  const handleDecline = (): void => {
    setConsentStatus('denied');
  };

  const handleManage = (): void => {
    setIsDialogOpen(true);
  };

  // Don't render banner if consent has already been given or not yet visible
  if (consentStatus !== 'pending' || !isVisible) {
    return undefined;
  }

  return (
    <>
      {/* Cookie consent banner */}
      <div className='fixed right-2 bottom-2 z-50 max-w-sm animate-in duration-300 fade-in slide-in-from-bottom-4 max-sm:left-2'>
        <div className='flex flex-col gap-2 rounded-lg border bg-card p-4 shadow-md'>
          <div className='flex items-start justify-between'>
            <h3 className='font-semibold'>Cookies</h3>
            <CookieIcon className='size-4 shrink-0 text-muted-foreground' />
          </div>
          <p className='text-sm text-muted-foreground'>
            We use cookies to analyze site usage and improve your experience.
          </p>
          <div className='flex items-center justify-between'>
            <Button variant='link' size='sm' className='-mb-2 -ml-3' onClick={handleManage}>
              Manage
            </Button>
            <div className='flex items-center gap-2'>
              <Button variant='outline' size='sm' onClick={handleDecline}>
                Decline
              </Button>
              <Button size='sm' onClick={handleAccept}>
                Accept
              </Button>
            </div>
          </div>
        </div>
      </div>

      {/* Preferences dialog */}
      <CookiePreferencesDialog isOpen={isDialogOpen} onOpenChange={setIsDialogOpen} />
    </>
  );
}
