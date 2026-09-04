// @vitest-environment jsdom
import { fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { AgentProjection } from '#hooks/use-agent-projections.js';
import type * as AgentProjectionsModule from '#hooks/use-agent-projections.js';
import { useAgentProjections } from '#hooks/use-agent-projections.js';
import { AgentList, AgentsPanelBody } from '#routes/w.$workspace.$project/chat-agents.js';

vi.mock('#components/icons/svg-icon.js', () => ({
  SvgIcon: ({ id }: { readonly id: string }) => <span data-testid={`model-icon-${id}`} />,
}));
vi.mock('#hooks/use-project.js', () => ({ useProject: () => ({ projectId: 'project-1' }) }));
vi.mock('#hooks/use-project-slug-route.js', () => ({
  useProjectSlugs: () => ({ status: 'resolved', value: { workspaceSlug: 'tau', projectSlug: 'engine' } }),
}));
vi.mock('#hooks/use-agent-projections.js', async (importOriginal) => {
  const original = await importOriginal<typeof AgentProjectionsModule>();
  return { ...original, useAgentProjections: vi.fn() };
});

const projection = (over: Partial<AgentProjection> = {}): AgentProjection => ({
  chatId: 'chat-1',
  name: 'Bracket exploration',
  state: 'running',
  focused: true,
  lastActivityAt: 1000,
  model: {
    id: 'anthropic/claude-sonnet',
    name: 'Claude Sonnet',
    family: 'claude',
    provider: 'Anthropic',
  },
  workspace: 'tau',
  branch: 'fea/bracket-v2',
  pendingApprovalCount: 0,
  totalCost: 0,
  unread: false,
  detail: 'Streaming response',
  ...over,
});

beforeEach(() => {
  vi.mocked(useAgentProjections).mockReturnValue({
    agents: [],
    isLoading: false,
    error: undefined,
    retry: vi.fn(),
  });
});

describe('AgentList', () => {
  it('renders state, focus, activity, model/provider, workspace, branch, approval, unread, and navigation', () => {
    render(
      <MemoryRouter>
        <AgentList
          agents={[
            projection({
              state: 'waiting',
              focused: false,
              unread: true,
              pendingApprovalCount: 2,
              detail: '2 approvals required',
            }),
          ]}
          projectSlugs={{ workspaceSlug: 'tau', projectSlug: 'engine' }}
        />
      </MemoryRouter>,
    );

    const row = screen.getByRole('link', { name: 'Bracket exploration, waiting' });
    expect(row.getAttribute('href')).toBe('/w/tau/engine?chat=chat-1');
    expect(screen.getByText('Waiting')).not.toBeNull();
    expect(screen.getByLabelText('Unread activity')).not.toBeNull();
    expect(screen.getByText('2 approvals required')).not.toBeNull();
    expect(screen.getByText('Approval · 2')).not.toBeNull();
    expect(screen.getByText('Claude Sonnet')).not.toBeNull();
    expect(screen.getByText('Anthropic')).not.toBeNull();
    expect(screen.getByText('tau')).not.toBeNull();
    expect(screen.getByText('fea/bracket-v2')).not.toBeNull();
    expect(row.querySelector('time')?.getAttribute('dateTime')).toBe(new Date(1000).toISOString());
  });

  it('exposes focused, running, waiting, error, and idle without collapsing them into one status', () => {
    render(
      <MemoryRouter>
        <AgentList
          agents={[
            projection({ chatId: 'focused', name: 'Focused agent', state: 'idle', focused: true }),
            projection({ chatId: 'running', name: 'Running agent', state: 'running', focused: false }),
            projection({ chatId: 'waiting', name: 'Waiting agent', state: 'waiting', focused: false }),
            projection({ chatId: 'error', name: 'Errored agent', state: 'error', focused: false }),
            projection({ chatId: 'idle', name: 'Idle agent', state: 'idle', focused: false }),
          ]}
        />
      </MemoryRouter>,
    );

    expect(screen.getByText('Focused')).not.toBeNull();
    expect(screen.getAllByText('Running')).toHaveLength(1);
    expect(screen.getAllByText('Waiting')).toHaveLength(1);
    expect(screen.getAllByText('Error')).toHaveLength(1);
    expect(screen.getAllByText('Idle')).toHaveLength(2);
  });
});

describe('AgentsPanelBody', () => {
  it('summarises concurrent and attention-needing agents from the projection hook', () => {
    vi.mocked(useAgentProjections).mockReturnValue({
      agents: [
        projection(),
        projection({ chatId: 'waiting', name: 'Waiting agent', state: 'waiting', focused: false }),
        projection({ chatId: 'idle', name: 'Idle agent', state: 'idle', focused: false, unread: true }),
      ],
      isLoading: false,
      error: undefined,
      retry: vi.fn(),
    });

    render(
      <MemoryRouter>
        <AgentsPanelBody />
      </MemoryRouter>,
    );

    const overview = screen.getByLabelText('Agent overview');
    expect(overview.textContent).toContain('3agents');
    expect(overview.textContent).toContain('2 active');
    expect(overview.textContent).toContain('2need attention');
  });

  it('offers recovery when the durable projection query fails', () => {
    const retry = vi.fn();
    vi.mocked(useAgentProjections).mockReturnValue({
      agents: [],
      isLoading: false,
      error: 'Could not read project chats',
      retry,
    });

    render(
      <MemoryRouter>
        <AgentsPanelBody />
      </MemoryRouter>,
    );
    expect(screen.getByRole('alert', { name: 'Agents unavailable' })).toHaveTextContent(
      'Agents unavailableCould not read project chatsRetry',
    );
    fireEvent.click(screen.getByRole('button', { name: 'Retry' }));
    expect(retry).toHaveBeenCalledOnce();
  });
});
