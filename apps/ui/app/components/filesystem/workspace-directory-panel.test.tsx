// @vitest-environment jsdom
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { WorkspaceDirectoryPanel } from '#components/filesystem/workspace-directory-panel.js';

describe('WorkspaceDirectoryPanel', () => {
  it('offers Disconnect only while a handle exists and Reconnect after it is removed', () => {
    const onConnect = vi.fn();
    const onDisconnect = vi.fn();
    const { rerender } = render(
      <WorkspaceDirectoryPanel
        variant='row'
        status='connected'
        workspaceName='Workshop'
        onConnect={onConnect}
        onDisconnect={onDisconnect}
      />,
    );

    expect(screen.getByRole('button', { name: 'Change folder' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Disconnect workspace' }));
    expect(onDisconnect).toHaveBeenCalledOnce();

    rerender(
      <WorkspaceDirectoryPanel
        variant='row'
        status='disconnected'
        workspaceName='Workshop'
        onConnect={onConnect}
        onDisconnect={onDisconnect}
      />,
    );

    expect(screen.queryByRole('button', { name: 'Disconnect workspace' })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Reconnect' }));
    expect(onConnect).toHaveBeenCalledOnce();
  });
});
