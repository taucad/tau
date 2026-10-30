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
  it('should keep accepting text while its host is not ready, and adopt once it is', async () => {
    let snapshot: EarlyChatInput | undefined;
    const content = (ready: boolean): React.JSX.Element => (
      <ChatEarlyInput isHostReady={ready}>
        {(input) => {
          snapshot = input;
          return <div>Rich editor</div>;
        }}
      </ChatEarlyInput>
    );
    const container = document.createElement('div');
    container.innerHTML = renderToString(content(false));
    document.body.append(container);
    const input = within(container).getByRole<HTMLTextAreaElement>('textbox');
    Object.assign(input, { tauEarlyDraft: { edited: false, composing: false } });
    const root = hydrateRoot(container, content(false));
    try {
      await act(async () => {
        await Promise.resolve();
      });
      /* The point of the gate: the native input is still the thing in the document, so a keystroke
       * in this window is accepted and held rather than landing on a pending boundary. */
      expect(within(container).getByRole('textbox')).toBe(input);
      expect(snapshot).toBeUndefined();
      expect(send).not.toHaveBeenCalled();
      await act(async () => {
        input.value = 'Typed before the composer arrived';
        Object.assign(input, { tauEarlyDraft: { edited: true, composing: false } });
        input.dispatchEvent(new InputEvent('input', { bubbles: true }));
      });
      expect(input.value).toBe('Typed before the composer arrived');
      expect(send).not.toHaveBeenCalled();
      await act(async () => {
        root.render(content(true));
      });
      await within(container).findByText('Rich editor');
      expect(snapshot?.text).toBe('Typed before the composer arrived');
      expect(send).toHaveBeenCalledExactlyOnceWith({
        type: 'setDraftText',
        text: 'Typed before the composer arrived',
        adoptedEdit: true,
      });
    } finally {
      await act(async () => {
        root.unmount();
      });
      container.remove();
    }
  });
});
