import { act, within } from '@testing-library/react';
import { hydrateRoot } from 'react-dom/client';
import { renderToString } from 'react-dom/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { HomeChatComposer } from '#routes/_index/home-chat-composer.js';
import type { EarlyChatInput } from '#components/chat/chat-early-input.js';

const send = vi.hoisted(() => vi.fn());
const draftActorRef = { send };
vi.mock('#hooks/active-chat-provider.js', () => ({ useChatComposer: () => ({ draftActorRef }) }));

const composerModule = vi.hoisted(() => ({
  resolve: undefined as undefined | (() => void),
  adopted: [] as EarlyChatInput[],
}));
vi.mock('#components/chat/new-project-chat-composer.js', async () => {
  // The import the component under test awaits; held open so the pre-composer window is observable.
  await new Promise<void>((resolve) => {
    composerModule.resolve = resolve;
  });
  return {
    NewProjectChatComposer: ({ adoptedEarlyInput }: { readonly adoptedEarlyInput: EarlyChatInput }) => {
      composerModule.adopted.push(adoptedEarlyInput);
      return <div>Rich composer</div>;
    },
  };
});

describe('Home chat composer', () => {
  beforeEach(() => {
    send.mockClear();
    composerModule.adopted.length = 0;
  });

  it('should serve a native input, hold text typed before the composer arrives and hand it over', async () => {
    const content = <HomeChatComposer />;
    const container = document.createElement('div');
    container.innerHTML = renderToString(content);
    /* The contract's first action is an input that accepts and retains text, so it has to be in the
     * served markup rather than in a chunk the browser has yet to fetch. */
    expect(container.querySelector('textarea[aria-label="Chat message"]')).not.toBeNull();
    expect(container.textContent).not.toContain('Rich composer');
    document.body.append(container);
    const input = within(container).getByRole<HTMLTextAreaElement>('textbox');
    Object.assign(input, { tauEarlyDraft: { edited: false, composing: false } });
    const onRecoverableError = vi.fn();
    const root = hydrateRoot(container, content, { onRecoverableError });
    try {
      await act(async () => {
        await Promise.resolve();
      });
      await act(async () => {
        input.value = 'A bracket for a 3 mm shaft';
        Object.assign(input, { tauEarlyDraft: { edited: true, composing: false } });
        input.dispatchEvent(new InputEvent('input', { bubbles: true }));
      });
      expect(within(container).getByRole('textbox')).toBe(input);
      expect(input.value).toBe('A bracket for a 3 mm shaft');

      await act(async () => {
        composerModule.resolve?.();
        await Promise.resolve();
      });
      await within(container).findByText('Rich composer');
      expect(composerModule.adopted.map((input_) => input_.text)).toEqual(['A bracket for a 3 mm shaft']);
      expect(send).toHaveBeenCalledExactlyOnceWith({
        type: 'setDraftText',
        text: 'A bracket for a 3 mm shaft',
        adoptedEdit: true,
      });
      expect(onRecoverableError).not.toHaveBeenCalled();
    } finally {
      await act(async () => {
        root.unmount();
      });
      container.remove();
    }
  });
});
