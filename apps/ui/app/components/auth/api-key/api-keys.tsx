'use client';

import { useAuth, useAuthPlugin, useListApiKeys } from '@better-auth-ui/react';
import type { ApiKeyAuthClient } from '@better-auth-ui/react';
import { useState } from 'react';
import { Button } from '#components/ui/button.js';
import { Card, CardContent } from '#components/ui/card.js';
import { Separator } from '#components/ui/separator.js';
import { apiKeyPlugin } from '#utils/api-key-plugin.js';
import { cn } from '#utils/ui.utils.js';
import { ApiKey } from '#components/auth/api-key/api-key.js';
import { ApiKeySkeleton } from '#components/auth/api-key/api-key-skeleton.js';
import { ApiKeysEmpty } from '#components/auth/api-key/api-keys-empty.js';
import { CreateApiKeyDialog } from '#components/auth/api-key/create-api-key-dialog.js';

export type ApiKeysProps = {
  className?: string;
};

export function ApiKeys({ className }: ApiKeysProps) {
  const { authClient } = useAuth();
  const { localization: apiKeyLocalization } = useAuthPlugin(apiKeyPlugin);

  const { data: listData, isPending } = useListApiKeys(authClient as ApiKeyAuthClient);

  const [createOpen, setCreateOpen] = useState(false);

  return (
    <div className={cn('flex flex-col gap-3', className)}>
      <div className='flex items-end justify-between gap-3'>
        <h2 className='truncate text-sm font-semibold'>{apiKeyLocalization.apiKeys}</h2>

        <Button
          className='shrink-0'
          size='sm'
          disabled={isPending}
          onClick={() => {
            setCreateOpen(true);
          }}
        >
          {apiKeyLocalization.createApiKey}
        </Button>
      </div>

      <Card className='p-0'>
        <CardContent className='p-0'>
          {isPending ? (
            <ApiKeySkeleton />
          ) : (listData?.apiKeys.length ?? 0) === 0 ? (
            <ApiKeysEmpty
              onCreatePress={() => {
                setCreateOpen(true);
              }}
            />
          ) : (
            listData?.apiKeys.map((key, index) => (
              <div key={key.id}>
                {index > 0 && <Separator />}

                <ApiKey apiKey={key} />
              </div>
            ))
          )}
        </CardContent>
      </Card>

      <CreateApiKeyDialog open={createOpen} onOpenChange={setCreateOpen} />
    </div>
  );
}
