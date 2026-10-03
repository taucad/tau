import { useEffect, useState } from 'react';
import { Maximize2 } from 'lucide-react';
import { cn } from '@taucad/ui/utils/cn';

/** Own and release one encoded part-preview URL for a mounted image. */
export function PartPreviewImage({
  bytes,
  className,
  alt = '',
  onError,
  onLoad,
}: {
  readonly bytes: Uint8Array<ArrayBuffer>;
  readonly className: string;
  readonly alt?: string;
  readonly onError?: () => void;
  readonly onLoad?: () => void;
}): React.JSX.Element | undefined {
  const [url, setUrl] = useState<string>();
  useEffect(() => {
    const next = URL.createObjectURL(new Blob([bytes], { type: 'image/webp' }));
    // oxlint-disable-next-line react/set-state-in-effect -- Object URL lifecycle is owned by this effect.
    setUrl(next);
    return () => {
      URL.revokeObjectURL(next);
    };
  }, [bytes]);
  return url ? (
    <img
      src={url}
      alt={alt}
      aria-hidden={alt ? undefined : true}
      className={className}
      onError={onError}
      onLoad={onLoad}
    />
  ) : undefined;
}

/**
 * A part's identity frame. With a rendered preview and `onOpen` it is a button that opens the part
 * gallery, showing an open glyph on hover, focus and coarse pointers; otherwise it shows `fallback`.
 * A refreshing preview keeps its last image, dimmed.
 */
export function PartPreviewFrame({
  name,
  preview,
  className,
  fallback,
  tabIndex,
  onOpen,
  onDecodeError,
  onDecoded,
}: {
  readonly name: string;
  readonly preview?: Readonly<{ status: 'pending' | 'ready' | 'failed'; bytes?: Uint8Array<ArrayBuffer> }>;
  readonly className: string;
  readonly fallback: React.ReactNode;
  readonly tabIndex?: number;
  readonly onOpen?: (origin: HTMLElement) => void;
  readonly onDecodeError?: () => void;
  readonly onDecoded?: () => void;
}): React.JSX.Element {
  const frameClassName = cn(
    'relative flex shrink-0 items-center justify-center overflow-hidden rounded-xs bg-muted ring-1 ring-border',
    className,
  );
  if (!preview?.bytes) {
    return (
      <span aria-hidden='true' className={frameClassName}>
        {fallback}
      </span>
    );
  }
  const image = (
    <PartPreviewImage
      bytes={preview.bytes}
      className={cn('size-full object-contain', preview.status === 'pending' && 'opacity-50')}
      onError={onDecodeError}
      onLoad={onDecoded}
    />
  );
  if (!onOpen) {
    return (
      <span aria-hidden='true' className={frameClassName}>
        {image}
      </span>
    );
  }
  return (
    <button
      type='button'
      tabIndex={tabIndex}
      aria-label={`Preview ${name}`}
      aria-busy={preview.status === 'pending' || undefined}
      className={cn(frameClassName, 'group/preview focus-visible:focus-outline')}
      onClick={(event) => {
        event.stopPropagation();
        onOpen(event.currentTarget);
      }}
    >
      {image}
      <span
        aria-hidden='true'
        className='absolute right-1 bottom-1 flex size-5 items-center justify-center rounded-xs bg-background/90 text-foreground opacity-0 shadow-xs group-hover/preview:opacity-100 group-focus-visible/preview:opacity-100 [@media(hover:none)]:opacity-100'
      >
        <Maximize2 className='size-3' />
      </span>
    </button>
  );
}
