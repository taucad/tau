// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import type { CadAgentExecution } from '@taucad/chat';
import type { captureCadImages as captureCadImagesType } from '#services/headless-capture.js';
import { toast } from '#components/ui/sonner.js';

const mockAddDraftAttachment = vi.fn();
const selectedModel = {
  name: 'Vision Model',
  model: { support: { modalities: { input: ['text', 'image'], output: ['text'] } } },
};
let mockSelectedModel: { name: string; model?: typeof selectedModel.model } = selectedModel;
let mockExecution: CadAgentExecution = { kind: 'tau', model: 'vision' };
const mockTrigger = vi.fn();
const mockGraphicsRef = { send: vi.fn(), id: 'graphics-actor' };
const mockCadRef = { send: vi.fn(), id: 'cad-actor' };
const mockImageService = { export: vi.fn() };
const mockCaptureCadImages = vi.fn<typeof captureCadImagesType>();

vi.mock('#services/headless-capture.js', () => ({
  captureCadImages: mockCaptureCadImages,
  captureFilesToDataUrls: () => ['data:image/webp;base64,AQID'],
  omittedSectionCutsNotice: 'Section cutaways narrower than 180° are not shown in captures.',
}));
vi.mock('#hooks/use-graphics.js', () => ({ useGraphics: () => mockGraphicsRef }));
vi.mock('#hooks/use-cad.js', () => ({ useCad: () => mockCadRef }));
vi.mock('#hooks/use-chat.js', () => ({ useChatActions: () => ({ addDraftAttachment: mockAddDraftAttachment }) }));
vi.mock('#hooks/active-chat-provider.js', () => ({
  useChatComposer: () => ({ model: { model: mockSelectedModel }, execution: { execution: mockExecution } }),
}));
vi.mock('#hooks/use-tick-animation.js', () => ({
  useTickAnimation: () => ({ ticked: false, trigger: mockTrigger }),
}));
vi.mock('#providers/headless-image-provider.js', () => ({
  useHeadlessImageService: () => mockImageService,
}));
vi.mock('#components/ui/sonner.js', () => ({ toast: { error: vi.fn(), success: vi.fn(), warning: vi.fn() } }));
vi.mock('@taucad/ui/components/tooltip', () => ({
  Tooltip: ({ children }: { readonly children: React.ReactNode }) => <div>{children}</div>,
  TooltipTrigger: ({ children }: { readonly children: React.ReactNode }) => <div>{children}</div>,
  TooltipContent: ({ children }: { readonly children: React.ReactNode }) => <div>{children}</div>,
}));
vi.mock('@taucad/ui/components/button', () => ({
  Button: ({ children, onClick }: { readonly children: React.ReactNode; readonly onClick?: () => void }) => (
    <button type='button' onClick={onClick} data-testid='capture-button'>
      {children}
    </button>
  ),
}));
const { CaptureViewControl } = await import('#components/geometry/cad/capture-view-control.js');

describe('CaptureViewControl', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockSelectedModel = selectedModel;
    mockExecution = { kind: 'tau', model: 'vision' };
    mockCaptureCadImages.mockResolvedValue({
      files: [{ name: 'capture.webp', mimeType: 'image/webp', bytes: new Uint8Array([1, 2, 3]) }],
      omittedSectionCutIds: [],
    });
  });

  it('should capture the local CAD unit losslessly through the headless service', async () => {
    const user = userEvent.setup();
    render(<CaptureViewControl />);
    await user.click(screen.getByTestId('capture-button'));

    await waitFor(() => {
      expect(mockCaptureCadImages).toHaveBeenCalledOnce();
    });
    expect(mockCaptureCadImages).toHaveBeenCalledWith({
      cadRef: mockCadRef,
      graphicsRef: mockGraphicsRef,
      imageService: mockImageService,
      recipe: { purpose: 'chat', mode: 'current' },
    });
    expect(mockAddDraftAttachment).toHaveBeenCalledWith('data:image/webp;base64,AQID', {
      preserveOriginal: true,
      model: { name: 'Vision Model', support: selectedModel.model.support },
    });
    expect(mockTrigger).toHaveBeenCalledOnce();
    expect(toast.warning).not.toHaveBeenCalled();
  });

  it('should say when the capture leaves a cut out', async () => {
    mockCaptureCadImages.mockResolvedValue({
      files: [{ name: 'capture.webp', mimeType: 'image/webp', bytes: new Uint8Array([1, 2, 3]) }],
      omittedSectionCutIds: ['cutaway'],
    });
    const user = userEvent.setup();
    render(<CaptureViewControl />);
    await user.click(screen.getByTestId('capture-button'));

    await waitFor(() => {
      expect(toast.warning).toHaveBeenCalledWith('Section cutaways narrower than 180° are not shown in captures.');
    });
    expect(mockAddDraftAttachment).toHaveBeenCalledOnce();
  });

  it('should admit a viewer capture for a local ACP agent without a Tau model row', async () => {
    mockSelectedModel = { name: 'Stale Tau' };
    mockExecution = { kind: 'acp', hostId: 'desktop', agentId: 'codex' };
    const user = userEvent.setup();
    render(<CaptureViewControl />);
    await user.click(screen.getByTestId('capture-button'));

    await waitFor(() => {
      expect(mockAddDraftAttachment).toHaveBeenCalledWith('data:image/webp;base64,AQID', {
        preserveOriginal: true,
        model: { name: 'codex', support: { modalities: { input: ['text', 'image', 'pdf'], output: ['text'] } } },
      });
    });
  });
});
