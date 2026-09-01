import type { LucideIcon } from 'lucide-react';
import { Archive, CloudOff, FileWarning, Lock, MapPin, TimerReset } from 'lucide-react';
import { Link } from 'react-router';
import { Button } from '@taucad/ui/components/button';
import { cn } from '@taucad/ui/utils/cn';
import { useAuthLinks } from '#hooks/use-auth-links.js';

export type PublicationLockReason =
  | 'sign-in-required'
  | 'forbidden'
  | 'not-found'
  | 'unpublished'
  | 'rate-limited'
  | 'service-unavailable';

const publicationLockReasons: ReadonlySet<string> = new Set([
  'sign-in-required',
  'forbidden',
  'not-found',
  'unpublished',
  'rate-limited',
  'service-unavailable',
]);

export function isPublicationLockReason(value: string): value is PublicationLockReason {
  return publicationLockReasons.has(value);
}

export type PublicationLockScreenVariant =
  | 'signInRequired'
  | 'accessDenied'
  | 'notFound'
  | 'unpublished'
  | 'rateLimited'
  | 'serviceUnavailable'
  | 'filesUnavailable';

type VariantConfig = {
  readonly Icon: LucideIcon;
  readonly headline: string;
  readonly body: string;
  readonly primary: { readonly label: string; readonly action: 'signIn' | 'signOut' | 'home' | 'reload' };
  readonly secondary?: { readonly label: string; readonly action: 'signUp' | 'signOut' | 'home' | 'reload' };
};

const needOwnerHelpVariants: ReadonlySet<PublicationLockScreenVariant> = new Set(['signInRequired', 'accessDenied']);

export function PublicationLockScreen({
  variant,
  isInline,
}: {
  readonly variant: PublicationLockScreenVariant;
  readonly isInline?: boolean;
}): React.JSX.Element {
  const { magicLink, signUp, signOut } = useAuthLinks();

  const config: VariantConfig = (() => {
    switch (variant) {
      case 'signInRequired': {
        return {
          Icon: Lock,
          headline: 'This design is private',
          body: 'Sign in to view this shared design.',
          primary: { label: 'Sign in', action: 'signIn' },
          secondary: { label: 'Create account', action: 'signUp' },
        };
      }
      case 'accessDenied': {
        return {
          Icon: Lock,
          headline: "Your account doesn't have access",
          body: "You're signed in, but this design isn't shared with this account.",
          primary: { label: 'Switch account', action: 'signOut' },
          secondary: { label: 'Go home', action: 'home' },
        };
      }
      case 'notFound': {
        return {
          Icon: MapPin,
          headline: "This design doesn't exist",
          body: 'The link may have a typo, or the design was deleted.',
          primary: { label: 'Go home', action: 'home' },
        };
      }
      case 'unpublished': {
        return {
          Icon: Archive,
          headline: 'This design has been unpublished',
          body: 'The owner removed this share link.',
          primary: { label: 'Go home', action: 'home' },
        };
      }
      case 'rateLimited': {
        return {
          Icon: TimerReset,
          headline: 'Too many requests',
          body: "You've hit our rate limit. Try again in a moment.",
          primary: { label: 'Try again', action: 'reload' },
          secondary: { label: 'Go home', action: 'home' },
        };
      }
      case 'serviceUnavailable': {
        return {
          Icon: CloudOff,
          headline: "We can't load this design right now",
          body: 'Something went wrong on our side or your connection. Try again in a moment.',
          primary: { label: 'Try again', action: 'reload' },
          secondary: { label: 'Go home', action: 'home' },
        };
      }
      case 'filesUnavailable': {
        return {
          Icon: FileWarning,
          headline: "Can't load this design's files",
          body: "The design's files are temporarily unavailable. Try again in a moment.",
          primary: { label: 'Try again', action: 'reload' },
        };
      }
    }
  })();

  const hrefFor = (action: VariantConfig['primary']['action'] | NonNullable<VariantConfig['secondary']>['action']) => {
    if (action === 'signIn') {
      return magicLink;
    }

    if (action === 'signUp') {
      return signUp;
    }

    if (action === 'signOut') {
      return signOut;
    }

    return '/';
  };

  const handleReload = (): void => {
    globalThis.location.reload();
  };

  const PrimaryControl =
    config.primary.action === 'reload' ? (
      <Button type='button' className='flex-1 sm:flex-none' onClick={handleReload}>
        {config.primary.label}
      </Button>
    ) : (
      <Button type='button' className='flex-1 sm:flex-none' asChild>
        <Link to={hrefFor(config.primary.action)}>{config.primary.label}</Link>
      </Button>
    );

  const SecondaryControl = config.secondary ? (
    config.secondary.action === 'reload' ? (
      <Button type='button' variant='outline' className='flex-1 sm:flex-none' onClick={handleReload}>
        {config.secondary.label}
      </Button>
    ) : (
      <Button type='button' variant='outline' className='flex-1 sm:flex-none' asChild>
        <Link to={hrefFor(config.secondary.action)}>{config.secondary.label}</Link>
      </Button>
    )
  ) : null;

  const { Icon } = config;

  return (
    <div
      className={cn(
        'flex flex-col items-center justify-center px-4 py-8',
        isInline ? 'size-full min-h-0' : 'min-h-full flex-1',
      )}
    >
      <div className='w-full max-w-md animate-in duration-300 fade-in'>
        <div className='mb-6 flex flex-col items-center text-center'>
          <div className='mb-4 flex size-12 items-center justify-center rounded-full bg-muted/50 dark:bg-muted/30'>
            <Icon className='size-6 text-muted-foreground' aria-hidden />
          </div>
          <h1 className='text-xl font-semibold tracking-tight'>{config.headline}</h1>
          <p className='mt-2 text-sm text-muted-foreground'>{config.body}</p>
        </div>

        <div className={cn('flex flex-col gap-3 sm:flex-row sm:justify-center')}>
          {PrimaryControl}
          {SecondaryControl}
        </div>

        {needOwnerHelpVariants.has(variant) ? (
          <p className='mt-6 text-center text-sm text-muted-foreground'>
            Need access? Ask the owner to share with you.
          </p>
        ) : null}
      </div>
    </div>
  );
}

export function parsePublicationLockPayload(data: unknown): PublicationLockReason | undefined {
  let parsed: unknown = data;

  if (typeof data === 'string') {
    try {
      parsed = JSON.parse(data) as unknown;
    } catch {
      return undefined;
    }
  }

  if (!parsed || typeof parsed !== 'object' || !('reason' in parsed)) {
    return undefined;
  }

  const { reason } = parsed as { reason: unknown };
  if (typeof reason !== 'string' || !isPublicationLockReason(reason)) {
    return undefined;
  }

  return reason;
}
