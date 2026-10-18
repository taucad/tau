// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter, useLocation } from 'react-router';
import type { ChatRecord } from '@taucad/chat/schemas';
import type { ProjectTask } from '@taucad/agent-host/wire';
import type { PanelState } from '#types/editor.types.js';
import { defaultPanelState } from '#constants/editor.constants.js';
import { mergePanelState } from '#utils/panel-state.utils.js';
import {
  ThreadNavigationProvider,
  taskBelongsToRoot,
  useThreadNavigation,
} from '#routes/w.$workspace.$project/thread-navigation-context.js';

const state = vi.hoisted(() => ({
  root: 'chat-root',
  panel: undefined as PanelState | undefined,
  tasks: [] as ProjectTask[],
  chats: [] as ChatRecord[],
  connected: true,
}));
const send = vi.fn((event: { type: string; panelState: Partial<PanelState> }) => {
  state.panel = mergePanelState(state.panel ?? defaultPanelState, event.panelState);
});
vi.mock('#hooks/use-project.js', () => ({
  useProject: () => ({
    projectId: 'project',
    editorRef: { send, getSnapshot: () => ({ context: { panelState: state.panel } }) },
  }),
}));
vi.mock('@xstate/react', () => ({
  useSelector: (
    _actor: unknown,
    select: (snapshot: { context: { focusedChatId: string; panelState: PanelState } }) => unknown,
  ) => select({ context: { focusedChatId: state.root, panelState: state.panel ?? defaultPanelState } }),
}));
vi.mock('#hooks/use-project-tasks.js', () => ({
  useProjectTasks: () => ({ snapshot: state.connected ? { tasks: state.tasks } : undefined }),
}));
vi.mock('#hooks/use-chat-records.js', () => ({ useChatRecords: () => ({ chats: state.chats }) }));
const task = (id: string, parentTaskId?: string): ProjectTask => ({
  id,
  parentTaskId,
  projectId: 'project',
  chatId: `chat-${id}`,
  depth: parentTaskId ? 1 : 0,
  title: id,
  prompt: id,
  provider: { id: 'codex' },
  createdAt: 1,
  closed: false,
  attempts: [
    {
      id: `attempt-${id}`,
      number: 1,
      status: 'completed',
      source: { revisionId: 'base', checkoutId: 'base' },
      toolGrant: { toolChoice: 'none' },
      createdAt: 1,
      candidateCheckoutId: `candidate-${id}`,
    },
  ],
});
function Probe(): React.JSX.Element {
  const nav = useThreadNavigation();
  const location = useLocation();
  return (
    <>
      <output>{nav.selectedTaskId ?? 'overview'}</output>
      <div data-testid='search'>{location.search}</div>
      <span>{nav.candidateReview?.checkoutId ?? 'no review'}</span>
      <span>{String(nav.getThreadGroupOpen('Ongoing'))}</span>
      <span>{nav.getThreadView('child').scrollTop ?? 0}</span>
      <button
        type='button'
        onClick={() => {
          nav.setThreadGroupOpen('Ongoing', false);
          nav.setThreadView('child', { scrollTop: 245, detailsOpen: true });
        }}
      >
        Save reading position
      </button>
      <button
        type='button'
        onClick={() => {
          nav.openThreads('child');
        }}
      >
        Open child
      </button>
      <button
        type='button'
        onClick={() => {
          nav.openThreads('other-child');
        }}
      >
        Open foreign
      </button>
      <button type='button' onClick={nav.back}>
        Back
      </button>
      <button
        type='button'
        onClick={() => {
          nav.openParent('grandchild');
        }}
      >
        Parent
      </button>
      <button
        type='button'
        onClick={() => {
          nav.reviewCandidate('child');
        }}
      >
        Review
      </button>
    </>
  );
}
const openPanel = vi.fn();
const tree = (): React.JSX.Element => (
  <MemoryRouter>
    <ThreadNavigationProvider openPanel={openPanel} isLayoutControllerReady>
      <Probe />
    </ThreadNavigationProvider>
  </MemoryRouter>
);
beforeEach(() => {
  vi.clearAllMocks();
  state.root = 'chat-root';
  state.connected = true;
  state.chats = [];
  state.panel = defaultPanelState;
  state.tasks = [
    task('root'),
    task('child', 'root'),
    task('grandchild', 'child'),
    task('other'),
    task('other-child', 'other'),
  ];
});
describe('Threads navigation', () => {
  it('should preserve reading position and disclosure across close, root switch and reopen', () => {
    const view = render(tree());
    fireEvent.click(screen.getByText('Save reading position'));
    view.rerender(tree());
    expect(screen.getByText('245')).toBeInTheDocument();
    expect(screen.getByText('false')).toBeInTheDocument();
    fireEvent.click(screen.getByText('Open child'));
    view.rerender(tree());
    state.root = 'chat-other';
    view.rerender(tree());
    expect(screen.getByText('0')).toBeInTheDocument();
    state.root = 'chat-root';
    view.unmount();
    render(tree());
    expect(screen.getByText('245')).toBeInTheDocument();
    expect(screen.getByText('false')).toBeInTheDocument();
    expect(screen.getByRole('status')).toHaveTextContent('child');
  });
  it('should navigate to a grandchild parent from synced metadata while the host is unavailable', () => {
    state.connected = false;
    state.chats = ['child', 'grandchild'].map((id) => ({
      id: `chat-${id}`,
      resourceId: 'project',
      name: id,
      createdAt: 1,
      updatedAt: 1,
      taskLineage: {
        taskId: id,
        parentTaskId: id === 'child' ? 'root' : 'child',
        parentChatId: id === 'child' ? 'chat-root' : 'chat-child',
        rootChatId: 'chat-root',
      },
    }));
    const view = render(tree());
    fireEvent.click(screen.getByText('Parent'));
    view.rerender(tree());
    expect(screen.getByRole('status')).toHaveTextContent('child');
  });
  it('should consume a deep link once without replaying it after Back', () => {
    const linkedTree = (): React.JSX.Element => (
      <MemoryRouter initialEntries={['/w/home/project?chat=chat-root&thread=grandchild']}>
        <ThreadNavigationProvider openPanel={openPanel} isLayoutControllerReady>
          <Probe />
        </ThreadNavigationProvider>
      </MemoryRouter>
    );
    const view = render(linkedTree());
    view.rerender(linkedTree());
    expect(screen.getByRole('status')).toHaveTextContent('grandchild');
    fireEvent.click(screen.getByText('Back'));
    view.rerender(linkedTree());
    expect(screen.getByRole('status')).toHaveTextContent('overview');
    expect(openPanel).toHaveBeenCalledTimes(2);
  });
  it('should wait for the layout owner before accepting a thread deep link', () => {
    const view = render(
      <MemoryRouter initialEntries={['/w/home/project?chat=chat-root&thread=child']}>
        <ThreadNavigationProvider openPanel={openPanel} isLayoutControllerReady={false}>
          <Probe />
        </ThreadNavigationProvider>
      </MemoryRouter>,
    );
    expect(screen.getByRole('status')).toHaveTextContent('overview');
    expect(screen.getByTestId('search')).toHaveTextContent('thread=child');
    expect(openPanel).not.toHaveBeenCalled();

    view.rerender(
      <MemoryRouter initialEntries={['/w/home/project?chat=chat-root&thread=child']}>
        <ThreadNavigationProvider openPanel={openPanel} isLayoutControllerReady>
          <Probe />
        </ThreadNavigationProvider>
      </MemoryRouter>,
    );
    expect(screen.getByRole('status')).toHaveTextContent('child');
    expect(screen.getByTestId('search')).not.toHaveTextContent('thread=child');
    expect(openPanel).toHaveBeenCalledExactlyOnceWith('agents');
    fireEvent.click(screen.getByText('Back'));
    view.rerender(
      <MemoryRouter initialEntries={['/w/home/project?chat=chat-root&thread=child']}>
        <ThreadNavigationProvider openPanel={openPanel} isLayoutControllerReady>
          <Probe />
        </ThreadNavigationProvider>
      </MemoryRouter>,
    );
    expect(screen.getByRole('status')).toHaveTextContent('overview');
    expect(openPanel).toHaveBeenCalledTimes(2);
  });
  it('should reject foreign, missing and cyclic ancestry', () => {
    expect(taskBelongsToRoot(state.tasks, 'grandchild', 'chat-root')).toBe(true);
    expect(taskBelongsToRoot(state.tasks, 'other-child', 'chat-root')).toBe(false);
    expect(taskBelongsToRoot([task('child', 'missing')], 'child', 'chat-root')).toBe(false);
    expect(taskBelongsToRoot([task('child', 'loop'), task('loop', 'child')], 'child', 'chat-root')).toBe(false);
    expect(taskBelongsToRoot(state.tasks, 'root', 'chat-root')).toBe(false);
  });
  it('should restore independent root selections and clear the selected thread on Back', () => {
    const view = render(tree());
    fireEvent.click(screen.getByText('Open child'));
    view.rerender(tree());
    expect(screen.getByRole('status')).toHaveTextContent('child');
    state.root = 'chat-other';
    view.rerender(tree());
    expect(screen.getByRole('status')).toHaveTextContent('overview');
    fireEvent.click(screen.getByText('Open foreign'));
    view.rerender(tree());
    expect(screen.getByRole('status')).toHaveTextContent('other-child');
    state.root = 'chat-root';
    view.rerender(tree());
    expect(screen.getByRole('status')).toHaveTextContent('child');
    fireEvent.click(screen.getByText('Back'));
    view.rerender(tree());
    expect(screen.getByRole('status')).toHaveTextContent('overview');
  });
  it('should not select another root or change editor focus when following a parent', () => {
    const view = render(tree());
    fireEvent.click(screen.getByText('Open foreign'));
    expect(send).not.toHaveBeenCalled();
    fireEvent.click(screen.getByText('Parent'));
    view.rerender(tree());
    expect(screen.getByRole('status')).toHaveTextContent('child');
    expect(send.mock.calls.every(([event]) => event.type === 'setPanelState')).toBe(true);
  });
  it('should invalidate a selected candidate immediately when a retry replaces the attempt', () => {
    const view = render(tree());
    fireEvent.click(screen.getByText('Review'));
    expect(screen.getByText('candidate-child')).toBeInTheDocument();
    state.tasks = state.tasks.map((entry) =>
      entry.id === 'child'
        ? {
            ...entry,
            attempts: [
              ...entry.attempts,
              { ...entry.attempts[0]!, id: 'attempt-2', number: 2, candidateCheckoutId: undefined },
            ],
          }
        : entry,
    );
    view.rerender(tree());
    expect(screen.getByText('no review')).toBeInTheDocument();
    expect(openPanel).toHaveBeenCalledWith('revisions');
  });
});
