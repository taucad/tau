import { useState } from 'react';
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { ComboBoxResponsive } from '#components/combobox-responsive.js';
import { ResponsiveSurfaceProvider } from '#hooks/use-mobile.js';

beforeAll(() => {
  globalThis.HTMLElement.prototype.scrollIntoView = vi.fn();
});

beforeEach(() => {
  // Vaul reads the media query when a drawer opens; jsdom has none.
  vi.stubGlobal(
    'matchMedia',
    (query: string): MediaQueryList =>
      ({
        matches: false,
        media: query,
        addEventListener: () => undefined,
        removeEventListener: () => undefined,
      }) as unknown as MediaQueryList,
  );
});

afterEach(() => {
  vi.unstubAllGlobals();
});

/** The kernel selector's shape: a short list and a More level (blueprint D8). */
function KernelPicker({
  onSelect,
  onSearch,
}: {
  readonly onSelect: (value: string) => void;
  readonly onSearch?: (search: string) => void;
}): React.JSX.Element {
  const [search, setSearch] = useState('');
  return (
    <ComboBoxResponsive
      title='Select kernel'
      description='Choose the kernel for this chat.'
      groupedItems={[
        { name: 'BRep', items: ['Replicad'] },
        { name: 'Mesh', items: ['OpenSCAD'] },
      ]}
      subViews={[
        {
          id: 'more',
          label: <span>More kernels</span>,
          title: 'More kernels',
          groupedItems: [
            { name: 'BRep', items: ['OpenCascade'] },
            { name: 'Mesh', items: ['Manifold', 'JSCAD'] },
          ],
        },
      ]}
      search={search}
      getValue={(item) => item}
      renderLabel={(item) => item}
      searchPlaceHolder='Search kernels…'
      onSearchChange={(next) => {
        setSearch(next);
        onSearch?.(next);
      }}
      onSelect={onSelect}
    >
      <button type='button'>Kernel</button>
    </ComboBoxResponsive>
  );
}

const options = (): string[] => screen.getAllByRole('option').map((option) => option.textContent);

describe.each([
  ['a wide screen', false],
  ['a phone', true],
] as const)('ComboBoxResponsive sub-views on %s', (_name, isMobile) => {
  const open = async (onSelect = vi.fn<(value: string) => void>(), onSearch?: (search: string) => void) => {
    const user = userEvent.setup();
    render(
      <ResponsiveSurfaceProvider isMobile={isMobile} container={undefined}>
        <KernelPicker onSelect={onSelect} onSearch={onSearch} />
      </ResponsiveSurfaceProvider>,
    );
    await user.click(screen.getByRole('button', { name: 'Kernel' }));
    await screen.findByRole('dialog');
    /* A phone's drawer reads its drag transform on every press, which jsdom does not compute: rows are tapped as
       clicks there, as the drawer tests do. */
    const click = async (element: HTMLElement): Promise<void> => {
      if (isMobile) {
        fireEvent.click(element);
        return;
      }
      await user.click(element);
    };
    const focusSearch = (): void => {
      act(() => {
        screen.getByPlaceholderText('Search kernels…').focus();
      });
    };
    return { user, onSelect, click, focusSearch };
  };

  it('should replace the list with the sub-view and a Back row, in one surface', async () => {
    const { click } = await open();
    expect(options()).toEqual(['Replicad', 'OpenSCAD', 'More kernels']);

    await click(screen.getByRole('option', { name: 'More kernels' }));
    expect(screen.getAllByRole('dialog')).toHaveLength(1);
    expect(options()).toEqual(['More kernels', 'OpenCascade', 'Manifold', 'JSCAD']);
    expect(screen.getByRole('option', { name: 'Back to Select kernel' })).toHaveTextContent('More kernels');
    await waitFor(() => {
      expect(screen.getByRole('option', { name: 'OpenCascade' })).toHaveAttribute('aria-selected', 'true');
    });
  });

  it('should step back on the Back row, Escape and Backspace in an empty search, highlighting the row it left', async () => {
    const { user, click, focusSearch } = await open();
    const more = (): HTMLElement => screen.getByRole('option', { name: 'More kernels' });

    await click(more());
    await click(screen.getByRole('option', { name: 'Back to Select kernel' }));
    expect(options()).toEqual(['Replicad', 'OpenSCAD', 'More kernels']);
    await waitFor(() => {
      expect(more()).toHaveAttribute('aria-selected', 'true');
    });

    await click(more());
    focusSearch();
    await user.keyboard('{Backspace}');
    expect(options()).toEqual(['Replicad', 'OpenSCAD', 'More kernels']);

    await click(more());
    focusSearch();
    await user.keyboard('{Escape}');
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    expect(options()).toEqual(['Replicad', 'OpenSCAD', 'More kernels']);

    await user.keyboard('{Escape}');
    await waitFor(() => {
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    });
  });

  it('should search every level, through a controlled search value', async () => {
    const onSearch = vi.fn<(search: string) => void>();
    const { user, onSelect, focusSearch } = await open(undefined, onSearch);
    focusSearch();
    await user.keyboard('jscad');

    expect(onSearch).toHaveBeenLastCalledWith('jscad');
    const list = screen.getByRole('listbox');
    expect(within(list).getByRole('option', { name: 'JSCAD' })).toBeInTheDocument();
    expect(within(list).queryByRole('option', { name: 'More kernels' })).not.toBeInTheDocument();

    await user.keyboard('{Enter}');
    expect(onSelect).toHaveBeenCalledWith('JSCAD');
  });
});
