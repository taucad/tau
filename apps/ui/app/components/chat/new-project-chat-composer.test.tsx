import { act, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { CadAgentExecution } from '@taucad/chat';
import type { ChatTextareaProperties } from '#components/chat/chat-textarea-types.js';
import type { ProjectCreationLocationState } from '#hooks/use-project-creation-location.js';

const mockNavigate = vi.fn(async () => undefined);
const mockCreateProject = vi.fn();
const mockConsumeDraft = vi.fn(async () => undefined);
const mockPresentLocationError = vi.fn(() => false);
const mockRefresh = vi.fn(async () => undefined);
let capturedTextarea: ChatTextareaProperties | undefined;
let locationState: ProjectCreationLocationState;
let composerExecution: CadAgentExecution;
let attachmentSource: string | undefined;
let draftAttachments: Array<{ hash: string; mediaType: string; byteLength?: number; filename?: string }>;

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
    draftActorRef: { getSnapshot: () => ({ context: { draftAttachments } }) },
    attachmentSource,
    model: { modelId: 'gpt-test' },
    execution: { execution: composerExecution },
    consumeDraft: mockConsumeDraft,
  }),
}));
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
    draftAttachments = [];
    attachmentSource = undefined;
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

  // Rewritten (W6): the startup message references the draft's stored
  // attachments; the textarea's data URLs are no longer the source.
  it('passes exact product selection and the stored draft attachments, then consumes before navigation', async () => {
    const hash = 'a'.repeat(64);
    draftAttachments = [
      { hash, mediaType: 'image/png', byteLength: 3 },
      { hash: 'b'.repeat(64), mediaType: 'application/pdf', byteLength: 9, filename: 'spec.pdf' },
    ];
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
      initialMessage: {
        content: 'Build a bracket',
        attachments: [
          { hash, mediaType: 'image/png' },
          { hash: 'b'.repeat(64), mediaType: 'application/pdf', filename: 'spec.pdf' },
        ],
      },
      editorState: {
        panelState: { desktopLayout: { chatOpen: true, compactAuxiliary: 'chat' }, mobileActiveTab: 'chat' },
      },
      location: { kind: 'workspace', workspaceId: 'wsp_workshop' },
    });
    expect(mockConsumeDraft).toHaveBeenCalledOnce();
    expect(mockNavigate).toHaveBeenCalledWith('/w/workshop/bracket');
    expect(mockConsumeDraft.mock.invocationCallOrder[0]).toBeLessThan(mockNavigate.mock.invocationCallOrder[0]!);
  });

  // New (W6, P39): a surface with its own directory names it, so resume copies from there.
  it('names the surface attachment directory when the provider has one', async () => {
    attachmentSource = '/.tau/composers/marketing/attachments';
    draftAttachments = [{ hash: 'a'.repeat(64), mediaType: 'image/png' }];
    render(<NewProjectChatComposer />);

    await act(async () => {
      await capturedTextarea?.onSubmit({ content: '', imageUrls: [] });
    });

    expect(mockCreateProject).toHaveBeenCalledWith(
      expect.objectContaining({
        initialMessage: {
          content: '',
          attachments: [{ hash: 'a'.repeat(64), mediaType: 'image/png' }],
          attachmentSource: '/.tau/composers/marketing/attachments',
        },
      }),
    );
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
    // Nothing ran that would release the Home draft or its bytes.
    expect(mockRefresh).toHaveBeenCalledOnce();
    expect(mockNavigate).not.toHaveBeenCalled();
    expect(mockConsumeDraft).not.toHaveBeenCalled();
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
