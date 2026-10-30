// @vitest-environment jsdom
import { render, screen } from '@testing-library/react';
import { CircleAlert, FolderOpen } from 'lucide-react';
import { describe, expect, it } from 'vitest';
import { PanelEmptyState } from '#components/panel-empty-state.js';

describe('PanelEmptyState', () => {
  it('renders shared panel copy, child actions, and caller-owned semantics', () => {
    render(
      <PanelEmptyState
        icon={CircleAlert}
        iconClassName='text-destructive'
        title='Files unavailable'
        description='Reconnect the workspace and try again.'
        role='alert'
        aria-label='Files unavailable'
        className='min-h-40'
      >
        <button type='button'>Retry</button>
      </PanelEmptyState>,
    );

    const state = screen.getByRole('alert', { name: 'Files unavailable' });
    expect(state).toHaveClass('min-h-40');
    expect(screen.getByRole('heading', { name: 'Files unavailable' })).toBeInTheDocument();
    expect(screen.getByText('Reconnect the workspace and try again.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Retry' })).toBeInTheDocument();
    expect(state.querySelector('svg')).toHaveAttribute('aria-hidden', 'true');
  });

  it('omits optional description and content when absent', () => {
    const { container } = render(<PanelEmptyState icon={FolderOpen} title='Open file' />);

    expect(screen.getByRole('heading', { name: 'Open file' })).toBeInTheDocument();
    expect(container.querySelector('[data-slot="panel-empty-state-description"]')).toBeNull();
    expect(container.querySelector('[data-slot="panel-empty-state-content"]')).toBeNull();
  });

  it('titles a pane state at level three and a page state at the level its host asks for', () => {
    const { rerender } = render(<PanelEmptyState icon={FolderOpen} title='Open file' />);
    expect(screen.getByRole('heading', { level: 3, name: 'Open file' })).toBeInTheDocument();

    rerender(<PanelEmptyState icon={FolderOpen} title='Open file' titleLevel={2} />);
    expect(screen.getByRole('heading', { level: 2, name: 'Open file' })).toBeInTheDocument();
    expect(screen.queryByRole('heading', { level: 3 })).not.toBeInTheDocument();
  });
});
