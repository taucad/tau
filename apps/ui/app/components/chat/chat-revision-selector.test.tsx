// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ChatComposerContextValue } from '#hooks/active-chat-provider.js';
import { withChatRevisionMode } from '#utils/chat-revision-mode.js';

const setActiveExecution = vi.fn();
let activeExecution: ChatComposerContextValue['execution']['execution'] = { kind: 'tau', model: 'gpt-test' };

vi.mock('#hooks/active-chat-provider.js', () => ({
  useChatComposer: (): ChatComposerContextValue =>
    ({ execution: { execution: activeExecution, setActiveExecution } }) as unknown as ChatComposerContextValue,
}));
vi.mock('@taucad/ui/hooks/use-mobile', () => ({ useIsMobile: () => false }));

const { ChatRevisionSelector } = await import('#components/chat/chat-revision-selector.js');

const openSelector = async (): Promise<ReturnType<typeof userEvent.setup>> => {
  const user = userEvent.setup();
  render(<ChatRevisionSelector>{({ label }) => <button type='button'>Work in: {label}</button>}</ChatRevisionSelector>);
  await user.click(screen.getByRole('button', { name: 'Work in: Locally' }));
  return user;
};

describe('ChatRevisionSelector', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    activeExecution = { kind: 'tau', model: 'gpt-test' };
    globalThis.HTMLElement.prototype.scrollIntoView = vi.fn();
  });

  it('offers both revision modes under the Work in heading and defaults to Locally', async () => {
    await openSelector();

    expect(await screen.findByText('Work in')).toBeInTheDocument();
    expect(screen.getByText('Locally')).toBeInTheDocument();
    expect(screen.getByText('New branch')).toBeInTheDocument();
  });

  it('persists the branch mode on the active Tau execution', async () => {
    const user = await openSelector();

    await user.click(await screen.findByText('New branch'));

    expect(setActiveExecution).toHaveBeenCalledWith({ kind: 'tau', model: 'gpt-test', revision: 'branch' });
  });

  it('returns a branch selection to the live tree without leaving a mode behind', async () => {
    activeExecution = withChatRevisionMode({ kind: 'tau', model: 'gpt-test' }, 'branch');
    const user = userEvent.setup();
    render(
      <ChatRevisionSelector>{({ label }) => <button type='button'>Work in: {label}</button>}</ChatRevisionSelector>,
    );

    await user.click(screen.getByRole('button', { name: 'Work in: New branch' }));
    await user.click(await screen.findByText('Locally'));

    expect(setActiveExecution).toHaveBeenCalledWith({ kind: 'tau', model: 'gpt-test' });
  });
});
