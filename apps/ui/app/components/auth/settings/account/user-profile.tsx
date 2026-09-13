import { useAuth, useSession, useUpdateUser } from '@better-auth-ui/react';
import { useState } from 'react';
import type { SyntheticEvent } from 'react';
import { toast } from 'sonner';

import { Button } from '#components/ui/button.js';
import { Card, CardContent, CardFooter } from '#components/ui/card.js';
import { Field, FieldError } from '#components/ui/field.js';
import { Input } from '#components/ui/input.js';
import { Label } from '#components/ui/label.js';
import { Skeleton } from '#components/ui/skeleton.js';
import { Spinner } from '#components/ui/spinner.js';
import { cn } from '#utils/ui.utils.js';
import { ChangeAvatar } from '#components/auth/settings/account/change-avatar.js';

export type UserProfileProps = {
  className?: string;
};

export function UserProfile({ className }: UserProfileProps): React.JSX.Element {
  const { authClient, localization } = useAuth();
  const { data: session } = useSession(authClient);

  const { mutate: updateUser, isPending } = useUpdateUser(authClient, {
    onSuccess: () => toast.success(localization.settings.profileUpdatedSuccess),
  });

  const [fieldErrors, setFieldErrors] = useState<{
    name?: string;
  }>({});

  function handleSubmit(event: SyntheticEvent<HTMLFormElement>): void {
    event.preventDefault();

    const formData = new FormData(event.currentTarget);
    const name = formData.get('name') as string;

    updateUser({
      name,
    });
  }

  return (
    <div>
      <h2 className='mb-3 text-sm font-semibold'>{localization.settings.userProfile}</h2>

      <form onSubmit={handleSubmit}>
        <Card className={cn(className)}>
          <CardContent className='flex flex-col gap-6'>
            <ChangeAvatar />

            <Field data-invalid={Boolean(fieldErrors.name)}>
              <Label htmlFor='name'>{localization.auth.name}</Label>

              {session ? (
                <Input
                  key={session.user.name}
                  id='name'
                  name='name'
                  autoComplete='name'
                  defaultValue={session.user.name}
                  placeholder={localization.auth.name}
                  disabled={isPending}
                  required
                  onChange={() => {
                    setFieldErrors((previous) => ({
                      ...previous,
                      name: undefined,
                    }));
                  }}
                  onInvalid={(event) => {
                    event.preventDefault();

                    setFieldErrors((previous) => ({
                      ...previous,
                      name: (event.target as HTMLInputElement).validationMessage,
                    }));
                  }}
                  aria-invalid={Boolean(fieldErrors.name)}
                />
              ) : (
                <Skeleton>
                  <Input className='invisible' />
                </Skeleton>
              )}

              <FieldError>{fieldErrors.name}</FieldError>
            </Field>
          </CardContent>

          <CardFooter>
            <Button type='submit' size='sm' disabled={isPending || !session}>
              {isPending && <Spinner />}

              {localization.settings.saveChanges}
            </Button>
          </CardFooter>
        </Card>
      </form>
    </div>
  );
}
