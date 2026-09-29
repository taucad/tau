import { useEffect, useState } from 'react';

/** Own and release one encoded part-preview URL for a mounted image. */
export function PartPreviewImage({
  bytes,
  className,
}: {
  readonly bytes: Uint8Array<ArrayBuffer>;
  readonly className: string;
}): React.JSX.Element | undefined {
  const [url, setUrl] = useState<string>();
  useEffect(() => {
    const next = URL.createObjectURL(new Blob([bytes], { type: 'image/webp' }));
    setUrl(next);
    return () => URL.revokeObjectURL(next);
  }, [bytes]);
  return url ? <img src={url} alt='' aria-hidden='true' className={className} /> : undefined;
}
