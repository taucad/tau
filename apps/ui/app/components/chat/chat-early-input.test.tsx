import { act, within } from '@testing-library/react';
import { hydrateRoot } from 'react-dom/client';
import { renderToString } from 'react-dom/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ChatEarlyInput } from '#components/chat/chat-early-input.js';
import type { EarlyChatInput } from '#components/chat/chat-early-input.js';

const send = vi.hoisted(() => vi.fn());
const draftActorRef = { send };
vi.mock('#hooks/active-chat-provider.js', () => ({ useChatComposer: () => ({ draftActorRef }) }));

describe('Home early input', () => {
  beforeEach(() => {
    send.mockClear();
  });

  it.each([
    { text: 'Build 🛠\na < b @part', edited: true, focused: true },
    { text: '', edited: true, focused: true },
    { text: '', edited: false, focused: false },
    { text: 'Keep this', edited: true, focused: false },
  ])('should adopt $text with edited=$edited and focused=$focused', async ({ text, edited, focused }) => {
    let snapshot: EarlyChatInput | undefined;
    const content = (
      <ChatEarlyInput>
        {(input) => {
          snapshot = input;
          return <div>Rich editor</div>;
        }}
      </ChatEarlyInput>
    );
    const container = document.createElement('div');
    container.innerHTML = renderToString(content);
    document.body.append(container);
    const input = within(container).getByRole<HTMLTextAreaElement>('textbox');
    input.value = text;
    Object.assign(input, { tauEarlyDraft: { edited, composing: false } });
    input.setSelectionRange(1, text.length, 'backward');
    if (focused) {
      input.focus();
    }
    const onRecoverableError = vi.fn();
    const root = hydrateRoot(container, content, { onRecoverableError });
    try {
      await within(container).findByText('Rich editor');
      expect(snapshot).toEqual({
        text,
        edited,
        focused,
        focusUnclaimed: !focused,
        start: Math.min(1, text.length),
        end: text.length,
        direction: 'backward',
      });
      expect(send.mock.calls).toEqual(edited ? [[{ type: 'setDraftText', text, adoptedEdit: true }]] : []);
      expect(onRecoverableError).not.toHaveBeenCalled();
    } finally {
      await act(async () => {
        root.unmount();
      });
      container.remove();
    }
  });

  it('should retain an active native composition until its final input arrives', async () => {
    let snapshot: EarlyChatInput | undefined;
    const content = (
      <ChatEarlyInput>
        {(input) => {
          snapshot = input;
          return <div>Rich editor</div>;
        }}
      </ChatEarlyInput>
    );
    const container = document.createElement('div');
    container.innerHTML = renderToString(content);
    document.body.append(container);
    const input = within(container).getByRole<HTMLTextAreaElement>('textbox');
    const state = { edited: true, composing: true };
    Object.assign(input, { tauEarlyDraft: state });
    input.value = 'に';
    const root = hydrateRoot(container, content);
    try {
      await act(async () => {
        await Promise.resolve();
      });
      expect(within(container).getByRole('textbox')).toBe(input);
      expect(send).not.toHaveBeenCalled();
      await act(async () => {
        state.composing = false;
        input.dispatchEvent(new CompositionEvent('compositionend', { bubbles: true }));
        input.value = '日本';
        input.dispatchEvent(new InputEvent('input', { bubbles: true }));
      });
      expect(snapshot?.text).toBe('日本');
      expect(send).toHaveBeenCalledExactlyOnceWith({ type: 'setDraftText', text: '日本', adoptedEdit: true });
    } finally {
      await act(async () => {
        root.unmount();
      });
      container.remove();
    }
  });
});
