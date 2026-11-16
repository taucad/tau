// @vitest-environment jsdom
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { PrintPanelBody } from '#routes/w.$workspace.$project/chat-print.js';
import { ConverterPanelBody } from '#routes/w.$workspace.$project/chat-converter.js';
import { AgentsPanelBody } from '#routes/w.$workspace.$project/chat-agents.js';
import type { ProjectAvailability } from '#hooks/use-project-availability.js';

vi.mock('#flags/use-feature.js', () => ({ useFeature: () => mocks.enabled }));

const mocks = vi.hoisted(() => ({
  availability: 'downloading' as ProjectAvailability,
  /* The chats surface's own availability (SP2h); `undefined` follows the whole apply. */
  chatsAvailability: undefined as ProjectAvailability | undefined,
  enabled: true,
  machines: vi.fn(() => ({ available: false, reason: 'not-supported' })),
  approvalBridge: vi.fn(() => {
    throw new Error('No chat provider exists before chat discovery');
  }),
  agents: vi.fn(() => {
    throw new Error('Agents must not read provisional project data');
  }),
}));
const editorSnapshot = { context: { focusedChatId: undefined } };
const editorRef = { getSnapshot: () => editorSnapshot, subscribe: () => ({ unsubscribe: () => undefined }) };
vi.mock('#hooks/use-project-availability.js', () => ({
  useProjectAvailability: (surface?: string) =>
    surface === 'chats' ? (mocks.chatsAvailability ?? mocks.availability) : mocks.availability,
  useModelAvailability: () => mocks.availability,
  useLargeObjectPending: () => false,
  useLargeObjects: () => undefined,
}));
vi.mock('#hooks/use-project.js', () => ({ useProject: () => ({ editorRef }) }));
vi.mock('#hooks/use-machines.js', () => ({ useMachinesFacet: mocks.machines }));
vi.mock('#hooks/use-machines-approvals.js', () => ({ usePrintApprovalBridge: mocks.approvalBridge }));
vi.mock('#hooks/use-agent-projections.js', () => ({ useAgentProjections: mocks.agents }));
vi.mock('#hooks/use-revision-status.js', () => ({
  useRevisionClient: () => undefined,
  useRevisionStatus: () => undefined,
  useRevisionCommands: () => ({ connectRemote: vi.fn(), syncNow: vi.fn() }),
}));

beforeEach(() => {
  mocks.availability = 'downloading';
  mocks.chatsAvailability = undefined;
  mocks.enabled = true;
  vi.clearAllMocks();
});

describe('Workbench first-checkout readiness', () => {
  it('keeps a restored Print pane inert when disabled', () => {
    mocks.enabled = false;
    mocks.availability = 'ready';
    render(
      <MemoryRouter>
        <PrintPanelBody />
      </MemoryRouter>,
    );
    expect(screen.getByText('Machines are not available in this release.')).toBeInTheDocument();
    expect(mocks.machines).not.toHaveBeenCalled();
    expect(mocks.approvalBridge).not.toHaveBeenCalled();
  });
  it.each([
    ['Print', PrintPanelBody],
    ['Export', ConverterPanelBody],
    ['Agents', AgentsPanelBody],
  ] as const)('should show download progress before mounting %s consumers', (_name, Component) => {
    render(
      <MemoryRouter>
        <Component />
      </MemoryRouter>,
    );
    expect(screen.getByRole('region')).toHaveTextContent('Downloading project files');
    expect(screen.getByRole('region')).toHaveAttribute('aria-busy', 'true');
    expect(mocks.machines).not.toHaveBeenCalled();
    expect(mocks.approvalBridge).not.toHaveBeenCalled();
    expect(mocks.agents).not.toHaveBeenCalled();
  });

  /* SP2h: the Agents panel is a projection of the chats, so it opens on their records, not on the whole apply. */
  it('should mount the Agents projection once the chats may open, while the apply still writes', () => {
    mocks.availability = 'preparing';
    mocks.chatsAvailability = 'ready';
    /* The content mounts, and its first chat-session hook finds no store here; the placeholder would render. */
    expect(() =>
      render(
        <MemoryRouter>
          <AgentsPanelBody />
        </MemoryRouter>,
      ),
    ).toThrow('useChatSessionStore');
    expect(screen.queryByRole('region')).toBeNull();
  });

  it('should open the Print pane without a chat approval provider once files are ready', () => {
    mocks.availability = 'ready';
    render(
      <MemoryRouter>
        <PrintPanelBody />
      </MemoryRouter>,
    );
    expect(screen.getByText('Machines unavailable')).toBeInTheDocument();
    expect(screen.queryByText('Downloading project files')).not.toBeInTheDocument();
    expect(mocks.machines).toHaveBeenCalledOnce();
    expect(mocks.approvalBridge).not.toHaveBeenCalled();
  });
});
