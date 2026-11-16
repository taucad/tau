import { act, render, within } from '@testing-library/react';
import { useContext } from 'react';
import { hydrateRoot } from 'react-dom/client';
import { renderToString } from 'react-dom/server';
import { MemoryRouter, Route, Routes } from 'react-router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { frameTabAttribute, writePhoneFrameHint, writeWideFrameHint } from '#lib/frame-hint.js';
import { writeDraftHint } from '#lib/frame-hint-draft.js';
import type { WideFrameHint } from '#lib/frame-hint.js';
import { WorkspaceFrame, workspaceFrameEndId } from '#routes/w.$workspace.$project/workspace-frame.js';
import { EarlyInputHandoverContext } from '#components/chat/chat-early-input-field.js';
import type { EarlyInputHandover } from '#components/chat/chat-early-input-field.js';

/*
 * The persisted `workbenchOpen` lives in the project's own layout record and is read only once the session is live.
 * A15b's fix is the frame hint: this device's last layout per project, readable before first paint by the pre-paint
 * script and at the client's first render by the frame. The lanes read only the hint's CSS variables, so jsdom, which
 * applies no Tailwind, asserts on the variables the frame sets and on the lanes' classes that read them.
 */
const workbenchClosed: WideFrameHint = {
  chatOpen: true,
  chatWidth: 440,
  workbenchOpen: false,
  workbenchWidth: 420,
  compactAuxiliary: 'chat',
};

const workbenchOpen: WideFrameHint = { ...workbenchClosed, workbenchOpen: true };

const frameAt = (url: string): React.JSX.Element => (
  <MemoryRouter initialEntries={[url]}>
    <Routes>
      <Route
        path='/w/:workspace/:project'
        element={
          <WorkspaceFrame>
            <p>content</p>
          </WorkspaceFrame>
        }
      />
    </Routes>
  </MemoryRouter>
);

const renderFrame = (url: string): HTMLElement => {
  /* The frame reads the document's URL, as the pre-paint script does. */
  globalThis.history.replaceState(null, '', url);
  render(frameAt(url));
  const frame = document.querySelector<HTMLElement>('[data-slot=workspace-frame]');
  expect(frame).not.toBeNull();
  return frame!;
};

const lane = (frame: HTMLElement, name: string): HTMLElement =>
  frame.querySelector<HTMLElement>(`[data-slot=workspace-lane][data-lane=${name}]`)!;

describe('WorkspaceFrame', () => {
  beforeEach(() => {
    globalThis.localStorage.clear();
  });

  afterEach(() => {
    globalThis.history.replaceState(null, '', '/');
    document.documentElement.removeAttribute('style');
    document.documentElement.removeAttribute(frameTabAttribute);
  });

  // ── Known defects (A0.9), flipped by A15b ──

  /*
   * C3 / U5 states the defect only: the loading frame of a workbench-closed project draws no third lane. The lane's
   * display is the hint's variable, so the frame of a workbench-closed project sets it to `none`.
   */
  it('U5: the loading frame of a workbench-closed project has no third lane border', () => {
    writeWideFrameHint('home/one', workbenchClosed);
    const frame = renderFrame('/w/home/one');

    expect(frame.style.getPropertyValue('--frame-workbench-display')).toBe('none');
    expect(lane(frame, 'workbench').className).toContain('[display:var(--frame-workbench-display,flex)]');
  });

  /*
   * The green twin of U5: a workbench-open project keeps its third lane in the loading frame, so a fix that drops the
   * lane for every project cannot turn U5 green.
   */
  it('U5 guard: the loading frame of a workbench-open project keeps its third lane border', () => {
    writeWideFrameHint('home/one', workbenchOpen);
    const frame = renderFrame('/w/home/one');

    expect(frame.style.getPropertyValue('--frame-workbench-display')).toBe('flex');
    expect(lane(frame, 'workbench')).toHaveClass('border-l');
  });

  it('draws each lane at the remembered width of this project, not another', () => {
    writeWideFrameHint('home/one', workbenchClosed);
    writeWideFrameHint('home/two', { ...workbenchOpen, chatWidth: 360 });
    const frame = renderFrame('/w/home/two');

    expect(frame.style.getPropertyValue('--frame-chat-width')).toBe('360px');
    expect(lane(frame, 'chat').className).toContain('w-(--frame-chat-width,320px)');
  });

  it('falls back to the default layout for a project with no hint', () => {
    const frame = renderFrame('/w/home/unknown');

    expect(frame.style.getPropertyValue('--frame-workbench-display')).toBe('flex');
    expect(frame.style.getPropertyValue('--frame-chat-width')).toBe('320px');
    expect(lane(frame, 'workbench').className).toContain('[display:var(--frame-workbench-display,flex)]');
    expect(lane(frame, 'chat').className).toContain('[display:var(--frame-chat-display,flex)]');
  });

  /* Review round 1: the pre-paint script's variables stay on <html> for the document's life, so a client navigation to
   * a project with no hint must set the defaults on the frame rather than inherit the first project's layout. */
  it('does not inherit the variables the pre-paint script left for another project', () => {
    document.documentElement.style.setProperty('--frame-workbench-display', 'none');
    try {
      const frame = renderFrame('/w/home/unknown');

      expect(frame.style.getPropertyValue('--frame-workbench-display')).toBe('flex');
    } finally {
      document.documentElement.style.removeProperty('--frame-workbench-display');
    }
  });

  it("draws no lanes under a failure that stands in the workspace's place, and keeps them under a live workspace alert", () => {
    const frame = renderFrame('/w/home/one');

    expect(frame.className).toContain(
      '[&:not([data-workspace-pending]):has([role=alert]:not([data-project-workspace]_*))>[data-slot=workspace-frame-lanes]]:hidden',
    );
  });

  /* Review round 2: the lanes follow the live layout's compact rule (under 1120 px), and the query container is the
   * lanes layer, so the content over the frame gains no container for its own queries. */
  it('switches to the compact lanes below 1120 px and gives the content no query container', () => {
    const frame = renderFrame('/w/home/one');

    expect(lane(frame, 'workbench').className).toContain('@max-[1120px]:');
    expect(lane(frame, 'chat').className).toContain('@max-[1120px]:');
    expect(frame).not.toHaveClass('@container');
    expect(frame.querySelector('[data-slot=workspace-frame-lanes]')).toHaveClass('@container');
  });

  it('renders no variables on the server, where the pre-paint script owns them', () => {
    writeWideFrameHint('home/one', workbenchClosed);
    const html = renderToString(frameAt('/w/home/one'));

    expect(html).toContain('data-slot="workspace-frame"');
    expect(html).not.toMatch(/style="[^"]*--frame-/u);
  });

  /* 20-run sample 4 of F15: a first frame painted before the parser reached the lanes drew none. */
  it('holds first paint on the server until the parser has reached the end of the lanes', () => {
    const html = renderToString(frameAt('/w/home/one'));

    expect(html).toContain(`<link rel="expect" href="#${workspaceFrameEndId}" blocking="render"/>`);
    const marker = html.indexOf(`id="${workspaceFrameEndId}"`);
    expect(marker).toBeGreaterThan(html.lastIndexOf('data-slot="workspace-lane"'));
    expect(marker).toBeLessThan(html.indexOf('<p>content</p>'));
  });

  /* Merge with main: the render-blocking marker moved the content's slot, so a non-project visit remounted it. */
  it('keeps the content node whether or not the frame is drawn', () => {
    globalThis.history.replaceState(null, '', '/w/home/one');
    const content = (isDrawn: boolean): React.JSX.Element => (
      <WorkspaceFrame isDrawn={isDrawn}>
        <input aria-label='Page input' />
      </WorkspaceFrame>
    );
    const view = render(content(true));
    const input = document.querySelector('input[aria-label="Page input"]');
    view.rerender(content(false));

    expect(document.querySelector('[data-slot=workspace-frame]')).toBeNull();
    expect(document.querySelector('input[aria-label="Page input"]')).toBe(input);
    view.rerender(content(true));
    expect(document.querySelector('input[aria-label="Page input"]')).toBe(input);
  });

  it('draws only frame: no skeleton, no animation, and the content over its lanes', () => {
    const frame = renderFrame('/w/home/one');

    expect(frame.querySelector('[data-slot=skeleton]')).toBeNull();
    expect(frame.innerHTML).not.toMatch(/animate-|fade-in/u);
    expect(frame.querySelector('[data-slot=workspace-frame-lanes]')).toHaveAttribute('aria-hidden', 'true');
    expect(frame).toHaveTextContent('content');
    expect(frame.querySelectorAll('[data-slot=workspace-lane]')).toHaveLength(3);
  });

  /* A15b2 (F11): drawn for a project the route has not committed, the frame's layers show and the page being left is
   * hidden in place, so nothing of it shows over the lanes or the phone frame. */
  it('hides every child but the lanes and the phone frame while the route is pending', () => {
    globalThis.history.replaceState(null, '', '/w/home/one');
    const view = render(
      <WorkspaceFrame isPending>
        <p>home</p>
      </WorkspaceFrame>,
    );
    const frame = view.container.querySelector<HTMLElement>('[data-slot=workspace-frame]')!;

    expect(frame).toHaveAttribute('data-workspace-pending');
    expect(frame.className).toContain(
      '[&[data-workspace-pending]>:not([data-slot=workspace-frame-lanes]):not([data-slot=workspace-frame-phone])]:invisible',
    );
    expect(frame.querySelector(':scope > [data-slot=workspace-frame-lanes]')).not.toBeNull();
    expect(frame.querySelector(':scope > [data-slot=workspace-frame-phone]')).not.toBeNull();
    view.rerender(
      <WorkspaceFrame>
        <p>home</p>
      </WorkspaceFrame>,
    );
    expect(frame).not.toHaveAttribute('data-workspace-pending');
  });

  /* A15b2 review: drawn ahead of the route, the frame renders before the router pushes the URL, so it reads the
   * destination's hint from the shell's pathname, not the document's URL (still the page being left). */
  it("draws the destination's remembered layout while the URL is still the page being left's", () => {
    writeWideFrameHint('home/two', workbenchClosed);
    globalThis.history.replaceState(null, '', '/');
    const view = render(
      <WorkspaceFrame isPending pathname='/w/home/two'>
        <p>home</p>
      </WorkspaceFrame>,
    );
    const frame = view.container.querySelector<HTMLElement>('[data-slot=workspace-frame]')!;

    expect(frame.style.getPropertyValue('--frame-workbench-display')).toBe('none');
  });

  // ── A15c: the phone frame (blueprint P-h; C6) ──

  /*
   * C6: before any client render (the server's HTML, which a phone paints first), the frame already holds the phone
   * workspace's four parts, each a bare box: the top bar, the viewer's box, the sheet and the tab bar. Nothing in them is
   * a skeleton or animates in. The sheet's display and detent are the hint's variables, closed by default.
   */
  it('C6: the first render draws the phone top bar, viewer box, sheet and tab bar, with no skeleton and no animation', () => {
    globalThis.history.replaceState(null, '', '/w/home/one');
    const container = document.createElement('div');
    container.innerHTML = renderToString(frameAt('/w/home/one'));
    const phone = container.querySelector<HTMLElement>('[data-slot=workspace-frame-phone]');

    expect(phone).not.toBeNull();
    expect(phone).toHaveAttribute('aria-hidden', 'true');
    expect(phone!.hasAttribute('inert')).toBe(true);
    const parts = [...phone!.querySelectorAll<HTMLElement>('[data-frame-part]')].map(
      (part) => part.dataset['framePart'],
    );
    expect(parts).toEqual(['top-bar', 'viewer', 'sheet', 'tab-bar']);
    expect(phone!.querySelector('[data-slot=skeleton]')).toBeNull();
    expect(phone!.innerHTML).not.toMatch(/animate-|fade-in|slide-in/u);
    const sheet = phone!.querySelector<HTMLElement>('[data-frame-part=sheet]')!;
    expect(sheet.className).toContain('[display:var(--frame-sheet-display,none)]');
    expect(sheet.className).toContain('top-[calc(100dvh_-_var(--frame-sheet-height,0px))]');
    /* The tab bar names every destination, so a phone's first paint is contentful. */
    expect(phone!.querySelector('[data-frame-part=tab-bar]')).toHaveTextContent('ChatParametersModelAll');
    /* The server sets no variable: the pre-paint script's on `<html>` stand until the client renders. */
    expect(container.querySelector<HTMLElement>('[data-slot=workspace-frame]')!.getAttribute('style')).toBeNull();
  });

  it("C6: on the client the frame draws this project's remembered sheet and selects its tab", () => {
    writePhoneFrameHint('home/one', 'parameters');
    const frame = renderFrame('/w/home/one');

    expect(frame.style.getPropertyValue('--frame-sheet-display')).toBe('flex');
    expect(frame.style.getPropertyValue('--frame-sheet-height')).toBe('calc(0.5 * 100dvh)');
    expect(document.documentElement.getAttribute(frameTabAttribute)).toBe('parameters');
  });

  it("does not carry the document's first project's sheet or tab to a project with no phone hint", () => {
    /* The pre-paint script's values for the project the document loaded first. */
    document.documentElement.setAttribute(frameTabAttribute, 'chat');
    document.documentElement.style.setProperty('--frame-sheet-display', 'flex');
    const frame = renderFrame('/w/home/two');

    expect(frame.style.getPropertyValue('--frame-sheet-display')).toBe('none');
    expect(frame.style.getPropertyValue('--frame-sheet-height')).toBe('0px');
    expect(document.documentElement.getAttribute(frameTabAttribute)).toBe('model');
  });

  it('gives each phone part way to the live one in its own box, and the whole phone frame to a failure or notice', () => {
    const frame = renderFrame('/w/home/one');
    const phone = frame.querySelector<HTMLElement>('[data-slot=workspace-frame-phone]')!;
    const part = (name: string): string => phone.querySelector<HTMLElement>(`[data-frame-part=${name}]`)!.className;

    /* Every part waits for the workspace's restored layout; the top bar keeps its box in the column, so the viewer's
     * box below it never moves, and the viewer's box also waits for the live stage. */
    expect(part('top-bar')).toContain('[[data-slot=workspace-frame]:has([data-mobile-workspace=ready])_&]:invisible');
    expect(part('viewer')).toContain(
      '[[data-slot=workspace-frame]:has([data-mobile-workspace=ready]_[data-slot=viewer-stage])_&]:hidden',
    );
    expect(part('sheet')).toContain('[[data-slot=workspace-frame]:has([data-mobile-workspace=ready])_&]:hidden');
    expect(part('tab-bar')).toContain('[[data-slot=workspace-frame]:has([data-mobile-workspace=ready])_&]:hidden');
    expect(phone.className).toContain(
      '[[data-slot=workspace-frame]:not([data-workspace-pending]):has([data-slot=project-route-notice])_&]:hidden',
    );
    expect(phone.className).toContain('md:hidden');
  });
});

/*
 * A15d, F7 (loading states UX blueprint, § Editor-route composer): the served document holds a typeable composer in the
 * chat lane, and the rich composer takes its text, caret, focus and queued send once the lane is revealed.
 */
describe('WorkspaceFrame served composer', () => {
  let handover: EarlyInputHandover | undefined;
  const Consumer = (): React.JSX.Element => {
    handover = useContext(EarlyInputHandoverContext);
    return <p>content</p>;
  };
  /* The shell's project path for the frame (A15b2), where a row passes one. */
  let framePath: string | undefined;
  let frameNavigation: 'POP' | 'PUSH' | 'REPLACE' | undefined;
  let isFramePending = false;
  const served = (url: string, isDrawn = true): React.JSX.Element => (
    <MemoryRouter initialEntries={[url]}>
      <Routes>
        <Route
          path='/w/:workspace/:project'
          element={
            <WorkspaceFrame
              isDrawn={isDrawn}
              isPending={isFramePending}
              pathname={framePath}
              navigationType={frameNavigation}
            >
              <Consumer />
            </WorkspaceFrame>
          }
        />
      </Routes>
    </MemoryRouter>
  );

  /** Serve the frame, run its inline script where it was served, and hydrate it. */
  const serveAndHydrate = async (
    url: string,
    beforeHydration?: (input: HTMLTextAreaElement, container: HTMLElement) => void,
  ): Promise<{ container: HTMLElement; rerender: (isDrawn: boolean) => void; done: () => Promise<void> }> => {
    globalThis.history.replaceState(null, '', url);
    const container = document.createElement('div');
    container.innerHTML = renderToString(served(url));
    document.body.append(container);
    const script = container.querySelector('[data-slot=workspace-frame-composer] script')!;
    const running = document.createElement('script');
    running.textContent = script.textContent;
    script.replaceWith(running);
    beforeHydration?.(within(container).getByRole('textbox', { name: 'Chat message' }), container);
    const onRecoverableError = vi.fn();
    const root = hydrateRoot(container, served(url), { onRecoverableError });
    await act(async () => {
      await Promise.resolve();
    });
    expect(onRecoverableError).not.toHaveBeenCalled();
    return {
      container,
      rerender: (isDrawn) => {
        act(() => {
          root.render(served(url, isDrawn));
        });
      },
      done: async () => {
        await act(async () => {
          root.unmount();
        });
        container.remove();
      },
    };
  };

  beforeEach(() => {
    globalThis.localStorage.clear();
    handover = undefined;
    framePath = undefined;
    frameNavigation = undefined;
    isFramePending = false;
  });

  afterEach(() => {
    globalThis.history.replaceState(null, '', '/');
  });

  it('serves a native input in the chat lane, the only part of the frame exposed before adoption', async () => {
    const { container, done } = await serveAndHydrate('/w/home/one');
    try {
      const frame = container.querySelector<HTMLElement>('[data-slot=workspace-frame]')!;
      const input = within(frame).getByRole('textbox', { name: 'Chat message' });
      expect(input.closest('[data-slot=workspace-frame-composer]')).not.toBeNull();
      /* Everything else in the frame is hidden from assistive technology: the lanes layer, and the inert bar. */
      expect(frame.querySelector('[data-slot=workspace-frame-lanes]')).toHaveAttribute('aria-hidden', 'true');
      const exposed = [...frame.querySelectorAll<HTMLElement>('button, textarea, input, [role], [tabindex]')].filter(
        (element) => element.closest('[aria-hidden=true], [inert]') === null && element.textContent !== 'content',
      );
      /* With the queued send's status, which says nothing until Enter queues one. */
      expect(exposed).toEqual([frame.querySelector('[data-slot=queued-send-status]'), input]);
      /* The lane's own composer box stays in place under the served one, drawing nothing. */
      expect(within(frame).getByTestId('chat-lane-frame-composer')).toHaveClass('invisible');
    } finally {
      await done();
    }
  });

  it('hands over text, caret, focus and a queued send at release, once, and then draws the empty box', async () => {
    const { container, done } = await serveAndHydrate('/w/home/one', (input) => {
      input.focus();
      input.value = 'abc';
      input.dispatchEvent(new InputEvent('input', { bubbles: true }));
      input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true }));
    });
    try {
      expect(handover?.pending).toBeUndefined();
      act(() => {
        handover?.claim('p1');
        handover?.release('p1');
      });
      expect(handover?.pending).toMatchObject({
        text: 'abc',
        edited: true,
        focused: true,
        start: 3,
        end: 3,
        queuedSend: true,
      });
      expect(container.querySelector('[data-slot=workspace-frame-composer]')).toBeNull();
      expect(within(container).getByTestId('chat-lane-frame-composer')).not.toHaveClass('invisible');
      act(() => {
        handover?.release('p1');
        handover?.taken();
      });
      expect(handover?.pending).toBeUndefined();
    } finally {
      await done();
    }
  });

  it('hands nothing over when nothing was typed or focused', async () => {
    const { container, done } = await serveAndHydrate('/w/home/one');
    try {
      act(() => {
        handover?.claim('p1');
        handover?.release('p1');
      });
      expect(handover?.pending).toBeUndefined();
      expect(container.querySelector('[data-slot=workspace-frame-composer]')).toBeNull();
    } finally {
      await done();
    }
  });

  /* Review round 7: a painted draft nobody focused is handed over too, so the editor holds it as the overlay leaves. */
  it.each([
    { claimed: 'c1', isPrefilled: true },
    { claimed: undefined, isPrefilled: true },
    /* A bare project URL whose focus resolved to another chat: that painted draft is not this chat's. */
    { claimed: 'c2', isPrefilled: false },
  ])(
    'hands over a painted draft nobody focused for its chat, claimed by $claimed',
    async ({ claimed, isPrefilled }) => {
      writeDraftHint({ kind: 'project', key: 'home/one' }, { text: 'Fillet it', chatId: 'c1' });
      const { done } = await serveAndHydrate('/w/home/one');
      try {
        act(() => {
          handover?.claim('p1', claimed);
          handover?.release('p1');
        });
        if (isPrefilled) {
          expect(handover?.pending).toMatchObject({
            text: 'Fillet it',
            prefilled: true,
            prefilledChatId: 'c1',
            edited: false,
            focused: false,
          });
        } else {
          /* Nothing of this chat's to take: the overlay leaves, and the chat's own record shows. */
          expect(handover?.pending).toBeUndefined();
        }
      } finally {
        await done();
      }
    },
  );

  it('waits for an open composition to end before handing over', async () => {
    let state: { composing: boolean } | undefined;
    let served: HTMLTextAreaElement | undefined;
    const { done } = await serveAndHydrate('/w/home/one', (input) => {
      served = input;
      input.dispatchEvent(new CompositionEvent('compositionstart', { bubbles: true }));
      input.value = 'に';
      input.dispatchEvent(new InputEvent('input', { bubbles: true }));
      state = (input as HTMLTextAreaElement & { tauEarlyDraft?: { composing: boolean } }).tauEarlyDraft;
    });
    try {
      expect(state?.composing).toBe(true);
      act(() => {
        handover?.claim('p1');
        handover?.release('p1');
      });
      expect(handover?.pending).toBeUndefined();
      /* The input stays on screen through the composition, so it keeps focus and its text. */
      expect(served!.isConnected).toBe(true);
      await act(async () => {
        served!.value = '日本';
        served!.dispatchEvent(new CompositionEvent('compositionend', { bubbles: true }));
        await Promise.resolve();
      });
      expect(handover?.pending).toMatchObject({ text: '日本', edited: true });
    } finally {
      await done();
    }
  });

  /* The chat lane can still be loading its history after the reveal (review round 1, defect 2). */
  it('keeps the served input on screen after the reveal, while the chat history gate still loads, until a composer claims it', async () => {
    let served: HTMLTextAreaElement | undefined;
    const { container, done } = await serveAndHydrate('/w/home/one', (input) => {
      served = input;
      input.focus();
      input.value = 'ab';
      input.dispatchEvent(new InputEvent('input', { bubbles: true }));
    });
    try {
      act(() => {
        handover?.release('p1');
      });
      expect(handover?.pending).toBeUndefined();
      expect(container.querySelector('[data-slot=workspace-frame-composer]')).not.toBeNull();
      served!.value = 'abc';
      served!.dispatchEvent(new InputEvent('input', { bubbles: true }));
      let unclaim: (() => void) | undefined;
      act(() => {
        unclaim = handover?.claim('p1');
      });
      expect(handover?.pending).toMatchObject({ text: 'abc', edited: true, focused: true });
      expect(container.querySelector('[data-slot=workspace-frame-composer]')).toBeNull();
      unclaim?.();
    } finally {
      await done();
    }
  });

  /* Round 2: a chat lane that stays without a composer, and a navigation away, both end the served input. */
  it('removes the served input when the lane declines it', async () => {
    const { container, done } = await serveAndHydrate('/w/home/one', (input) => {
      input.value = 'abc';
      input.dispatchEvent(new InputEvent('input', { bubbles: true }));
    });
    try {
      act(() => {
        handover?.release('p1');
        handover?.decline();
      });
      expect(container.querySelector('[data-slot=workspace-frame-composer]')).toBeNull();
      act(() => {
        handover?.claim('p1');
      });
      expect(handover?.pending).toBeUndefined();
    } finally {
      await done();
    }
  });

  it('draws no served input again after the frame stops being drawn', async () => {
    const { container, rerender, done } = await serveAndHydrate('/w/home/one');
    try {
      rerender(false);
      rerender(true);
      expect(container.querySelector('[data-slot=workspace-frame-composer]')).toBeNull();
    } finally {
      await done();
    }
  });

  /* Review round 3: the frame persists across a navigation to another project, which must not take this input. */
  it('ends the served input when another project claims it, and keeps it through a URL correction', async () => {
    const { container, done } = await serveAndHydrate('/w/home/one', (input) => {
      input.value = 'make it blue';
      input.dispatchEvent(new InputEvent('input', { bubbles: true }));
    });
    try {
      act(() => {
        handover?.release('p1');
      });
      /* The route corrects the URL to the same project's canonical slugs: the input stays. */
      globalThis.history.replaceState(null, '', '/w/home/one-renamed');
      expect(container.querySelector('[data-slot=workspace-frame-composer]')).not.toBeNull();
      act(() => {
        handover?.claim('p2');
      });
      expect(container.querySelector('[data-slot=workspace-frame-composer]')).toBeNull();
      expect(handover?.pending).toBeUndefined();
    } finally {
      await done();
    }
  });

  /* Review round 5, after A15b2: the frame's project path binds the input, even before any composer calls. */
  it("ends the served input when the shell draws the frame for another project's path, before any composer calls", async () => {
    framePath = '/w/home/one';
    const { container, rerender, done } = await serveAndHydrate('/w/home/one', (input) => {
      input.value = 'add fillets';
      input.dispatchEvent(new InputEvent('input', { bubbles: true }));
    });
    try {
      rerender(true);
      expect(container.querySelector('[data-slot=workspace-frame-composer]')).not.toBeNull();
      framePath = '/w/home/two';
      rerender(true);
      expect(container.querySelector('[data-slot=workspace-frame-composer]')).toBeNull();
      act(() => {
        handover?.release('p2');
        handover?.claim('p2');
      });
      expect(handover?.pending).toBeUndefined();
    } finally {
      await done();
    }
  });

  /* Review round 12: the focus sink rewrites a served URL to the same project's canonical slugs by a router replace. */
  it("keeps the served input and its text through the router's replace to the project's canonical slugs", async () => {
    framePath = '/w/Home/proj_1';
    frameNavigation = 'POP';
    const { container, rerender, done } = await serveAndHydrate('/w/Home/proj_1', (input) => {
      input.value = 'add fillets';
      input.dispatchEvent(new InputEvent('input', { bubbles: true }));
    });
    try {
      rerender(true);
      framePath = '/w/home/one';
      frameNavigation = 'REPLACE';
      rerender(true);
      expect(container.querySelector('[data-slot=workspace-frame-composer]')).not.toBeNull();
      act(() => {
        handover?.release('p1');
        handover?.claim('p1');
      });
      expect(handover?.pending?.text).toBe('add fillets');
      /* A later push to another project still ends a served input. */
      framePath = '/w/home/two';
      frameNavigation = 'PUSH';
      rerender(true);
      expect(container.querySelector('[data-slot=workspace-frame-composer]')).toBeNull();
    } finally {
      await done();
    }
  });

  /* Review round 13: a pending draw's navigation type is the committed page's, which may be a replace. */
  it("ends the served input when a pending draw for another project reads the committed page's replace", async () => {
    framePath = '/w/home/one';
    frameNavigation = 'POP';
    const { container, rerender, done } = await serveAndHydrate('/w/home/one', (input) => {
      input.value = 'add fillets';
      input.dispatchEvent(new InputEvent('input', { bubbles: true }));
    });
    try {
      rerender(true);
      framePath = '/w/home/two';
      frameNavigation = 'REPLACE';
      isFramePending = true;
      rerender(true);
      expect(container.querySelector('[data-slot=workspace-frame-composer]')).toBeNull();
    } finally {
      await done();
    }
  });

  it('drops an Enter on a painted draft nobody edited without showing or saying it as queued', async () => {
    writeDraftHint({ kind: 'project', key: 'home/one' }, { text: 'Fillet it' });
    let status: string | undefined;
    let isQueuedShown: boolean | undefined;
    let isPrevented: boolean | undefined;
    const { done } = await serveAndHydrate('/w/home/one', (input, container) => {
      input.focus();
      const enter = new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true });
      input.dispatchEvent(enter);
      isPrevented = enter.defaultPrevented;
      status = container.querySelector('[data-slot=queued-send-status]')?.textContent ?? undefined;
      isQueuedShown = container.querySelector('[data-queued-send]') !== null;
    });
    try {
      /* Dropped, so not announced or drawn as pending; and not a line break in the painted draft either. */
      expect(status).toBe('');
      expect(isQueuedShown).toBe(false);
      expect(isPrevented).toBe(true);
      act(() => {
        handover?.claim('p1');
        handover?.release('p1');
      });
      expect(handover?.pending).toMatchObject({ text: 'Fillet it', prefilled: true, edited: false, queuedSend: false });
    } finally {
      await done();
    }
  });

  it('serves no composer in a frame first rendered by a client navigation', () => {
    globalThis.history.replaceState(null, '', '/w/home/one');
    render(served('/w/home/one'));
    expect(document.querySelector('[data-slot=workspace-frame-composer]')).toBeNull();
    expect(handover?.pending).toBeUndefined();
  });
});
