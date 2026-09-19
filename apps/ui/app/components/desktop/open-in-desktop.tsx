/**
 * "Open in Tau Desktop" — the browser's half of a `tau://` deep link (R4).
 *
 * The rule the canvas encodes: the web page finishes its own job, and offers
 * the app second. So this is never a gate. It renders beside a page that is
 * already accepting the invitation or already importing the repository, it
 * renders nothing at all on the desktop build, and it renders nothing for a
 * link the shell's parser would refuse — a dead "Open in Tau Desktop" button
 * is worse than none.
 *
 * There is no timer anywhere here. A custom scheme gives the page no signal
 * either way: the browser may show its own "Open Tau?" dialog, the app may
 * already be running, or nothing may happen. The person says whether it
 * worked, through a button that is visible the whole time it is opening.
 */

import { useCallback, useEffect, useId, useRef, useState } from 'react';
import { useLocation } from 'react-router';
import { CircleAlert, Download, ExternalLink } from 'lucide-react';

import { Button } from '@taucad/ui/components/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@taucad/ui/components/card';
import { Checkbox } from '@taucad/ui/components/checkbox';
import { Label } from '@taucad/ui/components/label';
import { Spinner } from '#components/ui/spinner.js';
import { isDesktopTarget } from '#lib/build-target.js';
import { desktopDeepLink } from '#lib/desktop-deep-link.js';

/**
 * Where "Get Tau Desktop" goes.
 *
 * The same destination the in-app `Get Tau Desktop` action already opens
 * (`routes/w.$workspace.$project/project-route-notices.tsx`). There is no
 * dedicated download route yet; when one lands, both sites point at it.
 */
export const tauDesktopDownloadUrl = 'https://docs.tau.new';

/**
 * The browser's own preference, per the Figma pattern the canvas copies.
 *
 * ponytail: plain `localStorage`, not `useCookie` — this preference is
 * web-only, is never server-rendered and never rides a request, and adding it
 * to `CookieName` would buy only cross-tab sync nobody has asked for.
 */
const alwaysOpenStorageKey = 'tau.open-links-in-desktop';

const readAlwaysOpen = (): boolean => {
  try {
    return globalThis.localStorage.getItem(alwaysOpenStorageKey) === 'true';
  } catch {
    // A blocked store means no preference, never a broken page.
    return false;
  }
};

const writeAlwaysOpen = (value: boolean): void => {
  try {
    if (value) {
      globalThis.localStorage.setItem(alwaysOpenStorageKey, 'true');
    } else {
      globalThis.localStorage.removeItem(alwaysOpenStorageKey);
    }
  } catch {
    // Persistence is best-effort; a blocked store must not break the checkbox.
  }
};

/** What the offer is showing, in the order a person meets it. */
type OfferStage = 'offer' | 'opening' | 'not-opened' | 'dismissed';

export type OpenInDesktopProps = {
  /**
   * What staying in the browser is called on this page — "Accept in the
   * browser", "Import in the browser". The page is already doing it, so the
   * button only puts the offer away.
   */
  readonly continueLabel: string;
};

/**
 * Offer the desktop app for the link this page was opened with.
 *
 * @param props - The page's own word for continuing in the browser.
 * @returns The offer, or nothing when this build is the desktop app or the
 *   shell could not open this link anyway.
 */
export function OpenInDesktop({ continueLabel }: OpenInDesktopProps): React.JSX.Element | undefined {
  const location = useLocation();
  const checkboxId = useId();
  const [stage, setStage] = useState<OfferStage>('offer');
  const [alwaysOpen, setAlwaysOpen] = useState(false);
  /* The preference hands off on load, and React's development double-effect
     would otherwise navigate to the scheme twice. */
  const attempted = useRef(false);

  const deepLink = isDesktopTarget()
    ? undefined
    : desktopDeepLink(`${location.pathname}${location.search}${location.hash}`);

  const handOff = useCallback((): void => {
    if (deepLink === undefined) {
      return;
    }
    setStage('opening');
    /* A top-level navigation, which is how a browser is asked to consult its
       scheme handlers; the page itself stays where it is. */
    globalThis.location.assign(deepLink);
  }, [deepLink]);

  useEffect(() => {
    if (deepLink === undefined || attempted.current || !readAlwaysOpen()) {
      return;
    }
    attempted.current = true;
    setAlwaysOpen(true);
    handOff();
  }, [deepLink, handOff]);

  if (deepLink === undefined || stage === 'dismissed') {
    return undefined;
  }

  if (stage === 'opening') {
    return (
      <Card className='w-full max-w-sm' role='status' aria-busy='true'>
        <CardHeader>
          <div className='mb-2 flex size-10 items-center justify-center rounded-full bg-primary/10 text-primary'>
            <Spinner className='size-5' />
          </div>
          <CardTitle className='text-xl font-semibold'>Opening Tau Desktop</CardTitle>
          <CardDescription>
            Your browser asks whether to open Tau. Choose <strong>Open</strong> to continue there.
          </CardDescription>
        </CardHeader>
        <CardContent className='flex flex-col gap-2'>
          <Button
            variant='outline'
            className='w-full'
            onClick={() => {
              setStage('not-opened');
            }}
          >
            Tau Desktop didn’t open
          </Button>
        </CardContent>
      </Card>
    );
  }

  if (stage === 'not-opened') {
    return (
      <Card className='w-full max-w-sm'>
        <CardHeader>
          <div className='mb-2 flex size-10 items-center justify-center rounded-full bg-primary/10 text-primary'>
            <CircleAlert className='size-5' aria-hidden='true' />
          </div>
          <CardTitle className='text-xl font-semibold'>Tau Desktop didn’t open</CardTitle>
          <CardDescription>
            Tau Desktop may not be installed on this computer, or the browser did not offer to open it.
          </CardDescription>
        </CardHeader>
        <CardContent className='flex flex-col gap-2'>
          <Button className='w-full' onClick={handOff}>
            <ExternalLink aria-hidden='true' />
            Try again
          </Button>
          <Button asChild variant='outline' className='w-full'>
            <a href={tauDesktopDownloadUrl} target='_blank' rel='noreferrer'>
              <Download aria-hidden='true' />
              Get Tau Desktop
            </a>
          </Button>
          <Button
            variant='outline'
            className='w-full'
            onClick={() => {
              setStage('dismissed');
            }}
          >
            {continueLabel}
          </Button>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className='w-full max-w-sm'>
      <CardContent className='flex flex-col gap-2'>
        <Button className='w-full' onClick={handOff}>
          <ExternalLink aria-hidden='true' />
          Open in Tau Desktop
        </Button>
        <div className='flex items-center gap-2'>
          <Checkbox
            id={checkboxId}
            checked={alwaysOpen}
            onCheckedChange={(value) => {
              const next = value === true;
              setAlwaysOpen(next);
              writeAlwaysOpen(next);
            }}
          />
          <Label htmlFor={checkboxId} className='text-sm font-normal text-muted-foreground'>
            Always open Tau links in the desktop app
          </Label>
        </div>
      </CardContent>
    </Card>
  );
}
