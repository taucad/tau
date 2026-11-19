import { memo } from 'react';
import type { ComponentProps } from 'react';
import { CloudSurface } from '#cloud/cloud-surface.js';
import { useCloudFunded } from '#cloud/cloud-mode.js';
import { ChatErrorCredits as SelfHostChatErrorCredits } from '#routes/w.$workspace.$project/chat-error-credits.self-host.js';

/** The adaptive facade of the credits error card (adaptive app deployment mode W2 skeleton): self-host until W5. */
export const ChatErrorCredits = memo(function (props: ComponentProps<typeof SelfHostChatErrorCredits>) {
  const funded = useCloudFunded();
  return <CloudSurface enabled={funded} fallback={<SelfHostChatErrorCredits {...props} />} render={() => undefined} />;
});
