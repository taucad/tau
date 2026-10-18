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
vi.mock('#hooks/use-project-availability.js', () => ({ useProjectAvailability: () => mocks.availability }));
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
    expect(screen.getByRole('region')).toMatchTextContent('Downloading project files');
    expect(screen.getByRole('region')).toHaveAttribute('aria-busy', 'true');
    expect(mocks.machines).not.toHaveBeenCalled();
    expect(mocks.approvalBridge).not.toHaveBeenCalled();
    expect(mocks.agents).not.toHaveBeenCalled();
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
