import { act, within } from '@testing-library/react';
import { hydrateRoot } from 'react-dom/client';
import { renderToString } from 'react-dom/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { TooltipProvider } from '@taucad/ui/components/tooltip';
import { HomeChatComposer, homeComposerEndId } from '#routes/_index/home-chat-composer.js';
import type { EarlyChatInput } from '#components/chat/chat-early-input.js';

const send = vi.hoisted(() => vi.fn());
const draftActorRef = { send };
const composer = {
  draftActorRef,
  model: {
    model: {
      id: 'anthropic/claude-haiku',
      name: 'Haiku 5.5',
      family: 'claude',
      provider: { id: 'anthropic', name: 'Anthropic' },
      isResolved: true,
    },
    effort: undefined,
  },
  execution: { execution: { kind: 'tau' } },
  kernel: { preference: 'auto' },
};
vi.mock('#hooks/active-chat-provider.js', () => ({ useChatComposer: () => composer }));

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

  /* R2: the served composer has the rich one's shape — the box and its bar at rest, kernel pill included —
   * so nothing below it moves when the rich composer arrives. R11: it asks for focus at first paint. */
  it('should serve the composer bar at rest, with the Auto kernel pill, around an autofocusing input', () => {
    const container = document.createElement('div');
    container.innerHTML = renderToString(
      <TooltipProvider>
        <HomeChatComposer />
      </TooltipProvider>,
    );
    expect(container.querySelector('textarea')).toHaveAttribute('autofocus');
    const bar = container.querySelector('[data-slot="composer-bar"]')!;
    expect(bar).toHaveAttribute('inert');
    expect(bar.querySelector('[aria-label="Add"]')).not.toBeNull();
    expect(bar.querySelector('[aria-label="Create in Home"]')).not.toBeNull();
    expect(bar.querySelector('[data-slot="kernel-pill"]')).toHaveAttribute('aria-label', 'Kernel: Auto');
    expect(bar.querySelector('[data-slot="trigger-model"]')).toHaveTextContent('Haiku 5.5');
    expect(bar.querySelector('[aria-label="Send"]')).toHaveAttribute('aria-disabled', 'true');
  });

  /* Gate finding 1 (#1562): first paint waits until the parser has passed the whole composer. */
  it('should hold first paint until the parser reaches the marker after the composer', () => {
    const container = document.createElement('div');
    container.innerHTML = renderToString(
      <TooltipProvider>
        <HomeChatComposer />
      </TooltipProvider>,
    );
    const expectLink = container.querySelector('link[rel="expect"]');
    expect(expectLink).toHaveAttribute('blocking', 'render');
    expect(expectLink).toHaveAttribute('href', `#${homeComposerEndId}`);
    const marker = container.querySelector(`#${homeComposerEndId}`)!;
    expect(marker).toHaveAttribute('hidden');
    /* Everything the first paint must show whole comes before the marker in document order. */
    for (const part of [
      container.querySelector('textarea')!,
      container.querySelector('[data-slot="composer-bar"]')!,
      container.querySelector('[data-slot="trigger-model"]')!,
      container.querySelector('[data-slot="kernel-pill"]')!,
    ]) {
      expect(part.compareDocumentPosition(marker)).toBe(Node.DOCUMENT_POSITION_FOLLOWING);
    }
  });

  it('should not autofocus the served input on a surface that opts out', () => {
    const container = document.createElement('div');
    container.innerHTML = renderToString(
      <TooltipProvider>
        <HomeChatComposer enableAutoFocus={false} />
      </TooltipProvider>,
    );
    expect(container.querySelector('textarea')).not.toHaveAttribute('autofocus');
  });

  it('should serve a native input, hold text typed before the composer arrives and hand it over', async () => {
    const content = (
      <TooltipProvider>
        <HomeChatComposer />
      </TooltipProvider>
    );
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
