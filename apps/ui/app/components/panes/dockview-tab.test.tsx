import { createEvent, fireEvent, render, renderHook, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { DockviewApi, DockviewPanelApi, IDockviewPanelHeaderProps } from 'dockview-react';
import { describe, expect, it, vi } from 'vitest';
import { DockviewTab } from '#components/panes/dockview-tab.js';
import { useDockviewTerminalCloseHost } from '#components/terminal/terminal-close.js';
import { TooltipProvider } from '@taucad/ui/components/tooltip';

const createProperties = (title = 'main.scad', params?: Record<string, unknown>): IDockviewPanelHeaderProps => {
  const containerApi = Object.create(null) as DockviewApi;
  const api = {
    title,
    close: vi.fn(),
    setActive: vi.fn(),
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
    expect(close).toHaveClass(
      'fade-action',
      'absolute',
      'right-1',
      'z-10',
      'size-4.5!',
      // A 24px target under a coarse pointer (I3).
      'pointer-coarse:size-6!',
      'opacity-0',
      'group-hover/tab:opacity-100',
      'pointer-coarse:opacity-100',
    );
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

  it('closes from a pointer-only glyph without nesting an interactive control in the tab', () => {
    const properties = createProperties();
    const tabPointerDown = vi.fn((event: PointerEvent) => event.defaultPrevented);
    const { container } = render(
      <TooltipProvider>
        <div className='dv-tab' role='tab' tabIndex={0}>
          <DockviewTab {...properties} />
        </div>
      </TooltipProvider>,
    );
    const tab = screen.getByRole('tab');
    const close = container.querySelector<HTMLElement>('.dv-default-tab-action')!;
    tab.addEventListener('pointerdown', tabPointerDown);

    expect(screen.queryByRole('button')).not.toBeInTheDocument();
    expect(close).toHaveAttribute('aria-hidden', 'true');
    expect(close).not.toHaveAttribute('tabindex');
    expect(tab).toHaveAccessibleName('models/main.scad');
    expect(tab).toHaveAttribute('aria-keyshortcuts', 'Delete');

    // Dockview listens natively on `.dv-tab`; a cancelled pointerdown keeps it from activating or dragging.
    const pointerDown = createEvent.pointerDown(close, { button: 0 });
    fireEvent(close, pointerDown);
    expect(tabPointerDown).toHaveReturnedWith(true);
    expect(properties.api.close).not.toHaveBeenCalled();

    fireEvent.click(close);
    expect(properties.api.close).toHaveBeenCalledOnce();
  });

  describe('with a Terminal that holds its close (T15)', () => {
    const renderHeldTab = (holds: boolean) => {
      const properties = createProperties('Terminal', {});
      const request = vi.fn(() => holds);
      const { result } = renderHook(() => useDockviewTerminalCloseHost(properties.api, vi.fn()));
      const unregister = result.current.register(request);
      /* Dockview's own Delete/Backspace handler sits on the tablist, above the tab. */
      const tablistKeyDown = vi.fn();
      const { container } = render(
        <TooltipProvider>
          <div role='tablist' onKeyDown={tablistKeyDown}>
            <div className='dv-tab' role='tab' tabIndex={0}>
              <DockviewTab {...properties} />
            </div>
          </div>
        </TooltipProvider>,
      );
      return {
        properties,
        request,
        unregister,
        tablistKeyDown,
        tab: screen.getByRole('tab'),
        close: container.querySelector<HTMLElement>('.dv-default-tab-action')!,
      };
    };

    it('asks the Terminal from the close glyph instead of removing the panel', () => {
      const { properties, request, close } = renderHeldTab(true);
      fireEvent.click(close);
      expect(request).toHaveBeenCalledOnce();
      expect(properties.api.close).not.toHaveBeenCalled();
      expect(properties.api.setActive).toHaveBeenCalledOnce();
    });

    it.each(['Delete', 'Backspace'])('stops %s at the tab before Dockview closes the panel', (key) => {
      const { request, tab, tablistKeyDown } = renderHeldTab(true);
      const keyDown = createEvent.keyDown(tab, { key });
      fireEvent(tab, keyDown);
      expect(request).toHaveBeenCalledOnce();
      expect(keyDown.defaultPrevented).toBe(true);
      expect(tablistKeyDown).not.toHaveBeenCalled();
    });

    it('leaves the key and the glyph to Dockview when the Terminal has no running session', () => {
      const { properties, tab, close, tablistKeyDown } = renderHeldTab(false);
      fireEvent.keyDown(tab, { key: 'Delete' });
      expect(tablistKeyDown).toHaveBeenCalledOnce();
      fireEvent.click(close);
      expect(properties.api.close).toHaveBeenCalledOnce();
    });

    it('ignores other keys and closes normally once the Terminal unregisters', () => {
      const { properties, request, tab, close, tablistKeyDown, unregister } = renderHeldTab(true);
      fireEvent.keyDown(tab, { key: 'Enter' });
      expect(request).not.toHaveBeenCalled();
      expect(tablistKeyDown).toHaveBeenCalledOnce();
      unregister();
      fireEvent.click(close);
      expect(properties.api.close).toHaveBeenCalledOnce();
    });
  });
});
