import '#styles/global.css';
import { useSyncExternalStore } from 'react';
import { act, cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { page } from 'vitest/browser';
import type { MyUIMessage } from '@taucad/chat';
import type { FileContentResult } from '@taucad/fs-client/file-content-service';
import { TooltipProvider } from '@taucad/ui/components/tooltip';
import { buildTurnGroups } from '#routes/w.$workspace.$project/chat-turn-groups.js';
import { initialChatProjection, materializeTranscript, reduceChatProjection } from '#machines/chat-projection.logic.js';
import { lifecycleRow, logRow } from '#machines/chat-projection.fixture.js';

/**
 * One chat's session as the lane reads it: its transcript, the load state the session reports (I21: A12 adds it to
 * the store), and the task-list file that the chat's tray reads. The row publishes through the session's
 * subscription, so a resolved load commits as the store's would.
 */
type MockChatSession = {
  readonly messages: readonly MyUIMessage[];
  readonly transcript: 'loading' | 'loaded' | 'empty';
  readonly todoList: FileContentResult;
};
const chatSession: { current: MockChatSession } = {
  current: { messages: [], transcript: 'loading', todoList: { kind: 'loading' } },
};
const chatSessionListeners = new Set<() => void>();
let chatSessionVersion = 0;
const subscribeChatSession = (listener: () => void): (() => void) => {
  chatSessionListeners.add(listener);
  return () => {
    chatSessionListeners.delete(listener);
  };
};
const publishChatSession = (next: MockChatSession): void => {
  chatSession.current = next;
  chatSessionVersion += 1;
  for (const listener of chatSessionListeners) {
    listener();
  }
};
const readChatSession = (): MockChatSession => {
  useSyncExternalStore(subscribeChatSession, () => chatSessionVersion);
  return chatSession.current;
};

vi.doMock('#hooks/use-file-manager.js', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  useOptionalFileManager: () => undefined,
  useFileManager: () => ({ treeService: undefined }),
}));
vi.doMock('#hooks/use-theme.js', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  useTheme: () => ({ theme: 'light' }),
}));
vi.doMock('#components/files/file-link.js', () => ({
  FileLink: ({ children }: { readonly children: React.ReactNode }) => <span>{children}</span>,
}));
// The chat lane's own seams; the composer's tray stays real (`ChatTodoList` over the chat's task-list file).
vi.doMock('react-router', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  useLocation: () => ({ state: undefined }),
}));
vi.doMock('#hooks/use-search-parameter.js', () => ({ useSearchParameter: () => [false, vi.fn()] }));
vi.doMock('#hooks/use-chat.js', () => ({
  useChatSelector: (selector: (state: unknown) => unknown) => {
    const { messages, transcript } = readChatSession();
    return selector({
      messages,
      messageOrder: messages.map((message) => message.id),
      turnGroups: buildTurnGroups(messages),
      agentInvocations: '',
      transcript,
    });
  },
  useChatContext: () => ({ activeChatId: 'chat_tray', persistenceActorRef: undefined }),
}));
vi.doMock('#hooks/use-file-content.js', () => ({
  useFileContent: () => readChatSession().todoList,
}));
vi.doMock('#chat-clients/use-cad-chat-client.js', () => ({
  useCadChatClient: () => ({ submit: vi.fn(), steerOrSubmit: vi.fn() }),
}));
vi.doMock('#hooks/use-chat-records.js', () => ({ useChatRecords: () => ({ chats: [] }) }));
vi.doMock('#hooks/use-project.js', () => ({ useProject: () => ({ projectId: 'project_tray' }) }));
vi.doMock('#hooks/use-skills-catalog.js', () => ({ useSkillsCatalog: () => [] }));
vi.doMock('#routes/w.$workspace.$project/archived-chats.js', () => ({ ArchivedChats: () => null }));
vi.doMock('#routes/w.$workspace.$project/chat-title-bar.js', () => ({
  ChatTitleBar: ({ closeButton }: { readonly closeButton?: React.ReactNode }) => <span>{closeButton}</span>,
}));
vi.doMock('#routes/w.$workspace.$project/chat-message.js', () => ({
  ChatMessage: ({ messageId }: { readonly messageId: string }) => <p className='px-3 py-2 text-sm'>{messageId}</p>,
}));
vi.doMock('#routes/w.$workspace.$project/chat-revision-marker.js', () => ({ ChatRevisionMarker: () => null }));
vi.doMock('#routes/w.$workspace.$project/chat-error.js', () => ({ ChatError: () => null }));
// A settled chat has no activity cue; the row measures the trays, not the activity line.
vi.doMock('#routes/w.$workspace.$project/chat-message-planning.js', () => ({ ChatMessagePlanning: () => null }));
vi.doMock('#components/chat/chat-auto-kernel-row.js', () => ({ ChatAutoKernelRow: () => null }));
vi.doMock('#components/chat/chat-message-queue.js', () => ({ ChatMessageQueue: () => null }));
vi.doMock('#components/chat/chat-question-queue.js', () => ({ ChatQuestionQueue: () => null }));
vi.doMock('#components/chat/chat-questions-context.js', () => ({
  ChatQuestionsProvider: ({ children }: { readonly children: React.ReactNode }) => (
    <div className='contents'>{children}</div>
  ),
}));
vi.doMock('@taucad/chat-ui/components/at-reference-context', () => ({
  AtReferenceProvider: ({ children }: { readonly children: React.ReactNode }) => (
    <div className='contents'>{children}</div>
  ),
}));
vi.doMock('@taucad/project-workspace/components/scroll-down-button', () => ({ ScrollDownButton: () => null }));
vi.doMock('@taucad/ui/components/keyboard', () => ({
  useKeybinding: () => ({ formattedKeyCombination: 'Ctrl+C' }),
}));
// The textarea's own height does not change with the transcript; a fixed stand-in keeps the row on the trays.
vi.doMock('#components/chat/chat-textarea.js', () => ({
  ChatTextarea: () => <div data-testid='chat-textarea' className='h-20 rounded-2xl border' />,
}));
// The lane as the project route lays it out: a fixed-height column the transcript fills above the composer.
vi.doMock('#components/ui/floating-panel.js', () => ({
  FloatingPanel: ({ children }: { readonly children: React.ReactNode }) => (
    <div className='flex h-[640px] w-[400px] flex-col'>{children}</div>
  ),
  FloatingPanelClose: ({ label }: { readonly label?: string }) => <button type='button' aria-label={label} />,
  FloatingPanelContent: ({
    children,
    className,
  }: {
    readonly children: React.ReactNode;
    readonly className?: string;
  }) => <div className={`flex flex-1 flex-col ${className ?? ''}`}>{children}</div>,
  FloatingPanelContentHeader: ({ children }: { readonly children: React.ReactNode }) => <div>{children}</div>,
  FloatingPanelErrorContent: () => null,
}));
const { ChatMessageToolExternal } = await import('#routes/w.$workspace.$project/chat-message-tool-external.js');
const { ChatHistory } = await import('#routes/w.$workspace.$project/chat-history.js');

afterEach(cleanup);

it('should disclose recovered filenames and real highlighted diffs in a browser', async () => {
  const paths = ['main.cs', 'main.geospec.ts'];
  const rows = [lifecycleRow(0, 'admitted'), lifecycleRow(1, 'running')];
  for (const [index, path] of paths.entries()) {
    const content = [{ type: 'diff', path, oldText: 'before\n', newText: `recovered_${String(index)}\n` }];
    const identity = {
      toolCallId: `call-${String(index)}`,
      toolName: 'applyPatch',
      metadata: { tauInternal: { kind: 'external-tool', origin: 'external' } },
    };
    const call = { toolCallId: `vendor-${String(index)}`, kind: 'edit', content };
    rows.push(
      logRow(rows.length, {
        type: 'message.appended',
        message: {
          ...identity,
          id: `in-${String(index)}`,
          role: 'tool-input',
          content: {},
          call: { ...call, status: 'pending' },
        },
      }),
    );
    rows.push(
      logRow(rows.length, {
        type: 'message.appended',
        message: {
          ...identity,
          id: `out-${String(index)}`,
          role: 'tool-output',
          content,
          call: { ...call, status: 'completed' },
          isError: false,
        },
      }),
    );
  }
  rows.push(lifecycleRow(rows.length, 'completed'));
  const projection = reduceChatProjection(initialChatProjection, {
    type: 'batch',
    answer: { status: 'batch', cursor: 0, nextCursor: rows.length, endCursor: rows.length, events: rows },
  }).state;
  const messages = await materializeTranscript(projection);
  const tools = messages.flatMap((message) => message.parts).filter((part) => part.type === 'dynamic-tool');
  expect(tools).toHaveLength(2);
  await page.viewport(640, 500);
  render(
    <TooltipProvider>
      <section aria-label='Recovered edits'>
        {tools.map((part) => (
          <ChatMessageToolExternal key={part.toolCallId} part={part} />
        ))}
      </section>
    </TooltipProvider>,
  );
  const disclose = async (index: number, path: string): Promise<void> => {
    const header = page.getByRole('button', { name: new RegExp(path.replaceAll('.', String.raw`\.`), 'u') });
    await expect.element(header).toHaveAttribute('aria-expanded', 'false');
    await header.click();
    await expect.element(page.getByRole('region', { name: `Edited ${path}` })).toBeVisible();
    expect(await screen.findByText(`recovered_${String(index)}`)).toBeVisible();
  };
  await disclose(0, 'main.cs');
  await disclose(1, 'main.geospec.ts');
  await page.screenshot({
    element: screen.getByRole('region', { name: 'Recovered edits' }),
    path: '../../../../../out/research/acp-file-write-chat-history/browser/recovered-edits.png',
  });
});

const encoder = new TextEncoder();
/** The chat's task list, as `update_todos` wrote it: its tray rests folded to one header row. */
const todoList: FileContentResult = {
  kind: 'text',
  content: new Uint8Array(
    encoder.encode(
      [
        'version: 1',
        'items:',
        '  - id: model-cylinder',
        '    title: Model the cylinder',
        '    status: done',
        '  - id: export-stl',
        '    title: Export the STL',
        '    status: done',
        '',
      ].join('\n'),
    ),
  ),
};
const history: readonly MyUIMessage[] = [
  { id: 'u1', role: 'user', parts: [{ type: 'text', text: 'A 30 mm cylinder' }] },
  { id: 'a1', role: 'assistant', parts: [{ type: 'text', text: 'Done.' }] },
];

/**
 * Measure the composer region while the transcript loads and again once it resolves.
 *
 * @param todo - What the chat's task-list read answers with the transcript: the list, or no file.
 * @returns The region's height before and after, in CSS pixels.
 */
const composerHeightAcrossLoad = async (todo: FileContentResult): Promise<{ before: number; after: number }> => {
  await page.viewport(640, 800);
  publishChatSession({ messages: [], transcript: 'loading', todoList: { kind: 'loading' } });
  render(
    <TooltipProvider>
      <ChatHistory />
    </TooltipProvider>,
  );
  const composer = screen.getByRole('region', { name: 'Chat composer' });
  const before = composer.getBoundingClientRect().height;
  act(() => {
    publishChatSession({ messages: history, transcript: 'loaded', todoList: todo });
  });
  await expect.element(page.getByText('u1')).toBeVisible();
  return { before, after: composer.getBoundingClientRect().height };
};

describe('chat composer across the transcript load', () => {
  it.fails('keeps the composer region height when the transcript resolves, for a chat with a tray (U10)', async () => {
    const { before, after } = await composerHeightAcrossLoad(todoList);

    expect(screen.getByRole('button', { name: /Tasks:/u })).toBeVisible();
    expect(after).toBe(before);
  });

  it('keeps the composer region height when the transcript resolves, for a chat without a tray (U10)', async () => {
    const { before, after } = await composerHeightAcrossLoad({ kind: 'orphaned' });

    expect(screen.queryByRole('button', { name: /Tasks:/u })).toBeNull();
    expect(after).toBe(before);
  });
});
