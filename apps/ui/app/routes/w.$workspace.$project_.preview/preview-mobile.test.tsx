import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { describe, expect, it, vi } from 'vitest';
import { PreviewMobile } from '#routes/w.$workspace.$project_.preview/preview-mobile.js';

vi.mock('#routes/w.$workspace.$project_.preview/preview-project-context.js', () => ({
  usePreviewProject: () => ({ project: { id: 'fixture', name: 'Preview fixture' } }),
}));
vi.mock('#hooks/use-project-slug-route.js', () => ({ useProjectUrl: () => '/w/home/fixture' }));
vi.mock('#hooks/use-cad-preview.js', () => ({ useCadPreview: () => ({ artifact: undefined, cadRef: undefined }) }));
vi.mock('#components/cad-preview.js', () => ({
  CadPreviewViewer: () => <div>Rendered model</div>,
  CadPreviewStatus: () => null,
}));
vi.mock('#routes/w.$workspace.$project_.preview/use-preview-file-list.js', () => ({ usePreviewFileList: () => [] }));
vi.mock('#routes/w.$workspace.$project_.preview/preview-files.js', () => ({
  PreviewFiles: () => <div>Project files</div>,
}));
vi.mock('#routes/w.$workspace.$project_.preview/preview-parameters.js', () => ({
  PreviewParameters: () => <div>Project parameters</div>,
}));
vi.mock('#routes/w.$workspace.$project_.preview/preview-details.js', () => ({
  PreviewDetails: () => <div>Project details</div>,
}));

describe('PreviewMobile', () => {
  it('should connect the model and drawer tabs to their actual panels under one tab root', async () => {
    render(
      <MemoryRouter>
        <PreviewMobile />
      </MemoryRouter>,
    );
    const modelTab = screen.getByRole('tab', { name: 'Model' });
    const modelPanel = screen.getByRole('tabpanel', { name: 'Model' });
    expect(modelTab).toHaveAttribute('aria-controls', modelPanel.id);
    expect(screen.getByText('Rendered model')).toBeInTheDocument();
    const filesTab = screen.getByRole('tab', { name: 'Files' });
    fireEvent.mouseDown(filesTab, { button: 0, ctrlKey: false });
    await waitFor(() => {
      expect(screen.getByRole('tabpanel', { name: 'Files' })).toBeInTheDocument();
    });
    expect(filesTab).toHaveAttribute('aria-controls', screen.getByRole('tabpanel', { name: 'Files' }).id);
    expect(screen.getByText('Rendered model')).toBeInTheDocument();
    fireEvent.mouseDown(modelTab, { button: 0, ctrlKey: false });
    await waitFor(() => {
      expect(modelTab).toHaveAttribute('aria-selected', 'true');
    });
    expect(screen.getByRole('button', { name: 'Edit' })).toBeVisible();
  });
});
