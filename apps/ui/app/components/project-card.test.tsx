import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, useLocation } from 'react-router';
import { describe, expect, it, vi } from 'vitest';
import { ProjectCard, ProjectCardCadPreview, ProjectCardMedia } from '#components/project-card.js';
import { TooltipProvider } from '@taucad/ui/components/tooltip';

const { cadPreviewViewerMock } = vi.hoisted(() => ({
  cadPreviewViewerMock: vi.fn(() => <div data-testid='cad-preview-viewer' />),
}));

vi.mock('#components/cad-preview.js', () => ({
  CadPreviewViewer: cadPreviewViewerMock,
}));

function LocationProbe(): React.JSX.Element {
  const location = useLocation();
  return <output data-testid='location'>{location.pathname}</output>;
}

function TestWrapper({ children }: { readonly children: React.ReactNode }): React.JSX.Element {
  return (
    <MemoryRouter initialEntries={['/projects']}>
      <TooltipProvider>{children}</TooltipProvider>
      <LocationProbe />
    </MemoryRouter>
  );
}

describe('ProjectCard', () => {
  it('should expose the whole-card destination as a named keyboard-accessible link', async () => {
    render(
      <TestWrapper>
        <ProjectCard to='/projects/project-1' linkLabel='Open Project One'>
          <div>Project One</div>
        </ProjectCard>
      </TestWrapper>,
    );

    const link = screen.getByRole('link', { name: 'Open Project One' });
    expect(link).toHaveAttribute('href', '/projects/project-1');
    expect(link.parentElement).toHaveClass('hover:border-primary/60');

    link.focus();
    await userEvent.keyboard('{Enter}');
    expect(screen.getByTestId('location')).toHaveTextContent('/projects/project-1');
  });

  it('should leave nested controls independent from card navigation', async () => {
    const onClick = vi.fn();
    render(
      <TestWrapper>
        <ProjectCard to='/projects/project-1' linkLabel='Open Project One'>
          <button type='button' className='relative z-20' onClick={onClick}>
            Card action
          </button>
        </ProjectCard>
      </TestWrapper>,
    );

    await userEvent.click(screen.getByRole('button', { name: 'Card action' }));
    expect(onClick).toHaveBeenCalledOnce();
    expect(screen.getByTestId('location')).toHaveTextContent('/projects');
  });
});

describe('ProjectCardMedia', () => {
  it('should render a lazy thumbnail and expose preview visibility as native hidden state', async () => {
    const onPreviewVisibilityChange = vi.fn();
    const { rerender } = render(
      <TooltipProvider>
        <ProjectCardMedia
          name='Project One'
          isPreviewVisible={false}
          onPreviewVisibilityChange={onPreviewVisibilityChange}
        >
          <div data-testid='preview'>Preview</div>
        </ProjectCardMedia>
      </TooltipProvider>,
    );

    const thumbnail = screen.getByRole('img', { name: 'Project One' });
    expect(thumbnail).toHaveAttribute('src', '/placeholder.svg');
    expect(thumbnail).toHaveAttribute('loading', 'lazy');
    expect(thumbnail.parentElement).toHaveClass('aspect-4/3');
    expect(screen.getByTestId('preview').parentElement).toHaveAttribute('hidden');

    const toggle = screen.getByRole('button', { name: 'Preview model' });
    expect(toggle).toHaveAttribute('aria-pressed', 'false');
    await userEvent.click(toggle);
    expect(onPreviewVisibilityChange).toHaveBeenCalledWith(true);

    rerender(
      <TooltipProvider>
        <ProjectCardMedia
          name='Project One'
          thumbnailSource='/thumbnail.png'
          isPreviewVisible
          onPreviewVisibilityChange={onPreviewVisibilityChange}
        >
          <div data-testid='preview'>Preview</div>
        </ProjectCardMedia>
      </TooltipProvider>,
    );

    expect(screen.queryByRole('img', { name: 'Project One' })).not.toBeInTheDocument();
    expect(screen.getByTestId('preview').parentElement).not.toHaveAttribute('hidden');
    expect(screen.getByRole('button', { name: 'Preview model' })).toHaveAttribute('aria-pressed', 'true');
  });
});

describe('ProjectCardCadPreview', () => {
  it('should match thumbnail perspective and show card-only edge lines', () => {
    render(<ProjectCardCadPreview />);

    expect(cadPreviewViewerMock).toHaveBeenCalledWith(
      expect.objectContaining({
        className: 'size-full',
        enablePan: false,
        initialVerticalFieldOfView: 45,
        graphicsOptions: {
          enableAxes: false,
          enableGizmo: false,
          enableGrid: false,
          enableLines: true,
          viewerClassName: 'bg-muted',
        },
      }),
      undefined,
    );
  });
});
