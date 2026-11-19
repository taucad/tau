/* The Cloud implementation's props (TypeScript resolves the unaliased specifier to it); types only. */
import type { ChatErrorCredits as CloudChatErrorCredits } from '#routes/w.$workspace.$project/chat-error-credits.js';
import { memo } from 'react';
import type { ComponentProps } from 'react';
import { FundedSurface } from '#cloud/cloud-surface.js';
import { useDeploymentMode } from '#cloud/use-deployment-mode.js';
import { ChatErrorCredits as SelfHostChatErrorCredits } from '#routes/w.$workspace.$project/chat-error-credits.self-host.js';
import { ChatErrorCreditsCard } from '#routes/w.$workspace.$project/chat-error-credits-card.js';
import { ChatErrorNeutral } from '#routes/w.$workspace.$project/chat-error-neutral.js';

/**
 * The credits card: Core's card with the Cloud chunk's top-up while funded, self-host copy when unfunded, neutral while
 * unknown. The chunk carries only the Add credits action (gate G1, one-way dependency).
 */
export const ChatErrorCredits = memo(function (props: ComponentProps<typeof CloudChatErrorCredits>) {
  const { state } = useDeploymentMode();
  if (state === 'unfunded') {
    return <SelfHostChatErrorCredits {...props} />;
  }
  return (
    <FundedSurface
      fallback={<ChatErrorNeutral {...(props.className === undefined ? {} : { className: props.className })} />}
      render={(cloud) => <ChatErrorCreditsCard {...props} addCredits={<cloud.AddCreditsAction />} />}
    />
  );
});
