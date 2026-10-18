// @vitest-environment jsdom
/**
 * B-27, D-UI-16: a phone loads the mobile shell and the panel it shows, not the
 * desktop shell (dockview workbench) or every other tab's panel.
 */
import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { ChatInterface } from '#routes/w.$workspace.$project/chat-interface.js';

const loaded = vi.hoisted(() => new Set<string>());

/* Each factory runs only when its module is imported, so `loaded` records which modules a render needed. */
const panel = vi.hoisted(() => (name: string, label: string) => () => {
  loaded.add(name);
  return { [name]: () => label };
});

vi.mock('@taucad/ui/hooks/use-mobile', () => ({ useIsMobile: () => true }));
vi.mock('#providers/part-thumbnail-provider.js', () => ({
  PartThumbnailProvider: ({ children }: { children: React.ReactNode }): React.ReactNode => children,
}));
vi.mock('#components/geometry/cad/part-gallery.js', () => ({
  PartGalleryProvider: ({ children }: { children: React.ReactNode }): React.ReactNode => children,
}));
vi.mock('#routes/w.$workspace.$project/chat-interface-desktop.js', panel('ChatInterfaceDesktop', 'Desktop shell'));
vi.mock('#routes/w.$workspace.$project/use-chat-interface-state.js', () => ({
  useChatInterfaceState: () => ({
    activeTab: 'chat',
    handleTabChange: vi.fn(),
    drawerOpen: true,
    handleDrawerChange: vi.fn(),
    snapPoints: [0.5, 1],
    activeSnapPoint: 0.5,
    handleSnapChange: vi.fn(),
  }),
}));
vi.mock('#routes/w.$workspace.$project/focused-chat-gate.js', () => ({
  ChatHistoryGate: ({ children }: { children: React.ReactNode }): React.ReactNode => children,
  ChatInterfaceSessionGate: ({ children }: { children: React.ReactNode }): React.ReactNode => children,
}));
vi.mock('#routes/w.$workspace.$project/chat-viewer-dockview.js', () => ({ ViewerDockview: () => null }));
vi.mock('#routes/w.$workspace.$project/chat-history.js', panel('ChatHistory', 'Chat history'));
vi.mock('#routes/w.$workspace.$project/chat-file-tree.js', panel('ChatFileTree', 'Files'));
vi.mock('#routes/w.$workspace.$project/chat-parameters.js', panel('ChatParameters', 'Parameters'));
vi.mock('#routes/w.$workspace.$project/chat-editor-layout.js', panel('ChatEditorLayout', 'Editor'));
vi.mock('#routes/w.$workspace.$project/chat-details.js', panel('ChatDetails', 'Details'));
vi.mock('#routes/w.$workspace.$project/chat-converter.js', panel('ChatConverter', 'Converter'));
vi.mock('#routes/w.$workspace.$project/project-share-action.js', panel('ProjectShareWorkbenchPanel', 'Share'));
vi.mock('#routes/w.$workspace.$project/chat-revisions.js', panel('ChatRevisions', 'Revisions'));
vi.mock('#routes/w.$workspace.$project/project-unavailable-overlay.js', () => ({
  ProjectUnavailableOverlay: () => null,
}));
vi.mock('#routes/w.$workspace.$project/project-manifest-issue-banner.js', () => ({
  ProjectManifestIssueBanner: () => null,
}));
vi.mock('#routes/w.$workspace.$project/chat-interface-nav.js', () => ({ ChatInterfaceNav: () => null }));
vi.mock('#routes/w.$workspace.$project/workspace-skeleton.js', () => ({ WorkspaceSkeleton: () => null }));

describe('ChatInterface code splitting (B-27, D-UI-16)', () => {
  it('loads only the mobile shell and the open tab on a phone', async () => {
    render(<ChatInterface />);

    expect(await screen.findByText('Chat history')).toBeInTheDocument();
    expect([...loaded]).toEqual(['ChatHistory']);
  });
});
