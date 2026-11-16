import { render, screen } from '@testing-library/react';
import { renderToString } from 'react-dom/server';
import { MemoryRouter, Route, Routes } from 'react-router';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { resetHandOffStoreForTest } from '#components/hand-off/hand-off-store.js';
import { writeWideFrameHint } from '#lib/frame-hint.js';
import type { WideFrameHint } from '#lib/frame-hint.js';
import { WorkspaceFrame, workspaceFrameEndId } from '#routes/w.$workspace.$project/workspace-frame.js';

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
    resetHandOffStoreForTest();
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

  // ── PL6: the project composer's native input, in the frame's chat lane ──

  /* The chat lane's composer box takes text from first paint; the live composer adopts it at the reveal. Only that box
   * is exposed and takes pointer events: the lanes stay decorative. */
  it("serves the composer's native input in the chat lane's composer box, the one exposed part of the frame", () => {
    const frame = renderFrame('/w/home/one');

    const input = screen.getByRole('textbox', { name: 'Chat message' });
    expect(screen.getAllByRole('textbox')).toHaveLength(1);
    expect(input.closest('[aria-hidden=true]')).toBeNull();
    expect(frame.querySelector('[data-slot=workspace-frame-lanes]')).toHaveAttribute('aria-hidden', 'true');
    expect(frame.querySelector('[data-slot=workspace-frame-lanes] textarea')).toBeNull();
    /* Above the content, at the chat lane's place and width, and only its box takes pointer events. */
    const layer = frame.querySelector<HTMLElement>('[data-slot=workspace-frame-composer]');
    expect(layer).toHaveClass('pointer-events-none', 'z-10');
    expect(layer?.firstElementChild?.className).toContain('w-(--frame-chat-width,320px)');
    expect(layer?.firstElementChild?.className).toContain('[display:var(--frame-chat-display,flex)]');
    expect(input.closest('.pointer-events-auto')).not.toBeNull();
  });

  it('serves the input on the server, before the render-blocking marker, so it takes text at first paint', () => {
    const html = renderToString(frameAt('/w/home/one'));

    const input = html.indexOf('aria-label="Chat message"');
    expect(input).toBeGreaterThan(-1);
    expect(input).toBeLessThan(html.indexOf(`id="${workspaceFrameEndId}"`));
  });

  /* The input hides with the lanes: at the reveal, and under a failure in the workspace's place. */
  it('hides the composer box with the lanes once they are ready, and under a failure', () => {
    const frame = renderFrame('/w/home/one');

    expect(frame.className).toContain(
      '[&:has([data-workspace-lanes=ready])>[data-slot=workspace-frame-composer]]:hidden',
    );
    expect(frame.className).toContain(
      '[&:has([role=alert]:not([data-project-workspace]_*))>[data-slot=workspace-frame-composer]]:hidden',
    );
  });

  it('serves no input when this project remembers its chat lane closed', () => {
    writeWideFrameHint('home/one', { ...workbenchOpen, chatOpen: false });
    renderFrame('/w/home/one');

    expect(screen.queryByRole('textbox')).toBeNull();
    expect(document.querySelector('[data-slot=workspace-frame] textarea')).toBeNull();
  });
});
