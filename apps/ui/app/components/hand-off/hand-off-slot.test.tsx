import { act, render, renderHook, within } from '@testing-library/react';
import { hydrateRoot } from 'react-dom/client';
import { renderToString } from 'react-dom/server';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { HandOffSlot } from '#components/hand-off/hand-off-slot.js';
import { handOffStore, resetHandOffStoreForTest, useHandOffAdoption } from '#components/hand-off/hand-off-store.js';
import type { HandOffTarget } from '#components/hand-off/hand-off-store.js';
import type * as HandOff from '#components/hand-off/hand-off.js';
import type { HandOffElement } from '#components/hand-off/hand-off.js';

const recordInputAccepted = vi.hoisted(() => vi.fn());
vi.mock('#components/hand-off/hand-off.js', async (importOriginal) => ({
  ...(await importOriginal<typeof HandOff>()),
  recordInputAccepted,
}));

/** The project the slots belong to. */
const target: HandOffTarget = { surface: 'project-composer', scope: 'home/one' };

/** Two different parents, so swapping them remounts the slot, as any placeholder that remounts before its adopter does. */
function Stage({
  phase,
  scope = target.scope,
  placeholder = 'Ask Tau',
}: {
  readonly phase: 'first' | 'second' | 'both' | 'none';
  readonly scope?: string;
  readonly placeholder?: string;
}): React.JSX.Element {
  const slot = <HandOffSlot surface='project-composer' scope={scope} label='Chat message' placeholder={placeholder} />;
  return (
    <>
      <button type='button'>Elsewhere</button>
      {phase === 'first' || phase === 'both' ? <section aria-label='first'>{slot}</section> : null}
      {phase === 'second' || phase === 'both' ? <article aria-label='second'>{slot}</article> : null}
    </>
  );
}

/** Serve `content`, run its inline script as the parser would, and return the container. */
const serve = (content: React.ReactNode): HTMLElement => {
  const container = document.createElement('div');
  container.innerHTML = renderToString(content);
  document.body.append(container);
  for (const served of container.querySelectorAll('script')) {
    const script = document.createElement('script');
    script.textContent = served.textContent;
    served.replaceWith(script);
  }
  return container;
};

const typeInto = (input: HTMLTextAreaElement, text: string): void => {
  input.value += text;
  input.dispatchEvent(new InputEvent('input', { bubbles: true, data: text }));
};

describe('HandOffSlot', () => {
  beforeEach(() => {
    resetHandOffStoreForTest();
    recordInputAccepted.mockClear();
  });
  afterEach(() => {
    document.body.replaceChildren();
  });

  it('should serve a native input and its recorder, and hydrate over it without a disagreement', async () => {
    const container = serve(<Stage phase='first' />);
    const input = within(container).getByRole<HandOffElement>('textbox', { name: 'Chat message' });
    expect(input).toHaveAttribute('placeholder', 'Ask Tau');
    /* Typed before any bundle: only the served script saw it. */
    typeInto(input, 'Typed early');
    input.focus();
    input.setSelectionRange(2, 5, 'backward');
    const onRecoverableError = vi.fn();
    const consoleError = vi.spyOn(console, 'error');

    const root = hydrateRoot(container, <Stage phase='first' />, { onRecoverableError });
    await act(async () => {
      await Promise.resolve();
    });

    try {
      expect(within(container).getByRole('textbox')).toBe(input);
      expect(input.value).toBe('Typed early');
      expect(input).toHaveFocus();
      expect([input.selectionStart, input.selectionEnd, input.selectionDirection]).toEqual([2, 5, 'backward']);
      expect(input.tauHandOff?.edited).toBe(true);
      expect(onRecoverableError).not.toHaveBeenCalled();
      expect(consoleError).not.toHaveBeenCalled();
      expect(recordInputAccepted).toHaveBeenCalled();
    } finally {
      consoleError.mockRestore();
      await act(async () => {
        root.unmount();
      });
    }
  });

  /* P4 identity: one native input per load, however many placeholders it passes through before its adopter. */
  it('should carry the one input, its text, caret and focus across a remount', async () => {
    const container = serve(<Stage phase='first' />);
    const input = within(container).getByRole<HandOffElement>('textbox');
    const root = hydrateRoot(container, <Stage phase='first' />);
    await act(async () => {
      await Promise.resolve();
    });
    try {
      input.focus();
      typeInto(input, 'Make a hinge');
      input.setSelectionRange(5, 5);

      await act(async () => {
        root.render(<Stage phase='second' />);
      });

      const moved = within(within(container).getByRole('article')).getByRole('textbox');
      expect(moved).toBe(input);
      expect(container.querySelectorAll('textarea')).toHaveLength(1);
      expect(input.value).toBe('Make a hinge');
      expect(input).toHaveFocus();
      expect([input.selectionStart, input.selectionEnd]).toEqual([5, 5]);
    } finally {
      await act(async () => {
        root.unmount();
      });
    }
  });

  it('should keep the input in the newest placeholder, and fall back to the one still standing', () => {
    const { rerender, container } = render(<Stage phase='first' />);
    const input = within(container).getByRole('textbox');
    typeInto(input as HTMLTextAreaElement, 'kept');

    rerender(<Stage phase='both' />);
    expect(container.querySelectorAll('textarea')).toHaveLength(1);
    expect(within(within(container).getByRole('article')).getByRole('textbox')).toBe(input);

    rerender(<Stage phase='first' />);
    expect(within(container).getByRole('textbox')).toBe(input);
    expect((input as HTMLTextAreaElement).value).toBe('kept');
  });

  it('should create and record its input on a client mount, with no document behind it', () => {
    const { container } = render(<Stage phase='first' />);
    const input = within(container).getByRole<HandOffElement>('textbox');

    typeInto(input, 'a');

    expect(input.tauHandOff).toMatchObject({ edited: true });
  });

  /* Text typed for one project is never offered in another's placeholder after a client navigation. */
  it("should start a new input for another project's placeholder, and drop the unadopted one", () => {
    const { rerender, container } = render(<Stage phase='first' scope='home/one' />);
    const first = within(container).getByRole<HTMLTextAreaElement>('textbox');
    typeInto(first, 'For project one');

    rerender(<Stage phase='second' scope='home/two' />);

    const second = within(container).getByRole<HTMLTextAreaElement>('textbox');
    expect(second).not.toBe(first);
    expect(second.value).toBe('');
    expect(container.querySelectorAll('textarea')).toHaveLength(1);
  });

  it('should empty the input when the same placeholder turns to another project', () => {
    const { rerender, container } = render(<Stage phase='first' scope='home/one' />);
    const first = within(container).getByRole<HTMLTextAreaElement>('textbox');
    typeInto(first, 'For project one');

    rerender(<Stage phase='first' scope='home/two' />);

    const second = within(container).getByRole<HandOffElement>('textbox');
    expect(second.value).toBe('');
    typeInto(second, 'b');
    expect(second.tauHandOff).toMatchObject({ edited: true });
  });

  /* The placeholder's copy can change while the input is retained: the one element takes it, and keeps the text. */
  it('should keep the retained input when its placeholder text changes', () => {
    const { rerender, container } = render(<Stage phase='first' />);
    const input = within(container).getByRole<HTMLTextAreaElement>('textbox');
    input.focus();
    typeInto(input, 'kept');

    rerender(<Stage phase='first' placeholder='Ask Tau anything' />);

    expect(within(container).getByRole('textbox')).toBe(input);
    expect(input).toHaveAttribute('placeholder', 'Ask Tau anything');
    expect(input.value).toBe('kept');
    expect(input).toHaveFocus();
  });

  /* A remount puts the caret and scroll back, but never takes focus from a control the person moved to meanwhile. */
  it('should not take focus back from a control focused while no placeholder stood', () => {
    const { rerender, container } = render(<Stage phase='first' />);
    const input = within(container).getByRole<HTMLTextAreaElement>('textbox');
    input.focus();
    typeInto(input, 'Make a hinge');
    input.setSelectionRange(5, 5);

    rerender(<Stage phase='none' />);
    const elsewhere = within(container).getByRole('button', { name: 'Elsewhere' });
    elsewhere.focus();
    rerender(<Stage phase='second' />);

    expect(within(container).getByRole('textbox')).toBe(input);
    expect(elsewhere).toHaveFocus();
    expect([input.selectionStart, input.selectionEnd]).toEqual([5, 5]);
  });

  /* P4 failure: if the adopter never arrives the native input keeps working, through every placeholder. */
  it('should stay usable while no adopter arrives', () => {
    const { rerender, container } = render(<Stage phase='first' />);
    rerender(<Stage phase='none' />);
    rerender(<Stage phase='second' />);

    const input = within(container).getByRole<HandOffElement>('textbox');
    typeInto(input, 'still here');
    expect(input.value).toBe('still here');
  });
});

describe('useHandOffAdoption', () => {
  beforeEach(() => {
    resetHandOffStoreForTest();
  });
  afterEach(() => {
    document.body.replaceChildren();
  });

  it('should hand over the snapshot once, then take the native input away from every placeholder', () => {
    const view = render(<Stage phase='first' />);
    const input = within(view.container).getByRole<HandOffElement>('textbox');
    input.focus();
    typeInto(input, 'Make a bracket.');
    const onAdopted = vi.fn();

    const { result } = renderHook(() => useHandOffAdoption(target, onAdopted));

    expect(result.current).toMatchObject({
      kind: 'done',
      snapshot: { text: 'Make a bracket.', edited: true, focused: true },
    });
    expect(onAdopted).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({ text: 'Make a bracket.' }));
    expect(view.container.querySelector('textarea')).toBeNull();
    view.rerender(<Stage phase='second' />);
    expect(view.container.querySelector('textarea')).toBeNull();
    /* A later adopter, such as the composer of the next chat, gets nothing old. */
    const later = renderHook(() => useHandOffAdoption(target, onAdopted));
    expect(later.result.current).toEqual({ kind: 'done', snapshot: undefined });
    expect(onAdopted).toHaveBeenCalledOnce();
  });

  /* The composer of another project never takes this project's text. */
  it("should hand nothing to another project's adopter", () => {
    const view = render(<Stage phase='first' />);
    typeInto(within(view.container).getByRole<HandOffElement>('textbox'), 'For project one');
    const onAdopted = vi.fn();

    const { result } = renderHook(() => useHandOffAdoption({ ...target, scope: 'home/two' }, onAdopted));

    expect(result.current).toEqual({ kind: 'done', snapshot: undefined });
    expect(onAdopted).not.toHaveBeenCalled();
  });

  it('should adopt nothing when no native input was ever served', () => {
    const onAdopted = vi.fn();

    const { result } = renderHook(() => useHandOffAdoption(target, onAdopted));

    expect(result.current).toEqual({ kind: 'done', snapshot: undefined });
    expect(onAdopted).not.toHaveBeenCalled();
  });

  it('should adopt nothing for a surface that has no hand-off', () => {
    render(<Stage phase='first' />);

    const { result } = renderHook(() => useHandOffAdoption(undefined, vi.fn()));

    expect(result.current).toEqual({ kind: 'done', snapshot: undefined });
    expect(handOffStore.isAdopted(target)).toBe(false);
  });

  /* P4: an open IME composition is never cut; adoption waits for the composition's end, then takes the final text. */
  it('should wait for an open composition, then adopt its committed text', async () => {
    const view = render(<Stage phase='first' />);
    const input = within(view.container).getByRole<HandOffElement>('textbox');
    input.focus();
    input.dispatchEvent(new CompositionEvent('compositionstart'));
    input.value = 'に';
    input.dispatchEvent(new InputEvent('input', { isComposing: true }));
    const onAdopted = vi.fn();

    const { result } = renderHook(() => useHandOffAdoption(target, onAdopted));

    expect(result.current).toEqual({ kind: 'waiting' });
    expect(within(view.container).getByRole('textbox')).toBe(input);
    await act(async () => {
      input.value = '日本';
      input.dispatchEvent(new CompositionEvent('compositionend'));
      await Promise.resolve();
    });
    expect(result.current).toMatchObject({ kind: 'done', snapshot: { text: '日本' } });
    expect(onAdopted).toHaveBeenCalledOnce();
  });

  /* The browser cannot finish a composition in an input that left the document: adoption takes what it holds. */
  it('should adopt when the last placeholder leaves while a composition is open', () => {
    const view = render(<Stage phase='first' />);
    const input = within(view.container).getByRole<HandOffElement>('textbox');
    input.focus();
    input.dispatchEvent(new CompositionEvent('compositionstart'));
    input.value = 'に';
    input.dispatchEvent(new InputEvent('input', { isComposing: true }));
    const onAdopted = vi.fn();
    const { result } = renderHook(() => useHandOffAdoption(target, onAdopted));
    expect(result.current).toEqual({ kind: 'waiting' });

    view.rerender(<Stage phase='none' />);

    expect(result.current).toMatchObject({ kind: 'done', snapshot: { text: 'に' } });
    expect(onAdopted).toHaveBeenCalledOnce();
  });

  /* A composer that moves to another project while waiting tries again for that project. */
  it('should try again for a new scope while waiting', () => {
    const view = render(<Stage phase='first' />);
    const input = within(view.container).getByRole<HandOffElement>('textbox');
    input.focus();
    input.dispatchEvent(new CompositionEvent('compositionstart'));
    const { result, rerender } = renderHook(({ scope }) => useHandOffAdoption({ ...target, scope }, vi.fn()), {
      initialProps: { scope: target.scope },
    });
    expect(result.current).toEqual({ kind: 'waiting' });

    rerender({ scope: 'home/two' });

    expect(result.current).toEqual({ kind: 'done', snapshot: undefined });
  });

  /* An adoption is for its project: the next project's placeholder serves its own input, and its composer adopts it. */
  it("should serve another project's placeholder after one project adopted", () => {
    const view = render(<Stage phase='first' />);
    typeInto(within(view.container).getByRole<HandOffElement>('textbox'), 'For project one');
    renderHook(() => useHandOffAdoption(target, vi.fn()));
    expect(view.container.querySelector('textarea')).toBeNull();

    view.rerender(<Stage phase='second' scope='home/two' />);

    const input = within(view.container).getByRole<HandOffElement>('textbox');
    expect(input).toHaveValue('');
    typeInto(input, 'For project two');
    const onAdopted = vi.fn();
    const { result } = renderHook(() => useHandOffAdoption({ ...target, scope: 'home/two' }, onAdopted));
    expect(result.current).toMatchObject({ kind: 'done', snapshot: { text: 'For project two' } });
  });

  it('should carry a submit queued before adoption', () => {
    const view = render(<Stage phase='first' />);
    const input = within(view.container).getByRole<HandOffElement>('textbox');
    vi.stubGlobal('matchMedia', () => ({ matches: false }));
    typeInto(input, 'Make a bracket.');
    input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', cancelable: true }));
    vi.unstubAllGlobals();

    const { result } = renderHook(() => useHandOffAdoption(target, vi.fn()));

    expect(result.current).toMatchObject({ kind: 'done', snapshot: { submitQueued: true } });
  });
});
