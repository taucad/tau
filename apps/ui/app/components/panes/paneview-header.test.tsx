import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';
import type { PaneviewPanelApi } from 'dockview-react';
import {
  PaneviewHeader,
  PaneviewHeaderAction,
  PaneviewHeaderActionGroup,
  PaneviewHeaderControls,
  PaneviewHeaderContentActions,
  PaneviewHeaderTitle,
  paneviewStyleOverrides,
} from '#components/panes/paneview-header.js';
import { TooltipProvider } from '#components/ui/tooltip.js';

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
  });

  it('renders chevron rotated when expanded', () => {
    render(<PaneviewHeader api={mockApi} title='main.ts' />);

    const chevron = screen.getByRole('button').querySelector('svg')!;
    expect(chevron.classList.contains('rotate-90')).toBe(true);
  });

  it('renders chevron un-rotated when collapsed', () => {
    mockApi = createMockApi(false);
    render(<PaneviewHeader api={mockApi} title='main.ts' />);

    const chevron = screen.getByRole('button').querySelector('svg')!;
    expect(chevron.classList.contains('rotate-90')).toBe(false);
  });

  it('collapses panel on click when expanded', () => {
    render(<PaneviewHeader api={mockApi} title='main.ts' />);

    fireEvent.click(screen.getByRole('button'));

    expect(mockApi.setExpanded).toHaveBeenCalledWith(false);
    expect(mockApi.setSize).not.toHaveBeenCalled();
  });

  it('expands panel and sets default size on click when collapsed', () => {
    mockApi = createMockApi(false);
    render(<PaneviewHeader api={mockApi} title='main.ts' />);

    fireEvent.click(screen.getByRole('button'));

    expect(mockApi.setExpanded).toHaveBeenCalledWith(true);
    expect(mockApi.setSize).toHaveBeenCalledWith({ size: 200 });
  });

  it('updates chevron when expansion changes externally', () => {
    render(<PaneviewHeader api={mockApi} title='main.ts' />);

    const chevron = screen.getByRole('button').querySelector('svg')!;
    expect(chevron.classList.contains('rotate-90')).toBe(true);

    act(() => {
      mockApi.triggerExpansionChange(false);
    });

    expect(chevron.classList.contains('rotate-90')).toBe(false);
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

  it('toggles on Enter key', () => {
    mockApi = createMockApi(false);
    render(<PaneviewHeader api={mockApi} title='main.ts' />);

    fireEvent.keyDown(screen.getByRole('button'), { key: 'Enter' });

    expect(mockApi.setExpanded).toHaveBeenCalledWith(true);
    expect(mockApi.setSize).toHaveBeenCalledWith({ size: 200 });
  });

  it('toggles on Space key', () => {
    render(<PaneviewHeader api={mockApi} title='main.ts' />);

    fireEvent.keyDown(screen.getByRole('button'), { key: ' ' });

    expect(mockApi.setExpanded).toHaveBeenCalledWith(false);
  });

  it('applies group/paneview-header class', () => {
    render(<PaneviewHeader api={mockApi} title='main.ts' />);

    const root = screen.getByRole('button');
    expect(root.classList.contains('group/paneview-header')).toBe(true);
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
  it('should include the paneview header border color variable', () => {
    expect(paneviewStyleOverrides).toContain('--dv-paneview-header-border-color');
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

  it('applies ghost hover classes', () => {
    render(
      <PaneviewHeaderAction>
        <svg data-testid='icon' />
      </PaneviewHeaderAction>,
    );

    const button = screen.getByRole('button');
    expect(button.classList.contains('hover:bg-accent')).toBe(true);
  });

  it('renders with size-5 for compact header fit', () => {
    render(
      <PaneviewHeaderAction>
        <svg data-testid='icon' />
      </PaneviewHeaderAction>,
    );

    const button = screen.getByRole('button');
    expect(button.classList.contains('size-5')).toBe(true);
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
