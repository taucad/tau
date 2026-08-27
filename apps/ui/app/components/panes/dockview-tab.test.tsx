import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { DockviewApi, DockviewPanelApi, IDockviewPanelHeaderProps } from 'dockview-react';
import { describe, expect, it, vi } from 'vitest';
import { DockviewTab } from '#components/panes/dockview-tab.js';
import { TooltipProvider } from '#components/ui/tooltip.js';

const createProperties = (title = 'main.scad', params?: Record<string, unknown>): IDockviewPanelHeaderProps => {
  const containerApi = Object.create(null) as DockviewApi;
  const api = {
    title,
    close: vi.fn(),
    onDidTitleChange: vi.fn(() => ({ dispose: vi.fn() })),
  } as unknown as DockviewPanelApi;

  const properties: IDockviewPanelHeaderProps = {
    api,
    containerApi,
    params: params ?? { filePath: `models/${title}` },
    tabLocation: 'header',
  };

  return properties;
};

describe('DockviewTab', () => {
  it('clips a fixed-width title with a right-edge fade behind the close action', () => {
    const { container } = render(
      <TooltipProvider>
        <DockviewTab {...createProperties('long-assembly-name.scad')} />
      </TooltipProvider>,
    );
    const root = container.querySelector('.dv-default-tab');
    const title = screen.getByText('long-assembly-name.scad');
    const close = container.querySelector('.dv-default-tab-action');

    expect(root).toHaveClass('relative', 'size-full', 'min-w-0', 'overflow-hidden', 'py-1', 'pr-1', 'pl-2');
    expect(title).toHaveClass(
      'min-w-0',
      'flex-1',
      'dockview-tab-title',
      'scroll-shadow-right',
      'overflow-hidden',
      'whitespace-nowrap',
      '[--scroll-fade-size:24px]',
      'group-hover/default-tab:[--scroll-fade-size:42px]',
    );
    expect(title).not.toHaveClass('truncate');
    expect(close).toHaveClass(
      'absolute',
      'right-1',
      'z-10',
      'size-4.5!',
      'rounded-[5px]!',
      'bg-transparent',
      'before:right-full',
      'before:w-6',
      'before:bg-linear-to-r',
      'before:from-transparent',
      'before:to-accent',
      'hover:bg-input!',
    );
    expect(close).not.toHaveClass('group-hover/default-tab:bg-input!');
    expect(close).not.toHaveClass('right-0', 'right-0.5', 'bg-muted-foreground/10');
  });

  it('keeps its leading icon compact and non-shrinking', () => {
    const { container } = render(
      <TooltipProvider>
        <DockviewTab {...createProperties()} leadingIcon='viewer' />
      </TooltipProvider>,
    );

    expect(container.querySelector('svg')).toHaveClass('size-3', 'shrink-0');
  });

  it('accepts a concrete utility icon without replacing editor extension icons globally', () => {
    render(
      <TooltipProvider>
        <DockviewTab {...createProperties('Telemetry')} icon={<span data-testid='telemetry-tab-icon' />} />
      </TooltipProvider>,
    );

    expect(screen.getByTestId('telemetry-tab-icon')).toBeInTheDocument();
  });

  it.each([
    [{ filePath: 'src/models/gear.scad' }, 'src/models/gear.scad'],
    [{ entryPath: 'renders/final/gear.glb' }, 'renders/final/gear.glb'],
    [{}, 'Parameters'],
  ])('uses the full panel path as its tooltip and accessible name', async (params, expectedTitle) => {
    const user = userEvent.setup();
    const visibleTitle = expectedTitle === 'Parameters' ? 'Parameters' : 'gear';
    const properties = createProperties(visibleTitle, params);

    render(
      <TooltipProvider>
        <div className='dv-tab' role='tab' tabIndex={0}>
          <DockviewTab {...properties} />
        </div>
      </TooltipProvider>,
    );

    const tab = screen.getByRole('tab', { name: expectedTitle });
    const title = screen.getByText(visibleTitle);

    expect(tab).toHaveAttribute('aria-label', expectedTitle);

    await user.hover(title);

    expect(await screen.findByRole('tooltip')).toHaveTextContent(expectedTitle);
  });

  it('uses one native, named close button and keeps its events inside the tab action', async () => {
    const user = userEvent.setup();
    const parentClick = vi.fn();
    const parentPointerDown = vi.fn();
    const properties = createProperties('main.scad');

    render(
      <TooltipProvider>
        <div className='dv-tab' onClick={parentClick} onPointerDown={parentPointerDown}>
          <DockviewTab {...properties} />
        </div>
      </TooltipProvider>,
    );

    const close = screen.getByRole('button', { name: 'Close models/main.scad' });

    fireEvent.pointerDown(close);
    await user.click(close);

    expect(properties.api.close).toHaveBeenCalledOnce();
    expect(parentPointerDown).not.toHaveBeenCalled();
    expect(parentClick).not.toHaveBeenCalled();
  });
});
