// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { VirtuosoMockContext } from 'react-virtuoso';
import { PaneVirtualList } from '#components/panes/pane-virtual-list.js';

const rows = Array.from({ length: 1709 }, (_, index) => `Part ${index + 1}`);
const itemKey = (item: string): string => item;
const itemContent = (_index: number, item: string): React.JSX.Element => <button type='button'>{item}</button>;
const mockViewport = { viewportHeight: 180, itemHeight: 30 };

beforeEach(() => {
  vi.spyOn(HTMLElement.prototype, 'offsetHeight', 'get').mockReturnValue(180);
  vi.spyOn(HTMLElement.prototype, 'scrollHeight', 'get').mockReturnValue(1709 * 30);
  vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockReturnValue({
    top: 0,
    left: 0,
    right: 300,
    bottom: 180,
    width: 300,
    height: 180,
    x: 0,
    y: 0,
    // eslint-disable-next-line @typescript-eslint/naming-convention -- DOMRect uses the standard toJSON method.
    toJSON: () => ({}),
  });
  Object.defineProperty(HTMLElement.prototype, 'scrollIntoView', { configurable: true, value: vi.fn() });
  Object.defineProperty(HTMLElement.prototype, 'scrollTo', {
    configurable: true,
    value: vi.fn(function (this: HTMLElement, options: ScrollToOptions) {
      if (typeof options === 'object') {
        this.scrollTop = options.top ?? 0;
        fireEvent.scroll(this);
      }
    }),
  });
});
afterEach(() => {
  cleanup();
  Reflect.deleteProperty(HTMLElement.prototype, 'scrollIntoView');
  Reflect.deleteProperty(HTMLElement.prototype, 'scrollTo');
  vi.restoreAllMocks();
});

const renderList = (data = rows) =>
  render(
    <VirtuosoMockContext.Provider value={mockViewport}>
      <PaneVirtualList
        enableKeyboardNavigation
        data={data}
        getItemKey={itemKey}
        itemContent={itemContent}
        ariaLabel='Parts'
      />
    </VirtuosoMockContext.Provider>,
  );

describe('PaneVirtualList', () => {
  it('should bound mounted rows for a 1709-part collection and expose full positions', async () => {
    renderList();
    await screen.findByRole('button', { name: 'Part 1' });
    const mounted = screen.getAllByRole('listitem');
    expect(mounted.length).toBeLessThan(30);
    expect(mounted[0]).toHaveAttribute('aria-posinset', '1');
    expect(mounted[0]).toHaveAttribute('aria-setsize', '1709');
    expect(screen.queryByRole('button', { name: 'Part 1709' })).toBeNull();
  });

  it('should reach offscreen rows with End and restore the first row with Home', async () => {
    renderList();
    const first = await screen.findByRole('button', { name: 'Part 1' });
    first.focus();
    fireEvent.keyDown(first, { key: 'End' });
    const last = await screen.findByRole('button', { name: 'Part 1709' });
    await waitFor(() => {
      expect(last).toHaveFocus();
    });
    expect(screen.getAllByRole('listitem').length).toBeLessThan(30);
    fireEvent.keyDown(last, { key: 'Home' });
    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Part 1' })).toHaveFocus();
    });
  });

  it('should retain natural small-list layout and one primary Tab stop', async () => {
    renderList(rows.slice(0, 3));
    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Part 2' })).toHaveAttribute('tabindex', '-1');
    });
    const first = screen.getByRole('button', { name: 'Part 1' });
    first.focus();
    fireEvent.keyDown(first, { key: 'ArrowDown' });
    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Part 2' })).toHaveFocus();
    });
    expect(first).toHaveAttribute('tabindex', '-1');
    expect(screen.getAllByRole('listitem')).toHaveLength(3);
  });
  it('should consume a reveal once and preserve subsequent search focus', async () => {
    const reveal = { key: 'Part 1709', requestId: 1 };
    const view = (data: string[]) => (
      <VirtuosoMockContext.Provider value={mockViewport}>
        <input aria-label='Filter' />
        <PaneVirtualList data={data} getItemKey={itemKey} itemContent={itemContent} ariaLabel='Parts' reveal={reveal} />
      </VirtuosoMockContext.Provider>
    );
    const { rerender } = render(view(rows));
    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Part 1709' })).toHaveFocus();
    });
    const filter = screen.getByRole('textbox', { name: 'Filter' });
    filter.focus();
    rerender(view(rows.filter((row) => row.includes('170'))));
    await waitFor(() => {
      expect(filter).toHaveFocus();
    });
  });

  it('should bridge Tab across the virtual window and skip disabled-only rows', async () => {
    const content = (_index: number, item: string) =>
      item === 'Part 6' ? (
        <input disabled role='spinbutton' aria-label={item} />
      ) : (
        <>
          <input aria-label={item} />
          <input disabled role='spinbutton' aria-label={`Disabled ${item}`} />
        </>
      );
    render(
      <VirtuosoMockContext.Provider value={mockViewport}>
        <PaneVirtualList data={rows} getItemKey={itemKey} itemContent={content} ariaLabel='Parts' />
      </VirtuosoMockContext.Provider>,
    );
    await screen.findByRole('textbox', { name: 'Part 1' });
    const last = screen.getAllByRole('textbox').at(-1)!;
    const next = Number(last.getAttribute('aria-label')?.slice(5)) + 1;
    last.focus();
    fireEvent.keyDown(last, { key: 'Tab' });
    await waitFor(() => {
      expect(screen.getByRole('textbox', { name: `Part ${next === 6 ? 7 : next}` })).toHaveFocus();
    });
  });
});
