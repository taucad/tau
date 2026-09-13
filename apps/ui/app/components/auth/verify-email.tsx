import { useAuth } from '@better-auth-ui/react';
import { CheckCircle2, CircleAlert, LogIn } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { useLocation } from 'react-router';

import { Button } from '#components/ui/button.js';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '#components/ui/card.js';
import { Spinner } from '#components/ui/spinner.js';
import { cn } from '#utils/ui.utils.js';

/** Milliseconds. */
const redirectDelay = 900;

type VerifyEmailStatus = 'verifying' | 'verified' | 'failed' | 'missing-token';

export type VerifyEmailProps = {
  readonly className?: string;
};

export const sanitizeVerifyEmailRedirectTo = (value?: string): string => {
  if (!value) {
    return '/';
  }

  if (value.startsWith('/') && !value.startsWith('//')) {
    return value;
  }

  return '/';
};

export function VerifyEmail({ className }: VerifyEmailProps): React.JSX.Element {
  const { authClient, basePaths, viewPaths, navigate, Link } = useAuth();
  const location = useLocation();
  const [status, setStatus] = useState<VerifyEmailStatus>('verifying');

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

    const verifyEmail = async (): Promise<void> => {
      try {
        const result = await authClient.verifyEmail({
          query: { token },
        });

        if (result.error) {
          throw new Error(result.error.message ?? 'Email verification failed');
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

    void verifyEmail();

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
            ? 'Email verified'
            : status === 'verifying'
              ? 'Verifying your email'
              : status === 'missing-token'
                ? 'Verification link is missing'
                : "We couldn't verify your email"}
        </CardTitle>

        <CardDescription>
          {status === 'verified'
            ? 'Your Tau account is ready. Taking you back now.'
            : status === 'verifying'
              ? 'Hold tight while Tau confirms this verification link.'
              : status === 'missing-token'
                ? 'Open the verification link from your email, or sign in to request a fresh link.'
                : 'This link may have expired or already been used. Sign in to request a fresh verification email.'}
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
