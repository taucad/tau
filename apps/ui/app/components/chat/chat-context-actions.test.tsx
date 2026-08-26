// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import type { captureCadImages as captureCadImagesType } from '#services/headless-capture.js';

const mockAddImage = vi.fn();
const mockOnClose = vi.fn();
const mockCaptureCadImages = vi.fn<typeof captureCadImagesType>();
const mockCadRef = {
  getSnapshot: () => ({
    context: { geometry: { format: 'gltf' }, kernelIssues: new Map(), codeIssues: [] },
  }),
};
const mockGraphicsRef = {
  getSnapshot: () => ({ context: { cameraState: { position: [1, 2, 3] } } }),
};
const mockEditorRef = { getSnapshot: () => ({ context: { viewSettings: {} } }) };
const mockImageService = { export: vi.fn() };
const runtimeFileSystem = {};

vi.mock('@xstate/react', () => ({
  useSelector: (actor: { getSnapshot(): unknown }, selector: (snapshot: unknown) => unknown) =>
    selector(actor.getSnapshot()),
}));
vi.mock('#hooks/use-project.js', () => ({
  useMainGraphics: () => mockGraphicsRef,
  useProject: () => ({
    geometryUnits: new Map([['main.ts', mockCadRef]]),
    mainEntryPath: 'main.ts',
    viewGraphics: new Map(),
    editorRef: mockEditorRef,
  }),
}));
vi.mock('#hooks/use-graphics.js', () => ({
  useCameraRegistryVersion: () => 1,
}));
vi.mock('#services/graphics-camera-registry.js', () => ({
  hasGraphicsCameraRig: () => true,
  getGraphicsCameraState: () => ({ position: [1, 2, 3] }),
}));
vi.mock('#services/headless-capture.js', () => ({
  captureCadImages: mockCaptureCadImages,
  captureFilesToDataUrls: () => ['data:image/webp;base64,AQID'],
}));
vi.mock('#hooks/use-file-manager.js', () => ({ useFileManager: () => ({ runtimeFileSystem }) }));
vi.mock('#providers/headless-image-provider.js', () => ({ useHeadlessImageService: () => mockImageService }));
vi.mock('#components/ui/sonner.js', () => ({ toast: { error: vi.fn(), success: vi.fn() } }));

const { ChatContextActions } = await import('#components/chat/chat-context-actions.js');

describe('ChatContextActions', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('completes a capture after its popover closes and unmounts', async () => {
    const capture = Promise.withResolvers<Awaited<ReturnType<typeof captureCadImagesType>>>();
    mockCaptureCadImages.mockReturnValueOnce(capture.promise);
    const user = userEvent.setup();
    const { unmount } = render(
      <ChatContextActions asPopoverMenu addImage={mockAddImage} addText={vi.fn()} onClose={mockOnClose} />,
    );

    await user.click(screen.getByRole('button', { name: 'Current view' }));
    expect(mockOnClose).toHaveBeenCalledOnce();
    unmount();
    capture.resolve([{ name: 'capture.webp', mimeType: 'image/webp', bytes: new Uint8Array([1, 2, 3]) }]);

    await waitFor(() => {
      expect(mockAddImage).toHaveBeenCalledWith('data:image/webp;base64,AQID', { preserveOriginal: true });
    });
  });
});
