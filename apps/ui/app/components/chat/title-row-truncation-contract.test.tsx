// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { ChatToolCard, ChatToolCardHeader, ChatToolCardTitle } from '#components/chat/chat-tool-card.js';
import { ChatToolLabel } from '#components/chat/chat-tool-label.js';
import { ChatToolDescription } from '#components/chat/chat-tool-text.js';
import { FileLink } from '#components/files/file-link.js';
import { ViewerLink } from '#components/files/viewer-link.js';

// ChatToolCard transitively calls `useCookie`, which expects a react-router
// data router for `useRouteLoaderData`. Stub the cookie hook so these contract
// tests can render a real ChatToolCard tree without hauling in a router
// fixture. `vi.mock` is hoisted above imports by Vitest so the substitution
// applies to the ChatToolCard import above.
vi.mock('#hooks/use-cookie.js', () => ({
  useCookie: (_name: string, defaultValue: boolean) => [defaultValue, vi.fn(), vi.fn()],
}));

afterEach(() => {
  cleanup();
});

/**
 * Regression contract for chat-tool title-row truncation.
 *
 * The end-to-end visual behaviour ("Failed to compile main.kc…" character-by-
 * character ellipsis instead of a sudden "Failed to compile …" jump) depends on
 * a precise CSS cascade:
 *
 *   ChatToolCardTitle  -> block + min-w-0 + truncate  (canonical owner)
 *     ChatToolLabel    -> plain inline span (no truncate)
 *       verb           -> inline text
 *       ChatToolDescription -> plain inline span (no truncate)
 *         FileLink / ViewerLink -> bare `<span role='button'>`
 *                                   (non-replaced inline element + button
 *                                   semantics, NOT interactive content)
 *           text -> joins parent's inline text run
 *
 * The link **must** be a `<span>` — neither `<button>` nor `<a>`:
 * - `<button>` is rendered by browsers as an atomic inline-level box (CSS 2.1
 *   §9.2.2) and the parent's `text-overflow: ellipsis` cannot character-clip
 *   through an atomic box, so the entire button vanishes when the row
 *   narrows (the original truncation regression).
 * - `<a>` is a non-replaced inline element (text-truncation works), but HTML5
 *   classifies anchors as **interactive content**, which is forbidden inside
 *   a `<button>` — and the chat-tool title row sits inside the `<button>`
 *   rendered by `CollapsibleTrigger asChild → Button`. Browsers then hijack
 *   pointer/click activation up to the ancestor button, so the inner anchor's
 *   `onClick` no longer fires (the click toggles the collapsible instead of
 *   opening the file).
 * - `<span>` is non-replaced inline (truncatable) AND plain phrasing content
 *   (NOT interactive content), so it satisfies both constraints simultaneously.
 *
 * If any descendant flips back to `inline-block`, swaps the underlying tag to
 * `<button>` or `<a>`, or grows its own `truncate`/`overflow:hidden`, the link
 * becomes an atomic layout box (or invalid interactive nesting) and either the
 * outer `text-overflow: ellipsis` stops character-truncating through it or the
 * click stops reaching the inner handler. These assertions pin every layer.
 */
describe('chat-tool title-row truncation cascade', () => {
  it('keeps ChatToolCardTitle as the single block-level truncation owner', () => {
    render(
      <ChatToolCard variant='minimal' status='ready' isCollapsible={false}>
        <ChatToolCardHeader>
          <ChatToolCardTitle>
            <ChatToolLabel verb='Failed to compile'>
              <ChatToolDescription>
                <FileLink path='main.kcl'>main.kcl</FileLink>
              </ChatToolDescription>
            </ChatToolLabel>
          </ChatToolCardTitle>
        </ChatToolCardHeader>
      </ChatToolCard>,
    );

    const verbText = screen.getByText('Failed to compile');
    // ChatToolLabel wrapper sits between the verb span and ChatToolCardTitle's span.
    const labelWrapper = verbText.parentElement;
    expect(labelWrapper).not.toBeNull();
    const titleSpan = labelWrapper?.parentElement;
    expect(titleSpan).not.toBeNull();
    expect(titleSpan).toHaveClass('block');
    expect(titleSpan).toHaveClass('min-w-0');
    expect(titleSpan).toHaveClass('truncate');
  });

  it('keeps ChatToolLabel and ChatToolDescription wrappers as inline phrasing containers (no truncate / no inline-block)', () => {
    render(
      <ChatToolCard variant='minimal' status='ready' isCollapsible={false}>
        <ChatToolCardHeader>
          <ChatToolCardTitle>
            <ChatToolLabel verb='Read'>
              <ChatToolDescription>main.kcl</ChatToolDescription>
            </ChatToolLabel>
          </ChatToolCardTitle>
        </ChatToolCardHeader>
      </ChatToolCard>,
    );

    const labelWrapper = screen.getByText('Read').parentElement;
    expect(labelWrapper).not.toBeNull();
    expect(labelWrapper).not.toHaveClass('truncate');
    expect(labelWrapper).not.toHaveClass('min-w-0');
    expect(labelWrapper).not.toHaveClass('inline-block');
    expect(labelWrapper).not.toHaveClass('block');

    const description = screen.getByText('main.kcl');
    expect(description).not.toHaveClass('truncate');
    expect(description).not.toHaveClass('min-w-0');
    expect(description).not.toHaveClass('inline-block');
    expect(description).not.toHaveClass('block');
  });

  it('renders a default FileLink as a bare `<span>` (NOT `<a>` or `<button>`) so it can sit inside the chat-tool `<button>` trigger without browsers hijacking the click', () => {
    render(<FileLink path='main.kcl'>main.kcl</FileLink>);

    const link = screen.getByRole('button', { name: 'main.kcl' });

    // Primary contract: the underlying tag is `<span>`. Two failure modes the
    // shape pins simultaneously:
    //   1. `<button>` would be an atomic inline-level box (CSS 2.1 §9.2.2) —
    //      its text cannot be character-clipped by an ancestor's
    //      `text-overflow: ellipsis`, so the whole button vanishes when the
    //      row narrows.
    //   2. `<a>` is non-replaced inline (truncation works) but is HTML5
    //      *interactive content*, which is forbidden inside `<button>`. The
    //      chat-tool title row lives inside the `<button>` rendered by
    //      `CollapsibleTrigger asChild → Button` (chat-tool-card.tsx), so the
    //      browser hijacks pointer/click activation up to the ancestor button
    //      and the inner anchor's `onClick` never fires.
    // `<span>` is the only inline element that's both non-replaced (truncatable)
    // AND plain phrasing content (no interactive-nesting violation).
    expect(link.tagName).toBe('SPAN');
    expect(link).toBeInstanceOf(HTMLSpanElement);
    expect(link).not.toBeInstanceOf(HTMLAnchorElement);
    expect(link).not.toBeInstanceOf(HTMLButtonElement);

    // Button-like semantics for keyboard/AT users since `<span>` has no native
    // role, focusability, or activation.
    expect(link).toHaveAttribute('role', 'button');
    expect(link).toHaveAttribute('tabindex', '0');
    expect(link).not.toHaveAttribute('href');

    // Secondary class-list assertions — pin the inline display + absence of any
    // truncation that would re-introduce an atomic box at the link level.
    expect(link).toHaveClass('inline');
    expect(link).not.toHaveClass('inline-block');
    expect(link).not.toHaveClass('inline-flex');
    expect(link).not.toHaveClass('flex');
    expect(link).not.toHaveClass('block');
    // Truncation is owned upstream — link itself must not declare it.
    expect(link).not.toHaveClass('truncate');
  });

  it('renders a default ViewerLink as a bare `<span>` (NOT `<a>` or `<button>`) so it can sit inside the chat-tool `<button>` trigger without browsers hijacking the click', () => {
    render(<ViewerLink path='.tau/artifacts/tc-1__main.glb'>tc-1__main.glb</ViewerLink>);

    const link = screen.getByRole('button', { name: 'tc-1__main.glb' });

    expect(link.tagName).toBe('SPAN');
    expect(link).toBeInstanceOf(HTMLSpanElement);
    expect(link).not.toBeInstanceOf(HTMLAnchorElement);
    expect(link).not.toBeInstanceOf(HTMLButtonElement);
    expect(link).toHaveAttribute('role', 'button');
    expect(link).toHaveAttribute('tabindex', '0');
    expect(link).not.toHaveAttribute('href');

    // The wrapper MUST stay `inline` (not `inline-flex`) — otherwise the cube
    // makes the link an atomic flex chip and character-truncation through the
    // filename text breaks. See ViewerLink JSDoc for the architectural rule.
    expect(link).toHaveClass('inline');
    expect(link).not.toHaveClass('inline-block');
    expect(link).not.toHaveClass('inline-flex');
    expect(link).not.toHaveClass('flex');
    expect(link).not.toHaveClass('block');
    expect(link).not.toHaveClass('truncate');

    // ViewerLink prepends a `lucide-react` Box svg as its first child so
    // viewer links self-identify against extension-iconed FileLinks. The svg
    // sits inline-baseline (NOT inside a flex chip) so the surrounding text
    // continues to character-truncate through the parent `text-overflow:
    // ellipsis`. The icon is decorative — `aria-hidden` keeps the accessible
    // name as the filename only.
    const cube = link.querySelector('svg.lucide-box');
    expect(cube).not.toBeNull();
    expect(cube).toHaveAttribute('aria-hidden', 'true');
    expect(cube).toHaveClass('inline-block');
    expect(cube).not.toHaveClass('flex');
    // First DOM child of the link — sits before the filename text.
    expect(link.firstElementChild).toBe(cube);
  });

  it('keeps FileLink and ViewerLink keyboard-activatable (Enter and Space) since the bare span has no native activation', () => {
    render(
      <>
        <FileLink path='main.kcl'>main.kcl</FileLink>
        <ViewerLink path='.tau/artifacts/tc-1__main.glb'>tc-1__main.glb</ViewerLink>
      </>,
    );

    const fileLink = screen.getByRole('button', { name: 'main.kcl' });
    const viewerLink = screen.getByRole('button', { name: 'tc-1__main.glb' });

    // `fireEvent.keyDown` returns `false` when the React handler called
    // `preventDefault()`. The component runs without a ProjectProvider here, so
    // the activate path early-returns — what we're pinning is that the handler
    // is wired and that it prevents the default on the matching keys.
    expect(fireEvent.keyDown(fileLink, { key: 'Enter' })).toBe(false);
    expect(fireEvent.keyDown(fileLink, { key: ' ' })).toBe(false);
    expect(fireEvent.keyDown(viewerLink, { key: 'Enter' })).toBe(false);
    expect(fireEvent.keyDown(viewerLink, { key: ' ' })).toBe(false);

    // Sanity: a non-activation key must NOT be cancelled by the handler.
    expect(fireEvent.keyDown(fileLink, { key: 'Tab' })).toBe(true);
    expect(fireEvent.keyDown(viewerLink, { key: 'Tab' })).toBe(true);
  });

  it('delivers the inner link click to the link handler — NOT to a parent <button> ancestor (the chat-tool collapsible trigger)', () => {
    // Mirrors the production DOM shape: chat-tool title rows live inside a
    // `<button>` rendered by `CollapsibleTrigger asChild → Button`. The link
    // must keep its own click handler reachable when nested inside that button
    // — `<a>` would fail this because it's interactive content nested in
    // interactive content (browsers hoist the click up to the ancestor),
    // `<span>` succeeds because it's plain phrasing content.
    const ancestorButtonClick = vi.fn();
    render(
      <button type='button' onClick={ancestorButtonClick}>
        prefix <FileLink path='main.kcl'>main.kcl</FileLink> middle{' '}
        <ViewerLink path='.tau/artifacts/tc-1__main.glb'>tc-1__main.glb</ViewerLink> suffix
      </button>,
    );

    const fileLink = screen.getByRole('button', { name: 'main.kcl' });
    const viewerLink = screen.getByRole('button', { name: 'tc-1__main.glb' });

    fireEvent.click(fileLink);
    fireEvent.click(viewerLink);

    expect(ancestorButtonClick).not.toHaveBeenCalled();
  });

  it('still allows callers to override the default `inline` (e.g. chat-stack-trace uses `flex min-w-0`)', () => {
    render(
      <FileLink path='main.kcl' className='flex min-w-0'>
        main.kcl
      </FileLink>,
    );

    const link = screen.getByRole('button', { name: 'main.kcl' });
    // Both classes coexist in the cn() output. Tailwind resolves which display
    // wins via stylesheet order; what matters here is the override survives the
    // merge so legitimate non-inline callers keep working.
    expect(link).toHaveClass('flex');
    expect(link).toHaveClass('min-w-0');
  });

  it('does NOT impose `inline` when used with `asChild`, so the consumer owns its own display', () => {
    // Radix Slot concatenates classNames via plain string join (no twMerge —
    // see `@radix-ui/react-slot` source: `[a, b].filter(Boolean).join(' ')`).
    // If FileLink/ViewerLink emit an `inline` class on the asChild branch, it
    // ends up on the consumer's element alongside the consumer's `inline-flex`
    // or `flex`. Both are utility classes
    // with the same specificity, so which display value wins is decided by
    // Tailwind's CSS source order — fragile and bug-prone. The contract here
    // is that asChild merges DON'T leak a display value at all; the consumer
    // element's display (intrinsic or via its own className) is the only one
    // applied.
    render(
      <>
        <FileLink path='main.kcl' asChild>
          <span data-testid='file-asChild' className='inline-flex items-center gap-1 rounded-xs bg-purple/10 px-1.5'>
            main.kcl
          </span>
        </FileLink>
        <ViewerLink path='.tau/artifacts/tc-1__main.glb' asChild>
          <div data-testid='viewer-asChild' className='flex items-center gap-1.5 rounded-md border px-2 py-1'>
            tc-1__main.glb
          </div>
        </ViewerLink>
      </>,
    );

    const fileAsChild = screen.getByTestId('file-asChild');
    expect(fileAsChild).toHaveClass('inline-flex');
    expect(fileAsChild).not.toHaveClass('inline');

    const viewerAsChild = screen.getByTestId('viewer-asChild');
    expect(viewerAsChild).toHaveClass('flex');
    expect(viewerAsChild).not.toHaveClass('inline');

    // FileLink does NOT inject any icon (its consumers pair it with the
    // per-extension FileExtensionIcon — forcing one would conflict).
    expect(fileAsChild.querySelector('svg.lucide-box')).toBeNull();

    // ViewerLink, by contrast, MUST inject exactly one cube into the asChild
    // consumer's element — the consumer never renders its own <Box />, so the
    // duplicate-icon footgun is impossible by construction. The cube sits as
    // a sibling of the consumer's original children inside the consumer's
    // `<div>` (the asChild target), proving Slottable splicing is wired.
    const viewerCubes = viewerAsChild.querySelectorAll('svg.lucide-box');
    expect(viewerCubes.length).toBe(1);
    expect(viewerCubes[0]?.parentElement).toBe(viewerAsChild);
  });
});
