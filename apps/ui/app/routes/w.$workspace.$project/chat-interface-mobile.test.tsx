// @vitest-environment jsdom
import { act, render, screen, waitFor } from '@testing-library/react';
import { useSyncExternalStore } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { ChatInterfaceMobile } from '#routes/w.$workspace.$project/chat-interface-mobile.js';

const state = vi.hoisted(() => ({ drawerOpen: false, listeners: new Set<() => void>() }));
const setDrawerOpen = (open: boolean): void => {
  act(() => {
    state.drawerOpen = open;
    for (const listener of state.listeners) {
      listener();
    }
  });
};

vi.mock('#routes/w.$workspace.$project/use-chat-interface-state.js', () => ({
  useChatInterfaceState: () => ({
    activeTab: 'viewer',
    handleTabChange: vi.fn(),
    drawerOpen: useSyncExternalStore(
      (listener) => {
        state.listeners.add(listener);
        return () => state.listeners.delete(listener);
      },
      () => state.drawerOpen,
    ),
    handleDrawerChange: vi.fn(),
    snapPoints: [0.5, 1],
    activeSnapPoint: 0.5,
    handleSnapChange: vi.fn(),
  }),
}));
vi.mock('#routes/w.$workspace.$project/focused-chat-gate.js', () => ({
  ChatInterfaceSessionGate: ({ children }: { children: React.ReactNode }): React.ReactNode => children,
}));
vi.mock('#routes/w.$workspace.$project/chat-viewer-dockview.js', () => ({
  ViewerDockview: () => <button type='button'>Viewer controls</button>,
}));
vi.mock('#routes/w.$workspace.$project/chat-history.js', () => ({ ChatHistory: () => null }));
vi.mock('#routes/w.$workspace.$project/chat-file-tree.js', () => ({ ChatFileTree: () => null }));
vi.mock('#routes/w.$workspace.$project/chat-parameters.js', () => ({ ChatParameters: () => null }));
vi.mock('#routes/w.$workspace.$project/chat-editor-layout.js', () => ({ ChatEditorLayout: () => null }));
vi.mock('#routes/w.$workspace.$project/chat-details.js', () => ({ ChatDetails: () => null }));
vi.mock('#routes/w.$workspace.$project/chat-converter.js', () => ({ ChatConverter: () => null }));
vi.mock('#routes/w.$workspace.$project/project-share-action.js', () => ({ ProjectShareWorkbenchPanel: () => null }));
vi.mock('#routes/w.$workspace.$project/chat-revisions.js', () => ({ ChatRevisions: () => null }));
vi.mock('#routes/w.$workspace.$project/project-unavailable-overlay.js', () => ({
  ProjectUnavailableOverlay: () => null,
}));
vi.mock('#routes/w.$workspace.$project/project-manifest-issue-banner.js', () => ({
  ProjectManifestIssueBanner: () => null,
}));
vi.mock('#routes/w.$workspace.$project/chat-interface-nav.js', () => ({ ChatInterfaceNav: () => null }));
vi.mock('#routes/w.$workspace.$project/workspace-skeleton.js', () => ({ WorkspaceSkeleton: () => null }));

describe('ChatInterfaceMobile', () => {
  it('should keep the viewer accessible while the docked panel opens and closes', async () => {
    state.drawerOpen = false;
    render(<ChatInterfaceMobile />);

    expect(screen.getByRole('button', { name: 'Viewer controls' })).toBeInTheDocument();

    setDrawerOpen(true);

    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Viewer controls' })).toBeInTheDocument();
    });
    expect(screen.getByText('Viewer controls').closest('[aria-hidden]')).toBeNull();
    expect(document.querySelector('[data-slot=drawer-overlay]')).toBeNull();

    setDrawerOpen(false);

    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Viewer controls' })).toBeInTheDocument();
    });
    expect(screen.getByText('Viewer controls').closest('[aria-hidden]')).toBeNull();
  });
});
