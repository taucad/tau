import { act, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { CadAgentExecution } from '@taucad/chat';
import type { ChatTextareaProperties } from '#components/chat/chat-textarea-types.js';
import type { ProjectCreationLocationState } from '#hooks/use-project-creation-location.js';

const mockNavigate = vi.fn(async () => undefined);
const mockCreateProject = vi.fn();
const mockClearDraft = vi.fn();
const mockFlush = vi.fn();
const mockPresentLocationError = vi.fn(() => false);
const mockRefresh = vi.fn(async () => undefined);
let capturedTextarea: ChatTextareaProperties | undefined;
let locationState: ProjectCreationLocationState;
let composerExecution: CadAgentExecution;

vi.mock('react-router', () => ({ useNavigate: () => mockNavigate }));
vi.mock('#components/chat/chat-textarea.js', () => ({
  ChatTextarea: (properties: ChatTextareaProperties) => {
    capturedTextarea = properties;
    return (
      <>
        {properties.creationLocationControls?.toolbar}
        {properties.creationLocationControls?.field}
        <button type='button'>Submit draft</button>
      </>
    );
  },
}));
vi.mock('#components/chat/kernel-selector.js', () => ({
  KernelSelector: () => <div>Kernel selector</div>,
}));
vi.mock('#components/filesystem/workspace-selector.js', () => ({
  WorkspaceSelector: ({
    variant,
    isNested = false,
    'data-chat-textarea-focustrap': isInsideFocusTrap,
  }: {
    readonly variant: string;
    readonly isNested?: boolean;
    readonly 'data-chat-textarea-focustrap'?: unknown;
  }) => (
    <div
      data-testid={`location-${variant}`}
      data-is-nested={String(isNested)}
      data-is-inside-focus-trap={String(Boolean(isInsideFocusTrap))}
    >
      Location {variant}
    </div>
  ),
}));
vi.mock('#hooks/use-kernel.js', () => ({ useKernel: () => ({ kernel: 'openscad', setKernel: vi.fn() }) }));
vi.mock('#hooks/use-project-manager.js', () => ({
  useProjectManager: () => ({ createProject: mockCreateProject }),
}));
vi.mock('#hooks/use-project-creation-location.js', () => ({
  useProjectCreationLocation: () => locationState,
}));
vi.mock('#hooks/use-project-creation-location-error.js', () => ({
  useProjectCreationLocationError: () => mockPresentLocationError,
}));
vi.mock('#hooks/active-chat-provider.js', () => ({
  useChatComposer: () => ({
    model: { modelId: 'gpt-test' },
    execution: { execution: composerExecution },
    draftActorRef: { send: mockFlush },
  }),
}));
vi.mock('#hooks/use-chat.js', () => ({ useDraftActions: () => ({ clearDraft: mockClearDraft }) }));
vi.mock('#components/ui/sonner.js', () => ({ toast: { error: vi.fn() } }));

const { NewProjectChatComposer } = await import('#components/chat/new-project-chat-composer.js');

const readyLocation = (): ProjectCreationLocationState => ({
  phase: 'ready',
  hasWebAccessCapability: true,
  shouldShowPicker: true,
  value: { kind: 'workspace', workspaceId: 'wsp_workshop' },
  selectedOption: {
    location: { kind: 'workspace', workspaceId: 'wsp_workshop' },
    status: 'connected',
    label: 'Workshop',
    detail: 'on your disk',
  },
  options: [],
  canCreate: true,
  select: vi.fn(),
  connectWorkspace: vi.fn(async () => undefined),
  selectedWorkspaceRecovery: undefined,
  refresh: mockRefresh,
});

describe('NewProjectChatComposer', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    capturedTextarea = undefined;
    locationState = readyLocation();
    composerExecution = { kind: 'tau', model: 'gpt-test' };
    mockCreateProject.mockResolvedValue({ slugs: { workspaceSlug: 'workshop', projectSlug: 'bracket' } });
  });

  /*
   * The chip is the promise; the seed is the delivery. Rebuilding the seed from
   * the model alone is what placed a "Tau Host · root" turn on the browser host
   * (G4 live proof, 2026-09-03): the project was created, the chip read the
   * daemon, and the whole run happened in the page.
   */
  it.each([
    ['a paired Tau Host daemon', { kind: 'tau', model: 'gpt-test', hostId: 'device-av4' }],
    ['an external ACP agent on a daemon', { kind: 'acp', hostId: 'device-av4', agentId: 'codex' }],
    ['a Paseo agent', { kind: 'paseo', connectionId: 'conn-1', agentId: 'agent-1' }],
  ] as ReadonlyArray<readonly [string, CadAgentExecution]>)(
    'seeds the created chat with %s exactly as the chip shows it',
    async (_name, execution) => {
      composerExecution = execution;
      render(<NewProjectChatComposer />);

      await act(async () => {
        await capturedTextarea?.onSubmit({ content: 'Build a bracket', imageUrls: [] });
      });

      expect(mockCreateProject).toHaveBeenCalledWith(expect.objectContaining({ activeExecution: execution }));
    },
  );

  it('passes exact product selection and chat context, then clears only after navigation succeeds', async () => {
    render(<NewProjectChatComposer />);
    expect(capturedTextarea?.creationLocationControls?.toolbar).toBeDefined();
    expect(capturedTextarea?.creationLocationControls?.field).toBeDefined();
    expect(capturedTextarea?.isSubmitDisabled).toBe(false);
    expect(screen.getByTestId('location-toolbar')).toHaveAttribute('data-is-nested', 'false');
    expect(screen.getByTestId('location-field')).toHaveAttribute('data-is-nested', 'true');
    expect(screen.getByTestId('location-toolbar')).toHaveAttribute('data-is-inside-focus-trap', 'true');
    expect(screen.getByTestId('location-field')).toHaveAttribute('data-is-inside-focus-trap', 'true');

    await act(async () => {
      await capturedTextarea?.onSubmit({ content: 'Build a bracket', imageUrls: ['data:image/png;base64,a'] });
    });

    expect(mockCreateProject).toHaveBeenCalledWith({
      kernel: 'openscad',
      activeExecution: { kind: 'tau', model: 'gpt-test' },
      initialMessage: { content: 'Build a bracket', imageUrls: ['data:image/png;base64,a'] },
      editorState: {
        panelState: { desktopLayout: { chatOpen: true, compactAuxiliary: 'chat' }, mobileActiveTab: 'chat' },
      },
      location: { kind: 'workspace', workspaceId: 'wsp_workshop' },
    });
    expect(mockNavigate).toHaveBeenCalledWith('/w/workshop/bracket');
    expect(mockClearDraft).toHaveBeenCalledOnce();
    expect(mockFlush).toHaveBeenCalledWith({ type: 'flushNow' });
  });

  it('retains the draft and refreshes selected-folder status after a typed failure', async () => {
    const error = new Error('disconnected');
    mockCreateProject.mockRejectedValue(error);
    mockPresentLocationError.mockReturnValue(true);
    render(<NewProjectChatComposer />);

    await act(async () => {
      await capturedTextarea?.onSubmit({ content: 'Keep this draft', imageUrls: [] });
    });

    expect(mockPresentLocationError).toHaveBeenCalledWith(error);
    expect(mockRefresh).toHaveBeenCalledOnce();
    expect(mockNavigate).not.toHaveBeenCalled();
    expect(mockClearDraft).not.toHaveBeenCalled();
    expect(mockFlush).not.toHaveBeenCalled();
  });

  it('does not mount location controls and keeps Home ready without capability', () => {
    locationState = {
      phase: 'ready',
      hasWebAccessCapability: false,
      shouldShowPicker: false,
      value: { kind: 'home' },
      options: [{ location: { kind: 'home' }, status: 'ready', label: 'Home', detail: 'in this browser' }],
      canCreate: true,
    };
    render(<NewProjectChatComposer />);
    expect(capturedTextarea?.creationLocationControls).toBeUndefined();
    expect(screen.queryByText(/Location/)).not.toBeInTheDocument();
  });
});
