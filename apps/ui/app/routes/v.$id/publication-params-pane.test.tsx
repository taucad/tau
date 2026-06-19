import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { PublicationParamsPane } from '#routes/v.$id/publication-params-pane.js';
import type { ParsedPublication } from '#routes/v.$id/parsed-publication.js';

vi.mock('@xstate/react', () => ({
  useSelector: vi.fn(() => ({})),
}));

vi.mock('#components/geometry/parameters/parameters.js', () => ({
  Parameters: () => <div data-slot='parameters-stub' />,
}));

vi.mock('#components/files/export-selector.js', () => ({
  ExportSelector: () => <div data-slot='export-selector-stub' />,
}));

const cadPreviewMocks = vi.hoisted(() => ({ geometries: [] as unknown[] }));

vi.mock('#hooks/use-cad-preview.js', () => ({
  useCadPreview: () => ({
    cadRef: {},
    defaultParameters: {},
    geometries: cadPreviewMocks.geometries,
    jsonSchema: undefined,
    setParameters: vi.fn(),
  }),
}));

const publication: ParsedPublication = {
  id: 'pub_pd',
  title: 'PD',
  visibility: 'public',
  viewerRole: 'public',
  entryFile: 'main.ts',
  ownerSnapshot: null,
  forkCount: 0,
  viewCount: 0,
  createdAt: '2025-01-01T00:00:00.000Z',
};

describe('PublicationParamsPane', () => {
  it('fills its grid cell vertically (h-full + min-h-0)', () => {
    cadPreviewMocks.geometries = [{ id: 'g1' }];
    const { container } = render(<PublicationParamsPane publication={publication} />);
    const root = container.querySelector('[data-slot="publication-params-pane"]');
    expect(root).not.toBeNull();
    expect(root?.className).toContain('h-full');
    expect(root?.className).toContain('min-h-0');
  });

  it('exposes both regions via aria-label for assistive tech', () => {
    cadPreviewMocks.geometries = [];
    render(<PublicationParamsPane publication={publication} />);
    expect(screen.getByRole('region', { name: 'Parameters' })).toBeDefined();
    expect(screen.getByRole('region', { name: 'Downloads' })).toBeDefined();
  });

  it('shows the empty-state hint when no geometry has rendered yet', () => {
    cadPreviewMocks.geometries = [];
    render(<PublicationParamsPane publication={publication} />);
    expect(screen.getByText(/render the geometry to enable export/iu)).toBeDefined();
  });
});
