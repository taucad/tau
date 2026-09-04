import { useEffect, useState } from 'react';
import type { ReactNode } from 'react';
import { Download, Maximize2, Minus, Plus } from 'lucide-react';
import { PaneButton } from '#components/ui/pane-button.js';
import type { FileViewerRenderRequest } from '#routes/w.$workspace.$project/file-viewers/file-viewer.types.js';
import type { NativeImageFormat } from '#routes/w.$workspace.$project/file-viewers/native-image-format.js';
import { sniffNativeImageFormat } from '#routes/w.$workspace.$project/file-viewers/native-image-format.js';

type NativeImageViewerProps = {
  readonly name: string;
  readonly format: NativeImageFormat;
  readonly revision: number;
  readonly readAll: () => Promise<Uint8Array<ArrayBuffer>>;
  readonly renderPane: FileViewerRenderRequest['renderPane'];
};

type ImageResource =
  | { readonly kind: 'loading' }
  | { readonly kind: 'ready'; readonly url: string }
  | { readonly kind: 'error'; readonly message: string };

type Dimensions = { readonly width: number; readonly height: number };
type Zoom = 'fit' | number;
const minimumZoom = 10;
const maximumZoom = 800;
const zoomStep = 25;

export function NativeImageViewer({ name, format, revision, readAll, renderPane }: NativeImageViewerProps): ReactNode {
  return (
    <NativeImageViewerContent
      key={`${name}:${format.id}:${revision}`}
      name={name}
      format={format}
      revision={revision}
      readAll={readAll}
      renderPane={renderPane}
    />
  );
}

function NativeImageViewerContent({ name, format, revision, readAll, renderPane }: NativeImageViewerProps): ReactNode {
  const [resource, setResource] = useState<ImageResource>({ kind: 'loading' });
  const [dimensions, setDimensions] = useState<Dimensions>();
  const [zoom, setZoom] = useState<Zoom>('fit');

  useEffect(() => {
    let active = true;
    let url: string | undefined;
    const loadImage = async (): Promise<void> => {
      try {
        const bytes = await readAll();
        const detected = sniffNativeImageFormat(bytes, { allowSvg: format.id === 'svg' });
        if (detected?.id !== format.id) {
          throw new Error('The file changed before it could be displayed. Reopen it to try again.');
        }
        url = URL.createObjectURL(new Blob([bytes], { type: format.mimeType }));
        if (active) {
          setResource({ kind: 'ready', url });
        } else {
          URL.revokeObjectURL(url);
        }
      } catch (error) {
        if (active) {
          setResource({
            kind: 'error',
            message: error instanceof Error ? error.message : 'The image could not be displayed.',
          });
        }
      }
    };

    // async-iife: bootstrap — React effects cannot await image loading; the cleanup flag owns its lifecycle.
    void loadImage();

    return () => {
      active = false;
      if (url !== undefined) {
        URL.revokeObjectURL(url);
      }
    };
  }, [format.id, format.mimeType, name, readAll, revision]);

  const adjustZoom = (delta: number): void => {
    setZoom((current) => Math.min(maximumZoom, Math.max(minimumZoom, (current === 'fit' ? 100 : current) + delta)));
  };

  if (resource.kind === 'loading') {
    return renderPane({
      body: (
        <div
          className='flex h-full items-center justify-center bg-background text-xs text-muted-foreground'
          role='status'
        >
          Loading image…
        </div>
      ),
    });
  }

  if (resource.kind === 'error') {
    return renderPane({
      body: (
        <div className='flex h-full items-center justify-center bg-background p-6' role='alert'>
          <p className='max-w-md text-center text-sm text-muted-foreground'>{resource.message}</p>
        </div>
      ),
    });
  }

  const explicitSize =
    zoom === 'fit' || dimensions === undefined
      ? undefined
      : { width: `${(dimensions.width * zoom) / 100}px`, height: `${(dimensions.height * zoom) / 100}px` };

  return renderPane({
    actions: (
      <>
        <PaneButton
          tooltip='Fit image'
          aria-label='Fit image'
          aria-pressed={zoom === 'fit'}
          onClick={() => {
            setZoom('fit');
          }}
        >
          <Maximize2 />
        </PaneButton>
        <PaneButton
          tooltip='Zoom out'
          aria-label='Zoom out'
          onClick={() => {
            adjustZoom(-zoomStep);
          }}
        >
          <Minus />
        </PaneButton>
        <PaneButton
          size='label'
          className='min-w-12 tabular-nums'
          tooltip='Actual size'
          aria-label='Actual size'
          aria-pressed={zoom === 100}
          onClick={() => {
            setZoom(100);
          }}
        >
          {zoom === 'fit' ? 'Fit' : `${zoom}%`}
        </PaneButton>
        <PaneButton
          tooltip='Zoom in'
          aria-label='Zoom in'
          onClick={() => {
            adjustZoom(zoomStep);
          }}
        >
          <Plus />
        </PaneButton>
        <PaneButton tooltip='Download image' asChild>
          <a href={resource.url} download={name} aria-label='Download image'>
            <Download />
          </a>
        </PaneButton>
      </>
    ),
    body: (
      <section className='h-full min-h-0 overflow-hidden bg-background' aria-label={`Image viewer: ${name}`}>
        <div className='h-full overflow-auto p-4'>
          <div className='flex min-h-full min-w-full items-center justify-center'>
            <img
              src={resource.url}
              alt={name}
              draggable={false}
              className={zoom === 'fit' ? 'max-h-full max-w-full object-contain' : 'max-w-none shrink-0'}
              style={explicitSize}
              onLoad={(event) => {
                setDimensions({ width: event.currentTarget.naturalWidth, height: event.currentTarget.naturalHeight });
              }}
              onError={() => {
                setResource({ kind: 'error', message: 'The browser could not decode this image.' });
              }}
            />
          </div>
        </div>
      </section>
    ),
  });
}
