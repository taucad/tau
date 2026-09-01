import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { PaneviewPanelApi } from 'dockview-react';
import {
  PaneviewHeader,
  PaneviewHeaderAction,
  PaneviewHeaderActionGroup,
  PaneviewHeaderControls,
  PaneviewHeaderContentActions,
  PaneviewHeaderTitle,
  paneviewAttachedSurfaceStyleOverrides,
  paneviewHeaderSize,
  paneviewStyleOverrides,
} from '#components/panes/paneview-header.js';
import { TooltipProvider } from '@taucad/ui/components/tooltip';

type ExpansionHandler = (event: { isExpanded: boolean }) => void;

function createMockApi(initialExpanded = true): PaneviewPanelApi & {
  triggerExpansionChange: (isExpanded: boolean) => void;
} {
  let handler: ExpansionHandler | undefined;

  return {
    isExpanded: initialExpanded,
    onDidExpansionChange: vi.fn((callback: ExpansionHandler) => {
      handler = callback;
      return { dispose: vi.fn() };
    }),
    setExpanded: vi.fn(),
    setSize: vi.fn(),
    triggerExpansionChange(isExpanded: boolean) {
      handler?.({ isExpanded });
    },
  } as unknown as PaneviewPanelApi & { triggerExpansionChange: (isExpanded: boolean) => void };
}

describe('PaneviewHeader', () => {
  let mockApi: ReturnType<typeof createMockApi>;

  beforeEach(() => {
    mockApi = createMockApi(true);
  });

  it('renders title text', () => {
    render(<PaneviewHeader api={mockApi} title='main.ts' />);

    expect(screen.getByText('main.ts')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'main.ts' })).toHaveAttribute('aria-expanded', 'true');
  });

  it('renders chevron rotated when expanded', () => {
    render(<PaneviewHeader api={mockApi} title='main.ts' />);

    const chevron = screen.getByRole('button', { name: 'main.ts' }).querySelector('svg')!;
    expect(chevron.classList.contains('rotate-180')).toBe(true);
  });

  it('renders chevron un-rotated when collapsed', () => {
    mockApi = createMockApi(false);
    render(<PaneviewHeader api={mockApi} title='main.ts' />);

    const chevron = screen.getByRole('button', { name: 'main.ts' }).querySelector('svg')!;
    expect(chevron.classList.contains('rotate-180')).toBe(false);
  });

  it('collapses panel on click when expanded', () => {
    render(<PaneviewHeader api={mockApi} title='main.ts' />);

    fireEvent.click(screen.getByRole('button', { name: 'main.ts' }));

    expect(mockApi.setExpanded).toHaveBeenCalledWith(false);
    expect(mockApi.setSize).not.toHaveBeenCalled();
  });

  it('expands panel and sets default size on click when collapsed', () => {
    mockApi = createMockApi(false);
    render(<PaneviewHeader api={mockApi} title='main.ts' />);

    fireEvent.click(screen.getByRole('button', { name: 'main.ts' }));

    expect(mockApi.setExpanded).toHaveBeenCalledWith(true);
    expect(mockApi.setSize).toHaveBeenCalledWith({ size: 200 });
  });

  it('updates chevron when expansion changes externally', () => {
    render(<PaneviewHeader api={mockApi} title='main.ts' />);

    const disclosure = screen.getByRole('button', { name: 'main.ts' });
    const chevron = disclosure.querySelector('svg')!;
    expect(chevron.classList.contains('rotate-180')).toBe(true);

    act(() => {
      mockApi.triggerExpansionChange(false);
    });

    expect(chevron.classList.contains('rotate-180')).toBe(false);
    expect(disclosure).toHaveAttribute('aria-expanded', 'false');
  });

  it('disposes expansion listener on unmount', () => {
    const { unmount } = render(<PaneviewHeader api={mockApi} title='main.ts' />);

    const disposable = (mockApi.onDidExpansionChange as ReturnType<typeof vi.fn>).mock.results[0]!.value as {
      dispose: ReturnType<typeof vi.fn>;
    };

    unmount();

    expect(disposable.dispose).toHaveBeenCalled();
  });

  it('renders children inline', () => {
    render(
      <PaneviewHeader api={mockApi} title='main.ts'>
        <span data-testid='child-content'>Extra</span>
      </PaneviewHeader>,
    );

    expect(screen.getByTestId('child-content')).toBeInTheDocument();
  });

  it('renders children even when collapsed', () => {
    mockApi = createMockApi(false);
    render(
      <PaneviewHeader api={mockApi} title='main.ts'>
        <span data-testid='child-content'>Extra</span>
      </PaneviewHeader>,
    );

    expect(screen.getByTestId('child-content')).toBeInTheDocument();
  });

  it('toggles on Enter key', async () => {
    const user = userEvent.setup();
    mockApi = createMockApi(false);
    render(<PaneviewHeader api={mockApi} title='main.ts' />);

    screen.getByRole('button', { name: 'main.ts' }).focus();
    await user.keyboard('{Enter}');

    expect(mockApi.setExpanded).toHaveBeenCalledWith(true);
    expect(mockApi.setSize).toHaveBeenCalledWith({ size: 200 });
  });

  it('toggles on Space key', async () => {
    const user = userEvent.setup();
    render(<PaneviewHeader api={mockApi} title='main.ts' />);

    screen.getByRole('button', { name: 'main.ts' }).focus();
    await user.keyboard(' ');

    expect(mockApi.setExpanded).toHaveBeenCalledWith(false);
  });

  it('renders a non-interactive state root around the disclosure', () => {
    render(<PaneviewHeader api={mockApi} title='main.ts' />);

    const disclosure = screen.getByRole('button', { name: 'main.ts' });
    const root = disclosure.closest('[data-slot="paneview-header"]')!;
    expect(root.classList.contains('group/paneview-header')).toBe(true);
    expect(root).not.toHaveAttribute('role');
    expect(root).toHaveAttribute('data-state', 'open');
    expect(disclosure).toHaveAttribute('draggable', 'true');
  });

  it('keeps interactive children outside the disclosure button', () => {
    render(
      <PaneviewHeader api={mockApi} title='main.ts'>
        <button type='button'>More</button>
      </PaneviewHeader>,
    );

    const disclosure = screen.getByRole('button', { name: 'main.ts' });
    const action = screen.getByRole('button', { name: 'More' });
    expect(disclosure).not.toContainElement(action);
    expect(disclosure.closest('[data-slot="paneview-header"]')).toContainElement(action);
  });

  it('removes and restores the framework header tab stop', () => {
    const frameworkHeader = document.createElement('div');
    frameworkHeader.className = 'dv-pane-header';
    frameworkHeader.tabIndex = 0;
    document.body.append(frameworkHeader);

    const { unmount } = render(<PaneviewHeader api={mockApi} title='main.ts' />, { container: frameworkHeader });
    expect(frameworkHeader.tabIndex).toBe(-1);

    unmount();
    expect(frameworkHeader.tabIndex).toBe(0);
    frameworkHeader.remove();
  });
});

describe('PaneviewHeaderTitle', () => {
  it('renders text with truncation', () => {
    const mockApi = createMockApi(true);
    render(
      <PaneviewHeader api={mockApi}>
        <PaneviewHeaderTitle>custom-title.ts</PaneviewHeaderTitle>
      </PaneviewHeader>,
    );

    const title = screen.getByText('custom-title.ts');
    expect(title.classList.contains('truncate')).toBe(true);
    // 13px matches `--dv-tabs-and-actions-container-font-size` in dockview.tsx
    // so paneview header titles render at the same font-size as dockview tabs.
    expect(title.classList.contains('text-[13px]')).toBe(true);
  });

  it('applies custom className', () => {
    const mockApi = createMockApi(true);
    render(
      <PaneviewHeader api={mockApi}>
        <PaneviewHeaderTitle className='extra'>title</PaneviewHeaderTitle>
      </PaneviewHeader>,
    );

    expect(screen.getByText('title').classList.contains('extra')).toBe(true);
  });
});

describe('PaneviewHeaderControls', () => {
  let mockApi: ReturnType<typeof createMockApi>;

  beforeEach(() => {
    mockApi = createMockApi(true);
  });

  it('stops propagation of click events', () => {
    render(
      <PaneviewHeader api={mockApi} title='main.ts'>
        <PaneviewHeaderControls>
          <button type='button' data-testid='inner-btn'>
            Click me
          </button>
        </PaneviewHeaderControls>
      </PaneviewHeader>,
    );

    fireEvent.click(screen.getByTestId('inner-btn'));

    expect(mockApi.setExpanded).not.toHaveBeenCalled();
  });

  it('stops propagation of keyboard events', () => {
    render(
      <PaneviewHeader api={mockApi} title='main.ts'>
        <PaneviewHeaderControls>
          <input data-testid='inner-input' />
        </PaneviewHeaderControls>
      </PaneviewHeader>,
    );

    fireEvent.keyDown(screen.getByTestId('inner-input'), { key: 'Enter' });

    expect(mockApi.setExpanded).not.toHaveBeenCalled();
  });

  it('stops propagation of Space key', () => {
    render(
      <PaneviewHeader api={mockApi} title='main.ts'>
        <PaneviewHeaderControls>
          <input data-testid='inner-input' />
        </PaneviewHeaderControls>
      </PaneviewHeader>,
    );

    fireEvent.keyDown(screen.getByTestId('inner-input'), { key: ' ' });

    expect(mockApi.setExpanded).not.toHaveBeenCalled();
  });

  it('stops pointerdown from reaching the draggable header lane', () => {
    const handlePointerDown = vi.fn();
    render(
      <div onPointerDown={handlePointerDown}>
        <PaneviewHeader api={mockApi} title='main.ts'>
          <PaneviewHeaderControls>
            <button type='button' data-testid='inner-btn'>
              Click me
            </button>
          </PaneviewHeaderControls>
        </PaneviewHeader>
      </div>,
    );

    fireEvent.pointerDown(screen.getByTestId('inner-btn'));

    expect(handlePointerDown).not.toHaveBeenCalled();
  });

  it('applies ml-auto for trailing positioning', () => {
    const { container } = render(
      <PaneviewHeader api={mockApi} title='main.ts'>
        <PaneviewHeaderControls>
          <span>controls</span>
        </PaneviewHeaderControls>
      </PaneviewHeader>,
    );

    const controls = container.querySelector('[class*="ml-auto"]');
    expect(controls).toBeInTheDocument();
  });

  it('applies the shared neutral action treatment at the controls boundary', () => {
    render(
      <PaneviewHeader api={mockApi} title='main.ts'>
        <PaneviewHeaderControls>
          <button type='button'>Action</button>
        </PaneviewHeaderControls>
      </PaneviewHeader>,
    );

    const controls = screen.getByRole('button', { name: 'Action' }).closest('[data-slot="paneview-header-controls"]');
    expect(controls).toHaveAttribute('data-slot', 'paneview-header-controls');
    expect(controls?.className).toContain('[&_button:hover]:bg-muted-foreground/10');
    expect(controls?.className).toContain('[&_button:hover]:text-foreground');
    expect(controls?.className).toContain('[&_button:focus-visible]:bg-muted-foreground/10');
    expect(controls?.className).toContain('[&_button:focus-visible]:text-foreground');
    expect(controls?.className).toContain('[&_button:focus-visible]:ring-2');
    expect(controls?.className).toContain('[&_button[data-state=open]]:bg-muted-foreground/10');
    expect(controls?.className).toContain('[&_button[data-state=open]]:text-foreground');
  });
});

describe('PaneviewHeaderContentActions', () => {
  let mockApi: ReturnType<typeof createMockApi>;

  beforeEach(() => {
    mockApi = createMockApi(true);
  });

  it('renders children when expanded', () => {
    render(
      <PaneviewHeader api={mockApi} title='main.ts'>
        <PaneviewHeaderContentActions>
          <span data-testid='action-content'>Action</span>
        </PaneviewHeaderContentActions>
      </PaneviewHeader>,
    );

    expect(screen.getByTestId('action-content')).toBeInTheDocument();
  });

  it('hides children when collapsed', () => {
    mockApi = createMockApi(false);
    render(
      <PaneviewHeader api={mockApi} title='main.ts'>
        <PaneviewHeaderContentActions>
          <span data-testid='action-content'>Action</span>
        </PaneviewHeaderContentActions>
      </PaneviewHeader>,
    );

    expect(screen.queryByTestId('action-content')).not.toBeInTheDocument();
  });

  it('shows children when panel expands externally', () => {
    mockApi = createMockApi(false);
    render(
      <PaneviewHeader api={mockApi} title='main.ts'>
        <PaneviewHeaderContentActions>
          <span data-testid='action-content'>Action</span>
        </PaneviewHeaderContentActions>
      </PaneviewHeader>,
    );

    expect(screen.queryByTestId('action-content')).not.toBeInTheDocument();

    act(() => {
      mockApi.triggerExpansionChange(true);
    });

    expect(screen.getByTestId('action-content')).toBeInTheDocument();
  });

  it('throws when used outside PaneviewHeader', () => {
    expect(() => {
      render(
        <PaneviewHeaderContentActions>
          <span>orphan</span>
        </PaneviewHeaderContentActions>,
      );
    }).toThrow('PaneviewHeader compound components must be used within a <PaneviewHeader>');
  });
});

describe('paneviewStyleOverrides', () => {
  it('should remove the full-width paneview header separator', () => {
    expect(paneviewStyleOverrides).toContain('--dv-paneview-header-border-color:transparent');
  });

  it('should allocate 40px for the rounded header row', () => {
    expect(paneviewHeaderSize).toBe(40);
  });

  it('should disable active outline on focused pane panels', () => {
    expect(paneviewStyleOverrides).toContain('--dv-paneview-active-outline-color:transparent');
  });

  it('should set sash idle color to transparent', () => {
    expect(paneviewStyleOverrides).toContain('--dv-sash-color:transparent');
  });

  it('should set active sash color to primary', () => {
    expect(paneviewStyleOverrides).toContain('--dv-active-sash-color:var(--primary)');
  });

  it('should include sash transition duration and delay', () => {
    expect(paneviewStyleOverrides).toContain('--dv-active-sash-transition-duration:0.1s');
    expect(paneviewStyleOverrides).toContain('--dv-active-sash-transition-delay:0.5s');
  });

  it('should include h-full for container sizing', () => {
    expect(paneviewStyleOverrides).toContain('h-full');
  });

  it('should attach open headers to inset bordered panel bodies', () => {
    expect(paneviewAttachedSurfaceStyleOverrides).toContain(paneviewStyleOverrides);
    expect(paneviewAttachedSurfaceStyleOverrides).toContain('[&_.dv-pane-body]:px-2!');
    expect(paneviewAttachedSurfaceStyleOverrides).toContain('[data-state=open]]:rounded-b-none!');
    expect(paneviewAttachedSurfaceStyleOverrides).toContain('[data-state=open]]:border-b-0!');
  });
});

describe('PaneviewHeaderAction', () => {
  it('renders children', () => {
    render(
      <PaneviewHeaderAction>
        <svg data-testid='icon' />
      </PaneviewHeaderAction>,
    );

    expect(screen.getByTestId('icon')).toBeInTheDocument();
  });

  it('fires onClick handler', () => {
    const handleClick = vi.fn();
    render(
      <PaneviewHeaderAction onClick={handleClick}>
        <svg data-testid='icon' />
      </PaneviewHeaderAction>,
    );

    fireEvent.click(screen.getByRole('button'));

    expect(handleClick).toHaveBeenCalledOnce();
  });

  it('applies the Dockview action hover classes', () => {
    render(
      <PaneviewHeaderAction>
        <svg data-testid='icon' />
      </PaneviewHeaderAction>,
    );

    const button = screen.getByRole('button');
    expect(button.classList.contains('hover:bg-muted-foreground/10')).toBe(true);
    expect(button.classList.contains('hover:text-foreground')).toBe(true);
  });

  it('renders with a 24px target', () => {
    render(
      <PaneviewHeaderAction>
        <svg data-testid='icon' />
      </PaneviewHeaderAction>,
    );

    const button = screen.getByRole('button');
    expect(button.classList.contains('size-6')).toBe(true);
  });

  it('wraps in tooltip when tooltip prop is provided', () => {
    render(
      <TooltipProvider>
        <PaneviewHeaderAction tooltip='Reset'>
          <svg data-testid='icon' />
        </PaneviewHeaderAction>
      </TooltipProvider>,
    );

    expect(screen.getByRole('button')).toBeInTheDocument();
  });

  it('does not render tooltip wrapper when tooltip prop is absent', () => {
    const { container } = render(
      <PaneviewHeaderAction>
        <svg data-testid='icon' />
      </PaneviewHeaderAction>,
    );

    expect(container.querySelectorAll('button')).toHaveLength(1);
  });

  it('applies custom className', () => {
    render(
      <PaneviewHeaderAction className='custom-class'>
        <svg data-testid='icon' />
      </PaneviewHeaderAction>,
    );

    const button = screen.getByRole('button');
    expect(button.classList.contains('custom-class')).toBe(true);
  });
});

describe('PaneviewHeaderActionGroup', () => {
  it('renders children', () => {
    render(
      <PaneviewHeaderActionGroup>
        <span data-testid='child-a'>A</span>
        <span data-testid='child-b'>B</span>
      </PaneviewHeaderActionGroup>,
    );

    expect(screen.getByTestId('child-a')).toBeInTheDocument();
    expect(screen.getByTestId('child-b')).toBeInTheDocument();
  });

  it('applies flex layout classes', () => {
    const { container } = render(
      <PaneviewHeaderActionGroup>
        <span>A</span>
      </PaneviewHeaderActionGroup>,
    );

    const group = container.firstElementChild!;
    expect(group.classList.contains('flex')).toBe(true);
    expect(group.classList.contains('items-center')).toBe(true);
    expect(group.classList.contains('gap-1')).toBe(true);
  });

  it('applies custom className', () => {
    const { container } = render(
      <PaneviewHeaderActionGroup className='extra'>
        <span>A</span>
      </PaneviewHeaderActionGroup>,
    );

    const group = container.firstElementChild!;
    expect(group.classList.contains('extra')).toBe(true);
  });
});
