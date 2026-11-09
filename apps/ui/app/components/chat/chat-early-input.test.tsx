import { act, within } from '@testing-library/react';
import { hydrateRoot } from 'react-dom/client';
import { renderToString } from 'react-dom/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ChatEarlyInput } from '#components/chat/chat-early-input.js';
import type { EarlyChatInput, EarlyChatInputBarState } from '#components/chat/chat-early-input.js';
import {
  chatComposerEditorTextClassName,
  chatComposerFrameClassName,
  chatComposerPlaceholder,
} from '#components/chat/chat-input-styles.js';

/** Run the served inline script the way the browser does: in place, where it was served. */
const runEarlyScript = (container: HTMLElement): void => {
  const served = container.querySelector('script')!;
  const script = document.createElement('script');
  script.textContent = served.textContent;
  served.replaceWith(script);
};

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

  /* R2: the native input sits in the rich composer's own box — frame, text inset and placeholder — over its bar. */
  it('should serve the input inside the composer frame, over the bar it is given', () => {
    const bars: EarlyChatInputBarState[] = [];
    const container = document.createElement('div');
    container.innerHTML = renderToString(
      <ChatEarlyInput
        bar={(state) => {
          bars.push(state);
          return <div data-testid='bar'>Bar</div>;
        }}
      >
        {() => null}
      </ChatEarlyInput>,
    );
    const input = within(container).getByRole<HTMLTextAreaElement>('textbox');
    const frame = input.parentElement!.parentElement!;
    expect(frame).toHaveClass(...chatComposerFrameClassName.split(' '), 'rounded-2xl');
    expect(input).toHaveClass(...chatComposerEditorTextClassName.split(' '));
    expect(input).toHaveAttribute('placeholder', chatComposerPlaceholder);
    expect(frame.lastElementChild).toHaveAttribute('data-testid', 'bar');
    expect(bars).toEqual([{ isEmpty: true }]);
  });

  it('should reserve the bar when it is given none', () => {
    const container = document.createElement('div');
    container.innerHTML = renderToString(<ChatEarlyInput>{() => null}</ChatEarlyInput>);
    const frame = within(container).getByRole('textbox').parentElement!.parentElement!;
    expect(frame.lastElementChild).toHaveClass('h-7');
  });

  /* R11: the served input carries `autofocus`, so the browser focuses it at its first rendering update. */
  it.each([true, false])('should serve autofocus only when enableAutoFocus=%s', (enableAutoFocus) => {
    const container = document.createElement('div');
    container.innerHTML = renderToString(
      <ChatEarlyInput enableAutoFocus={enableAutoFocus}>{() => null}</ChatEarlyInput>,
    );
    expect(within(container).getByRole('textbox').hasAttribute('autofocus')).toBe(enableAutoFocus);
  });

  it('should leave focus where the person put it before hydration', async () => {
    const content = (
      <ChatEarlyInput enableAutoFocus isHostReady={false}>
        {() => null}
      </ChatEarlyInput>
    );
    const other = document.createElement('button');
    document.body.append(other);
    const container = document.createElement('div');
    container.innerHTML = renderToString(content);
    document.body.append(container);
    other.focus();
    const root = hydrateRoot(container, content);
    try {
      await act(async () => {
        await Promise.resolve();
      });
      expect(other).toHaveFocus();
    } finally {
      await act(async () => {
        root.unmount();
      });
      container.remove();
      other.remove();
    }
  });

  /* Gate finding 1 (#1562): a browser may paint the half-parsed document when the parser reaches a script, so
   * the script comes after the whole box and its bar — a cut there never shows the box without its bar. */
  it('should serve its script after the bar, and record edits from there', () => {
    const container = document.createElement('div');
    container.innerHTML = renderToString(
      <ChatEarlyInput bar={() => <div data-testid='bar' />}>{() => null}</ChatEarlyInput>,
    );
    document.body.append(container);
    try {
      const script = container.querySelector('script')!;
      const bar = container.querySelector('[data-testid="bar"]')!;
      /* The script is the composer's last element, so the bar precedes it in document order. */
      expect(script.parentElement?.lastElementChild).toBe(script);
      expect(script.parentElement).toContainElement(bar as HTMLElement);
      runEarlyScript(container);
      const input = within(container).getByRole<HTMLTextAreaElement & { tauEarlyDraft?: { edited: boolean } }>(
        'textbox',
      );
      expect(input.tauEarlyDraft).toEqual({ edited: false, composing: false });
      input.dispatchEvent(new InputEvent('input', { bubbles: true }));
      expect(input.tauEarlyDraft?.edited).toBe(true);
    } finally {
      container.remove();
    }
  });

  it('should tell the bar when the input holds text, including text typed before hydration', async () => {
    const bars: EarlyChatInputBarState[] = [];
    const content = (
      <ChatEarlyInput
        isHostReady={false}
        bar={(state) => {
          bars.push(state);
          return null;
        }}
      >
        {() => null}
      </ChatEarlyInput>
    );
    const container = document.createElement('div');
    container.innerHTML = renderToString(content);
    document.body.append(container);
    const input = within(container).getByRole<HTMLTextAreaElement>('textbox');
    input.value = 'A hinge';
    const root = hydrateRoot(container, content);
    try {
      await act(async () => {
        await Promise.resolve();
      });
      expect(bars.at(-1)).toEqual({ isEmpty: false });
    } finally {
      await act(async () => {
        root.unmount();
      });
      container.remove();
    }
  });
});
