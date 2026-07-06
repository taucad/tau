import { describe, it, expect, vi } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { FormatEntry } from '#utils/export-formats.utils.js';

const { ExportFormatGrid } = await import('./export-format-grid.js');

const meshFormats: FormatEntry[] = [
  { format: 'glb', fidelity: 'mesh', direct: true },
  { format: 'stl', fidelity: 'mesh', direct: true },
];
const brepFormats: FormatEntry[] = [
  { format: 'step', fidelity: 'brep', direct: true },
  { format: 'iges', fidelity: 'brep', direct: false },
];

describe('ExportFormatGrid', () => {
  it('should render BREP formats above mesh formats', () => {
    try {
      render(
        <ExportFormatGrid formats={[...meshFormats, ...brepFormats]} isExporting={false} onSelectFormat={vi.fn()} />,
      );

      expect(screen.getByText('Mesh')).toBeInTheDocument();
      expect(screen.getByText('BREP')).toBeInTheDocument();
      expect(screen.getAllByText(/^(BREP|Mesh)$/).map((heading) => heading.textContent)).toEqual(['BREP', 'Mesh']);

      for (const { format } of meshFormats) {
        expect(screen.getByRole('button', { name: new RegExp(format, 'i') })).toBeInTheDocument();
      }
      for (const { format } of brepFormats) {
        expect(screen.getByRole('button', { name: new RegExp(format, 'i') })).toBeInTheDocument();
      }
    } finally {
      cleanup();
    }
  });

  it('should hide the MESH section when no mesh formats exist', () => {
    try {
      render(<ExportFormatGrid formats={brepFormats} isExporting={false} onSelectFormat={vi.fn()} />);
      expect(screen.queryByText('Mesh')).not.toBeInTheDocument();
      expect(screen.getByText('BREP')).toBeInTheDocument();
    } finally {
      cleanup();
    }
  });

  it('should hide the BREP section when no brep formats exist', () => {
    try {
      render(<ExportFormatGrid formats={meshFormats} isExporting={false} onSelectFormat={vi.fn()} />);
      expect(screen.getByText('Mesh')).toBeInTheDocument();
      expect(screen.queryByText('BREP')).not.toBeInTheDocument();
    } finally {
      cleanup();
    }
  });

  it('should call onSelectFormat with the clicked format', async () => {
    const user = userEvent.setup();
    const onSelectFormat = vi.fn();
    try {
      render(<ExportFormatGrid formats={meshFormats} isExporting={false} onSelectFormat={onSelectFormat} />);
      await user.click(screen.getByRole('button', { name: /stl/i }));
      expect(onSelectFormat).toHaveBeenCalledWith('stl');
    } finally {
      cleanup();
    }
  });

  it('should disable all pills while isExporting is true', () => {
    try {
      render(<ExportFormatGrid formats={[...meshFormats, ...brepFormats]} isExporting onSelectFormat={vi.fn()} />);
      const buttons = screen.getAllByRole('button');
      for (const button of buttons) {
        expect(button).toBeDisabled();
      }
    } finally {
      cleanup();
    }
  });
});
