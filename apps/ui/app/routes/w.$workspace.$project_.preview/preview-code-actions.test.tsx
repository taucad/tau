import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';

vi.mock('@taucad/ui/components/dropdown-menu', () => ({
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
  it('renders the owned-project Edit action', () => {
    try {
      render(<PreviewCodeActions onEdit={vi.fn()} onDownloadZip={vi.fn()} />);

      expect(screen.getByRole('button', { name: 'Edit' })).toBeInTheDocument();
      expect(screen.queryByRole('button', { name: 'Remix' })).toBeNull();
    } finally {
      cleanup();
    }
  });

  it('calls onEdit when the primary button is clicked', () => {
    const onEdit = vi.fn();
    try {
      render(<PreviewCodeActions onEdit={onEdit} onDownloadZip={vi.fn()} />);

      fireEvent.click(screen.getByRole('button', { name: 'Edit' }));

      expect(onEdit).toHaveBeenCalledTimes(1);
    } finally {
      cleanup();
    }
  });

  it('should expose Download ZIP through the icon menu rather than as a top-level button', () => {
    try {
      render(<PreviewCodeActions onEdit={vi.fn()} onDownloadZip={vi.fn()} />);

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
      render(<PreviewCodeActions onEdit={vi.fn()} onDownloadZip={onDownloadZip} />);

      fireEvent.click(screen.getByRole('menuitem', { name: /download zip/i }));

      expect(onDownloadZip).toHaveBeenCalledTimes(1);
    } finally {
      cleanup();
    }
  });
});
