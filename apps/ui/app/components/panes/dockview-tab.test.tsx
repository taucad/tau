import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { DockviewApi, DockviewPanelApi, IDockviewPanelHeaderProps } from 'dockview-react';
import { describe, expect, it, vi } from 'vitest';
import { DockviewTab } from '#components/panes/dockview-tab.js';
import { TooltipProvider } from '@taucad/ui/components/tooltip';

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

    /* The fade geometry has one owner: `fade-row` / `fade-label` / `fade-action` in the token
       layer. A tab composes them and never restates the mask or the scrim gradient. */
    expect(root).toHaveClass('fade-row', 'size-full', 'min-w-0', 'overflow-hidden', 'py-1', 'pr-1', 'pl-2');
    expect(title).toHaveClass('dockview-tab-title', 'fade-label', 'flex-1');
    expect(title).not.toHaveClass('truncate');
    expect(title.className).not.toMatch(/scroll-shadow-right|--scroll-fade-size|whitespace-nowrap|overflow-hidden/);
    expect(close).toBeNull();
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

  it('leaves closing to the group action and Dockview keyboard handler, without nesting a button in a tab', () => {
    render(
      <TooltipProvider>
        <div className='dv-tab' role='tab' tabIndex={0}>
          <DockviewTab {...createProperties()} />
        </div>
      </TooltipProvider>,
    );
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
    expect(screen.getByRole('tab')).toHaveAccessibleName('models/main.scad');
  });
});
