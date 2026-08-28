/* @vitest-environment jsdom */
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Fragment } from 'react';
import { ComboBoxResponsive } from '#components/ui/combobox-responsive.js';

const mobileState = vi.hoisted(() => ({ current: false }));

vi.mock('#hooks/use-mobile.js', () => ({
  useIsMobile: (): boolean => mobileState.current,
}));

/** Flatten nested popovers so CommandList mounts without opening Radix modal state. */
vi.mock('#components/ui/popover.js', () => ({
  Popover: ({ children }: { readonly children: React.ReactNode }) => <div data-testid='popover-root'>{children}</div>,
  PopoverTrigger: ({ children }: { readonly children: React.ReactNode }) => (
    <span data-testid='popover-trigger-inner'>{children}</span>
  ),
  PopoverContent: ({ children }: { readonly children: React.ReactNode }) => (
    <div data-testid='popover-content-test'>{children}</div>
  ),
}));

vi.mock('#components/ui/drawer.js', () => ({
  Drawer: ({ children }: { readonly children: React.ReactNode }) => <div data-testid='drawer-root'>{children}</div>,
  DrawerNestedRoot: ({ children }: { readonly children: React.ReactNode }) => (
    <div data-testid='drawer-nested-root'>{children}</div>
  ),
  DrawerContent: ({ children }: { readonly children: React.ReactNode }) => (
    <div data-testid='drawer-content-test'>{children}</div>
  ),
  DrawerDescription: () => null,
  DrawerTitle: () => null,
  DrawerTrigger: ({ children }: { readonly children: React.ReactNode }) => (
    <span data-testid='drawer-trigger-inner'>{children}</span>
  ),
}));

vi.mock('#components/ui/loader.js', () => ({
  Loader: (): React.ReactNode => null,
}));

vi.mock('react-virtuoso', () => ({
  Virtuoso: ({
    totalCount,
    itemContent,
  }: {
    readonly totalCount: number;
    readonly itemContent: (index: number) => React.ReactNode;
  }) => (
    <div>
      {Array.from({ length: totalCount }, (_, index) => (
        <Fragment key={index}>{itemContent(index)}</Fragment>
      ))}
    </div>
  ),
}));

type Row = { readonly id: string };

beforeAll(() => {
  // Cmdk scrolls focused items into view; jsdom does not ship `scrollIntoView`.
  globalThis.HTMLElement.prototype.scrollIntoView = vi.fn();
});

describe('ComboBoxResponsive (controlled)', () => {
  const a: Row = { id: 'a' };
  const b: Row = { id: 'b' };

  beforeEach(() => {
    mobileState.current = false;
  });

  const renderResponsive = (isNested = false): void => {
    render(
      <ComboBoxResponsive<Row>
        title='Pick'
        description='Pick one.'
        groupedItems={[{ name: 'G', items: [a, b] }]}
        getValue={(item) => item.id}
        value={a}
        isSearchEnabled={false}
        renderLabel={(item) => <span>{item.id}</span>}
        placeholder='Pick'
        isNested={isNested}
      >
        <button type='button'>Trigger</button>
      </ComboBoxResponsive>,
    );
  };

  it('uses a popover on desktop', () => {
    renderResponsive();
    expect(screen.getByTestId('popover-root')).toBeInTheDocument();
    expect(screen.getByTestId('popover-content-test')).toBeInTheDocument();
    expect(screen.queryByTestId('drawer-root')).not.toBeInTheDocument();
  });

  it('uses a root drawer on standalone mobile surfaces', () => {
    mobileState.current = true;
    renderResponsive();
    expect(screen.getByTestId('drawer-root')).toBeInTheDocument();
    expect(screen.getByTestId('drawer-content-test')).toBeInTheDocument();
    expect(screen.queryByTestId('drawer-nested-root')).not.toBeInTheDocument();
    expect(screen.queryByTestId('popover-root')).not.toBeInTheDocument();
  });

  it('uses a nested drawer inside mobile chat options', () => {
    mobileState.current = true;
    renderResponsive(true);
    expect(screen.getByTestId('drawer-nested-root')).toBeInTheDocument();
    expect(screen.getByTestId('drawer-content-test')).toBeInTheDocument();
    expect(screen.queryByTestId('drawer-root')).not.toBeInTheDocument();
    expect(screen.queryByTestId('popover-root')).not.toBeInTheDocument();
  });

  it('should filter non-virtualized options through the shared search input', async () => {
    render(
      <ComboBoxResponsive<Row>
        title='Pick'
        description='Pick one.'
        groupedItems={[{ name: 'Rows', items: [{ id: 'alpha' }, { id: 'beta' }] }]}
        getValue={(item) => item.id}
        renderLabel={(item) => <span>{item.id}</span>}
        searchPlaceHolder='Filter rows...'
      >
        <button type='button'>Trigger</button>
      </ComboBoxResponsive>,
    );

    await userEvent.type(screen.getByPlaceholderText('Filter rows...'), 'alpha');

    expect(screen.getByText('alpha')).toBeInTheDocument();
    expect(screen.queryByText('beta')).not.toBeInTheDocument();
  });

  it('should filter virtualized options through the shared search input', async () => {
    render(
      <ComboBoxResponsive<Row>
        title='Pick'
        description='Pick one.'
        groupedItems={[{ name: 'Rows', items: [{ id: 'alpha' }, { id: 'beta' }] }]}
        getValue={(item) => item.id}
        renderLabel={(item) => <span>{item.id}</span>}
        searchPlaceHolder='Filter rows...'
        withVirtualization
      >
        <button type='button'>Trigger</button>
      </ComboBoxResponsive>,
    );

    await userEvent.type(screen.getByPlaceholderText('Filter rows...'), 'beta');

    expect(screen.queryByText('alpha')).not.toBeInTheDocument();
    expect(screen.getByText('beta')).toBeInTheDocument();
  });

  it('rebinds dropdown selection highlight when `value` changes across re-renders', () => {
    function RowLabel(props: { readonly row: Row; readonly selected: Row | undefined }) {
      const picked = props.selected?.id === props.row.id;
      return (
        <span data-picked={picked} data-testid={`row-${props.row.id}`}>
          {props.row.id}
        </span>
      );
    }

    const { rerender } = render(
      <ComboBoxResponsive<Row>
        title='Pick'
        description='Pick one.'
        groupedItems={[{ name: 'G', items: [a, b] }]}
        getValue={(item) => item.id}
        value={a}
        isSearchEnabled={false}
        renderLabel={(item, selected) => <RowLabel row={item} selected={selected} />}
        placeholder='Pick'
      >
        <button type='button'>Trigger</button>
      </ComboBoxResponsive>,
    );

    expect(screen.getByTestId('popover-content-test')).toBeInTheDocument();
    expect(screen.getByTestId('row-a').dataset['picked']).toBe('true');
    expect(screen.getByTestId('row-b').dataset['picked']).toBe('false');

    rerender(
      <ComboBoxResponsive<Row>
        title='Pick'
        description='Pick one.'
        groupedItems={[{ name: 'G', items: [a, b] }]}
        getValue={(item) => item.id}
        value={b}
        isSearchEnabled={false}
        renderLabel={(item, selected) => <RowLabel row={item} selected={selected} />}
        placeholder='Pick'
      >
        <button type='button'>Trigger</button>
      </ComboBoxResponsive>,
    );

    expect(screen.getByTestId('row-a').dataset['picked']).toBe('false');
    expect(screen.getByTestId('row-b').dataset['picked']).toBe('true');
  });
});
