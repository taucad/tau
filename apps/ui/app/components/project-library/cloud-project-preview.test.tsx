// @vitest-environment jsdom
import { fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { CloudProjectPreview } from '#components/project-library/cloud-project-preview.js';

const preview = vi.hoisted(() => ({
  url: undefined as string | undefined,
  isLoading: false,
  isFailed: false,
  isSettled: false,
  canRetry: true,
  retry: vi.fn(async () => undefined),
}));
vi.mock('#hooks/use-cloud-project-preview.js', () => ({ useCloudProjectPreview: () => preview }));

beforeEach(() => {
  Object.assign(preview, { url: undefined, isLoading: false, isFailed: false, isSettled: false, canRetry: true });
  preview.retry.mockClear();
  vi.stubGlobal(
    'IntersectionObserver',
    class {
      public observe() {
        /* Visibility is controlled by the hook fixture. */
      }
      public disconnect() {
        /* No observer resources in this fixture. */
      }
    },
  );
});
afterEach(() => {
  vi.unstubAllGlobals();
});

describe('cloud project preview recovery', () => {
  it('should explain unavailable previews without offering a futile retry', () => {
    Object.assign(preview, { isFailed: true, isSettled: true, canRetry: false });
    render(<CloudProjectPreview projectId='cloud' name='Cloud cube' />);
    expect(screen.getByText('Preview unavailable. Open the project to view it.')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Retry preview' })).not.toBeInTheDocument();
  });

  it('should retry a transient failure, announce progress, then show the recovered image', () => {
    Object.assign(preview, { isFailed: true, isSettled: true });
    const view = render(<CloudProjectPreview projectId='cloud' name='Cloud cube' />);
    fireEvent.click(screen.getByRole('button', { name: 'Retry preview' }));
    expect(preview.retry).toHaveBeenCalledOnce();
    Object.assign(preview, { isLoading: true, isSettled: false });
    view.rerender(<CloudProjectPreview projectId='cloud' name='Cloud cube' />);
    expect(view.container.querySelector('[data-slot="skeleton"]')).toBeNull();
    expect(screen.getByRole('button', { name: 'Loading preview…' })).toBeDisabled();
    Object.assign(preview, { isLoading: false, isFailed: false, isSettled: true, url: 'blob:recovered' });
    view.rerender(<CloudProjectPreview projectId='cloud' name='Cloud cube' />);
    expect(screen.getByRole('img', { name: 'Saved preview of Cloud cube' })).toHaveAttribute('src', 'blob:recovered');
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
    expect(screen.queryByText('Saved preview')).not.toBeInTheDocument();
  });

  it('should keep a project with no saved image neutral and allow retry of a corrupt image', () => {
    const view = render(<CloudProjectPreview projectId='cloud' name='Cloud cube' />);
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
    expect(screen.queryByText(/Preview unavailable/u)).not.toBeInTheDocument();
    preview.url = 'blob:corrupt';
    view.rerender(<CloudProjectPreview projectId='cloud' name='Cloud cube' />);
    fireEvent.error(screen.getByRole('img', { name: 'Saved preview of Cloud cube' }));
    fireEvent.click(screen.getByRole('button', { name: 'Retry preview' }));
    expect(preview.retry).toHaveBeenCalledOnce();
  });

  /* C15 (P-g, H-d): a Tau Cloud card's media box stays plain until its saved preview's read has settled. */
  it('C15: draws no icon and no skeleton before the saved preview is asked for', () => {
    const { container } = render(<CloudProjectPreview projectId='cloud' name='Cloud cube' />);
    expect(screen.queryByLabelText('No saved preview')).not.toBeInTheDocument();
    expect(container.querySelector('[data-slot="skeleton"]')).toBeNull();
  });

  it('C15: draws no icon and no skeleton while the saved preview is read', () => {
    preview.isLoading = true;
    const { container } = render(<CloudProjectPreview projectId='cloud' name='Cloud cube' />);
    expect(screen.queryByLabelText('No saved preview')).not.toBeInTheDocument();
    expect(container.querySelector('[data-slot="skeleton"]')).toBeNull();
  });

  it('C15: draws the "no saved preview" icon once the read has settled as absent', () => {
    preview.isSettled = true;
    render(<CloudProjectPreview projectId='cloud' name='Cloud cube' />);
    expect(screen.getByLabelText('No saved preview')).toBeInTheDocument();
  });
});
