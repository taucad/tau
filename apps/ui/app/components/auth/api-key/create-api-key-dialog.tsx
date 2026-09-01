'use client';

import { useAuth, useAuthPlugin, useCreateApiKey } from '@better-auth-ui/react';
import type { ApiKeyAuthClient } from '@better-auth-ui/react';
import { Key } from 'lucide-react';
import { useState } from 'react';
import type { SyntheticEvent } from 'react';

import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogMedia,
  AlertDialogTitle,
} from '@taucad/ui/components/alert-dialog';
import { Button } from '@taucad/ui/components/button';
import { Field, FieldError } from '@taucad/ui/components/field';
import { Input } from '@taucad/ui/components/input';
import { Label } from '@taucad/ui/components/label';
import { Spinner } from '#components/ui/spinner.js';
import { apiKeyPlugin } from '#utils/api-key-plugin.js';
import { NewApiKeyDialog } from '#components/auth/api-key/new-api-key-dialog.js';

export type CreateApiKeyDialogProps = {
  // oxlint-disable-next-line react-js/boolean-prop-naming -- mirrors Radix Dialog's controlled `open` prop API.
  open: boolean;
  onOpenChange: (open: boolean) => void;
};

export function CreateApiKeyDialog({ open, onOpenChange }: CreateApiKeyDialogProps): React.JSX.Element {
  const { authClient, localization } = useAuth();
  const { localization: apiKeyLocalization } = useAuthPlugin(apiKeyPlugin);

  const { mutate: createApiKey, isPending: isCreating } = useCreateApiKey(authClient as ApiKeyAuthClient);

  const [isNewKeyDialogOpen, setIsNewKeyDialogOpen] = useState(false);
  const [keyName, setKeyName] = useState<string | undefined>(undefined);
  const [secretKey, setSecretKey] = useState<string | undefined>(undefined);
  const [fieldErrors, setFieldErrors] = useState<{
    name?: string;
  }>({});

  const nameRequiredMessage = `${apiKeyLocalization.apiKey} name is required.`;

  const handleOpenChange = (nextOpen: boolean): void => {
    if (!nextOpen) {
      setKeyName(undefined);
      setSecretKey(undefined);
      setFieldErrors({});
    }

    onOpenChange(nextOpen);
  };

  const handleSubmit = (event: SyntheticEvent<HTMLFormElement>): void => {
    event.preventDefault();

    const form = event.currentTarget;
    const formData = new FormData(form);
    const name = (formData.get('name') as string).trim();

    if (!name) {
      const nameInput = form.elements.namedItem('name');
      if (nameInput instanceof HTMLInputElement) {
        nameInput.setCustomValidity(nameRequiredMessage);
        nameInput.focus();
      }

      setFieldErrors((previous) => ({
        ...previous,
        name: nameRequiredMessage,
      }));
      return;
    }

    createApiKey(
      { name },
      {
        onSuccess: (result) => {
          handleOpenChange(false);
          setKeyName(name);
          setSecretKey(result.key);
          setIsNewKeyDialogOpen(true);
        },
      },
    );
  };

  return (
    <>
      <AlertDialog open={open} onOpenChange={handleOpenChange}>
        <AlertDialogContent>
          <form onSubmit={handleSubmit} className='flex flex-col gap-6'>
            <AlertDialogHeader>
              <AlertDialogMedia>
                <Key />
              </AlertDialogMedia>

              <AlertDialogTitle>{apiKeyLocalization.createApiKey}</AlertDialogTitle>

              <AlertDialogDescription>{apiKeyLocalization.apiKeysDescription}</AlertDialogDescription>
            </AlertDialogHeader>

            <Field data-invalid={Boolean(fieldErrors.name)}>
              <Label htmlFor='api-key-name'>{apiKeyLocalization.name}</Label>

              <Input
                id='api-key-name'
                name='name'
                autoFocus
                placeholder='Enter name'
                required
                disabled={isCreating}
                onChange={(event) => {
                  event.currentTarget.setCustomValidity('');
                  setFieldErrors((previous) => ({
                    ...previous,
                    name: undefined,
                  }));
                }}
                onInvalid={(event) => {
                  event.preventDefault();
                  setFieldErrors((previous) => ({
                    ...previous,
                    name: event.currentTarget.validationMessage,
                  }));
                }}
                aria-invalid={Boolean(fieldErrors.name)}
              />

              <FieldError>{fieldErrors.name}</FieldError>
            </Field>

            <AlertDialogFooter>
              <AlertDialogCancel disabled={isCreating}>{localization.settings.cancel}</AlertDialogCancel>

              <Button type='submit' disabled={isCreating}>
                {isCreating && <Spinner />}

                {apiKeyLocalization.createApiKey}
              </Button>
            </AlertDialogFooter>
          </form>
        </AlertDialogContent>
      </AlertDialog>

      <NewApiKeyDialog
        open={isNewKeyDialogOpen}
        onOpenChange={setIsNewKeyDialogOpen}
        secretKey={secretKey}
        name={keyName}
      />
    </>
  );
}
