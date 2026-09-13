// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { KernelIssue } from '@taucad/runtime';
import { chatTurnRequestSchema } from '@taucad/chat/schemas';
import type { CadAgentConfigInput, MyUIMessage } from '@taucad/chat';

const { mockCreateChat, mockSubmit, mockSetFocusedChatId, mockEditorSend, mockReadFile } = vi.hoisted(() => ({
  mockCreateChat: vi.fn(),
  mockSubmit: vi.fn(),
  mockSetFocusedChatId: vi.fn(),
  mockEditorSend: vi.fn(),
  mockReadFile: vi.fn(),
}));

let mockKernelIssues = new Map<string, KernelIssue[]>();
let mockAgent: CadAgentConfigInput = {
  profile: 'cad',
  model: 'cookie-model',
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
    setFocusedChatId: mockSetFocusedChatId,
  }),
}));

vi.mock('#hooks/use-cad.js', () => ({
  useCad: () => ({ id: 'cad-project_test-main.scad' }),
  useCadSelector: <S,>(selector: (state: { context: { kernelIssues: Map<string, KernelIssue[]> } }) => S): S =>
    selector({ context: { kernelIssues: mockKernelIssues } }),
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

vi.mock('#components/files/file-link.js', () => ({
  FileLink: ({ children }: { readonly children: React.ReactNode }) => <span>{children}</span>,
}));

vi.mock('#components/markdown/markdown-viewer.js', () => ({
  MarkdownViewer: ({ children }: { readonly children: React.ReactNode }) => <span>{children}</span>,
}));

vi.mock('#components/ui/key-shortcut.js', () => ({
  KeyShortcut: ({ children }: { readonly children: React.ReactNode }) => <span>{children}</span>,
}));

vi.mock('#components/ui/tooltip.js', () => ({
  Tooltip: ({ children }: { readonly children: React.ReactNode }): React.ReactNode => children,
  TooltipTrigger: ({ children }: { readonly children: React.ReactNode }): React.ReactNode => children,
  TooltipContent: ({ children }: { readonly children: React.ReactNode }): React.ReactNode => children,
}));

vi.mock('#components/ui/collapsible.js', () => ({
  Collapsible: ({ children }: { readonly children: React.ReactNode }) => <div>{children}</div>,
  CollapsibleTrigger: ({ children }: { readonly children: React.ReactNode }) => <div>{children}</div>,
  CollapsibleContent: ({ children }: { readonly children: React.ReactNode }) => <div>{children}</div>,
}));

vi.mock('#components/ui/button.js', () => ({
  Button: ({ children, onClick }: { readonly children: React.ReactNode; readonly onClick?: () => void }) => (
    <button type='button' onClick={onClick} data-testid='fix-with-ai'>
      {children}
    </button>
  ),
}));

vi.mock('#utils/chat.utils.js', () => ({
  createMessage: (options: Record<string, unknown>) => ({ id: 'msg-fix', ...options }),
}));

vi.mock('#utils/filesystem.utils.js', () => ({
  decodeTextFile: (_bytes: Uint8Array<ArrayBuffer>) => 'cube(10);',
}));

const { ChatStackTrace } = await import('#routes/projects_.$id/chat-stack-trace.js');

const issue: KernelIssue = {
  message: 'Boom',
  code: 'RUNTIME',
  severity: 'error',
  location: { fileName: 'main.scad', startLineNumber: 1, startColumn: 1 },
  stackFrames: [],
};

describe('ChatStackTrace — new-chat (shift held) path', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockReadFile.mockResolvedValue(new Uint8Array([1, 2, 3]));
    mockCreateChat.mockResolvedValue({ id: 'chat_new' });
    mockKernelIssues = new Map([['main.scad', [issue]]]);
    mockAgent = {
      profile: 'cad',
      model: 'cookie-model',
      kernel: 'openscad',
      mode: 'agent',
      toolChoice: 'auto',
      testingEnabled: true,
    };
  });

  it('seeds activeModel and activeKernel on the new chat from the chat-client agent', async () => {
    render(<ChatStackTrace entryFile='main.scad' side='top' />);
    fireEvent.click(await screen.findByTestId('fix-with-ai'));

    await waitFor(() => {
      expect(mockCreateChat).toHaveBeenCalledOnce();
    });

    const callArgs = mockCreateChat.mock.calls[0]?.[0] as { activeModel?: string; activeKernel?: string };
    expect(callArgs.activeModel).toBe('cookie-model');
    expect(callArgs.activeKernel).toBe('openscad');
  });

  it('focuses the newly created chat after seeding', async () => {
    render(<ChatStackTrace entryFile='main.scad' side='top' />);
    fireEvent.click(await screen.findByTestId('fix-with-ai'));

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
    mockAgent = { ...mockAgent, model: 'chat-local-model', kernel: 'manifold' };

    render(<ChatStackTrace entryFile='main.scad' side='top' />);
    fireEvent.click(await screen.findByTestId('fix-with-ai'));

    await waitFor(() => {
      expect(mockCreateChat).toHaveBeenCalledOnce();
    });

    const callArgs = mockCreateChat.mock.calls[0]?.[0] as {
      activeModel?: string;
      activeKernel?: string;
      messages?: Array<{ metadata?: Record<string, unknown> }>;
    };
    expect(callArgs.activeModel).toBe('chat-local-model');
    expect(callArgs.activeKernel).toBe('manifold');
    expect(callArgs.messages?.[0]?.metadata?.['status']).toBe('pending');
  });
});

describe('ChatStackTrace — in-place (shift not held) path', () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    mockReadFile.mockResolvedValue(new Uint8Array([1, 2, 3]));
    mockKernelIssues = new Map([['main.scad', [issue]]]);
    mockAgent = {
      profile: 'cad',
      model: 'chat-local-model',
      kernel: 'manifold',
      mode: 'plan',
      toolChoice: 'auto',
      testingEnabled: false,
    };

    // Override `useModifiers` for this describe block so the shift-not-held
    // path is exercised and the in-place chat-client submit fires.
    const useModifiersMock = (await import('#hooks/use-keyboard.js')) as { useModifiers: () => { shift: boolean } };
    useModifiersMock.useModifiers = () => ({ shift: false });
  });

  it('routes the fix prompt through cadChat.submit (no inline metadata stamping)', async () => {
    render(<ChatStackTrace entryFile='main.scad' side='top' />);
    fireEvent.click(await screen.findByTestId('fix-with-ai'));

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
    render(<ChatStackTrace entryFile='main.scad' side='top' />);
    fireEvent.click(await screen.findByTestId('fix-with-ai'));

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
      messages: [userMessage],
      agent: mockAgent,
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
});
