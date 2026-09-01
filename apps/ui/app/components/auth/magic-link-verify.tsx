import { useAuth } from '@better-auth-ui/react';
import { CheckCircle2, CircleAlert, LogIn } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { useLocation } from 'react-router';

import { Button } from '@taucad/ui/components/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@taucad/ui/components/card';
import { Spinner } from '#components/ui/spinner.js';
import { sanitizeVerifyEmailRedirectTo } from '#components/auth/verify-email.js';
import { cn } from '@taucad/ui/utils/cn';

/** Milliseconds. */
const redirectDelay = 900;

type MagicLinkVerifyStatus = 'verifying' | 'verified' | 'failed' | 'missing-token';

type MagicLinkVerifyClient = {
  readonly magicLink: {
    readonly verify: (args: {
      readonly query: {
        readonly token: string;
        readonly callbackURL: string;
      };
    }) => Promise<{ readonly error?: { readonly message?: string } | null }>;
  };
};

export type MagicLinkVerifyProps = {
  readonly className?: string;
};

export function MagicLinkVerify({ className }: MagicLinkVerifyProps): React.JSX.Element {
  const { authClient, basePaths, viewPaths, navigate, Link } = useAuth();
  const location = useLocation();
  const [status, setStatus] = useState<MagicLinkVerifyStatus>('verifying');

  const searchParams = useMemo(() => new URLSearchParams(location.search), [location.search]);
  const token = searchParams.get('token');
  const redirectTo = sanitizeVerifyEmailRedirectTo(searchParams.get('redirectTo') ?? undefined);
  const signInPath = `${basePaths.auth}/${viewPaths.auth.signIn}`;

  useEffect(() => {
    if (!token) {
      setStatus('missing-token');
      return;
    }

    let isMounted = true;
    let redirectTimer: ReturnType<typeof setTimeout> | undefined;
    const magicLinkClient = authClient as unknown as MagicLinkVerifyClient;

    const verifyMagicLink = async (): Promise<void> => {
      try {
        const result = await magicLinkClient.magicLink.verify({
          query: { token, callbackURL: redirectTo },
        });

        if (result.error) {
          throw new Error(result.error.message ?? 'Magic link verification failed');
        }

        if (!isMounted) {
          return;
        }

        setStatus('verified');
        redirectTimer = setTimeout(() => {
          navigate({ to: redirectTo, replace: true });
        }, redirectDelay);
      } catch {
        if (isMounted) {
          setStatus('failed');
        }
      }
    };

    void verifyMagicLink();

    return () => {
      isMounted = false;

      if (redirectTimer) {
        clearTimeout(redirectTimer);
      }
    };
  }, [authClient, navigate, redirectTo, token]);

  return (
    <Card className={cn('w-full max-w-sm', className)}>
      <CardHeader>
        <div className='mb-2 flex size-10 items-center justify-center rounded-full bg-primary/10 text-primary'>
          {status === 'verified' ? (
            <CheckCircle2 className='size-5' aria-hidden='true' />
          ) : status === 'verifying' ? (
            <Spinner className='size-5' />
          ) : (
            <CircleAlert className='size-5' aria-hidden='true' />
          )}
        </div>

        <CardTitle className='text-xl font-semibold'>
          {status === 'verified'
            ? 'Magic link verified'
            : status === 'verifying'
              ? 'Verifying your magic link'
              : status === 'missing-token'
                ? 'Magic link is missing'
                : "We couldn't verify your magic link"}
        </CardTitle>

        <CardDescription>
          {status === 'verified'
            ? 'Opening Tau now.'
            : status === 'verifying'
              ? 'Hold tight while Tau confirms this sign-in link.'
              : status === 'missing-token'
                ? 'Open the magic link from your email, or sign in to request a fresh link.'
                : 'This link may have expired or already been used. Sign in to request a fresh link.'}
        </CardDescription>
      </CardHeader>

      {status !== 'verified' && status !== 'verifying' && (
        <CardContent>
          <Button asChild className='w-full'>
            <Link href={signInPath}>
              <LogIn aria-hidden='true' />
              Sign in
            </Link>
          </Button>
        </CardContent>
      )}
    </Card>
  );
}
