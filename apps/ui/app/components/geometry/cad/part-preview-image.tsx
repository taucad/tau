import { useEffect, useState } from 'react';

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
