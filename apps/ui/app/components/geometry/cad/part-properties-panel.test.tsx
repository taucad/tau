import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { mock } from 'vitest-mock-extended';
import type { GeometryComponentNode } from '@taucad/types';
import { PartPropertiesPanel } from '#components/geometry/cad/part-properties-panel.js';

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
});
