// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { KernelIssue } from '@taucad/runtime';
import { chatTurnRequestSchema } from '@taucad/chat/schemas';
import type { CadAgentConfigInput, MyUIMessage } from '@taucad/chat';

const { mockCreateChat, mockSubmit, mockSetFocusedChatId, mockEditorSend, mockReadFile, mockSetChatOpen } = vi.hoisted(
  () => ({
    mockCreateChat: vi.fn(),
    mockSubmit: vi.fn(),
    mockSetFocusedChatId: vi.fn(),
    mockEditorSend: vi.fn(),
    mockReadFile: vi.fn(),
    mockSetChatOpen: vi.fn(),
  }),
);

let mockKernelIssues = new Map<string, KernelIssue[]>();
let mockLatestGeometryOutcome: 'success' | 'failure' | undefined;
let mockCadTags = new Set<string>();
let mockProjectRef = {};
let mockCadParentRef = mockProjectRef;
let mockCadId = 'cad-project_test-main.scad';
let mockHasCadActor = true;
let mockAgent: CadAgentConfigInput = {
  profile: 'cad',
  execution: { kind: 'tau', model: 'cookie-model' },
  kernel: 'openscad',
  mode: 'agent',
  toolChoice: 'auto',
  testingEnabled: true,
};

vi.mock('#hooks/use-project.js', () => ({
  useProject: () => ({
    getMainFilename: async () => 'main.scad',
    editorRef: { send: mockEditorSend },
    projectId: 'project_test',
    projectRef: mockProjectRef,
    setFocusedChatId: mockSetFocusedChatId,
  }),
}));

vi.mock('#hooks/use-cad.js', () => ({
  useCad: () => (mockHasCadActor ? { id: mockCadId } : undefined),
  useCadSelector: <S,>(selector: (state: unknown) => S, defaultValue: S): S =>
    mockHasCadActor
      ? selector({
          context: {
            parentRef: mockCadParentRef,
            entryPath: 'main.scad',
            kernelIssues: mockKernelIssues,
            latestRenderingOutcome: mockLatestGeometryOutcome,
          },
          hasTag: (tag: string) => mockCadTags.has(tag),
        })
      : defaultValue,
}));

vi.mock('#hooks/use-chats.js', () => ({
  useChats: () => ({ createChat: mockCreateChat }),
}));

vi.mock('#chat-clients/use-cad-chat-client.js', () => ({
  useCadChatClient: () => ({
    submit: mockSubmit,
    agent: mockAgent,
  }),
}));

// Production code now reads the entire per-request config via the
// chat-client — guard the legacy per-field hooks with throwing mocks so any
// regression that re-introduces them is caught immediately.
vi.mock('#hooks/use-chat.js', () => ({
  useChatActions: () => {
    throw new Error('chat-stack-trace should no longer call useChatActions — switch to useCadChatClient');
  },
}));

vi.mock('#hooks/use-models.js', () => ({
  useModels: () => {
    throw new Error('chat-stack-trace should no longer call useModels — switch to useCadChatClient');
  },
}));

vi.mock('#hooks/use-kernel.js', () => ({
  useKernel: () => {
    throw new Error('chat-stack-trace should no longer call useKernel — switch to useCadChatClient');
  },
}));

vi.mock('#hooks/use-chat-snapshot.js', () => ({
  useChatSnapshot: () => {
    throw new Error('chat-stack-trace should no longer call useChatSnapshot — switch to useCadChatClient');
  },
}));

vi.mock('#hooks/use-keyboard.js', () => ({
  useModifiers: () => ({ shift: true }),
}));

vi.mock('#hooks/use-file-manager.js', () => ({
  useFileManager: () => ({ readFile: mockReadFile }),
}));

vi.mock('#routes/w.$workspace.$project/project-workspace-context.js', () => ({
  useProjectWorkspace: () => ({ setChatOpen: mockSetChatOpen }),
}));

vi.mock('#components/files/file-link.js', () => ({
  FileLink: ({ children }: { readonly children: React.ReactNode }) => <span>{children}</span>,
}));

vi.mock('#components/markdown/markdown-viewer.js', () => ({
  MarkdownViewer: ({ children }: { readonly children: React.ReactNode }) => <span>{children}</span>,
}));

vi.mock('#components/ui/key-shortcut.js', () => ({
  KeyShortcut: ({ children }: { readonly children: React.ReactNode }) => <span>{children}</span>,
}));

vi.mock('@taucad/ui/components/tooltip', () => ({
  Tooltip: ({ children }: { readonly children: React.ReactNode }): React.ReactNode => children,
  TooltipTrigger: ({ children }: { readonly children: React.ReactNode }): React.ReactNode => children,
  TooltipContent: ({ children }: { readonly children: React.ReactNode }): React.ReactNode => children,
}));

vi.mock('@taucad/ui/components/collapsible', () => ({
  Collapsible: ({ children }: { readonly children: React.ReactNode }) => <div>{children}</div>,
  CollapsibleTrigger: ({ children }: { readonly children: React.ReactNode }) => <div>{children}</div>,
  CollapsibleContent: ({ children }: { readonly children: React.ReactNode }) => <div>{children}</div>,
}));

vi.mock('@taucad/ui/components/button', () => ({
  Button: ({
    children,
    ref,
    ...props
  }: React.ButtonHTMLAttributes<HTMLButtonElement> & { readonly ref?: React.Ref<HTMLButtonElement> }) => (
    <button
      ref={ref}
      type='button'
      onClick={props.onClick}
      onKeyDown={props.onKeyDown}
      aria-label={props['aria-label']}
      aria-expanded={props['aria-expanded']}
    >
      {children}
    </button>
  ),
}));

vi.mock('#utils/filesystem.utils.js', () => ({
  decodeTextFile: (_bytes: Uint8Array<ArrayBuffer>) => 'cube(10);',
}));

const { ViewerIssues } = await import('#routes/w.$workspace.$project/chat-stack-trace.js');

type Notice = Parameters<typeof ViewerIssues>[0]['notice'];

function ViewerIssuesHost({ notice }: { readonly notice?: Notice }): React.JSX.Element {
  return (
    <ViewerIssues entryPath='main.scad' notice={notice}>
      {({ segment, list }) => (
        <>
          {list}
          {segment}
        </>
      )}
    </ViewerIssues>
  );
}

/** The segment toggling the list: "Issues: …", after "Build failed." when the build failed. */
const issuesSegment = (): HTMLElement => screen.getByRole('button', { name: /Issues:/ });

function renderOpen(notice?: Notice): ReturnType<typeof render> {
  const view = render(<ViewerIssuesHost notice={notice} />);
  if (!notice) {
    fireEvent.click(issuesSegment());
  }
  return view;
}

const issue: KernelIssue = {
  message: 'Boom',
  code: 'RUNTIME',
  severity: 'error',
  location: { fileName: 'main.scad', startLineNumber: 1, startColumn: 1 },
  stackFrames: [],
};

beforeEach(() => {
  mockProjectRef = {};
  mockCadParentRef = mockProjectRef;
  mockCadId = 'cad-project_test-main.scad';
  mockHasCadActor = true;
  mockLatestGeometryOutcome = undefined;
  mockCadTags = new Set();
});

describe('ViewerIssues — canonical issue selection', () => {
  const compileIssue: KernelIssue = {
    message: "The name 'MissingPicoGkSymbol' does not exist in the current context",
    code: 'RUNTIME',
    severity: 'error',
    type: 'compilation',
    details: { workerCode: 'CS0103', workerType: 'syntax' },
    location: { fileName: 'ShapeFactory.cs', startLineNumber: 14, startColumn: 80 },
  };

  it('shows the owned generated-ID CAD actor compilation issue and location', () => {
    mockCadId = 'x:42';
    mockKernelIssues = new Map([['main.scad', [compileIssue]]]);
    mockLatestGeometryOutcome = 'failure';

    renderOpen();

    expect(issuesSegment()).toHaveAccessibleName('Build failed. Issues: 1 error');
    expect(screen.getByText(compileIssue.message)).toBeInTheDocument();
    expect(screen.getByText('ShapeFactory.cs:14:80')).toBeInTheDocument();
  });

  it('hides a foreign parent even when the actor ID contains the current project ID', () => {
    mockCadParentRef = {};
    mockKernelIssues = new Map([['main.scad', [compileIssue]]]);

    render(<ViewerIssuesHost />);

    expect(screen.queryByRole('button', { name: /Issues:/ })).not.toBeInTheDocument();
  });

  it('hides previous-project issues during a project transition', () => {
    mockKernelIssues = new Map([['main.scad', [compileIssue]]]);
    const { rerender } = renderOpen();
    expect(screen.getByText(compileIssue.message)).toBeInTheDocument();

    mockProjectRef = {};
    rerender(<ViewerIssuesHost />);

    expect(screen.queryByText(compileIssue.message)).not.toBeInTheDocument();
  });

  it('remains safe while the CAD actor is absent', () => {
    mockHasCadActor = false;
    mockKernelIssues = new Map([['main.scad', [compileIssue]]]);

    render(<ViewerIssuesHost />);

    expect(screen.queryByRole('button', { name: /Issues:/ })).not.toBeInTheDocument();
  });

  it('shows connection failures selected by the CAD machine', () => {
    const connectionIssue = { ...issue, message: 'Desktop runtime connection failed' };
    mockKernelIssues = new Map([['__connection__', [connectionIssue]]]);
    mockCadTags = new Set(['cad-runtime-error']);

    renderOpen();

    expect(screen.getByText(connectionIssue.message)).toBeInTheDocument();
  });

  it('keeps non-fatal entry diagnostics visible after a successful render', () => {
    const warning: KernelIssue = { ...issue, message: 'Parameter is unused', severity: 'warning' };
    mockKernelIssues = new Map([['main.scad', [warning]]]);
    mockLatestGeometryOutcome = 'success';

    renderOpen();

    expect(issuesSegment()).toHaveAccessibleName('Issues: 1 warning');
    expect(screen.getByText(warning.message)).toBeInTheDocument();
  });
});

describe('ViewerIssues — disclosure', () => {
  const warning: KernelIssue = { ...issue, message: 'Parameter is unused', severity: 'warning' };
  const note: KernelIssue = { ...issue, message: 'Wall is thin', severity: 'info' };

  beforeEach(() => {
    mockKernelIssues = new Map([['main.scad', [note, warning, issue]]]);
  });

  it('starts closed, with the counts in the segment', () => {
    render(<ViewerIssuesHost />);

    expect(issuesSegment()).toHaveAttribute('aria-expanded', 'false');
    expect(issuesSegment()).toHaveAccessibleName('Issues: 1 error, 1 warning, 1 info');
    expect(screen.queryByRole('region', { name: 'Issues' })).not.toBeInTheDocument();
  });

  it('leaves the running phase to the top pill: no segment while the build renders', () => {
    mockKernelIssues = new Map();
    mockCadTags = new Set(['cad-loading']);
    render(<ViewerIssuesHost />);

    expect(screen.queryByRole('status')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Issues/ })).not.toBeInTheDocument();
  });

  it('lists errors first, then warnings, then notes', () => {
    renderOpen();

    const messages = screen.getAllByRole('listitem').map((item) => item.textContent);
    expect(messages.map((text) => text.includes(issue.message))).toEqual([true, false, false]);
    expect(messages[1]).toContain(warning.message);
    expect(messages[2]).toContain(note.message);
  });

  it('closes on Escape and returns focus to the segment', () => {
    renderOpen();

    fireEvent.keyDown(screen.getByRole('region', { name: 'Issues' }), { key: 'Escape' });

    expect(screen.queryByRole('region', { name: 'Issues' })).not.toBeInTheDocument();
    expect(issuesSegment()).toHaveFocus();
  });

  it('opens for a view notice and acts on it', () => {
    mockKernelIssues = new Map();
    const onAct = vi.fn();
    render(
      <ViewerIssuesHost
        notice={{ message: 'Saved view “drawing” is unavailable', actionLabel: 'Use default view', onAct }}
      />,
    );

    expect(screen.getByRole('alert')).toHaveTextContent('Saved view “drawing” is unavailable');
    fireEvent.click(screen.getByRole('button', { name: 'Use default view' }));
    expect(onAct).toHaveBeenCalledOnce();
  });
});

/** Fix with AI is named for what Shift does: a new chat while it is held. */
let shiftHeld = true;
const fixLabel = (): string => (shiftHeld ? 'Fix in new chat' : 'Fix with AI');

describe('ViewerIssues — new-chat (shift held) path', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockReadFile.mockResolvedValue(new Uint8Array([1, 2, 3]));
    mockCreateChat.mockResolvedValue({ id: 'chat_new' });
    mockKernelIssues = new Map([['main.scad', [issue]]]);
    mockAgent = {
      profile: 'cad',
      execution: { kind: 'tau', model: 'cookie-model' },
      kernel: 'openscad',
      mode: 'agent',
      toolChoice: 'auto',
      testingEnabled: true,
    };
  });

  it('seeds activeExecution and activeKernel on the new chat from the chat-client agent', async () => {
    renderOpen();
    fireEvent.click(await screen.findByRole('button', { name: fixLabel() }));

    await waitFor(() => {
      expect(mockCreateChat).toHaveBeenCalledOnce();
    });

    const callArgs = mockCreateChat.mock.calls[0]?.[0] as {
      activeExecution?: CadAgentConfigInput['execution'];
      activeKernel?: string;
    };
    expect(callArgs.activeExecution).toEqual({ kind: 'tau', model: 'cookie-model' });
    expect(callArgs.activeKernel).toBe('openscad');
    expect(mockSetChatOpen).toHaveBeenCalledWith(true);
  });

  it('focuses the newly created chat after seeding', async () => {
    renderOpen();
    fireEvent.click(await screen.findByRole('button', { name: fixLabel() }));

    await waitFor(() => {
      expect(mockSetFocusedChatId).toHaveBeenCalledWith('chat_new');
    });
  });

  // The pending user message itself should only carry `status: pending` —
  // the wire body's `agent` payload is composed by the chat-client at
  // regenerate time, not from this metadata block. This guards against the
  // legacy "stamp kernel/model into metadata" pattern that the chat-metadata-
  // first-class-architecture refactor removes.
  it('seeds the pending user message without per-field metadata stamping', async () => {
    mockAgent = { ...mockAgent, execution: { kind: 'tau', model: 'chat-local-model' }, kernel: 'manifold' };

    renderOpen();
    fireEvent.click(await screen.findByRole('button', { name: fixLabel() }));

    await waitFor(() => {
      expect(mockCreateChat).toHaveBeenCalledOnce();
    });

    const callArgs = mockCreateChat.mock.calls[0]?.[0] as {
      activeExecution?: CadAgentConfigInput['execution'];
      activeKernel?: string;
      messages?: Array<{ id: string; metadata?: Record<string, unknown> }>;
      startupRequest?: {
        id: string;
        kind: string;
        messageId: string;
        message?: { id: string; metadata?: Record<string, unknown> };
        source: string;
        createdAt: number;
      };
    };
    expect(callArgs.activeExecution).toEqual({ kind: 'tau', model: 'chat-local-model' });
    expect(callArgs.activeKernel).toBe('manifold');
    expect(callArgs.messages?.[0]?.metadata?.['status']).toBe('pending');
    expect(callArgs.startupRequest?.id).toMatch(/^req_/);
    expect(callArgs.startupRequest?.kind).toBe('regenerate-tail');
    expect(callArgs.startupRequest?.messageId).toBe(callArgs.messages?.[0]?.id);
    expect(callArgs.startupRequest?.message).toEqual(callArgs.messages?.[0]);
    expect(callArgs.startupRequest?.source).toBe('fix-with-ai-new-chat');
    expect(typeof callArgs.startupRequest?.createdAt).toBe('number');
  });
});

describe('ViewerIssues — in-place (shift not held) path', () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    mockReadFile.mockResolvedValue(new Uint8Array([1, 2, 3]));
    mockKernelIssues = new Map([['main.scad', [issue]]]);
    mockAgent = {
      profile: 'cad',
      execution: { kind: 'tau', model: 'chat-local-model' },
      kernel: 'manifold',
      mode: 'plan',
      toolChoice: 'auto',
      testingEnabled: false,
    };

    // Override `useModifiers` for this describe block so the shift-not-held
    // path is exercised and the in-place chat-client submit fires.
    const useModifiersMock = (await import('#hooks/use-keyboard.js')) as { useModifiers: () => { shift: boolean } };
    useModifiersMock.useModifiers = () => ({ shift: false });
    shiftHeld = false;
  });

  it('routes the fix prompt through cadChat.submit (no inline metadata stamping)', async () => {
    renderOpen();
    fireEvent.click(await screen.findByRole('button', { name: fixLabel() }));

    await waitFor(() => {
      expect(mockSubmit).toHaveBeenCalledOnce();
    });

    const submitArgs = mockSubmit.mock.calls[0]?.[0] as { text: string };
    expect(typeof submitArgs.text).toBe('string');
    expect(submitArgs.text).toContain('error');
    expect(mockCreateChat).not.toHaveBeenCalled();
  });

  // Wire-format invariant — the captured agent identity must produce a body
  // that satisfies the shared chatTurnRequestSchema. Regression coverage for
  // the original Fix-with-AI missing-kernel / missing-mode / missing-
  // testingEnabled bug — all three fields previously needed to be hand-
  // stamped on the user message metadata and frequently drifted.
  it('produces a wire body satisfying chatTurnRequestSchema for the Fix-with-AI in-place path', async () => {
    renderOpen();
    fireEvent.click(await screen.findByRole('button', { name: fixLabel() }));

    await waitFor(() => {
      expect(mockSubmit).toHaveBeenCalledOnce();
    });

    const submitArgs = mockSubmit.mock.calls[0]?.[0] as { text: string };
    const userMessage: MyUIMessage = {
      id: 'msg_test',
      role: 'user',
      parts: [{ type: 'text', text: submitArgs.text }],
    };
    const wireBody = {
      id: 'chat_test',
      projectId: 'project_test',
      messages: [userMessage],
      agent: mockAgent,
      admission: { version: 1, idempotencyKey: 'request_0000000001' },
      execution: { hostId: 'host_test', workspaceId: 'workspace_test', baseRevisionId: 'rev_test' },
    };

    const parsed = chatTurnRequestSchema.parse(wireBody);
    if (parsed.agent.profile !== 'cad') {
      throw new Error(`expected cad profile, got ${parsed.agent.profile}`);
    }
    expect(parsed.agent.kernel).toBe('manifold');
    expect(parsed.agent.mode).toBe('plan');
    expect(parsed.agent.toolChoice).toBe('auto');
    expect(parsed.agent.testingEnabled).toBe(false);
  });

  it('sends every issue in one prompt with Fix all', async () => {
    const second: KernelIssue = { ...issue, message: 'Second failure', location: undefined };
    mockKernelIssues = new Map([['main.scad', [issue, second]]]);
    renderOpen();

    fireEvent.click(screen.getByRole('button', { name: /Fix all 2 with AI/ }));

    await waitFor(() => {
      expect(mockSubmit).toHaveBeenCalledOnce();
    });
    const submitArgs = mockSubmit.mock.calls[0]?.[0] as { text: string };
    expect(submitArgs.text).toContain("I'm getting 2 issues");
    expect(submitArgs.text).toContain(issue.message);
    expect(submitArgs.text).toContain(second.message);
  });
});
