/* The Cloud implementation's props (TypeScript resolves the unaliased specifier to it); types only. */
import type { ChatErrorProviderAccount as CloudChatErrorProviderAccount } from '#routes/w.$workspace.$project/chat-error-provider-account.js';
import { memo } from 'react';
import type { ComponentProps } from 'react';
import { useDeploymentMode } from '#cloud/use-deployment-mode.js';
import { ChatErrorProviderAccount as SelfHostChatErrorProviderAccount } from '#routes/w.$workspace.$project/chat-error-provider-account.self-host.js';
import { ChatErrorProviderAccountFunded } from '#routes/w.$workspace.$project/chat-error-provider-account-funded.js';
import { ChatErrorNeutral } from '#routes/w.$workspace.$project/chat-error-neutral.js';

// oxlint-disable-next-line no-barrel-files/no-barrel-files -- the details parser is shared by every ceiling.
export { providerEntryFrom } from '#routes/w.$workspace.$project/chat-error-provider-account.self-host.js';

/**
 * The provider-account card: Tau Cloud's copy while funded, the operator's links when unfunded, neutral while unknown.
 * Copy only, so no Cloud chunk is loaded for it (gate G1).
 */
export const ChatErrorProviderAccount = memo(function (props: ComponentProps<typeof CloudChatErrorProviderAccount>) {
  const { state } = useDeploymentMode();
  if (state === 'funded') {
    return <ChatErrorProviderAccountFunded {...props} />;
  }
  if (state === 'unfunded') {
    return <SelfHostChatErrorProviderAccount {...props} />;
  }
  return <ChatErrorNeutral {...(props.className === undefined ? {} : { className: props.className })} />;
});
