// @vitest-environment jsdom
import { act, fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ReactNode } from 'react';
import type { MyUIMessage } from '@taucad/chat';
import type { ProjectTask, ProjectTaskSnapshot } from '@taucad/agent-host/wire';
import type { ChatTextareaProperties, ChatTextareaSubmitPayload } from '#components/chat/chat-textarea-types.js';
import { storedRef } from '#utils/attachment.test-utils.js';
import { SelectedTaskHistory } from '#routes/w.$workspace.$project/chat-history.js';

const state = vi.hoisted(() => ({
  messages: [] as MyUIMessage[],
  draftText: '',
  draftAttachments: [] as unknown[],
  consumeDraft: vi.fn(async () => undefined),
}));
let textareaProps: ChatTextareaProperties | undefined;

vi.mock('#hooks/use-chat.js', () => ({
  useChatSelector: (selector: (value: { messages: MyUIMessage[] }) => unknown) =>
    selector({ messages: state.messages }),
  useDraftSelector: (selector: (value: { draftText: string; draftAttachments: unknown[] }) => unknown) =>
    selector({ draftText: state.draftText, draftAttachments: state.draftAttachments }),
}));
vi.mock('#hooks/active-chat-provider.js', () => ({
  ActiveChatProvider: ({ children }: { readonly children: ReactNode }) => <div>{children}</div>,
  useChatComposer: () => ({ consumeDraft: state.consumeDraft }),
}));
vi.mock('#hooks/use-project.js', () => ({ useProject: () => ({ projectId: 'project' }) }));
vi.mock('#hooks/use-file-manager.js', () => ({ useFileManager: () => ({ treeService: undefined }) }));
vi.mock('#hooks/use-chat-records.js', () => ({ useChatRecords: () => ({ chats: [] }) }));
vi.mock('#routes/w.$workspace.$project/thread-navigation-context.js', () => ({
  useThreadNavigation: () => undefined,
}));
vi.mock('#components/chat/at-reference-context.js', () => ({
  AtReferenceProvider: ({ children }: { readonly children: ReactNode }) => <div>{children}</div>,
}));
vi.mock('#components/chat/chat-questions-context.js', () => ({
  ChatQuestionsProvider: ({ children }: { readonly children: ReactNode }) => <div>{children}</div>,
}));
vi.mock('#routes/w.$workspace.$project/chat-message-planning.js', () => ({ ChatMessagePlanning: () => null }));
vi.mock('#routes/w.$workspace.$project/chat-message.js', () => ({
  ChatMessage: ({
    messageId,
    readOnly,
  }: {
    readonly messageId: string;
    // oxlint-disable-next-line react-js/boolean-prop-naming -- mirrors the shipping ChatMessage prop
    readonly readOnly?: boolean;
  }) => <div data-testid='shipping-message' data-message-id={messageId} data-read-only={String(readOnly)} />,
}));
vi.mock('#components/chat/chat-textarea.js', () => ({
  ChatTextarea: (props: ChatTextareaProperties) => {
    textareaProps = props;
    return <div data-testid='thread-composer' data-disabled={String(props.isSubmitDisabled)} />;
  },
}));

const makeTask = (
  status: ProjectTask['attempts'][number]['status'],
  overrides: Partial<ProjectTask> = {},
): ProjectTask => ({
  id: 'child',
  projectId: 'project',
  chatId: 'chat-child',
  parentTaskId: 'root',
  depth: 1,
  title: 'Check mounting fit',
  prompt: 'Check the mounting fit',
  provider: { id: 'codex' },
  createdAt: 1,
  closed: false,
  attempts: [
    {
      id: 'attempt-child',
      number: 1,
      status,
      source: { revisionId: 'base', checkoutId: 'source' },
      toolGrant: { toolChoice: 'none', allowedTools: [] },
      createdAt: 1,
    },
  ],
  ...overrides,
});
const makeSnapshot = (task: ProjectTask): ProjectTaskSnapshot => ({
  tasks: [task],
  messages: [],
  cursor: 0,
  nextCursor: 0,
  hasMore: false,
});
const actions = () => ({
  send: vi.fn(async (_taskId: string, _text: string) => undefined),
  cancel: vi.fn(async (_taskId: string) => undefined),
  resume: vi.fn(async (_taskId: string) => undefined),
});
const renderTask = (
  task: ProjectTask,
  options: {
    readonly isReadOnly?: boolean;
    readonly hasClosedAncestor?: boolean;
    readonly commands?: ReturnType<typeof actions>;
  } = {},
) => {
  const commands = options.commands ?? actions();
  const onOpenParent = vi.fn();
  const view = render(
    <SelectedTaskHistory
      task={task}
      parent={makeTask('running', {
        id: 'root',
        chatId: 'chat-root',
        parentTaskId: undefined,
        depth: 0,
        title: 'Main chat',
      })}
      snapshot={makeSnapshot(task)}
      actions={commands}
      isReadOnly={options.isReadOnly ?? false}
      hasClosedAncestor={options.hasClosedAncestor ?? false}
      onBack={vi.fn()}
      onOpenParent={onOpenParent}
      onSelectTask={vi.fn()}
      onReviewCandidate={vi.fn()}
    />,
  );
  return { commands, onOpenParent, unmount: view.unmount };
};
const submit = async (content: string, attachments: ChatTextareaSubmitPayload['attachments'] = []) => {
  await act(async () => {
    await textareaProps?.onSubmit({ content, attachments });
  });
};

beforeEach(() => {
  state.messages = [];
  state.draftText = '';
  state.draftAttachments = [];
  state.consumeDraft.mockReset();
  state.consumeDraft.mockResolvedValue(undefined);
  textareaProps = undefined;
});

describe('selected thread action boundaries', () => {
  it('keeps an unsent draft when attachments are rejected or the host rejects the mailbox write', async () => {
    const commands = actions();
    commands.send.mockRejectedValueOnce(new Error('Host disconnected'));
    renderTask(makeTask('failed'), { commands });

    await submit('Check the drawing', [
      storedRef({ hash: 'f'.repeat(64), mediaType: 'image/png', filename: 'attachment.png' }),
    ]);
    expect(commands.send).not.toHaveBeenCalled();
    expect(state.consumeDraft).not.toHaveBeenCalled();
    expect(screen.getByRole('alert')).toHaveTextContent('text only');

    await submit('Check the drawing');
    expect(commands.send).toHaveBeenCalledOnce();
    expect(commands.resume).not.toHaveBeenCalled();
    expect(state.consumeDraft).not.toHaveBeenCalled();
    expect(screen.getByRole('alert')).toHaveTextContent('Host disconnected');
  });

  it('blocks host mutations under a stopped ancestor while retaining parent navigation', async () => {
    const { commands, onOpenParent } = renderTask(makeTask('failed'), { hasClosedAncestor: true });
    expect(screen.getByText('This thread’s parent was stopped.')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Retry thread' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Stop thread' })).toBeNull();
    expect(screen.getByTestId('thread-composer')).toHaveAttribute('data-disabled', 'true');
    await submit('Should not send');
    expect(commands.send).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Open parent' }));
    expect(onOpenParent).toHaveBeenCalledWith('child');
  });

  it('offers approvals only for a writable running thread and disables actions after disconnect', async () => {
    const task = makeTask('running');
    const commands = actions();
    const mounted = renderTask(task, { commands });
    expect(textareaProps?.enableApprovals).toBe(true);
    expect(textareaProps?.enableContextActions).toBe(false);
    expect(textareaProps?.enableKernelSelector).toBe(false);
    expect(textareaProps?.taskMailbox).toBe(true);
    expect(screen.getByRole('button', { name: 'Stop thread' })).toBeEnabled();

    mounted.unmount();
    renderTask(task, { commands, isReadOnly: true });
    expect(textareaProps?.enableApprovals).toBe(false);
    expect(screen.getByTestId('thread-composer')).toHaveAttribute('data-disabled', 'true');
    expect(screen.getByRole('button', { name: 'Stop thread' })).toBeDisabled();
    expect(screen.getByText('Last known thread. Reconnect to act.')).toBeInTheDocument();
    await submit('Should not send');
    expect(commands.send).not.toHaveBeenCalled();
  });

  it('sends a live message to the mailbox without starting another attempt', async () => {
    const commands = actions();
    renderTask(makeTask('running'), { commands });
    await submit('Review the latest dimension');
    expect(commands.send).toHaveBeenCalledExactlyOnceWith('child', 'Review the latest dimension');
    expect(state.consumeDraft).toHaveBeenCalledOnce();
    expect(commands.resume).not.toHaveBeenCalled();
  });
});
