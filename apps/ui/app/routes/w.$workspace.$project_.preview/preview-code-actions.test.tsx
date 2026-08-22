import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';

vi.mock('#components/ui/dropdown-menu.js', () => ({
  DropdownMenu: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  DropdownMenuTrigger: ({ children }: { children: React.ReactNode }) => <span>{children}</span>,
  DropdownMenuContent: ({ children }: { children: React.ReactNode }) => (
    <div data-testid='dropdown-menu-content'>{children}</div>
  ),
  DropdownMenuItem: ({
    children,
    onClick,
    disabled: isDisabled,
  }: {
    children: React.ReactNode;
    onClick?: () => void;
    // oxlint-disable-next-line react-js/boolean-prop-naming -- mocking shadcn DropdownMenuItem prop API
    disabled?: boolean;
  }) => (
    <button
      type='button'
      role='menuitem'
      disabled={isDisabled}
      onClick={() => {
        if (!isDisabled) {
          onClick?.();
        }
      }}
    >
      {children}
    </button>
  ),
}));

const { PreviewCodeActions } = await import('./preview-code-actions.js');

beforeEach(() => {
  vi.clearAllMocks();
});

describe('PreviewCodeActions', () => {
  it('should render a standalone Remix button when isStaticProject is true', () => {
    try {
      render(<PreviewCodeActions isStaticProject isCloning={false} onRemix={vi.fn()} onDownloadZip={vi.fn()} />);

      expect(screen.getByRole('button', { name: 'Remix' })).toBeInTheDocument();
      expect(screen.queryByRole('button', { name: 'Edit' })).toBeNull();
    } finally {
      cleanup();
    }
  });

  it('should render an Edit label when isStaticProject is false', () => {
    try {
      render(
        <PreviewCodeActions isStaticProject={false} isCloning={false} onRemix={vi.fn()} onDownloadZip={vi.fn()} />,
      );

      expect(screen.getByRole('button', { name: 'Edit' })).toBeInTheDocument();
      expect(screen.queryByRole('button', { name: 'Remix' })).toBeNull();
    } finally {
      cleanup();
    }
  });

  it('should render Remixing... and disable the primary button while cloning', () => {
    try {
      render(<PreviewCodeActions isStaticProject isCloning onRemix={vi.fn()} onDownloadZip={vi.fn()} />);

      const button = screen.getByRole('button', { name: 'Remixing...' });
      expect(button).toBeInTheDocument();
      expect(button).toBeDisabled();
    } finally {
      cleanup();
    }
  });

  it('should call onRemix when the primary button is clicked', () => {
    const onRemix = vi.fn();
    try {
      render(<PreviewCodeActions isStaticProject isCloning={false} onRemix={onRemix} onDownloadZip={vi.fn()} />);

      fireEvent.click(screen.getByRole('button', { name: 'Remix' }));

      expect(onRemix).toHaveBeenCalledTimes(1);
    } finally {
      cleanup();
    }
  });

  it('should expose Download ZIP through the icon menu rather than as a top-level button', () => {
    try {
      render(<PreviewCodeActions isStaticProject isCloning={false} onRemix={vi.fn()} onDownloadZip={vi.fn()} />);

      const downloadItem = screen.getByRole('menuitem', { name: /download zip/i });
      expect(downloadItem).toBeInTheDocument();
      expect(screen.getByTestId('preview-code-actions-menu')).toBeInTheDocument();
    } finally {
      cleanup();
    }
  });

  it('should call onDownloadZip when the Download ZIP menu item is clicked', () => {
    const onDownloadZip = vi.fn();
    try {
      render(<PreviewCodeActions isStaticProject isCloning={false} onRemix={vi.fn()} onDownloadZip={onDownloadZip} />);

      fireEvent.click(screen.getByRole('menuitem', { name: /download zip/i }));

      expect(onDownloadZip).toHaveBeenCalledTimes(1);
    } finally {
      cleanup();
    }
  });
});
