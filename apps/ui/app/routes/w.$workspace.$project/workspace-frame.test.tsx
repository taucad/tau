import { act, render, screen } from '@testing-library/react';
import { renderToString } from 'react-dom/server';
import { MemoryRouter, Route, Routes } from 'react-router';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { handOffStore, resetHandOffStoreForTest } from '#components/hand-off/hand-off-store.js';
import { frameTabAttribute, writePhoneFrameHint, writeWideFrameHint } from '#lib/frame-hint.js';
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

  /* Review (r4586677545): the lanes can be laid out while the chat lane shows a gate's status instead of the composer
   * (chats loading, sync off, a failed load). The input must stay to be seen and edited until a composer adopts it, so
   * the box leaves on the composer's adoption, not on the lanes' layout. */
  it('keeps the composer box once the lanes are ready, and drops it when the composer adopts', () => {
    const frame = renderFrame('/w/home/one');

    expect(frame.className).not.toContain('[data-workspace-lanes=ready])>[data-slot=workspace-frame-composer]');
    screen.getByRole('textbox', { name: 'Chat message' }).focus();
    act(() => {
      handOffStore.adopt({ surface: 'project-composer', scope: 'home/one' });
    });

    expect(screen.queryByRole('textbox')).toBeNull();
    expect(frame.querySelector('[data-slot=workspace-frame-composer] .rounded-2xl')).toBeNull();
  });

  /* Where no composer can take the text, the box hides and the text stays in the store for a later adoption: a
   * failure in the workspace's place, or the chat lane closed in the live layout. */
  it('hides the composer box, keeping its text, under a failure or while the live chat lane is closed', () => {
    const frame = renderFrame('/w/home/one');

    expect(frame.className).toContain(
      '[&:not([data-workspace-pending]):has([role=alert]:not([data-project-workspace]_*))>[data-slot=workspace-frame-composer]]:hidden',
    );
    expect(frame.className).toContain('[&:has([data-chat-lane=hidden])>[data-slot=workspace-frame-composer]]:hidden');
    expect(handOffStore.holds({ surface: 'project-composer', scope: 'home/one' })).toBe(true);
  });

  it('serves no input when this project remembers its chat lane closed', () => {
    writeWideFrameHint('home/one', { ...workbenchOpen, chatOpen: false });
    renderFrame('/w/home/one');

    expect(screen.queryByRole('textbox')).toBeNull();
    expect(document.querySelector('[data-slot=workspace-frame] textarea')).toBeNull();
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
      '[&[data-workspace-pending]>:not([data-slot=workspace-frame-lanes]):not([data-slot=workspace-frame-phone]):not([data-slot=workspace-frame-composer])]:invisible',
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

  /* PL6 on A15b2: drawn ahead of the route, the composer box serves the destination's input, not the route's (still
   * the page being left's), so the destination's composer is the one that adopts it. */
  it("serves the destination's composer input while the route is still the page being left's", () => {
    globalThis.history.replaceState(null, '', '/w/home/one');
    render(
      <MemoryRouter initialEntries={['/w/home/one']}>
        <Routes>
          <Route
            path='/w/:workspace/:project'
            element={
              <WorkspaceFrame isPending pathname='/w/home/two'>
                <p>home</p>
              </WorkspaceFrame>
            }
          />
        </Routes>
      </MemoryRouter>,
    );

    expect(screen.getByRole('textbox', { name: 'Chat message' })).toBeInTheDocument();
    expect(handOffStore.holds({ surface: 'project-composer', scope: 'home/two' })).toBe(true);
    expect(handOffStore.holds({ surface: 'project-composer', scope: 'home/one' })).toBe(false);
    /* The pending rule hides the page being left, never the destination's composer box. */
    const frame = document.querySelector<HTMLElement>('[data-slot=workspace-frame]')!;
    expect(frame).toHaveAttribute('data-workspace-pending');
    expect(frame.className).toContain(':not([data-slot=workspace-frame-composer])]:invisible');
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
