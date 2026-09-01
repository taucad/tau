'use client';

import { useAuthPlugin } from '@better-auth-ui/react';
import { Key } from 'lucide-react';

import { Button } from '@taucad/ui/components/button';
import { Card, CardContent } from '@taucad/ui/components/card';
import { apiKeyPlugin } from '#utils/api-key-plugin.js';

export type ApiKeysEmptyProps = {
  onCreatePress: () => void;
};

export function ApiKeysEmpty({ onCreatePress }: ApiKeysEmptyProps) {
  const { localization: apiKeyLocalization } = useAuthPlugin(apiKeyPlugin);

  return (
    <Card className='border-0 bg-transparent shadow-none ring-0'>
      <CardContent className='flex flex-col items-center justify-center gap-4'>
        <div className='flex size-10 items-center justify-center rounded-md bg-muted'>
          <Key className='size-4.5' />
        </div>

        <div className='flex flex-col items-center justify-center gap-1 text-center'>
          <p className='text-sm font-semibold'>{apiKeyLocalization.noApiKeys}</p>

          <p className='text-xs text-muted-foreground'>{apiKeyLocalization.apiKeysDescription}</p>
        </div>

        <Button size='sm' onClick={onCreatePress}>
          {apiKeyLocalization.createApiKey}
        </Button>
      </CardContent>
    </Card>
  );
}
