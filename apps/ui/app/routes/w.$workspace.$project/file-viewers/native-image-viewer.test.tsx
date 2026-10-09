import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useCallback } from 'react';
import { mock } from 'vitest-mock-extended';
import { TooltipProvider } from '@taucad/ui/components/tooltip';
import { FileContentService } from '@taucad/fs-client/file-content-service';
import type { ComposedViewClient } from '@taucad/fs-client/composed-view-client';
import { RefreshGenerationGuard } from '@taucad/fs-client/refresh-generation-guard';
import { WorkerChangeChannel } from '@taucad/fs-client/worker-change-channel';
import { WorkspacePathResolver } from '@taucad/fs-client/workspace-path-resolver';
import { useFileContent } from '#hooks/use-file-content.js';
import { NativeImageViewer } from '#routes/w.$workspace.$project/file-viewers/native-image-viewer.js';
import { nativeImageFormats } from '#routes/w.$workspace.$project/file-viewers/native-image-format.js';
import type { FileViewerPaneContent } from '#routes/w.$workspace.$project/file-viewers/file-viewer.types.js';

const png = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
const fileManager = vi.hoisted(() => ({ contentService: undefined as FileContentService | undefined }));
vi.mock('#hooks/use-file-manager.js', () => ({ useFileManager: () => fileManager }));

function ImageFromFileContentService(): React.JSX.Element {
  const result = useFileContent('preview.png');
  const service = fileManager.contentService;
  const binarySize = result.kind === 'binary' ? result.size : undefined;
  const readAll = useCallback(async (): Promise<Uint8Array<ArrayBuffer>> => {
    if (binarySize === undefined || !service) {
      throw new Error('Image bytes are unavailable');
    }
    return service.readRawBytes('preview.png', { sizeLimit: binarySize });
  }, [binarySize, service]);
  if (result.kind !== 'binary') {
    return <span>Loading file…</span>;
  }
  return (
    <TooltipProvider>
      <NativeImageViewer
        name='preview.png'
        format={nativeImageFormats.png}
        revision={result.revision}
        readAll={readAll}
        renderPane={renderPane('preview.png')}
      />
    </TooltipProvider>
  );
}

const renderPane =
  (name: string) =>
  ({ actions, body }: FileViewerPaneContent): React.ReactNode => (
    <>
      <header role='group' aria-label={`File actions for ${name}`}>
        {actions}
      </header>
      <main>{body}</main>
    </>
  );

const viewer = ({
  name = 'preview.png',
  revision = 1,
  readAll = async () => png,
}: {
  readonly name?: string;
  readonly revision?: number;
  readonly readAll?: () => Promise<Uint8Array<ArrayBuffer>>;
} = {}): React.JSX.Element => (
  <TooltipProvider>
    <NativeImageViewer
      name={name}
      format={nativeImageFormats.png}
      revision={revision}
      readAll={readAll}
      renderPane={renderPane(name)}
    />
  </TooltipProvider>
);

describe('NativeImageViewer', () => {
  beforeEach(() => {
    vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:image');
    vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => undefined);
  });

  afterEach(() => {
    fileManager.contentService = undefined;
    vi.restoreAllMocks();
  });

  it('loads through a typed Blob URL and revokes it on unmount', async () => {
    const { unmount } = render(viewer());

    const image = await screen.findByRole('img', { name: 'preview.png' });
    expect(image).toHaveAttribute('src', 'blob:image');
    expect(URL.createObjectURL).toHaveBeenCalledWith(expect.objectContaining({ type: 'image/png' }));

    unmount();
    expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:image');
  });

  it('supports fit, 100%, and bounded zoom controls', async () => {
    const user = userEvent.setup();
    render(viewer());

    const image = await screen.findByRole('img', { name: 'preview.png' });
    const actions = screen.getByRole('group', { name: 'File actions for preview.png' });
    const imageRegion = screen.getByRole('region', { name: 'Image viewer: preview.png' });
    expect(within(actions).getAllByRole('button')).toHaveLength(4);
    expect(within(actions).getByRole('link', { name: 'Download image' })).toHaveAttribute('href', 'blob:image');
    expect(within(actions).getByRole('link', { name: 'Download image' })).toHaveAttribute('download', 'preview.png');
    expect(within(imageRegion).queryByRole('button')).not.toBeInTheDocument();
    expect(within(imageRegion).queryByRole('link')).not.toBeInTheDocument();
    expect(within(actions).getByRole('button', { name: 'Fit image' })).toHaveAttribute('aria-pressed', 'true');
    Object.defineProperties(image, {
      naturalWidth: { configurable: true, value: 800 },
      naturalHeight: { configurable: true, value: 600 },
    });
    fireEvent.load(image);

    await user.click(screen.getByRole('button', { name: 'Actual size' }));
    expect(image).toHaveStyle({ width: '800px', height: '600px' });
    expect(screen.getByRole('button', { name: 'Actual size' })).toHaveAttribute('aria-pressed', 'true');
    await user.click(screen.getByRole('button', { name: 'Zoom in' }));
    expect(screen.getByText('125%')).toBeInTheDocument();
    for (let index = 0; index < 40; index += 1) {
      fireEvent.click(screen.getByRole('button', { name: 'Zoom in' }));
    }
    expect(screen.getByText('800%')).toBeInTheDocument();
    for (let index = 0; index < 40; index += 1) {
      fireEvent.click(screen.getByRole('button', { name: 'Zoom out' }));
    }
    expect(screen.getByText('10%')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Fit image' }));
    expect(image).toHaveClass('max-h-full', 'max-w-full');
  });

  it('renders loading in the pane body without image actions', () => {
    const readAll = async (): Promise<Uint8Array<ArrayBuffer>> =>
      new Promise(() => {
        // Intentionally pending so the loading state remains observable.
      });
    render(viewer({ readAll }));

    expect(screen.getByRole('status')).toHaveTextContent('Loading image…');
    expect(screen.getByRole('group', { name: 'File actions for preview.png' })).toBeEmptyDOMElement();
  });

  it('shows a stable error when full bytes no longer match the routed format', async () => {
    render(viewer({ readAll: async () => new Uint8Array([0, 1, 2]) }));

    expect(await screen.findByRole('alert')).toHaveTextContent(/changed before it could be displayed/i);
    expect(screen.getByRole('group', { name: 'File actions for preview.png' })).toBeEmptyDOMElement();
    await waitFor(() => {
      expect(URL.createObjectURL).not.toHaveBeenCalled();
    });
  });

  it('replaces and revokes the Blob URL when the binary revision changes', async () => {
    vi.mocked(URL.createObjectURL).mockReturnValueOnce('blob:first').mockReturnValueOnce('blob:second');
    const readAll = vi.fn().mockResolvedValue(png);
    const { rerender } = render(viewer({ revision: 1, readAll }));
    expect(await screen.findByRole('img', { name: 'preview.png' })).toHaveAttribute('src', 'blob:first');

    rerender(viewer({ revision: 2, readAll }));

    await waitFor(() => {
      expect(screen.getByRole('img', { name: 'preview.png' })).toHaveAttribute('src', 'blob:second');
    });
    expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:first');
  });

  it('should keep the live image after a no-op file refresh and reload changed tail bytes', async () => {
    let bytes = new Uint8Array(600);
    bytes.set(png);
    const proxy = mock<ComposedViewClient>({
      stat: vi.fn().mockImplementation(async () => ({ size: bytes.byteLength })),
      readFile: vi.fn().mockImplementation(async () => new Uint8Array(bytes)),
    });
    let emitFileChanged: (event: unknown) => void = () => undefined;
    const watches = new Set<(event: { type: 'change'; path: string }) => void>();
    /* As the worker reports a write: the exact authority watch, then the coalesced tree notification. */
    const writeFile = (): void => {
      for (const watch of watches) {
        watch({ type: 'change', path: 'preview.png' });
      }
      emitFileChanged({ type: 'fileWritten', path: 'preview.png', backend: 'indexeddb' });
    };
    const channel = new WorkerChangeChannel({
      transport: {
        listen: (_event, callback) => {
          emitFileChanged = callback;
          return () => undefined;
        },
        watchReady: (_request, handler) => {
          watches.add(handler);
          return {
            ready: Promise.resolve(),
            closed: new Promise<void>(() => {
              // Never closes.
            }),
            unsubscribe: () => {
              watches.delete(handler);
            },
          };
        },
      },
    });
    const service = new FileContentService({
      proxy,
      paths: new WorkspacePathResolver('/project'),
      channel,
      refreshGuard: new RefreshGenerationGuard(),
    });
    fileManager.contentService = service;
    const digest = vi.spyOn(globalThis.crypto.subtle, 'digest');
    vi.mocked(URL.createObjectURL).mockReturnValueOnce('blob:first').mockReturnValueOnce('blob:second');
    const mounted = render(<ImageFromFileContentService />);
    try {
      const image = await screen.findByRole('img', { name: 'preview.png' });
      expect(image).toHaveAttribute('src', 'blob:first');
      Object.defineProperties(image, {
        naturalWidth: { configurable: true, value: 800 },
        naturalHeight: { configurable: true, value: 600 },
      });
      fireEvent.load(image);
      await userEvent.click(screen.getByRole('button', { name: 'Actual size' }));
      await userEvent.click(screen.getByRole('button', { name: 'Zoom in' }));
      expect(screen.getByText('125%')).toBeInTheDocument();
      const firstOutcome = service.peekOutcome('preview.png');
      // The viewer's raw bytes come from the classified content the service already cached.
      expect(proxy.readFile).toHaveBeenCalledOnce();

      act(writeFile);
      await waitFor(() => {
        expect(proxy.readFile).toHaveBeenCalledTimes(2);
        expect(digest).toHaveBeenCalledTimes(2);
      });
      await act(async () => {
        await digest.mock.results[1]!.value;
        await new Promise((resolve) => {
          setTimeout(resolve, 0);
        });
      });
      expect(service.peekOutcome('preview.png')).toBe(firstOutcome);
      expect(screen.getByRole('img', { name: 'preview.png' })).toBe(image);
      expect(screen.getByText('125%')).toBeInTheDocument();
      expect(URL.createObjectURL).toHaveBeenCalledOnce();
      expect(URL.revokeObjectURL).not.toHaveBeenCalled();

      bytes = new Uint8Array(bytes);
      bytes[bytes.length - 1] = 1;
      act(writeFile);
      await waitFor(() => {
        expect(screen.getByRole('img', { name: 'preview.png' })).toHaveAttribute('src', 'blob:second');
      });
      expect(proxy.readFile).toHaveBeenCalledTimes(3);
      expect(digest).toHaveBeenCalledTimes(3);
      expect(service.peekOutcome('preview.png')).not.toBe(firstOutcome);
      expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:first');
    } finally {
      mounted.unmount();
      service.dispose();
      channel.dispose();
    }
  });

  it('shows a stable error when the browser cannot decode matching image bytes', async () => {
    render(viewer({ name: 'broken.png' }));
    const image = await screen.findByRole('img', { name: 'broken.png' });

    fireEvent.error(image);

    expect(await screen.findByRole('alert')).toHaveTextContent(/could not be decoded/i);
    expect(screen.queryByRole('img', { name: 'broken.png' })).not.toBeInTheDocument();
    expect(screen.getByRole('group', { name: 'File actions for broken.png' })).toBeEmptyDOMElement();
    expect(URL.createObjectURL).toHaveBeenCalledOnce();
  });
});
