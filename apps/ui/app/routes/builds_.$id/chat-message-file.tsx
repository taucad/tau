import { useState } from 'react';
import type { FileUIPart } from 'ai';
import { File } from 'lucide-react';
import { cn } from '#utils/ui.utils.js';

export function ChatMessageFile({ part }: { readonly part: FileUIPart }): React.ReactNode {
  const [imageError, setImageError] = useState(false);
  const isImage = part.mediaType.startsWith('image/');

  // Render images with preview
  if (isImage && !imageError) {
    return (
      <div className="flex flex-col gap-2">
        <div className="relative max-w-20 overflow-hidden rounded-lg border bg-background">
          <img
            src={part.url}
            alt={part.filename ?? 'Uploaded image'}
            className="h-auto w-full object-contain"
            loading="lazy"
            onError={() => {
              setImageError(true);
            }}
          />
        </div>
      </div>
    );
  }

  // Render non-image files or failed images as download links
  return (
    <div className="flex items-center gap-2 rounded-lg border bg-background p-3">
      <File className="size-5 text-muted-foreground" />
      <div className="flex flex-1 flex-col gap-1">
        <a
          href={part.url}
          download={part.filename}
          className={cn('text-sm font-medium hover:underline', imageError && 'text-destructive')}
          target="_blank"
          rel="noopener noreferrer"
        >
          {part.filename ?? 'File'}
        </a>
        {imageError ? <span className="text-xs text-destructive">Failed to load image. Click to download.</span> : null}
        <span className="text-xs text-muted-foreground">{part.mediaType}</span>
      </div>
    </div>
  );
}
