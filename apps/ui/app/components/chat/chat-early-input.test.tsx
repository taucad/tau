import { act, within } from '@testing-library/react';
import { hydrateRoot } from 'react-dom/client';
import { renderToString } from 'react-dom/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ChatEarlyInput } from '#components/chat/chat-early-input.js';
import type { EarlyChatInput, EarlyChatInputBarState } from '#components/chat/chat-early-input.js';
import type { HandOffElement } from '#components/hand-off/hand-off.js';
import { hasUsedPageSince } from '#components/onboarding/home-interaction.js';
import { draftHintStorageKey, writeDraftHint } from '#lib/frame-hint-draft.js';
import {
  chatComposerEditorTextClassName,
  chatComposerFrameClassName,
  chatComposerPlaceholder,
} from '@taucad/chat-ui/components/chat-input-styles';

/** Run the served inline script the way the browser does: in place, where it was served. */
const runEarlyScript = (container: HTMLElement): void => {
  const served = container.querySelector('script')!;
  const script = document.createElement('script');
  script.textContent = served.textContent;
  served.replaceWith(script);
};

const send = vi.hoisted(() => vi.fn());
/* The draft the record holds; empty unless a row loads one. */
let recordDraftText = '';
let recordDraftAttachments: readonly unknown[] = [];
/* The draft owner's surface the early input reads: its sends, and the draft to select from. */
const draftActorRef = {
  send,
  getSnapshot: () => ({ context: { draftText: recordDraftText, draftAttachments: recordDraftAttachments } }),
  subscribe: () => ({ unsubscribe: () => undefined }),
};
vi.mock('#hooks/active-chat-provider.js', () => ({ useChatComposer: () => ({ draftActorRef }) }));

describe('Home early input', () => {
  beforeEach(() => {
    send.mockClear();
    recordDraftText = '';
    recordDraftAttachments = [];
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
    Object.assign(input, { tauHandOff: { edited, composing: false, submitQueued: false, acceptedAt: undefined } });
    input.setSelectionRange(1, text.length, 'backward');
    if (focused) {
      input.focus();
    }
    const onRecoverableError = vi.fn();
    const hydratedAt = performance.now();
    const root = hydrateRoot(container, content, { onRecoverableError });
    try {
      await within(container).findByText('Rich editor');
      /* Keys typed before the bundle reached no listener; the adopted edit is what tells home it was used. */
      expect(hasUsedPageSince(hydratedAt)).toBe(edited);
      expect(snapshot).toEqual({
        text,
        edited,
        focused,
        focusUnclaimed: !focused,
        start: Math.min(1, text.length),
        end: text.length,
        direction: 'backward',
        scrollTop: 0,
        submitQueued: false,
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
    const state = { edited: true, composing: true, submitQueued: false, acceptedAt: undefined };
    Object.assign(input, { tauHandOff: state });
    input.value = 'に';
    /* A composition is open only in the input that holds focus. */
    input.focus();
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
    Object.assign(input, {
      tauHandOff: { edited: false, composing: false, submitQueued: false, acceptedAt: undefined },
    });
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
        Object.assign(input, {
          tauHandOff: { edited: true, composing: false, submitQueued: false, acceptedAt: undefined },
        });
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
      const input = within(container).getByRole<HandOffElement>('textbox');
      expect(input.tauHandOff).toEqual({ edited: false, composing: false, submitQueued: false, acceptedAt: undefined });
      input.dispatchEvent(new InputEvent('input', { bubbles: true }));
      expect(input.tauHandOff?.edited).toBe(true);
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

/* A15d, C10 (loading states UX blueprint, § Input during loading): Enter before adoption queues one send, which an edit
 * or Escape cancels, and a stored draft is the served input's value from its first frame. */
describe('Home early input: queued send and stored draft (C10)', () => {
  beforeEach(() => {
    send.mockClear();
    localStorage.clear();
  });

  /** Serve the composer, run its script where it was served, and return the input and its box. */
  const serve = (content: React.JSX.Element): { container: HTMLElement; input: HandOffElement } => {
    const container = document.createElement('div');
    container.innerHTML = renderToString(content);
    document.body.append(container);
    runEarlyScript(container);
    return { container, input: within(container).getByRole('textbox') };
  };

  const press = (input: HTMLElement, init: KeyboardEventInit): KeyboardEvent => {
    const event = new KeyboardEvent('keydown', { bubbles: true, cancelable: true, ...init });
    input.dispatchEvent(event);
    return event;
  };

  const type = (input: HTMLTextAreaElement, value: string): void => {
    input.value = value;
    input.dispatchEvent(new InputEvent('input', { bubbles: true }));
  };

  const adopting = (): { content: React.JSX.Element; adopted: () => EarlyChatInput | undefined } => {
    let snapshot: EarlyChatInput | undefined;
    return {
      content: (
        <ChatEarlyInput>
          {(input) => {
            snapshot = input;
            return <div>Rich editor</div>;
          }}
        </ChatEarlyInput>
      ),
      adopted: () => snapshot,
    };
  };

  const hydrateAndAdopt = async (container: HTMLElement, content: React.JSX.Element): Promise<() => Promise<void>> => {
    const root = hydrateRoot(container, content);
    await within(container).findByText('Rich editor');
    return async () => {
      await act(async () => {
        root.unmount();
      });
      container.remove();
    };
  };

  it('should queue one send on Enter before adoption, without breaking the line, and hand it over', async () => {
    const { content, adopted } = adopting();
    const { container, input } = serve(content);
    type(input, 'Make a bracket.');
    const enter = press(input, { key: 'Enter' });
    expect(enter.defaultPrevented).toBe(true);
    expect(input.value).toBe('Make a bracket.');
    /* The box is marked at once, so the send button shows its pending state before any bundle runs. */
    expect(container.querySelector('[data-queued-send]')).not.toBeNull();
    const done = await hydrateAndAdopt(container, content);
    try {
      expect(adopted()).toMatchObject({ text: 'Make a bracket.', edited: true, submitQueued: true });
      expect(send.mock.calls).toEqual([[{ type: 'setDraftText', text: 'Make a bracket.', adoptedEdit: true }]]);
    } finally {
      await done();
    }
  });

  it.each([
    {
      cancel: 'an edit',
      act: (input: HTMLTextAreaElement): void => {
        type(input, 'Make a bracket. Twice');
      },
    },
    {
      cancel: 'Escape',
      act: (input: HTMLTextAreaElement): void => {
        press(input, { key: 'Escape' });
      },
    },
  ])('should cancel a queued send on $cancel and keep the text', async ({ act: cancel }) => {
    const { content, adopted } = adopting();
    const { container, input } = serve(content);
    type(input, 'Make a bracket.');
    press(input, { key: 'Enter' });
    cancel(input);
    expect(container.querySelector('[data-queued-send]')).toBeNull();
    const done = await hydrateAndAdopt(container, content);
    try {
      expect(adopted()?.submitQueued).toBe(false);
      expect(adopted()?.text.startsWith('Make a bracket.')).toBe(true);
    } finally {
      await done();
    }
  });

  it.each([
    { name: 'Shift+Enter', init: { key: 'Enter', shiftKey: true }, value: 'A line' },
    { name: 'Enter in an empty input', init: { key: 'Enter' }, value: '' },
    { name: 'Enter that ends a composition', init: { key: 'Enter', isComposing: true }, value: 'に' },
    /* Safari commits a conversion with an Enter after compositionend, marked only by keyCode 229 (review round 3). */
    { name: "Safari's Enter that commits a conversion", init: { key: 'Enter', keyCode: 229 }, value: '日本' },
  ])('should queue no send for $name', ({ init, value }) => {
    const { content } = adopting();
    const { container, input } = serve(content);
    try {
      type(input, value);
      const event = press(input, init);
      expect(container.querySelector('[data-queued-send]')).toBeNull();
      expect(input.tauHandOff?.submitQueued).toBe(false);
      /* Shift+Enter and a composition's Enter are the input's own; only an empty input's plain Enter is swallowed. */
      expect(event.defaultPrevented).toBe(value === '');
    } finally {
      container.remove();
    }
  });

  /* Q15: a touch keyboard's return breaks the line, as in the rich composer; only Send sends (review round 3). */
  it("should leave a touch keyboard's return to break the line", () => {
    /* The served script runs in the document's realm, which has its own window: set its matchMedia there. */
    const inRealm = (source: string): void => {
      const script = document.createElement('script');
      script.textContent = source;
      document.body.append(script);
      script.remove();
    };
    inRealm("window.__tauMatchMedia=window.matchMedia;window.matchMedia=(q)=>({matches:q==='(pointer: coarse)'})");
    const { content } = adopting();
    const { container, input } = serve(content);
    try {
      type(input, 'Make a bracket');
      const event = press(input, { key: 'Enter' });
      expect(event.defaultPrevented).toBe(false);
      expect(container.querySelector('[data-queued-send]')).toBeNull();
      expect(input.tauHandOff?.submitQueued).toBe(false);
    } finally {
      inRealm('window.matchMedia=window.__tauMatchMedia;delete window.__tauMatchMedia');
      container.remove();
    }
  });

  it("should paint Home's stored draft as the input's first value and hydrate the draft with it", async () => {
    writeDraftHint({ kind: 'home' }, { text: 'A bracket for the shelf' });
    const { content, adopted } = adopting();
    const { container, input } = serve(content);
    expect(input.value).toBe('A bracket for the shelf');
    const done = await hydrateAndAdopt(container, content);
    try {
      expect(adopted()).toMatchObject({ text: 'A bracket for the shelf', edited: false, prefilled: true });
      expect(send.mock.calls).toHaveLength(1);
      expect(send.mock.calls[0]?.[0]).toMatchObject({
        type: 'hydrateDraft',
        draft: { parts: [{ type: 'text', text: 'A bracket for the shelf' }] },
      });
    } finally {
      await done();
    }
  });

  /* The record wins where the two differ (review round 1, defect 7). */
  it.each([
    { name: 'the same draft', record: 'A bracket for the shelf', cancelled: undefined },
    /* Ruling 2026-11-17T03:43Z: the Enter stays visibly queued until the composer cancels it and says why. */
    { name: 'another draft', record: 'A hinge for the door', cancelled: { recordText: 'A hinge for the door' } },
    /* The hint holds text only: a draft that also holds an attachment is not what the box showed (review round 20). */
    {
      name: 'the same text with an attachment',
      record: 'A bracket for the shelf',
      attachments: [{ id: 'photo' }],
      cancelled: { recordText: 'A bracket for the shelf' },
    },
  ])(
    'should not hydrate a draft the record already holds, $name, and send Enter only on it',
    async ({ record, attachments = [], cancelled }) => {
      writeDraftHint({ kind: 'home' }, { text: 'A bracket for the shelf' });
      recordDraftText = record;
      recordDraftAttachments = attachments;
      const { content, adopted } = adopting();
      const { container, input } = serve(content);
      press(input, { key: 'Enter' });
      const done = await hydrateAndAdopt(container, content);
      try {
        expect(adopted()).toMatchObject({ prefilled: true, edited: false, submitQueued: true });
        expect(adopted()?.paintedSendCancelled).toEqual(cancelled);
        expect(send).not.toHaveBeenCalled();
      } finally {
        await done();
      }
    },
  );

  /* Review round 5: Send is drawn for the text the input holds from the first frame, painted or typed. */
  it('should mark the box as holding text from the paint, and follow edits', () => {
    writeDraftHint({ kind: 'home' }, { text: 'A bracket for the shelf' });
    const { content } = adopting();
    const { container, input } = serve(content);
    try {
      const box = input.closest('[data-early-text]');
      expect(box).not.toBeNull();
      type(input, '  ');
      expect(container.querySelector('[data-early-text]')).toBeNull();
      type(input, 'A hinge');
      expect(container.querySelector('[data-early-text]')).not.toBeNull();
    } finally {
      container.remove();
    }
  });

  it('should keep an early edit over the stored draft', async () => {
    writeDraftHint({ kind: 'home' }, { text: 'A bracket for the shelf' });
    const { content, adopted } = adopting();
    const { container, input } = serve(content);
    type(input, 'A hinge');
    const done = await hydrateAndAdopt(container, content);
    try {
      expect(adopted()).toMatchObject({ text: 'A hinge', edited: true });
      expect(adopted()?.prefilled).toBeUndefined();
      expect(send.mock.calls).toEqual([[{ type: 'setDraftText', text: 'A hinge', adoptedEdit: true }]]);
    } finally {
      await done();
    }
  });

  it.each([
    { url: '/w/acme/bracket', painted: 'Fillet the edges' },
    { url: '/w/acme/bracket?chat=chat-1', painted: 'Fillet the edges' },
    { url: '/w/acme/bracket?chat=chat-2', painted: '' },
    { url: '/w/acme/hinge', painted: '' },
  ])("should paint a project's stored draft on $url only for its own chat", ({ url, painted }) => {
    writeDraftHint({ kind: 'project', key: 'acme/bracket' }, { text: 'Fillet the edges', chatId: 'chat-1' });
    const previous = `${location.pathname}${location.search}`;
    history.replaceState(null, '', url);
    const { content } = adopting();
    const { container, input } = serve(content);
    try {
      expect(input.value).toBe(painted);
    } finally {
      container.remove();
      history.replaceState(null, '', previous);
    }
  });

  it('should paint no draft from a malformed or unreadable record', () => {
    localStorage.setItem(draftHintStorageKey, '{"v":1,"home":{"text":7}}');
    const { content } = adopting();
    const { container, input } = serve(content);
    try {
      expect(input.value).toBe('');
    } finally {
      container.remove();
    }
  });
});
