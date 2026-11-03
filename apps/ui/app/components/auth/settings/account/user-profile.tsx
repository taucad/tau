import { useAuth, useSession, useUpdateUser } from '@better-auth-ui/react';
import { useState } from 'react';
import type { SyntheticEvent } from 'react';
import { toast } from 'sonner';

import { Button } from '@taucad/ui/components/button';
import { FieldError } from '@taucad/ui/components/field';
import { Input } from '@taucad/ui/components/input';
import { Skeleton } from '@taucad/ui/components/skeleton';
import { Spinner } from '#components/ui/spinner.js';
import { ChangeAvatar } from '#components/auth/settings/account/change-avatar.js';
import { SettingsGroup, SettingsRow } from '#components/settings/settings-item.js';

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
    <SettingsGroup title='Profile' className={className}>
      <SettingsRow title={localization.settings.avatar} control={<ChangeAvatar />} />
      <form onSubmit={handleSubmit}>
        <SettingsRow
          title={<label htmlFor='name'>{localization.auth.name}</label>}
          control={
            <>
              {session ? (
                <Input
                  key={session.user.name}
                  id='name'
                  name='name'
                  autoComplete='name'
                  className='w-40 sm:w-56'
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
                  <Input className='invisible w-40 sm:w-56' />
                </Skeleton>
              )}
              <Button type='submit' size='sm' variant='outline' disabled={isPending || !session}>
                {isPending && <Spinner />}
                Save
              </Button>
            </>
          }
        >
          <FieldError>{fieldErrors.name}</FieldError>
        </SettingsRow>
      </form>
    </SettingsGroup>
  );
}
