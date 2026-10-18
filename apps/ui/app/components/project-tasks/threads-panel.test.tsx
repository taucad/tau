// @vitest-environment jsdom
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { ProjectTask, ProjectTaskSnapshot } from '@taucad/agent-host/wire';
import type { ChatRecord } from '@taucad/chat/schemas';
import { ThreadsPanelBody, rootThreadTasks } from '#components/project-tasks/threads-panel.js';

const task = (
  id: string,
  parentTaskId?: string,
  status: ProjectTask['attempts'][number]['status'] = 'running',
): ProjectTask => ({
  id,
  projectId: 'project',
  chatId: `chat-${id}`,
  ...(parentTaskId ? { parentTaskId } : {}),
  depth: parentTaskId ? 1 : 0,
  title: id,
  prompt: `Instruction for ${id}`,
  provider: { id: 'codex' },
  attempts: [
    {
      id: `attempt-${id}`,
      number: 1,
      status,
      source: { revisionId: 'base', checkoutId: 'base' },
      toolGrant: { toolChoice: 'none' },
      createdAt: 1,
    },
  ],
  createdAt: 1,
  closed: false,
});

const snapshot: ProjectTaskSnapshot = {
  tasks: [
    task('root'),
    task('child', 'root'),
    task('grandchild', 'child', 'completed'),
    task('other'),
    task('foreign', 'other'),
  ],
  messages: [],
  cursor: 0,
  nextCursor: 0,
  hasMore: false,
};
const fixtureState = vi.hoisted(() => ({ offline: false, chats: [] as ChatRecord[] }));

vi.mock('#hooks/use-project.js', () => ({ useProject: () => ({ projectId: 'project' }) }));
vi.mock('#hooks/use-project-slug-route.js', () => ({
  useProjectSlugs: () => ({ status: 'resolved', value: { workspaceSlug: 'home' } }),
}));
vi.mock('#hooks/use-agent-projections.js', () => ({ useAgentProjections: () => ({ agents: [] }) }));
vi.mock('#hooks/use-project-tasks.js', () => ({
  useProjectTasks: () => ({
    snapshot: fixtureState.offline ? undefined : snapshot,
    isLoading: false,
    actions: { send: vi.fn(), cancel: vi.fn(), resume: vi.fn() },
    retry: vi.fn(),
  }),
}));
vi.mock('#hooks/use-chat-records.js', () => ({ useChatRecords: () => ({ chats: fixtureState.chats }) }));
vi.mock('#routes/w.$workspace.$project/chat-history.js', () => ({
  SelectedTaskHistory: ({ task: item }: { readonly task: ProjectTask }) => (
    <div aria-label='Selected thread'>{item.title}</div>
  ),
  MetadataTaskHistory: ({ chat }: { readonly chat: ChatRecord }) => <div aria-label='Offline thread'>{chat.name}</div>,
}));

describe('rootThreadTasks', () => {
  it('should include only children and grandchildren of the selected root', () => {
    expect(rootThreadTasks(snapshot.tasks, 'chat-root').map((item) => item.id)).toEqual(['child', 'grandchild']);
    expect(rootThreadTasks(snapshot.tasks, 'chat-other').map((item) => item.id)).toEqual(['foreign']);
  });

  it('should reject a missing parent and a cycle rather than leak foreign work', () => {
    const orphan = task('orphan', 'missing');
    const cycleA = task('cycle-a', 'cycle-b');
    const cycleB = task('cycle-b', 'cycle-a');
    expect(rootThreadTasks([...snapshot.tasks, orphan, cycleA, cycleB], 'chat-root').map((item) => item.id)).toEqual([
      'child',
      'grandchild',
    ]);
  });
});

describe('ThreadsPanelBody', () => {
  it('should show only a metadata-attested selected descendant while the task host is unavailable', () => {
    fixtureState.offline = true;
    fixtureState.chats = [
      { id: 'chat-root', resourceId: 'project', name: 'Root', createdAt: 1, updatedAt: 1 },
      {
        id: 'chat-child',
        resourceId: 'project',
        name: 'Mounting holes',
        createdAt: 1,
        updatedAt: 1,
        taskLineage: { taskId: 'child', parentTaskId: 'root', parentChatId: 'chat-root', rootChatId: 'chat-root' },
      },
      {
        id: 'chat-foreign',
        resourceId: 'project',
        name: 'Foreign',
        createdAt: 1,
        updatedAt: 1,
        taskLineage: { taskId: 'foreign', parentTaskId: 'other', parentChatId: 'chat-other', rootChatId: 'chat-other' },
      },
    ];
    try {
      const props = {
        rootChatId: 'chat-root',
        onSelectTask: vi.fn(),
        onBack: vi.fn(),
        onOpenParent: vi.fn(),
        onReviewCandidate: vi.fn(),
      };
      const { rerender } = render(<ThreadsPanelBody {...props} selectedTaskId='child' />);
      expect(screen.getByLabelText('Offline thread').textContent).toBe('Mounting holes');
      rerender(<ThreadsPanelBody {...props} selectedTaskId='foreign' />);
      expect(screen.queryByLabelText('Offline thread')).toBeNull();
      rerender(<ThreadsPanelBody {...props} selectedTaskId={undefined} />);
      expect(screen.queryByLabelText('Offline thread')).toBeNull();
    } finally {
      fixtureState.offline = false;
      fixtureState.chats = [];
    }
  });
  it('should group real child statuses and select a child without changing the root chat', () => {
    const onSelectTask = vi.fn();
    render(
      <ThreadsPanelBody
        rootChatId='chat-root'
        onSelectTask={onSelectTask}
        onBack={vi.fn()}
        onOpenParent={vi.fn()}
        onReviewCandidate={vi.fn()}
      />,
    );
    expect(screen.getByRole('region', { name: 'Threads for this chat' })).toBeDefined();
    expect(screen.getByRole('button', { name: 'Open child' })).toBeDefined();
    expect(screen.getByRole('button', { name: 'Open grandchild' })).toBeDefined();
    expect(screen.queryByRole('button', { name: /foreign/u })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Open child' }));
    expect(onSelectTask).toHaveBeenCalledWith('child');
  });

  it('should refuse a selected task outside the root and show the scoped overview', () => {
    render(
      <ThreadsPanelBody
        rootChatId='chat-root'
        selectedTaskId='foreign'
        onSelectTask={vi.fn()}
        onBack={vi.fn()}
        onOpenParent={vi.fn()}
        onReviewCandidate={vi.fn()}
      />,
    );
    expect(screen.queryByLabelText('Selected thread')).toBeNull();
    expect(screen.getByRole('button', { name: 'Open child' })).toBeDefined();
  });
});
