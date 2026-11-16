import { act, render, within } from '@testing-library/react';
import { useContext } from 'react';
import { hydrateRoot } from 'react-dom/client';
import { renderToString } from 'react-dom/server';
import { MemoryRouter, Route, Routes } from 'react-router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { writeWideFrameHint } from '#lib/frame-hint.js';
import { writeDraftHint } from '#lib/frame-hint-draft.js';
import { ProjectRouteStateContext } from '#routes/w.$workspace.$project/project-route-state.js';
import type { ProjectRouteState } from '#types/project-route-state.types.js';
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
      '[&:has([role=alert]:not([data-project-workspace]_*))>[data-slot=workspace-frame-lanes]]:hidden',
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
  let routeState: ProjectRouteState | undefined;
  const served = (url: string, isDrawn = true): React.JSX.Element => (
    <ProjectRouteStateContext.Provider value={routeState}>
      <MemoryRouter initialEntries={[url]}>
        <Routes>
          <Route
            path='/w/:workspace/:project'
            element={
              <WorkspaceFrame isDrawn={isDrawn}>
                <Consumer />
              </WorkspaceFrame>
            }
          />
        </Routes>
      </MemoryRouter>
    </ProjectRouteStateContext.Provider>
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
    routeState = undefined;
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

  /* Review round 5: the route's resolved project binds the input, even before any composer calls. */
  it('ends the served input when the route resolves another project, before any composer calls', async () => {
    routeState = { kind: 'unavailable', projectId: 'p1' };
    const { container, rerender, done } = await serveAndHydrate('/w/home/one', (input) => {
      input.value = 'add fillets';
      input.dispatchEvent(new InputEvent('input', { bubbles: true }));
    });
    try {
      rerender(true);
      expect(container.querySelector('[data-slot=workspace-frame-composer]')).not.toBeNull();
      routeState = { kind: 'unavailable', projectId: 'p2' };
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

  it('drops an Enter on a painted draft nobody edited, and says a queued send aloud', async () => {
    writeDraftHint({ kind: 'project', key: 'home/one' }, { text: 'Fillet it' });
    let status: Element | undefined;
    const { done } = await serveAndHydrate('/w/home/one', (input, container) => {
      input.focus();
      input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true }));
      status = container.querySelector('[data-slot=queued-send-status]') ?? undefined;
    });
    try {
      expect(status).toHaveTextContent('Send queued');
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
