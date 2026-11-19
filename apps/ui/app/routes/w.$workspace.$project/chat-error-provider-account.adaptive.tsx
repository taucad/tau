import { memo } from 'react';
import type { ComponentProps } from 'react';
import { CloudSurface } from '#cloud/cloud-surface.js';
import { useCloudFunded } from '#cloud/cloud-mode.js';
import { ChatErrorProviderAccount as SelfHostChatErrorProviderAccount } from '#routes/w.$workspace.$project/chat-error-provider-account.self-host.js';

// oxlint-disable-next-line no-barrel-files/no-barrel-files -- the details parser is shared by every ceiling.
export { providerEntryFrom } from '#routes/w.$workspace.$project/chat-error-provider-account.self-host.js';

/** The adaptive facade of the provider-account error card (adaptive app deployment mode W2 skeleton): self-host until W5. */
export const ChatErrorProviderAccount = memo(function (props: ComponentProps<typeof SelfHostChatErrorProviderAccount>) {
  const funded = useCloudFunded();
  return (
    <CloudSurface
      enabled={funded}
      fallback={<SelfHostChatErrorProviderAccount {...props} />}
      render={() => undefined}
    />
  );
});
