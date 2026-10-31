import { act, within } from '@testing-library/react';
import { hydrateRoot } from 'react-dom/client';
import { renderToString } from 'react-dom/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ChatEarlyInput } from '#components/chat/chat-early-input.js';
import type { EarlyChatInput } from '#components/chat/chat-early-input.js';

const send = vi.hoisted(() => vi.fn());
const draftActorRef = { send };
vi.mock('#hooks/active-chat-provider.js', () => ({ useChatComposer: () => ({ draftActorRef }) }));

describe("the composer's early input", () => {
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
      <ChatEarlyInput
        isHostReady
        placeholder='Ask Tau'
        onAdopt={(input) => {
          snapshot = input;
        }}
      >
        <div>Rich editor</div>
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

  it('should serve only the editor area, with none of the composer box around it', () => {
    const container = document.createElement('div');
    container.innerHTML = renderToString(
      <ChatEarlyInput isHostReady={false} placeholder='Ask Tau' onAdopt={vi.fn()}>
        <div>Rich editor</div>
      </ChatEarlyInput>,
    );
    const input = within(container).getByRole<HTMLTextAreaElement>('textbox', { name: 'Ask Tau' });
    // The composer's frame, border and bar belong to the composer itself, which renders around this input.
    expect(container.firstElementChild).toBe(input);
    expect(input).not.toHaveClass('border', 'rounded-2xl', 'shadow-md');
    expect(input).toHaveAttribute('placeholder', 'Ask Tau');
  });

  it('should keep accepting text until the editor exists, then hand it over', async () => {
    const onAdopt = vi.fn();
    const slot = (isHostReady: boolean): React.JSX.Element => (
      <ChatEarlyInput isHostReady={isHostReady} placeholder='Ask Tau' onAdopt={onAdopt}>
        <div>Rich editor</div>
      </ChatEarlyInput>
    );
    const container = document.createElement('div');
    container.innerHTML = renderToString(slot(false));
    document.body.append(container);
    const input = within(container).getByRole<HTMLTextAreaElement>('textbox');
    Object.assign(input, { tauEarlyDraft: { edited: true, composing: false } });
    input.value = 'A bracket';
    const root = hydrateRoot(container, slot(false));
    try {
      await act(async () => {
        await Promise.resolve();
      });
      expect(within(container).getByRole('textbox')).toBe(input);
      expect(onAdopt).not.toHaveBeenCalled();
      expect(send).not.toHaveBeenCalled();
      await act(async () => {
        root.render(slot(true));
      });
      expect(within(container).getByText('Rich editor')).toBeInTheDocument();
      expect(within(container).queryByRole('textbox')).not.toBeInTheDocument();
      expect(onAdopt).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({ text: 'A bracket', edited: true }));
      expect(send).toHaveBeenCalledExactlyOnceWith({ type: 'setDraftText', text: 'A bracket', adoptedEdit: true });
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
      <ChatEarlyInput
        isHostReady
        placeholder='Ask Tau'
        onAdopt={(input) => {
          snapshot = input;
        }}
      >
        <div>Rich editor</div>
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
