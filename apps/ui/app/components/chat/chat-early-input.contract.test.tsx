import { useLayoutEffect } from 'react';
import { vi } from 'vitest';
import { ChatEarlyInput } from '#components/chat/chat-early-input.js';
import type { EarlyChatInput } from '#components/chat/chat-early-input.js';
import { describeHandOffContract } from '#testing/hand-off-contract.js';

const send = vi.hoisted(() => vi.fn());
/* A15d (H-e): Home's adopter reads the draft it hydrates a painted draft into; here an empty one. */
const draftActorRef = {
  send,
  getSnapshot: () => ({ context: { draftText: '', draftAttachments: [] } }),
  subscribe: () => ({ unsubscribe: () => undefined }),
};
vi.mock('#hooks/active-chat-provider.js', () => ({ useChatComposer: () => ({ draftActorRef }) }));

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
  /* A15d (H-f): Enter before adoption is one queued send on Home too. */
  queuesSubmit: true,
  reset: () => {
    mounts = 0;
    adopted = undefined;
    send.mockClear();
  },
});
