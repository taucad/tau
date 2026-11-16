import { useLayoutEffect } from 'react';
import { vi } from 'vitest';
import { ChatEarlyInput } from '#components/chat/chat-early-input.js';
import type { EarlyChatInput } from '#components/chat/chat-early-input.js';
import { describeHandOffContract } from '#testing/hand-off-contract.js';

const send = vi.hoisted(() => vi.fn());
vi.mock('#hooks/active-chat-provider.js', () => ({ useChatComposer: () => ({ draftActorRef: { send } }) }));

/* Home's composer (P4's first surface): the rich composer's chunk is the held adopter. */
let mounts = 0;
let adopted: EarlyChatInput | undefined;

function RichComposer({ input }: { readonly input: EarlyChatInput }): React.JSX.Element {
  useLayoutEffect(() => {
    mounts++;
    adopted = input;
  }, [input]);
  return <div>Rich composer</div>;
}

describeHandOffContract('Home composer', {
  content: (adopterLoaded) => (
    <ChatEarlyInput isHostReady={adopterLoaded}>
      {(input) => (adopterLoaded ? <RichComposer input={input} /> : null)}
    </ChatEarlyInput>
  ),
  mounts: () => mounts,
  adopted: () => adopted,
  queuesSubmit: false,
  reset: () => {
    mounts = 0;
    adopted = undefined;
    send.mockClear();
  },
});
