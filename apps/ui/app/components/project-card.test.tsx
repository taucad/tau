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
    // Neutral, instant hover edge at the owner; the brand hue and the colour transition are gone.
    expect(link.parentElement).toHaveClass('hover:border-foreground/30');
    expect(link.parentElement).not.toHaveClass('hover:border-primary/60', 'transition-colors');

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
  it('should render a lazy thumbnail and mount the preview only while it is visible', async () => {
    const onPreviewVisibilityChange = vi.fn();
    const { rerender } = render(
      <TooltipProvider>
        <ProjectCardMedia isPreviewVisible={false} onPreviewVisibilityChange={onPreviewVisibilityChange}>
          <div data-testid='preview'>Preview</div>
        </ProjectCardMedia>
      </TooltipProvider>,
    );

    // The card link names the card, so the thumbnail is decorative.
    const thumbnail = screen.getByRole('presentation');
    expect(thumbnail).toHaveAttribute('alt', '');
    expect(thumbnail).toHaveAttribute('src', '/placeholder.svg');
    expect(thumbnail).toHaveAttribute('loading', 'lazy');
    expect(thumbnail.parentElement).toHaveClass('aspect-4/3');
    expect(screen.queryByTestId('preview')).not.toBeInTheDocument();

    const toggle = screen.getByRole('button', { name: 'Preview model' });
    expect(toggle).toHaveAttribute('aria-pressed', 'false');
    await userEvent.click(toggle);
    expect(onPreviewVisibilityChange).toHaveBeenCalledWith(true);

    rerender(
      <TooltipProvider>
        <ProjectCardMedia
          thumbnailSource='/thumbnail.png'
          isPreviewVisible
          onPreviewVisibilityChange={onPreviewVisibilityChange}
        >
          <div data-testid='preview'>Preview</div>
        </ProjectCardMedia>
      </TooltipProvider>,
    );

    expect(screen.queryByRole('presentation')).not.toBeInTheDocument();
    expect(screen.getByTestId('preview')).toBeVisible();
    const pressed = screen.getByRole('button', { name: 'Preview model' });
    expect(pressed).toHaveAttribute('aria-pressed', 'true');
    // Pressed is a neutral fill with a foreground glyph, never hue alone.
    expect(pressed).toHaveClass('aria-pressed:bg-accent', 'aria-pressed:text-foreground');
    expect(pressed.querySelector('svg')).not.toHaveClass('text-primary');
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
