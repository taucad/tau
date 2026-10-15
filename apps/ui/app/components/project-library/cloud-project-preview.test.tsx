// @vitest-environment jsdom
import { fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { CloudProjectPreview } from '#components/project-library/cloud-project-preview.js';

const preview = vi.hoisted(() => ({
  url: undefined as string | undefined,
  isLoading: false,
  isFailed: false,
  canRetry: true,
  retry: vi.fn(async () => undefined),
}));
vi.mock('#hooks/use-cloud-project-preview.js', () => ({ useCloudProjectPreview: () => preview }));

beforeEach(() => {
  Object.assign(preview, { url: undefined, isLoading: false, isFailed: false, canRetry: true });
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
    preview.isFailed = true;
    preview.canRetry = false;
    render(<CloudProjectPreview projectId='cloud' name='Cloud cube' />);
    expect(screen.getByText('Preview unavailable. Open the project to view it.')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Retry preview' })).not.toBeInTheDocument();
  });

  it('should retry a transient failure, announce progress, then show the recovered image', () => {
    preview.isFailed = true;
    const view = render(<CloudProjectPreview projectId='cloud' name='Cloud cube' />);
    fireEvent.click(screen.getByRole('button', { name: 'Retry preview' }));
    expect(preview.retry).toHaveBeenCalledOnce();
    preview.isLoading = true;
    view.rerender(<CloudProjectPreview projectId='cloud' name='Cloud cube' />);
    expect(screen.getByRole('status', { name: 'Loading saved preview' })).toHaveAttribute('aria-busy', 'true');
    expect(screen.getByRole('button', { name: 'Loading preview…' })).toBeDisabled();
    Object.assign(preview, { isLoading: false, isFailed: false, url: 'blob:recovered' });
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
});
