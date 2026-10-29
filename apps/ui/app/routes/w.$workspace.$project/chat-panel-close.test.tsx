// @vitest-environment jsdom
import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { KeyboardProvider } from '@taucad/ui/components/keyboard';
import { TooltipProvider } from '@taucad/ui/components/tooltip';

/* The Files and Editor panels name their Close after the panel, as their tooltips do (I6, D4). */

vi.mock('#hooks/use-project-availability.js', () => ({
  useProjectAvailability: () => 'ready',
  useModelAvailability: () => 'ready',
  useLargeObjectPending: () => false,
}));
vi.mock('#routes/w.$workspace.$project/chat-editor-file-tree.js', () => ({
  ChatEditorFileTree: ({ closeButton }: { readonly closeButton?: React.ReactNode }) => <div>{closeButton}</div>,
}));
vi.mock('#routes/w.$workspace.$project/chat-workbench-dockview.js', () => ({ WorkbenchDockview: () => null }));

const { ChatFileTree } = await import('#routes/w.$workspace.$project/chat-file-tree.js');
const { ChatEditorLayout } = await import('#routes/w.$workspace.$project/chat-editor-layout.js');

const renderPanel = (panel: React.ReactNode): void => {
  render(
    <KeyboardProvider>
      <TooltipProvider>{panel}</TooltipProvider>
    </KeyboardProvider>,
  );
};

describe('named panel Close', () => {
  it('should name the Files Close after Files', () => {
    renderPanel(<ChatFileTree />);

    expect(screen.getByRole('button', { name: 'Close Files' })).toBeInTheDocument();
  });

  it('should name the Editor Close after Editor', () => {
    renderPanel(<ChatEditorLayout />);

    expect(screen.getByRole('button', { name: 'Close Editor' })).toBeInTheDocument();
  });
});
