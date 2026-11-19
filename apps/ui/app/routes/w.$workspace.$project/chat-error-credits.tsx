import { memo } from 'react';
import type { ComponentProps } from 'react';
import { ChatErrorCreditsCard } from '#routes/w.$workspace.$project/chat-error-credits-card.js';
import { AddCreditsAction } from '#routes/w.$workspace.$project/chat-error-add-credits.js';

type ChatErrorCreditsProps = Omit<ComponentProps<typeof ChatErrorCreditsCard>, 'addCredits'>;

/** Tau Cloud: the out-of-credits card with its top-up. */
export const ChatErrorCredits = memo(function (props: ChatErrorCreditsProps): React.JSX.Element {
  return <ChatErrorCreditsCard {...props} addCredits={<AddCreditsAction />} />;
});
