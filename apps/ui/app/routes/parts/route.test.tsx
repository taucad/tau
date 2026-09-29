import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, useLocation } from 'react-router';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { TooltipProvider } from '@taucad/ui/components/tooltip';
import { KeyboardProvider } from '#hooks/use-keyboard.js';
import Parts from '#routes/parts/route.js';

const state = vi.hoisted(() => ({ enabled: true }));
vi.mock('#flags/use-feature.js', () => ({ useFeature: () => state.enabled }));
vi.mock('#constants/warehouse-parts.js', () => ({
  warehouseProjects: Array.from({ length: 25 }, (_, index) => ({
    locator: `warehouse.part-${index}`,
    kernel: 'replicad',
    id: `part-${index}`,
    name: `Part ${index}`,
    description: index === 24 ? 'Slotted bracket for a motor' : 'A reusable part',
    tags: [index < 20 ? 'fasteners' : 'brackets'],
    assets: { main: { entryPath: 'main.ts' } },
    fileAssets: [],
  })),
}));
vi.mock('#hooks/use-project-manager.js', () => ({ useProjectManager: () => ({ createProject: vi.fn() }) }));
vi.mock('#hooks/use-project-creation-location-error.js', () => ({
  useProjectCreationLocationError: () => vi.fn(() => false),
}));
vi.mock('#hooks/use-cad-preview.js', () => ({
  CadPreviewProvider: ({ children }: { readonly children: React.ReactNode }) => <div>{children}</div>,
}));
vi.mock('#components/cad-preview.js', () => ({ CadPreviewViewer: () => <div /> }));

const LocationProbe = (): React.JSX.Element => {
  const { search } = useLocation();
  return <output aria-label='Current query'>{search}</output>;
};
const renderParts = (entry = '/parts'): void => {
  render(
    <KeyboardProvider>
      <TooltipProvider>
        <MemoryRouter initialEntries={[entry]}>
          <Parts />
          <LocationProbe />
        </MemoryRouter>
      </TooltipProvider>
    </KeyboardProvider>,
  );
};

describe('Parts route', () => {
  beforeEach(() => {
    state.enabled = true;
  });

  it('should paginate the catalog and link to an editable part', async () => {
    renderParts();
    expect(screen.getAllByRole('listitem')).toHaveLength(20);
    expect(screen.getByRole('heading', { level: 1, name: 'Parts' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Open Part 0' })).toHaveAttribute('href', '/s/builtin~warehouse.part-0');
    await userEvent.click(screen.getByRole('button', { name: 'Go to next page' }));
    expect(screen.getAllByRole('listitem')).toHaveLength(5);
  });

  it('should find a matching description beyond the first page', () => {
    renderParts();
    fireEvent.change(screen.getByRole('searchbox', { name: 'Search parts' }), { target: { value: 'motor' } });
    expect(screen.getAllByRole('listitem')).toHaveLength(1);
    expect(screen.getByRole('link', { name: 'Open Part 24' })).toBeInTheDocument();
    expect(screen.getByLabelText('Current query')).toHaveTextContent('?q=motor');
  });

  it('should restore category filters from the URL and update the selected category', async () => {
    renderParts('/parts?category=brackets');
    expect(screen.getAllByRole('listitem')).toHaveLength(5);
    expect(screen.getByRole('button', { name: 'Category: Brackets' })).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Category: Brackets' }));
    expect(screen.getByRole('menuitemradio', { name: 'Brackets' })).toHaveAttribute('aria-checked', 'true');
    await userEvent.click(screen.getByRole('menuitemradio', { name: 'Fasteners' }));
    expect(screen.getAllByRole('listitem')).toHaveLength(20);
    expect(screen.getByLabelText('Current query')).toHaveTextContent('?category=fasteners');
  });

  it('should clear the category and search after no parts match', async () => {
    renderParts('/parts?category=brackets');
    fireEvent.change(screen.getByRole('searchbox', { name: 'Search parts' }), { target: { value: 'missing' } });
    expect(screen.queryByRole('list')).not.toBeInTheDocument();
    expect(screen.getByText('No parts match “missing”')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Clear filters' }));
    expect(screen.getAllByRole('listitem')).toHaveLength(20);
    expect(screen.getByRole('button', { name: 'Category: All categories' })).toBeInTheDocument();
    expect(screen.getByLabelText('Current query')).toBeEmptyDOMElement();
  });

  it('should hide catalog access when the flag is disabled and offer its settings', async () => {
    state.enabled = false;
    renderParts();
    expect(screen.getByText('Parts is turned off')).toBeInTheDocument();
    expect(screen.queryByRole('searchbox')).not.toBeInTheDocument();
    expect(screen.queryByRole('list')).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Open settings' }));
    expect(screen.getByLabelText('Current query')).toHaveTextContent('?settings=experimental');
  });
});
