'use client';

import { useAuth, useAuthPlugin, useDeleteApiKey } from '@better-auth-ui/react';
import type { ApiKeyAuthClient, ListedApiKey } from '@better-auth-ui/react';
import { Key } from 'lucide-react';

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
import { Field } from '#components/ui/field.js';
import { Input } from '#components/ui/input.js';
import { Label } from '#components/ui/label.js';
import { Spinner } from '#components/ui/spinner.js';
import { apiKeyPlugin } from '#utils/api-key-plugin.js';

export type DeleteApiKeyDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  apiKey: ListedApiKey;
};

export function DeleteApiKeyDialog({ open, onOpenChange, apiKey }: DeleteApiKeyDialogProps) {
  const { authClient, localization } = useAuth();
  const { localization: apiKeyLocalization } = useAuthPlugin(apiKeyPlugin);
  const preview = `${apiKey.start}${'*'.repeat(16)}`;
  const previewId = `delete-api-key-preview-${apiKey.id}`;
  const { mutate: deleteApiKey, isPending: isDeleting } = useDeleteApiKey(authClient as ApiKeyAuthClient, {
    onSuccess: () => {
      onOpenChange(false);
    },
  });

  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogMedia>
            <Key />
          </AlertDialogMedia>

          <AlertDialogTitle>{apiKeyLocalization.deleteApiKey}</AlertDialogTitle>

          <AlertDialogDescription>{apiKeyLocalization.deleteApiKeyWarning}</AlertDialogDescription>
        </AlertDialogHeader>

        <Field>
          <Label htmlFor={previewId}>{apiKey.name ?? apiKeyLocalization.apiKey}</Label>

          <Input id={previewId} value={preview} readOnly className='font-mono text-xs' disabled />
        </Field>

        <AlertDialogFooter>
          <AlertDialogCancel disabled={isDeleting}>{localization.settings.cancel}</AlertDialogCancel>

          <Button
            type='button'
            variant='destructive'
            disabled={isDeleting}
            onClick={() => {
              deleteApiKey({ keyId: apiKey.id });
            }}
          >
            {isDeleting && <Spinner />}

            {apiKeyLocalization.deleteApiKey}
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
