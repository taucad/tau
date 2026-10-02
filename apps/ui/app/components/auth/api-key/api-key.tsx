import { useAuth, useAuthPlugin } from '@better-auth-ui/react';
import type { ListedApiKey } from '@better-auth-ui/react';
import { Key, X } from 'lucide-react';
import { useState } from 'react';

import { Button } from '#components/ui/button.js';
import { Card, CardContent } from '#components/ui/card.js';
import { apiKeyPlugin } from '#utils/api-key-plugin.js';
import { DeleteApiKeyDialog } from '#components/auth/api-key/delete-api-key-dialog.js';

export type ApiKeyProps = {
  apiKey: ListedApiKey;
};

export function ApiKey({ apiKey }: ApiKeyProps) {
  const { localization } = useAuth();
  const { localization: apiKeyLocalization } = useAuthPlugin(apiKeyPlugin);
  const [deleteOpen, setDeleteOpen] = useState(false);

  const preview = `${apiKey.start}${'*'.repeat(16)}`;

  return (
    <Card className='border-0 bg-transparent shadow-none ring-0'>
      <CardContent className='flex items-center gap-3'>
        <div className='flex size-10 shrink-0 items-center justify-center rounded-md bg-muted'>
          <Key className='size-4.5' />
        </div>

        <div className='flex min-w-0 flex-col'>
          <span className='truncate text-sm leading-tight font-medium'>{apiKey.name ?? apiKeyLocalization.apiKey}</span>

          <span className='truncate font-mono text-xs text-muted-foreground'>{preview}</span>

          <span className='text-xs text-muted-foreground'>
            {new Date(apiKey.createdAt).toLocaleString(undefined, {
              dateStyle: 'medium',
              timeStyle: 'short',
            })}
          </span>
        </div>

        <Button
          className='ml-auto shrink-0'
          variant='outline'
          size='sm'
          onClick={() => {
            setDeleteOpen(true);
          }}
          aria-label={apiKeyLocalization.deleteApiKey}
        >
          <X />

          {localization.settings.delete}
        </Button>

        <DeleteApiKeyDialog open={deleteOpen} onOpenChange={setDeleteOpen} apiKey={apiKey} />
      </CardContent>
    </Card>
  );
}
