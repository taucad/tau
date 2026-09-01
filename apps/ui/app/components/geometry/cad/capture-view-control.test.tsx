// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import type { captureCadImages as captureCadImagesType } from '#services/headless-capture.js';

const mockAddDraftImage = vi.fn();
const mockTrigger = vi.fn();
const mockGraphicsRef = { send: vi.fn(), id: 'graphics-actor' };
const mockCadRef = { send: vi.fn(), id: 'cad-actor' };
const mockImageService = { export: vi.fn() };
const runtimeFileSystem = {};
const mockCaptureCadImages = vi.fn<typeof captureCadImagesType>();

vi.mock('#services/headless-capture.js', () => ({
  captureCadImages: mockCaptureCadImages,
  captureFilesToDataUrls: () => ['data:image/webp;base64,AQID'],
}));
vi.mock('#hooks/use-graphics.js', () => ({ useGraphics: () => mockGraphicsRef }));
vi.mock('#hooks/use-cad.js', () => ({ useCad: () => mockCadRef }));
vi.mock('#hooks/use-chat.js', () => ({ useChatActions: () => ({ addDraftImage: mockAddDraftImage }) }));
vi.mock('#hooks/use-tick-animation.js', () => ({
  useTickAnimation: () => ({ ticked: false, trigger: mockTrigger }),
}));
vi.mock('#hooks/use-file-manager.js', () => ({ useFileManager: () => ({ runtimeFileSystem }) }));
vi.mock('#providers/headless-image-provider.js', () => ({
  useHeadlessImageService: () => mockImageService,
}));
vi.mock('#components/ui/sonner.js', () => ({ toast: { error: vi.fn(), success: vi.fn() } }));
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
vi.mock('@taucad/ui/components/dropdown-menu', () => ({
  DropdownMenuItem: ({
    children,
    onSelect,
  }: {
    readonly children: React.ReactNode;
    readonly onSelect?: () => void;
  }) => (
    <button type='button' onClick={onSelect} data-testid='capture-overflow-button'>
      {children}
    </button>
  ),
}));

const { CaptureViewControl, CaptureViewOverflowControl } =
  await import('#components/geometry/cad/capture-view-control.js');

describe('CaptureViewControl', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockCaptureCadImages.mockResolvedValue([
      { name: 'capture.webp', mimeType: 'image/webp', bytes: new Uint8Array([1, 2, 3]) },
    ]);
  });

  it('captures the local CAD unit losslessly through the headless service', async () => {
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
      fileSystem: runtimeFileSystem,
      recipe: { purpose: 'chat', mode: 'current' },
    });
    expect(mockAddDraftImage).toHaveBeenCalledWith('data:image/webp;base64,AQID', { preserveOriginal: true });
    expect(mockTrigger).toHaveBeenCalledOnce();
  });

  it('completes the overflow capture after its dropdown item unmounts', async () => {
    const capture = Promise.withResolvers<Awaited<ReturnType<typeof captureCadImagesType>>>();
    mockCaptureCadImages.mockReturnValueOnce(capture.promise);
    const user = userEvent.setup();
    const { unmount } = render(<CaptureViewOverflowControl />);
    await user.click(screen.getByTestId('capture-overflow-button'));
    unmount();
    capture.resolve([{ name: 'capture.webp', mimeType: 'image/webp', bytes: new Uint8Array([1, 2, 3]) }]);

    await waitFor(() => {
      expect(mockAddDraftImage).toHaveBeenCalledWith('data:image/webp;base64,AQID', { preserveOriginal: true });
    });
  });
});
