/* The Cloud implementation's props (TypeScript resolves the unaliased specifier to it); types only. */
import type { ChatErrorProviderAccount as CloudChatErrorProviderAccount } from '#routes/w.$workspace.$project/chat-error-provider-account.js';
import { memo } from 'react';
import type { ComponentProps } from 'react';
import { FundedSurface } from '#cloud/cloud-surface.js';
import { useDeploymentMode } from '#cloud/use-deployment-mode.js';
import { ChatErrorProviderAccount as SelfHostChatErrorProviderAccount } from '#routes/w.$workspace.$project/chat-error-provider-account.self-host.js';
import { ChatErrorNeutral } from '#routes/w.$workspace.$project/chat-error-neutral.js';

// oxlint-disable-next-line no-barrel-files/no-barrel-files -- the details parser is shared by every ceiling.
export { providerEntryFrom } from '#routes/w.$workspace.$project/chat-error-provider-account.self-host.js';

/** The provider-account card: Cloud copy while funded, the operator's links when unfunded, neutral while unknown. */
export const ChatErrorProviderAccount = memo(function (props: ComponentProps<typeof CloudChatErrorProviderAccount>) {
  const { state } = useDeploymentMode();
  if (state === 'unfunded') {
    return <SelfHostChatErrorProviderAccount {...props} />;
  }
  return (
    <FundedSurface
      fallback={<ChatErrorNeutral {...(props.className === undefined ? {} : { className: props.className })} />}
      render={(cloud) => <cloud.ChatErrorProviderAccount {...props} />}
    />
  );
});
