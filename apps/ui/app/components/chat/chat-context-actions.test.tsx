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
const secondaryGraphicsRef = {
  getSnapshot: () => ({ context: { cameraState: { position: [4, 5, 6] } } }),
};
const secondaryCadRef = mockCadRef;
let cameraRegistryVersion = 0;
const registeredGraphics = new Set<Record<string, unknown>>();
let viewGraphics = new Map<string, typeof mockGraphicsRef>();
let viewSettings: Record<string, { entryPath?: string }> = {};
const mockEditorRef = { getSnapshot: () => ({ context: { viewSettings } }) };
const mockImageService = { export: vi.fn() };
const runtimeFileSystem = {};

vi.mock('@xstate/react', () => ({
  useSelector: (actor: { getSnapshot(): unknown }, selector: (snapshot: unknown) => unknown) =>
    selector(actor.getSnapshot()),
}));
vi.mock('#hooks/use-project.js', () => ({
  useMainGraphics: () => mockGraphicsRef,
  useProject: () => ({
    geometryUnits: new Map([
      ['main.ts', mockCadRef],
      ['secondary.ts', secondaryCadRef],
    ]),
    mainEntryPath: 'main.ts',
    viewGraphics,
    editorRef: mockEditorRef,
  }),
}));
vi.mock('#hooks/use-graphics.js', () => ({
  useGraphicsCameraRigQuery: () => {
    const _version = cameraRegistryVersion;
    return (graphicsRef: Record<string, unknown>) => registeredGraphics.has(graphicsRef) && _version >= 0;
  },
}));
vi.mock('#services/graphics-camera-registry.js', () => ({
  hasGraphicsCameraRig: (graphicsRef: Record<string, unknown>) => registeredGraphics.has(graphicsRef),
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
    cameraRegistryVersion = 0;
    registeredGraphics.clear();
    registeredGraphics.add(mockGraphicsRef);
    viewGraphics = new Map();
    viewSettings = {};
  });

  it('uses shared menu-item geometry for inline popover actions', () => {
    render(
      <ChatContextActions
        asPopoverMenu
        selectedIndex={0}
        onSelectedIndexChange={vi.fn()}
        addImage={mockAddImage}
        addText={vi.fn()}
      />,
    );

    const firstAction = screen.getByRole('button', { name: 'Current view' });
    expect(firstAction).toHaveClass('rounded-sm');
    expect(firstAction).toHaveAttribute('data-selected', 'true');
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

  it('reacts to camera registration for main and non-main stable graphics actors', () => {
    registeredGraphics.clear();
    viewGraphics = new Map([
      ['main', mockGraphicsRef],
      ['secondary', secondaryGraphicsRef],
    ]);
    viewSettings = {
      main: { entryPath: 'main.ts' },
      secondary: { entryPath: 'secondary.ts' },
    };
    const view = render(<ChatContextActions asPopoverMenu addImage={mockAddImage} addText={vi.fn()} />);
    expect(screen.getByRole('button', { name: 'Current view' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'secondary.ts' })).toBeDisabled();

    registeredGraphics.add(mockGraphicsRef);
    registeredGraphics.add(secondaryGraphicsRef);
    cameraRegistryVersion += 1;
    view.rerender(<ChatContextActions asPopoverMenu addImage={mockAddImage} addText={vi.fn()} />);
    expect(screen.getByRole('button', { name: 'Current view' })).toBeEnabled();
    expect(screen.getByRole('button', { name: 'secondary.ts' })).toBeEnabled();

    registeredGraphics.clear();
    cameraRegistryVersion += 1;
    view.rerender(<ChatContextActions asPopoverMenu addImage={mockAddImage} addText={vi.fn()} />);
    expect(screen.getByRole('button', { name: 'Current view' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'secondary.ts' })).toBeDisabled();
  });
});
