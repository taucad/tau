import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { TooltipProvider } from '@taucad/ui/components/tooltip';
import type * as ProjectExamplesModule from '#constants/project-examples.js';
import { KeyboardProvider } from '#hooks/use-keyboard.js';
import CadCommunity, { meta } from '#routes/community/route.js';

/* A gallery of 25 so the standard page size (20) leaves a second page: 21 Replicad
   examples led by the featured one, then 4 JSCAD examples. */
vi.mock('#constants/project-examples.js', async (importOriginal) => {
  const actual = await importOriginal<typeof ProjectExamplesModule>();
  const template = actual.galleryProjects[0];
  if (!template) {
    throw new Error('Expected a curated Community project');
  }
  const galleryProjects = Array.from({ length: 25 }, (_, index) => {
    const kernel = index < 21 ? 'replicad' : 'jscad';
    const locator = index === 0 ? actual.featuredCommunityLocator : `${kernel}.example-${index}`;
    return {
      ...template,
      locator,
      kernel,
      id: `example-${index}`,
      name: index === 0 ? 'Featured Quadcopter' : `Example ${index}`,
      description: index === 3 ? 'A worm gear drive' : 'A curated example',
      tags: [],
    };
  });
  return { ...actual, galleryProjects };
});

vi.mock('#hooks/use-project-manager.js', () => ({
  useProjectManager: () => ({ createProject: vi.fn() }),
}));

vi.mock('#hooks/use-project-creation-location-error.js', () => ({
  useProjectCreationLocationError: () => vi.fn(() => false),
}));

vi.mock('#hooks/use-cad-preview.js', () => ({
  CadPreviewProvider: ({ children }: { readonly children: React.ReactNode }) => <div>{children}</div>,
}));

vi.mock('#components/cad-preview.js', () => ({
  CadPreviewViewer: () => <div data-testid='cad-preview-viewer' />,
}));

function LocationProbe(): React.JSX.Element {
  const location = useLocation();
  return <div data-testid='location'>{`${location.pathname}${location.search}`}</div>;
}

function renderCommunity(entry = '/community'): void {
  render(
    <KeyboardProvider>
      <TooltipProvider>
        <MemoryRouter initialEntries={[entry]}>
          <Routes>
            <Route path='/community' element={<CadCommunity />} />
          </Routes>
          <LocationProbe />
        </MemoryRouter>
      </TooltipProvider>
    </KeyboardProvider>,
  );
}

const cardNames = (): string[] =>
  within(screen.getByRole('list'))
    .getAllByRole('heading', { level: 2 })
    .map((heading) => heading.textContent);

describe('Community route', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('should name the document and describe the gallery', () => {
    const tags = meta({} as Parameters<typeof meta>[0]);

    expect(tags).toContainEqual({ title: 'Community · Tau' });
    expect(tags).toContainEqual(expect.objectContaining({ name: 'description' }));
  });

  it('should lead the unfiltered first page with the featured card, a status and the kernel shelf', () => {
    renderCommunity();

    expect(screen.getByRole('heading', { level: 1, name: 'Community' })).toBeInTheDocument();
    expect(screen.getByRole('status')).toHaveTextContent('25 examples');
    expect(screen.getAllByRole('listitem')).toHaveLength(20);
    expect(screen.getAllByRole('listitem')[0]).toHaveClass('col-span-2', 'lg:row-span-2');
    expect(screen.getByText('Featured')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Open Featured Quadcopter' })).toBeInTheDocument();

    const shelf = screen.getByRole('radiogroup', { name: 'Kernel' });
    const tiles = within(shelf).getAllByRole('radio');
    expect(tiles.map((tile) => tile.textContent)).toEqual([
      'All kernels 25 Every example',
      'Replicad 21 TypeScript CAD for precise engineering',
      'JSCAD 4 TypeScript CAD for Constructive Solid Geometry',
    ]);
    expect(within(shelf).getByRole('radio', { name: /^All kernels/u })).toHaveAttribute('aria-checked', 'true');
    expect(screen.getByRole('searchbox', { name: 'Search examples' })).toHaveAttribute(
      'placeholder',
      'Search examples…',
    );
    expect(screen.getByRole('link', { name: 'New project' })).toHaveAttribute('href', '/projects/new');
    expect(screen.queryByRole('button', { name: 'Clear' })).not.toBeInTheDocument();
  });

  it('should page 20 then the rest and drop the featured span after the first page', async () => {
    renderCommunity();

    await userEvent.click(screen.getByRole('button', { name: 'Go to next page' }));

    expect(screen.getAllByRole('listitem')).toHaveLength(5);
    expect(cardNames()).toEqual(['Example 20', 'Example 21', 'Example 22', 'Example 23', 'Example 24']);
    expect(screen.queryByText('Featured')).not.toBeInTheDocument();
  });

  it('should write the kernel and query to the URL, show a match status and restart at page one', async () => {
    renderCommunity();
    await userEvent.click(screen.getByRole('button', { name: 'Go to next page' }));

    await userEvent.click(screen.getByRole('radio', { name: /^Replicad/u }));

    expect(screen.getByTestId('location')).toHaveTextContent('/community?kernel=replicad');
    expect(screen.getByRole('status')).toHaveTextContent('21 of 25 match');
    expect(screen.getAllByRole('listitem')).toHaveLength(20);
    expect(screen.queryByText('Featured')).not.toBeInTheDocument();
    expect(screen.getAllByRole('listitem')[0]).not.toHaveClass('col-span-2');

    await userEvent.type(screen.getByRole('searchbox', { name: 'Search examples' }), 'worm');

    expect(screen.getByTestId('location')).toHaveTextContent('/community?kernel=replicad&q=worm');
    expect(screen.getByRole('status')).toHaveTextContent('1 of 25 match');
    expect(cardNames()).toEqual(['Example 3']);

    await userEvent.click(screen.getByRole('button', { name: 'Clear' }));

    expect(screen.getByTestId('location')).toHaveTextContent(/^\/community$/u);
    expect(screen.getByRole('status')).toHaveTextContent('25 examples');
  });

  it('should reproduce the view from a shared URL and ignore a kernel without examples', () => {
    renderCommunity('/community?kernel=jscad&q=example');

    expect(screen.getByRole('radio', { name: /^JSCAD/u })).toHaveAttribute('aria-checked', 'true');
    expect(screen.getByRole('searchbox', { name: 'Search examples' })).toHaveValue('example');
    expect(screen.getByRole('status')).toHaveTextContent('4 of 25 match');
  });

  it('should read an unknown kernel as every kernel', () => {
    renderCommunity('/community?kernel=zoo');

    expect(screen.getByRole('radio', { name: /^All kernels/u })).toHaveAttribute('aria-checked', 'true');
    expect(screen.getByRole('status')).toHaveTextContent('25 examples');
  });

  it('should show a no-match state whose action clears every filter', async () => {
    renderCommunity('/community?q=zzzz&kernel=jscad');

    expect(screen.queryByRole('list')).not.toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'No examples match “zzzz”' })).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: 'Clear filters' }));

    expect(screen.getByTestId('location')).toHaveTextContent(/^\/community$/u);
    expect(screen.getAllByRole('listitem')).toHaveLength(20);
  });

  it('should focus the search field on /', async () => {
    renderCommunity();

    await userEvent.keyboard('/');

    expect(screen.getByRole('searchbox', { name: 'Search examples' })).toHaveFocus();
  });

  describe('card anchors', () => {
    beforeEach(() => {
      Element.prototype.scrollIntoView = vi.fn();
    });

    it('should open the page holding #<locator>, scroll the card into view and focus its link', async () => {
      renderCommunity('/community#jscad.example-22');

      expect(screen.getAllByRole('listitem')).toHaveLength(5);
      const link = screen.getByRole('link', { name: 'Open Example 22' });
      await waitFor(() => {
        expect(link).toHaveFocus();
      });
      expect(screen.getAllByRole('listitem').find((item) => item.id === 'jscad.example-22')).toContainElement(link);
      expect(Element.prototype.scrollIntoView).toHaveBeenCalledWith({ block: 'center' });
    });

    it('should count the page after filters', async () => {
      renderCommunity('/community?kernel=jscad#jscad.example-22');

      expect(screen.getAllByRole('listitem')).toHaveLength(4);
      await waitFor(() => {
        expect(screen.getByRole('link', { name: 'Open Example 22' })).toHaveFocus();
      });
    });

    it('should stay on the first page for a locator the filters exclude', () => {
      renderCommunity('/community?kernel=jscad#replicad.example-5');

      expect(screen.getAllByRole('listitem')).toHaveLength(4);
      expect(screen.queryByRole('link', { name: 'Open Example 5' })).not.toBeInTheDocument();
    });
  });
});
