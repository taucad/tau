import { beforeEach, describe, expect, it, vi } from 'vitest';
import type React from 'react';
import { render, screen } from '@testing-library/react';
import { ChatCreditsNotice } from '#components/chat/chat-credits-notice.js';

type NoticeState = {
  identity: 'verified' | 'signed-out';
  standing: { isEmpty: boolean } | undefined;
  kind: 'tau' | 'acp';
};
const state = vi.hoisted((): NoticeState => ({ identity: 'verified', standing: { isEmpty: true }, kind: 'tau' }));

vi.mock('#hooks/use-identity.js', () => ({ useIdentity: () => ({ state: state.identity }) }));
vi.mock('#hooks/use-credit-standing.js', () => ({ useCreditStanding: () => state.standing }));
vi.mock('#hooks/active-chat-provider.js', () => ({
  useChatComposer: () => ({ execution: { execution: { kind: state.kind } } }),
}));
/* The Cloud chunk is loaded: its Add credits action renders as a plain button carrying its variant. */
type CloudModule = { AddCreditsAction: (props: { readonly variant?: string }) => React.JSX.Element };
vi.mock('#cloud/cloud-surface.js', () => ({
  FundedSurface: (props: { readonly render: (cloud: CloudModule) => React.ReactNode }): React.JSX.Element => (
    <>
      {props.render({
        AddCreditsAction: ({ variant }) => (
          <button type='button' data-variant={variant}>
            Add credits
          </button>
        ),
      })}
    </>
  ),
}));

describe('ChatCreditsNotice', () => {
  beforeEach(() => {
    state.identity = 'verified';
    state.standing = { isEmpty: true };
    state.kind = 'tau';
  });

  it('should say a signed-in account has no credits yet, with Add credits', () => {
    render(<ChatCreditsNotice />);

    expect(screen.getByRole('status')).toHaveTextContent('You don’t have any credits yet.');
    expect(screen.getByRole('button', { name: 'Add credits' })).toHaveAttribute('data-variant', 'outline');
  });

  it.each([
    [
      'a balance to spend',
      () => {
        state.standing = { isEmpty: false };
      },
    ],
    [
      'an unknown balance',
      () => {
        state.standing = undefined;
      },
    ],
    [
      'a signed-out visitor',
      () => {
        state.identity = 'signed-out';
      },
    ],
    /* People can start free with their own agents, which need no credits. */
    [
      'an external agent',
      () => {
        state.kind = 'acp';
      },
    ],
  ])('should stay silent for %s', (_case, arrange) => {
    arrange();
    const { container } = render(<ChatCreditsNotice />);

    expect(container).toBeEmptyDOMElement();
  });

  it('should leave the chat to a visible card that already says it', () => {
    const { container } = render(<ChatCreditsNotice isCovered />);

    expect(container).toBeEmptyDOMElement();
  });
});
