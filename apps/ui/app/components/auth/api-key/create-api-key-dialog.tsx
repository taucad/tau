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
} from '#components/ui/alert-dialog.js';
import { Button } from '#components/ui/button.js';
import { Field, FieldError } from '#components/ui/field.js';
import { Input } from '#components/ui/input.js';
import { Label } from '#components/ui/label.js';
import { Spinner } from '#components/ui/spinner.js';
import { apiKeyPlugin } from '#utils/api-key-plugin.js';
import { NewApiKeyDialog } from '#components/auth/api-key/new-api-key-dialog.js';

export type CreateApiKeyDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
};

export function CreateApiKeyDialog({ open, onOpenChange }: CreateApiKeyDialogProps) {
  const { authClient, localization } = useAuth();
  const { localization: apiKeyLocalization } = useAuthPlugin(apiKeyPlugin);

  const { mutate: createApiKey, isPending: isCreating } = useCreateApiKey(authClient as ApiKeyAuthClient);

  const [isNewKeyDialogOpen, setIsNewKeyDialogOpen] = useState(false);
  const [keyName, setKeyName] = useState<string | undefined>(undefined);
  const [secretKey, setSecretKey] = useState<string | undefined>(undefined);

  const handleOpenChange = (nextOpen: boolean) => {
    if (!nextOpen) {
      setKeyName(undefined);
      setSecretKey(undefined);
    }

    onOpenChange(nextOpen);
  };

  const handleSubmit = (e: SyntheticEvent<HTMLFormElement>) => {
    e.preventDefault();

    const formData = new FormData(e.target as HTMLFormElement);
    const name = (formData.get('name') as string).trim();

    createApiKey(name ? { name } : {}, {
      onSuccess: (result) => {
        handleOpenChange(false);
        setKeyName(name);
        setSecretKey(result.key);
        setIsNewKeyDialogOpen(true);
      },
    });
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

            <Field>
              <Label htmlFor='api-key-name'>{apiKeyLocalization.name}</Label>

              <Input
                id='api-key-name'
                name='name'
                autoFocus
                placeholder={localization.settings.optional}
                disabled={isCreating}
              />

              <FieldError />
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
