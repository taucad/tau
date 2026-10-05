import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { VirtuosoMockContext } from 'react-virtuoso';
import { mock } from 'vitest-mock-extended';
import type { GeometryComponentNode } from '@taucad/types';
import { PartPropertiesPanel } from '#components/geometry/cad/part-properties-panel.js';
import { projectPartInspection } from '#components/geometry/cad/part-quantities.js';

const mockViewport = { viewportHeight: 180, itemHeight: 30 };

describe('PartPropertiesPanel', () => {
  it('should show an empty selection without inventing physical facts', () => {
    render(<PartPropertiesPanel />);
    expect(screen.getByText('No part selected')).toBeVisible();
    expect(screen.queryByText('Weight')).not.toBeInTheDocument();
  });

  it('should disclose indexed source appearance and keep volume unmeasured', async () => {
    const appearance: NonNullable<GeometryComponentNode['appearance']> = {
      materials: [{ materialIndex: 2, name: 'Carbon fabric', textures: { baseColor: { index: 5 } } }],
    };
    const node: GeometryComponentNode = {
      ...mock<GeometryComponentNode>(),
      name: 'Housing',
      kind: 'part',
      appearance,
    };
    render(<PartPropertiesPanel node={node} entryPath='src/housing.ts' />);
    expect(screen.getByText('Housing')).toBeVisible();
    expect(screen.getByText('Carbon fabric')).toBeVisible();
    expect(screen.getAllByText('Not measured')).toHaveLength(2);
    expect(screen.getByText('Volume not measured yet.')).toBeVisible();
    expect(screen.queryByText('Retry')).not.toBeInTheDocument();

    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: /Carbon fabric/ }));
    expect(screen.getByText('baseColor: source texture index 5')).toBeVisible();
    expect(screen.getByText(/Material 3 of the source file/)).toBeVisible();
    await user.click(screen.getByRole('button', { name: 'Details' }));
    expect(screen.getByText('Not supplied; a finish is not a material')).toBeVisible();
  });
  it('opens the gallery from an 80 px identity frame and hides that row on request', async () => {
    const node: GeometryComponentNode = { ...mock<GeometryComponentNode>(), name: 'Housing', kind: 'part' };
    const open = vi.fn();
    Object.defineProperty(URL, 'createObjectURL', { configurable: true, value: vi.fn(() => 'blob:housing') });
    Object.defineProperty(URL, 'revokeObjectURL', { configurable: true, value: vi.fn() });
    const preview = { status: 'ready', bytes: new Uint8Array([1]) } as const;
    const { rerender } = render(<PartPropertiesPanel node={node} preview={preview} onOpenPreview={open} />);
    const frame = screen.getByRole('button', { name: 'Preview Housing' });
    expect(frame).toHaveClass('size-20', 'rounded-xs');
    await userEvent.setup().click(frame);
    expect(open).toHaveBeenCalledWith(frame);

    rerender(<PartPropertiesPanel node={node} preview={preview} onOpenPreview={open} isIdentityHidden />);
    expect(screen.queryByRole('button', { name: 'Preview Housing' })).toBeNull();
    expect(screen.getByRole('region', { name: 'Physical facts' })).toBeVisible();
  });

  it('shows the material swatch, not a control, while a part has no preview image', () => {
    const node: GeometryComponentNode = {
      ...mock<GeometryComponentNode>(),
      name: 'Housing',
      kind: 'part',
      appearance: { materials: [{ materialIndex: 0, color: 'unavailable' }] },
    };
    render(<PartPropertiesPanel node={node} preview={{ status: 'pending' }} onOpenPreview={vi.fn()} />);
    expect(screen.queryByRole('button', { name: 'Preview Housing' })).toBeNull();
    expect(document.querySelector('[data-slot="part-properties"] [data-slot="material-swatch"]')).not.toBeNull();
  });

  it('should bound a generated collection of 1709 appearance disclosures', async () => {
    const node: GeometryComponentNode = {
      ...mock<GeometryComponentNode>(),
      id: 'many-materials',
      name: 'Assembly part',
      kind: 'part',
      appearance: {
        materials: Array.from({ length: 1709 }, (_, materialIndex) => ({
          materialIndex,
          name: `Finish ${materialIndex + 1}`,
        })),
      },
    };
    render(
      <VirtuosoMockContext.Provider value={mockViewport}>
        <PartPropertiesPanel node={node} />
      </VirtuosoMockContext.Provider>,
    );
    await screen.findByRole('button', { name: 'Finish 1' });
    expect(screen.getAllByRole('listitem').length).toBeLessThan(30);
    expect(screen.queryByRole('button', { name: 'Finish 1709' })).toBeNull();
  });

  it('shows preview loading and lets a failed preview retry without losing part facts', async () => {
    const node: GeometryComponentNode = { ...mock<GeometryComponentNode>(), name: 'Housing', kind: 'part' };
    const retry = vi.fn();
    const { rerender } = render(<PartPropertiesPanel node={node} preview={{ status: 'pending' }} />);
    expect(screen.getByText('Preview loading')).toBeVisible();
    rerender(<PartPropertiesPanel node={node} preview={{ status: 'failed' }} onRetryPreview={retry} />);
    expect(screen.getByText('Preview unavailable')).toBeVisible();
    await userEvent.setup().click(screen.getByRole('button', { name: 'Retry preview' }));
    expect(retry).toHaveBeenCalledOnce();
    expect(screen.getByText('Housing')).toBeVisible();
  });

  it('shows authored density, native volume, and last-committed provenance during a preview', async () => {
    const node = mock<GeometryComponentNode>({ id: 'housing', name: 'Housing', kind: 'part' });
    const committedNode = mock<GeometryComponentNode>({
      id: 'housing',
      kind: 'part',
      physical: {
        volume: {
          state: 'measured',
          valueMm3: 12_480,
          geometryDigest: `sha256:${'a'.repeat(64)}`,
          method: 'occt-solid-volume',
          validity: 'closed-solid',
        },
        density: {
          // eslint-disable-next-line @typescript-eslint/naming-convention -- Unit-bearing physical field uses cm³ notation.
          valueGPerCm3: 1.55,
          provenance: 'authored-shape-config',
        },
      },
    });
    render(
      <PartPropertiesPanel
        node={node}
        inspection={projectPartInspection({ node, committedNode, transientPreview: true })}
      />,
    );
    expect(screen.getByText('Last committed physical facts; preview geometry is transient.')).toBeVisible();
    expect(screen.getByText('1.55 g/cm³')).toBeVisible();
    expect(screen.getByText('12.48 cm³')).toBeVisible();
    expect(screen.getByText('19.34 g')).toBeVisible();
    await userEvent.setup().click(screen.getByRole('button', { name: 'Details' }));
    expect(screen.getByText('Native solid volume (OCCT)')).toBeVisible();
    expect(screen.getByText('Authored shape configuration')).toBeVisible();
    expect(screen.getByText('Last committed geometry')).toBeVisible();
  });
});
