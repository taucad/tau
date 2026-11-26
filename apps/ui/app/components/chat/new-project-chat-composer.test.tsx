import { act, fireEvent, render } from '@testing-library/react';
import { useImperativeHandle } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { CadAgentExecution } from '@taucad/chat';
import type { ChatTextareaHandle, ChatTextareaProperties } from '#components/chat/chat-textarea-types.js';
import type { ProjectCreationLocationState } from '#hooks/use-project-creation-location.js';

const mockNavigate = vi.fn(async () => undefined);
const mockCreateProject = vi.fn();
const mockConsumeDraft = vi.fn(async () => undefined);
const mockPresentLocationError = vi.fn(() => false);
const mockRefresh = vi.fn(async () => undefined);
const mockFocus = vi.fn();
const mockTakeName = vi.fn<(draft: { text: string }) => Promise<string> | undefined>();
let routerLocationState: unknown;
let locationKey = 0;
let capturedTextarea: ChatTextareaProperties | undefined;
let locationState: ProjectCreationLocationState;
let composerExecution: CadAgentExecution;
let attachmentSource: string | undefined;
let draftAttachments: Array<{ hash: string; mediaType: string; byteLength?: number; filename?: string }>;

vi.mock('react-router', () => ({
  useNavigate: () => mockNavigate,
  useLocation: () => ({ key: String(locationKey), state: routerLocationState }),
}));
vi.mock('#components/chat/chat-textarea.js', () => ({
  ChatTextarea: ({
    ref,
    ...properties
  }: ChatTextareaProperties & { readonly ref?: React.Ref<Partial<ChatTextareaHandle>> }) => {
    useImperativeHandle(ref, () => ({ focus: mockFocus }));
    capturedTextarea = properties;
    return <button type='button'>Submit draft</button>;
  },
}));
const remembered = vi.hoisted(() => ({ preference: 'openscad' as string }));
vi.mock('#hooks/use-kernel.js', () => ({
  useKernel: () => ({ kernel: 'openscad', preference: remembered.preference }),
}));
vi.mock('#hooks/use-models.js', () => ({
  useModels: () => ({ withCatalogDefaultModel: async (execution: unknown) => execution }),
}));
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
vi.mock('@taucad/ui/components/sonner', () => ({ toast: { error: vi.fn() } }));
vi.mock('#components/chat/use-project-name-ahead.js', () => ({
  useProjectNameAhead: () => ({ take: mockTakeName, onPasteCapture: vi.fn() }),
}));

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
    remembered.preference = 'openscad';
    vi.clearAllMocks();
    capturedTextarea = undefined;
    locationState = readyLocation();
    composerExecution = { kind: 'tau', model: 'gpt-test' };
    draftAttachments = [];
    attachmentSource = undefined;
    routerLocationState = null;
    mockTakeName.mockReturnValue(undefined);
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
    [
      'an external ACP agent on a daemon',
      // eslint-disable-next-line @typescript-eslint/naming-convention -- ACP option IDs retain the provider's wire spelling.
      { kind: 'acp', hostId: 'device-av4', agentId: 'codex', config: { thought_level: 'high' } },
    ],
  ] as ReadonlyArray<readonly [string, CadAgentExecution]>)(
    'seeds the created chat with %s exactly as the chip shows it',
    async (_name, execution) => {
      composerExecution = execution;
      render(<NewProjectChatComposer />);

      await act(async () => {
        await capturedTextarea?.onSubmit({ content: 'Build a bracket', attachments: [] });
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
    expect(capturedTextarea?.creationLocation).toBe(locationState);
    expect(capturedTextarea?.isSubmitDisabled).toBe(false);

    await act(async () => {
      await capturedTextarea?.onSubmit({ content: 'Build a bracket', attachments: [] });
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

  /* C1: a name asked for while the prompt was written is the project's name, so the create asks for none; it is
   * handed over unawaited, so a request still in flight does not hold back the create's setup. */
  it('creates the project under the name asked for the submitted draft, without waiting for it', async () => {
    draftAttachments = [{ hash: 'a'.repeat(64), mediaType: 'image/png', byteLength: 3 }];
    const inFlight = new Promise<string>(() => {
      /* Never settles: the create must not wait for it. */
    });
    mockTakeName.mockReturnValue(inFlight);
    render(<NewProjectChatComposer />);

    await act(async () => {
      await capturedTextarea?.onSubmit({ content: 'A wall bracket for a pipe', attachments: [] });
    });

    expect(mockTakeName).toHaveBeenCalledWith({
      text: 'A wall bracket for a pipe',
      attachments: [{ hash: 'a'.repeat(64), mediaType: 'image/png' }],
    });
    expect(mockCreateProject).toHaveBeenCalledWith(expect.objectContaining({ projectName: inFlight }));
  });

  it('leaves naming to the create when no name is held', async () => {
    render(<NewProjectChatComposer />);
    await act(async () => {
      await capturedTextarea?.onSubmit({ content: 'A wall bracket for a pipe', attachments: [] });
    });
    expect(mockCreateProject.mock.calls[0]?.[0]).not.toHaveProperty('projectName');
  });

  it('creates an entry-less Auto project when the remembered choice is Auto (blueprint D3)', async () => {
    remembered.preference = 'auto';
    render(<NewProjectChatComposer />);
    await act(async () => {
      await capturedTextarea?.onSubmit({ content: 'Build a bracket', attachments: [] });
    });
    expect(mockCreateProject).toHaveBeenCalledWith(expect.objectContaining({ kernel: 'auto' }));
  });

  // New (W6, P39): a surface with its own directory names it, so resume copies from there.
  it('names the surface attachment directory when the provider has one', async () => {
    attachmentSource = '/.tau/composers/marketing/attachments';
    draftAttachments = [{ hash: 'a'.repeat(64), mediaType: 'image/png' }];
    render(<NewProjectChatComposer />);

    await act(async () => {
      await capturedTextarea?.onSubmit({ content: '', attachments: [] });
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

  it('focuses the composer when a navigation asks for it, including a return to an already-mounted Home', () => {
    const { rerender } = render(<NewProjectChatComposer />);
    expect(mockFocus).not.toHaveBeenCalled();

    routerLocationState = { focusChatComposer: true };
    locationKey += 1;
    rerender(<NewProjectChatComposer />);
    expect(mockFocus).toHaveBeenCalledOnce();

    // A second "New Project" press is a new navigation, so it refocuses too.
    locationKey += 1;
    rerender(<NewProjectChatComposer />);
    expect(mockFocus).toHaveBeenCalledTimes(2);
  });

  it('refocuses on window return only when nothing else holds focus', () => {
    render(<NewProjectChatComposer />);
    const other = document.createElement('input');
    document.body.append(other);

    other.focus();
    fireEvent.focus(globalThis.window);
    expect(mockFocus).not.toHaveBeenCalled();

    other.blur();
    fireEvent.focus(globalThis.window);
    expect(mockFocus).toHaveBeenCalledOnce();
    other.remove();
  });

  it('leaves focus alone on surfaces without autofocus', () => {
    routerLocationState = { focusChatComposer: true };
    render(<NewProjectChatComposer enableAutoFocus={false} />);
    fireEvent.focus(globalThis.window);
    expect(mockFocus).not.toHaveBeenCalled();
  });

  it('retains the draft and refreshes selected-folder status after a typed failure', async () => {
    const error = new Error('disconnected');
    mockCreateProject.mockRejectedValue(error);
    mockPresentLocationError.mockReturnValue(true);
    render(<NewProjectChatComposer />);

    await act(async () => {
      await capturedTextarea?.onSubmit({ content: 'Keep this draft', attachments: [] });
    });

    expect(mockPresentLocationError).toHaveBeenCalledWith(error);
    // Nothing ran that would release the Home draft or its bytes.
    expect(mockRefresh).toHaveBeenCalledOnce();
    expect(mockNavigate).not.toHaveBeenCalled();
    expect(mockConsumeDraft).not.toHaveBeenCalled();
  });

  it('offers no location and keeps Home ready without capability', () => {
    locationState = {
      phase: 'ready',
      hasWebAccessCapability: false,
      shouldShowPicker: false,
      value: { kind: 'home' },
      options: [{ location: { kind: 'home' }, status: 'ready', label: 'Home', detail: 'in this browser' }],
      canCreate: true,
    };
    render(<NewProjectChatComposer />);
    expect(capturedTextarea?.creationLocation).toBeUndefined();
  });
});
