import { useAuth } from '@better-auth-ui/react';
import { CheckCircle2, CircleAlert, LogIn } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { useLocation } from 'react-router';

import { Button } from '@taucad/ui/components/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@taucad/ui/components/card';
import { Spinner } from '@taucad/ui-kit/components/spinner';
import { cn } from '@taucad/ui/utils/cn';

/** Milliseconds. */
const redirectDelay = 900;

/**
 * `verified-signed-out`: the link was good but brought no session. Verification links stay valid until they expire,
 * so this is a second open (say on a laptop after the phone) or a link for an account already verified.
 */
type VerifyEmailStatus = 'verifying' | 'verified' | 'verified-signed-out' | 'failed' | 'missing-token';

export type VerifyEmailProps = {
  readonly className?: string;
};

/**
 * Keeps a redirect only when it resolves to this origin. Resolving, not prefix-matching: browsers read `/\host` as
 * `//host`, which a "starts with one slash" check let through (web UI security assessment F-6).
 */
export const sanitizeVerifyEmailRedirectTo = (value?: string): string => {
  if (!value) {
    return '/';
  }

  try {
    const origin = globalThis.location.origin;
    const target = new URL(value, origin);
    if (target.origin !== origin) {
      return '/';
    }
    return `${target.pathname}${target.search}${target.hash}`;
  } catch {
    return '/';
  }
};

export function VerifyEmail({ className }: VerifyEmailProps): React.JSX.Element {
  const { authClient, basePaths, viewPaths, navigate, Link } = useAuth();
  const location = useLocation();
  const searchParams = useMemo(() => new URLSearchParams(location.search), [location.search]);
  const token = searchParams.get('token');
  const [status, setStatus] = useState<VerifyEmailStatus>(() => (token ? 'verifying' : 'missing-token'));
  const redirectTo = sanitizeVerifyEmailRedirectTo(searchParams.get('redirectTo') ?? undefined);
  const signInPath = `${basePaths.auth}/${viewPaths.auth.signIn}`;

  useEffect(() => {
    if (!token) {
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

        // With auto sign-in the answer carries the new session's user; without one there is nothing to go back to.
        if (!result.data?.user) {
          setStatus('verified-signed-out');
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
          {status === 'verified' || status === 'verified-signed-out' ? (
            <CheckCircle2 className='size-5' aria-hidden='true' />
          ) : status === 'verifying' ? (
            <Spinner className='size-5' />
          ) : (
            <CircleAlert className='size-5' aria-hidden='true' />
          )}
        </div>

        <CardTitle className='text-xl font-semibold'>
          <h1>
            {status === 'verified' || status === 'verified-signed-out'
              ? 'Email verified'
              : status === 'verifying'
                ? 'Verifying your email'
                : status === 'missing-token'
                  ? 'Verification link is missing'
                  : "We couldn't verify your email"}
          </h1>
        </CardTitle>

        <CardDescription>
          {status === 'verified'
            ? 'Your Tau account is ready. Taking you back now.'
            : status === 'verified-signed-out'
              ? 'Your email is confirmed. Sign in to continue.'
              : status === 'verifying'
                ? 'Hold tight while Tau confirms this verification link.'
                : status === 'missing-token'
                  ? 'Open the verification link from your email, or sign in to get a new one.'
                  : "This link has expired or isn't valid. Sign in with your email and password and we'll send you a new one."}
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
