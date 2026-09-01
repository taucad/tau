/* @vitest-environment jsdom */
import { beforeAll, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { ComboBoxResponsive } from '#components/ui/combobox-responsive.js';

vi.mock('#hooks/use-mobile.js', () => ({
  useIsMobile: (): boolean => false,
}));

/** Flatten nested popovers so CommandList mounts without opening Radix modal state. */
vi.mock('#components/ui/popover.js', () => ({
  Popover: ({ children }: { readonly children: React.ReactNode }) => <div>{children}</div>,
  PopoverTrigger: ({ children }: { readonly children: React.ReactNode }) => (
    <span data-testid='popover-trigger-inner'>{children}</span>
  ),
  PopoverContent: ({ children }: { readonly children: React.ReactNode }) => (
    <div data-testid='popover-content-test'>{children}</div>
  ),
}));

vi.mock('#components/ui/drawer.js', () => ({
  Drawer: ({ children }: { readonly children: React.ReactNode }) => <div>{children}</div>,
  DrawerNestedRoot: ({ children }: { readonly children: React.ReactNode }) => <div>{children}</div>,
  DrawerContent: ({ children }: { readonly children: React.ReactNode }) => <div>{children}</div>,
  DrawerDescription: () => null,
  DrawerTitle: () => null,
  DrawerTrigger: ({ children }: { readonly children: React.ReactNode }) => (
    <span data-testid='drawer-trigger-inner'>{children}</span>
  ),
}));

vi.mock('#components/ui/loader.js', () => ({
  Loader: (): React.ReactNode => null,
}));

type Row = { readonly id: string };

beforeAll(() => {
  // Cmdk scrolls focused items into view; jsdom does not ship `scrollIntoView`.
  globalThis.HTMLElement.prototype.scrollIntoView = vi.fn();
});

describe('ComboBoxResponsive (controlled)', () => {
  const a: Row = { id: 'a' };
  const b: Row = { id: 'b' };

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
