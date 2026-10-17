import '#styles/global.css';
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { page, userEvent } from 'vitest/browser';
import type { ProjectTask, ProjectTaskSnapshot } from '@taucad/agent-host/wire';
import type { AgentProjection } from '#hooks/use-agent-projections.js';
import { ExperimentalSettings } from '#components/settings/experimental-settings.js';
import { ChatInterfaceNav } from '#routes/w.$workspace.$project/chat-interface-nav.js';
import { Tabs } from '@taucad/ui/components/tabs';
import { featureFlagStorageKey } from '#flags/flag.constants.js';
import { ThreadsPanelBody } from '#components/project-tasks/threads-panel.js';

const panelView = vi.hoisted(() => ({
  snapshot: undefined as ProjectTaskSnapshot | undefined,
  agents: [] as AgentProjection[],
}));
vi.mock('#hooks/use-project.js', () => ({ useProject: () => ({ projectId: 'project' }) }));
vi.mock('#hooks/use-project-slug-route.js', () => ({
  useProjectSlugs: () => ({ status: 'resolved', value: { workspaceSlug: 'home', projectSlug: 'bracket' } }),
}));
vi.mock('#hooks/use-project-tasks.js', () => ({
  useProjectTasks: () => ({
    snapshot: panelView.snapshot,
    isLoading: false,
    actions: { send: vi.fn(), cancel: vi.fn(), resume: vi.fn() },
    retry: vi.fn(),
  }),
}));
vi.mock('#hooks/use-agent-projections.js', () => ({
  useAgentProjections: () => ({ agents: panelView.agents, isLoading: false, retry: vi.fn() }),
}));
vi.mock('#hooks/use-chat-records.js', () => ({ useChatRecords: () => ({ chats: [] }) }));
vi.mock('#routes/w.$workspace.$project/chat-history.js', () => ({
  SelectedTaskHistory: () => null,
  MetadataTaskHistory: () => null,
}));

afterEach(cleanup);

const tasks: ProjectTask[] = [
  {
    id: 'root',
    projectId: 'project',
    chatId: 'chat-root',
    depth: 0,
    title: 'Design bracket',
    prompt: 'Design a bracket',
    provider: { id: 'codex' },
    createdAt: 1,
    closed: false,
    attempts: [
      {
        id: 'attempt-root',
        number: 1,
        status: 'running',
        toolGrant: { toolChoice: 'none', allowedTools: [] },
        source: { revisionId: 'source', checkoutId: 'checkout' },
        createdAt: 1,
      },
    ],
  },
  {
    id: 'child',
    projectId: 'project',
    chatId: 'chat-child',
    parentTaskId: 'root',
    depth: 1,
    title: 'Check mounting holes',
    prompt: 'Check mounting holes',
    provider: { id: 'tau' },
    createdAt: 2,
    closed: false,
    attempts: [
      {
        id: 'attempt-child',
        number: 1,
        status: 'running',
        toolGrant: { toolChoice: 'none', allowedTools: [] },
        source: { revisionId: 'source', checkoutId: 'candidate' },
        createdAt: 2,
      },
    ],
  },
  {
    id: 'grandchild',
    projectId: 'project',
    chatId: 'chat-grandchild',
    parentTaskId: 'child',
    depth: 2,
    title: 'Verify note',
    prompt: 'Read the supplied note',
    provider: { id: 'codex' },
    createdAt: 3,
    closed: false,
    attempts: [
      {
        id: 'attempt-grandchild',
        number: 1,
        status: 'running',
        toolGrant: { toolChoice: 'none', allowedTools: [] },
        source: { revisionId: 'source', checkoutId: 'grandchild-candidate' },
        createdAt: 3,
      },
    ],
  },
];

const denseTasks = (): ProjectTask[] => [
  {
    ...tasks[0]!,
    title: 'Design a manufacturable mounting bracket with several mounting patterns and verify its clearances',
    attempts: [{ ...tasks[0]!.attempts[0]!, status: 'completed', placementId: 'placement-root' }],
  },
  { ...tasks[1]!, attempts: [{ ...tasks[1]!.attempts[0]!, status: 'running' }] },
  {
    ...tasks[2]!,
    title: 'Check the final dimensions and mounting clearances against every drawing',
    attempts: [
      {
        ...tasks[2]!.attempts[0]!,
        status: 'failed',
        detail: 'Dimension check could not read the supplied drawing. Open the transcript, then retry.',
      },
    ],
  },
];

it('keeps root-scoped Threads groups reachable at desktop and narrow widths in light and dark themes', async () => {
  await page.viewport(800, 720);
  const fixture = denseTasks();
  fixture.push({ ...tasks[1]!, id: 'ongoing', chatId: 'chat-ongoing', title: 'Check fastener fit', createdAt: 4 });
  fixture.push({
    ...tasks[1]!,
    id: 'past',
    chatId: 'chat-past',
    title: 'Compare alloys',
    createdAt: 5,
    attempts: [{ ...tasks[1]!.attempts[0]!, id: 'attempt-past', status: 'completed' }],
  });
  panelView.snapshot = { tasks: fixture, messages: [], cursor: 5, nextCursor: 5, hasMore: false };
  panelView.agents = [
    {
      chatId: 'chat-child',
      name: 'Mounting hole check',
      state: 'waiting',
      focused: false,
      lastActivityAt: 2,
      model: { id: 'codex', name: 'Codex', family: 'unknown', provider: 'OpenAI' },
      workspace: 'project',
      branch: undefined,
      pendingApprovalCount: 1,
      operationIds: [],
      unread: false,
    },
  ];
  const onSelectTask = vi.fn();
  render(
    <main aria-label='Production Threads pane fixture' className='h-screen w-full bg-sidebar'>
      <ThreadsPanelBody
        rootChatId='chat-root'
        onSelectTask={onSelectTask}
        onBack={vi.fn()}
        onOpenParent={vi.fn()}
        onReviewCandidate={vi.fn()}
      />
    </main>,
  );
  const pane = screen.getByRole('main', { name: 'Production Threads pane fixture' });
  expect(screen.getByRole('button', { name: 'Waiting on you, 2 threads' })).toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Ongoing, 1 thread' })).toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Past threads, 1 thread' })).toBeInTheDocument();
  expect(screen.queryByRole('button', { name: 'Open Design bracket' })).toBeNull();
  screen.getByRole('button', { name: 'Waiting on you, 2 threads' }).focus();
  await userEvent.keyboard('{Enter}');
  expect(screen.queryByRole('button', { name: 'Open Check mounting holes' })).toBeNull();
  await userEvent.click(screen.getByRole('button', { name: 'Waiting on you, 2 threads' }));
  await userEvent.click(screen.getByRole('button', { name: 'Open Check mounting holes' }));
  expect(onSelectTask).toHaveBeenCalledWith('child');
  await page.viewport(320, 720);
  expect(pane.getBoundingClientRect().width).toBe(320);
  expect(pane.scrollWidth).toBeLessThanOrEqual(pane.clientWidth);
  await page.screenshot({ element: pane });
  document.documentElement.classList.add('dark');
  try {
    await page.screenshot({ element: pane });
  } finally {
    document.documentElement.classList.remove('dark');
    await page.viewport(800, 720);
  }
});

it('should persist the settings toggle and immediately update Threads navigation', async () => {
  await page.viewport(800, 1000);
  render(
    <main aria-label='Experimental settings and navigation' className='bg-background p-4 text-foreground'>
      <ExperimentalSettings />
      <Tabs defaultValue='chat'>
        <ChatInterfaceNav />
      </Tabs>
    </main>,
  );
  const toggle = screen.getByRole('switch', { name: 'Project threads' });
  expect(toggle).toBeChecked();
  expect(screen.getByRole('tab', { name: 'Threads' })).toBeVisible();
  await userEvent.click(toggle);
  expect(toggle).not.toBeChecked();
  expect(JSON.parse(localStorage.getItem(featureFlagStorageKey) ?? '{}').projectThreads).toBe(false);
  expect(screen.queryByRole('tab', { name: 'Threads' })).toBeNull();
  await page.screenshot({ element: screen.getByRole('main', { name: 'Experimental settings and navigation' }) });
  await userEvent.click(toggle);
  expect(toggle).toBeChecked();
  expect(screen.getByRole('tab', { name: 'Threads' })).toBeVisible();
  document.documentElement.classList.add('dark');
  try {
    await page.screenshot({ element: screen.getByRole('main', { name: 'Experimental settings and navigation' }) });
  } finally {
    document.documentElement.classList.remove('dark');
  }
});
