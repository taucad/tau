'use client';

import { useAuth, useSendVerificationEmail } from '@better-auth-ui/react';
import { MailCheck } from 'lucide-react';
import { useEffect, useState } from 'react';
import { toast } from 'sonner';

import { Button } from '@taucad/ui/components/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@taucad/ui/components/card';
import { cn } from '@taucad/ui/utils/cn';
import { authErrorMessage } from '@taucad/ui-core/utils/auth-error.utils';

/** Seconds before another verification email may be requested from this view. */
export const resendCooldownSeconds = 60;

export type CheckEmailProps = {
  readonly className?: string;
  /** The address the verification link went to. */
  readonly email: string;
  /** Why the person is here: a new sign-up, or a sign-in to an account that is not verified yet. */
  readonly reason: 'sign-up' | 'unverified-sign-in';
  /** Returns to the form so a mistyped address can be corrected. */
  readonly onUseDifferentEmail: () => void;
};

/**
 * What a person sees after an action that sent them a verification link: the address it went to, how long it
 * lasts, and a rate-limited way to get another. A toast on the next page disappeared before anyone read it.
 *
 * The resend starts cooling down at once, because the action that opened this view already sent a link.
 */
export function CheckEmail({ className, email, reason, onUseDifferentEmail }: CheckEmailProps): React.JSX.Element {
  const { authClient, basePaths, baseURL, redirectTo, viewPaths, Link } = useAuth();
  const [cooldown, setCooldown] = useState(resendCooldownSeconds);

  useEffect(() => {
    if (cooldown <= 0) {
      return;
    }
    const timer = setTimeout(() => {
      setCooldown((seconds) => seconds - 1);
    }, 1000);
    return () => {
      clearTimeout(timer);
    };
  }, [cooldown]);

  const { mutate: sendVerificationEmail, isPending } = useSendVerificationEmail(authClient, {
    onSuccess: () => {
      toast.success(`We sent a new link to ${email}.`);
      setCooldown(resendCooldownSeconds);
    },
    onError: (error) => {
      toast.error(authErrorMessage(error));
    },
  });

  return (
    <Card className={cn('w-full max-w-sm', className)}>
      <CardHeader>
        <div className='mb-2 flex size-10 items-center justify-center rounded-full bg-primary/10 text-primary'>
          <MailCheck className='size-5' aria-hidden='true' />
        </div>
        <CardTitle className='text-xl font-semibold'>
          <h1>Check your email</h1>
        </CardTitle>
        <CardDescription>
          {reason === 'sign-up'
            ? 'We sent a verification link to '
            : 'Your email is not verified yet. We sent a new link to '}
          <span className='font-medium text-foreground'>{email}</span>. Open it to finish setting up your Tau account.
          The link expires in 1 hour.
        </CardDescription>
      </CardHeader>
      <CardContent className='flex flex-col gap-3'>
        <Button
          type='button'
          variant='outline'
          className='w-full'
          disabled={isPending || cooldown > 0}
          onClick={() => {
            sendVerificationEmail({ email, callbackURL: `${baseURL}${redirectTo}` });
          }}
        >
          {cooldown > 0 ? `Resend email in ${cooldown}s` : 'Resend email'}
        </Button>
        <Button type='button' variant='ghost' className='w-full' onClick={onUseDifferentEmail}>
          {reason === 'sign-up' ? 'Use a different email' : 'Back to sign in'}
        </Button>
        {reason === 'sign-up' && (
          <p className='text-center text-sm text-muted-foreground'>
            Already verified?{' '}
            <Link href={`${basePaths.auth}/${viewPaths.auth.signIn}`} className='underline underline-offset-4'>
              Sign in
            </Link>
          </p>
        )}
      </CardContent>
    </Card>
  );
}
