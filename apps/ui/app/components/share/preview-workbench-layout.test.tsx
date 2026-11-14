import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { PreviewWorkbenchLayout } from '#components/share/preview-workbench-layout.js';

vi.mock('@taucad/ui/hooks/use-mobile', () => ({
  useIsMobile: () => true,
}));

vi.mock('#routes/w.$workspace.$project/project-workspace-context.js', () => ({
  ProjectWorkspaceProvider: ({ children }: { readonly children: React.JSX.Element }): React.JSX.Element => children,
}));

vi.mock('#routes/w.$workspace.$project/chat-viewer-dockview.js', () => ({
  ViewerDockview: () => null,
}));

vi.mock('#routes/w.$workspace.$project/chat-workbench-dockview.js', () => ({
  WorkbenchDockview: () => <div data-resize-owner>Workbench panes</div>,
}));

describe('PreviewWorkbenchLayout', () => {
  it('should lift the phone Workbench drawer tab strip out of the Dockview stacking context above the grabber', async () => {
    render(<PreviewWorkbenchLayout renderTopbar={(trigger) => <header>{trigger}</header>} />);

    await userEvent.click(screen.getByRole('button', { name: 'Workbench' }));

    const drawer = await screen.findByRole('dialog', { name: 'Project workbench' });
    expect(screen.getByText('Workbench panes')).toBeInTheDocument();
    // Dockview's root is `isolate`, which would trap its z-6 tab strip under the grabber's z-1 reach; inside the sheet
    // the root stacks in the sheet's own context instead, so the tabs and actions stay on top and take the pointer.
    expect(drawer.className.split(' ')).toContain('[&_[data-resize-owner]]:isolation-auto');
  });
});
