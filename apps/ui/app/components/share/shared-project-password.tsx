import { useId } from 'react';
import { sharePasswordLimits } from '@taucad/share/artifact';
import { Button } from '@taucad/ui/components/button';
import { Input } from '@taucad/ui/components/input';
import { Label } from '@taucad/ui/components/label';
import { Loader } from '@taucad/ui/components/loader';

/** Password entry shared by the portable-link route and embedded previews. */
export function SharedProjectPassword({
  password,
  isOpening,
  passwordError,
  onPasswordChange,
  onSubmit,
}: {
  readonly password: string;
  readonly isOpening: boolean;
  readonly passwordError?: string;
  readonly onPasswordChange: (password: string) => void;
  readonly onSubmit: (password: string) => void;
}): React.JSX.Element {
  const inputId = useId();
  const errorId = useId();
  const passwordBytes = new TextEncoder().encode(password.normalize('NFC')).byteLength;
  const passwordValid = passwordBytes >= sharePasswordLimits.minBytes && passwordBytes <= sharePasswordLimits.maxBytes;
  return (
    <main className='flex min-h-dvh items-center justify-center bg-background p-6'>
      <form
        className='w-full max-w-sm rounded-xl border bg-card p-6'
        aria-busy={isOpening}
        onSubmit={(event) => {
          event.preventDefault();
          if (passwordValid) {
            onSubmit(password);
          }
        }}
      >
        <h1 className='text-lg font-semibold'>Password required</h1>
        <p className='mt-2 text-sm text-muted-foreground'>Enter the password shared by the project author.</p>
        <div className='mt-5 flex flex-col gap-2'>
          <Label htmlFor={inputId}>Password</Label>
          <Input
            id={inputId}
            type='password'
            autoComplete='current-password'
            autoFocus
            value={password}
            disabled={isOpening}
            aria-invalid={Boolean(passwordError)}
            aria-errormessage={passwordError ? errorId : undefined}
            aria-describedby={passwordError ? errorId : undefined}
            onChange={(event) => {
              onPasswordChange(event.target.value);
            }}
          />
          <p className='text-xs text-muted-foreground'>
            {sharePasswordLimits.minBytes}–{sharePasswordLimits.maxBytes} UTF-8 bytes required.
          </p>
          {passwordError ? (
            <p id={errorId} className='text-sm text-feature'>
              {passwordError}
            </p>
          ) : null}
        </div>
        <Button className='mt-5 w-full' type='submit' disabled={!passwordValid || isOpening} aria-busy={isOpening}>
          {isOpening ? <Loader className='size-4' /> : null}
          Open project
        </Button>
      </form>
    </main>
  );
}
