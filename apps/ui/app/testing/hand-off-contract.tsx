import { act } from '@testing-library/react';
import { hydrateRoot } from 'react-dom/client';
import type { Root } from 'react-dom/client';
import { renderToString } from 'react-dom/server';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * The hand-off contract's test kit (progressive loading architecture P4, PL6).
 *
 * One reusable suite for every surface whose native input is adopted by a richer one: serve the document, run its
 * inline scripts as the parser would, hydrate with the adopter's chunk held for three seconds, act on the native
 * input meanwhile, then release the chunk. Each case asserts a clause of the contract:
 *
 * - no lost character, in order, with the caret where the person left it, and a single mount of the adopter;
 * - an open IME composition is never cut: adoption waits, and takes the committed text;
 * - focus moves to the adopter only if the native input held it;
 * - if the chunk never arrives the native input keeps working, and nothing is adopted;
 * - no double input: once adopted, no native input is left to type into, and the text is not repeated;
 * - for a surface that queues, Enter before adoption is one send, after it.
 *
 * This is the class of check that catches a surface mounted twice while its chunk is held (U1).
 *
 * @module
 */

/** What the adopter received, in the shape every adopter takes. */
export type HandOffContractAdoption = {
  readonly text: string;
  readonly focused: boolean;
  readonly start: number;
  readonly end: number;
  readonly submitQueued?: boolean;
};

/** One surface, as the kit drives it. */
export type HandOffContractFixture = {
  /** The tree: what the document serves (adopter not loaded) and, later, with the adopter's chunk here. */
  readonly content: (adopterLoaded: boolean) => React.ReactElement;
  /** How many times the adopter has mounted. */
  readonly mounts: () => number;
  /** What the adopter was handed, once it has been. */
  readonly adopted: () => HandOffContractAdoption | undefined;
  /** Whether the surface takes plain Enter as a queued send. */
  readonly queuesSubmit: boolean;
  /** Clear the fixture's records and any page store between cases. */
  readonly reset: () => void;
};

/** How long the adopter's chunk is held, as P4's reusable test holds it. Milliseconds. */
export const heldChunkMilliseconds = 3000;

type Served = {
  readonly container: HTMLElement;
  readonly root: Root;
  readonly input: () => HTMLTextAreaElement | undefined;
  readonly release: () => Promise<void>;
  readonly wait: (milliseconds: number) => Promise<void>;
};

/** Serve `content(false)`, run its scripts in place, hydrate over it and keep the adopter's chunk held. */
const serveHeld = async (fixture: HandOffContractFixture): Promise<Served> => {
  const container = document.createElement('div');
  container.innerHTML = renderToString(fixture.content(false));
  document.body.append(container);
  for (const served of container.querySelectorAll('script')) {
    const script = document.createElement('script');
    script.textContent = served.textContent;
    served.replaceWith(script);
  }
  const root = hydrateRoot(container, fixture.content(false));
  await act(async () => {
    await Promise.resolve();
  });
  let loaded = false;
  const chunk = new Promise<void>((resolve) => {
    setTimeout(resolve, heldChunkMilliseconds);
  });
  // async-iife: bootstrap -- the held chunk resolves on the fake clock, as a slow network would deliver it.
  void (async (): Promise<void> => {
    await chunk;
    loaded = true;
    root.render(fixture.content(true));
  })();
  return {
    container,
    root,
    input: () => container.querySelector('textarea') ?? undefined,
    wait: async (milliseconds) => {
      await act(async () => {
        await vi.advanceTimersByTimeAsync(milliseconds);
      });
    },
    release: async () => {
      await act(async () => {
        await vi.advanceTimersByTimeAsync(heldChunkMilliseconds);
      });
      expect(loaded, 'the held chunk was released').toBe(true);
    },
  };
};

/** Insert `text` at the caret, as a keystroke does, and report it to the page. */
const typeAtCaret = (input: HTMLTextAreaElement, text: string): void => {
  input.setRangeText(text, input.selectionStart, input.selectionEnd, 'end');
  input.dispatchEvent(new InputEvent('input', { bubbles: true, data: text, inputType: 'insertText' }));
};

/** A key the page may take (Enter): dispatched, and inserted only if nothing prevented it. */
const pressEnter = (input: HTMLTextAreaElement): void => {
  const event = new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true });
  input.dispatchEvent(event);
  if (!event.defaultPrevented) {
    typeAtCaret(input, '\n');
  }
};

/**
 * Run the hand-off contract's cases against one surface.
 *
 * @param name - The surface, as the suite names it.
 * @param fixture - How the kit serves it and reads its adopter.
 */
export function describeHandOffContract(name: string, fixture: HandOffContractFixture): void {
  describe(`${name} hand-off contract (P4)`, () => {
    let served: Served | undefined;
    beforeEach(() => {
      vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
      vi.stubGlobal('matchMedia', (query: string) => ({ matches: false, media: query }));
      /* The served scripts run against the document's own window. */
      Object.defineProperty(document.defaultView ?? globalThis, 'matchMedia', {
        configurable: true,
        writable: true,
        value: globalThis.matchMedia,
      });
      fixture.reset();
    });
    afterEach(async () => {
      if (served !== undefined) {
        const { root, container } = served;
        await act(async () => {
          root.unmount();
        });
        container.remove();
        served = undefined;
      }
      vi.useRealTimers();
      vi.unstubAllGlobals();
    });

    it('should lose no character typed while the adopter chunk is held, and mount the adopter once', async () => {
      served = await serveHeld(fixture);
      const input = served.input();
      expect(input, 'the document serves a native input').toBeDefined();
      input!.focus();
      for (const key of ['M', 'a', 'k', 'e', ' ', 'a', ' ', 'h', 'i', 'n', 'g', 'e']) {
        typeAtCaret(input!, key);
      }
      await served.wait(1000);
      /* Back into the middle, as a person correcting themselves: order is the caret's, not the keys'. */
      input!.setSelectionRange(5, 5);
      typeAtCaret(input!, 'me ');
      typeAtCaret(input!, '🛠');
      await served.wait(1000);
      expect(fixture.mounts(), 'the adopter mounted before its chunk').toBe(0);

      await served.release();

      expect(fixture.mounts()).toBe(1);
      expect(fixture.adopted()).toMatchObject({
        text: 'Make me 🛠a hinge',
        focused: true,
        start: 'Make me 🛠'.length,
        end: 'Make me 🛠'.length,
      });
      /* No double input: nothing native is left to take a key, and the text is held once. */
      expect(served.container.querySelector('textarea'), 'a native input is left after adoption').toBeNull();
    });

    it('should wait for an open composition, then adopt its committed text once', async () => {
      served = await serveHeld(fixture);
      const input = served.input()!;
      input.focus();
      input.dispatchEvent(new CompositionEvent('compositionstart', { data: '' }));
      input.value = 'に';
      input.dispatchEvent(new InputEvent('input', { bubbles: true, isComposing: true }));

      await served.release();

      expect(fixture.mounts(), 'adoption cut an open composition').toBe(0);
      expect(served.input()).toBe(input);
      await act(async () => {
        input.value = '日本';
        input.dispatchEvent(new InputEvent('input', { bubbles: true, isComposing: true }));
        input.dispatchEvent(new CompositionEvent('compositionend', { data: '日本' }));
        await vi.advanceTimersByTimeAsync(0);
      });
      expect(fixture.mounts()).toBe(1);
      expect(fixture.adopted()?.text).toBe('日本');
    });

    it('should leave focus where the person put it', async () => {
      const elsewhere = document.createElement('button');
      document.body.append(elsewhere);
      try {
        served = await serveHeld(fixture);
        typeAtCaret(served.input()!, 'a');
        elsewhere.focus();

        await served.release();

        expect(fixture.adopted()).toMatchObject({ text: 'a', focused: false });
        expect(elsewhere).toHaveFocus();
      } finally {
        elsewhere.remove();
      }
    });

    it('should keep the native input usable when the adopter chunk never arrives', async () => {
      served = await serveHeld(fixture);
      const input = served.input()!;
      input.focus();
      typeAtCaret(input, 'still typing');

      await served.wait(heldChunkMilliseconds - 1);
      typeAtCaret(input, ', and more');

      expect(served.input()).toBe(input);
      expect(input.value).toBe('still typing, and more');
      expect(fixture.mounts()).toBe(0);
      expect(fixture.adopted()).toBeUndefined();
    });

    it(`should ${fixture.queuesSubmit ? 'queue one send for' : 'take as a line break'} Enter before adoption`, async () => {
      served = await serveHeld(fixture);
      const input = served.input()!;
      input.focus();
      typeAtCaret(input, 'Make a bracket.');
      pressEnter(input);

      await served.release();

      expect(fixture.adopted()).toMatchObject(
        fixture.queuesSubmit
          ? { text: 'Make a bracket.', submitQueued: true }
          : { text: 'Make a bracket.\n', submitQueued: false },
      );
      expect(fixture.mounts()).toBe(1);
    });
  });
}
