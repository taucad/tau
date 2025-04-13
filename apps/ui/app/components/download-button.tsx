import { Download } from 'lucide-react';
import React from 'react';
import { Button } from '@/components/ui/button.js';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip.js';
import { toast } from '@/components/ui/sonner.js';

export type DownloadButtonProperties = {
  /**
   * The text to copy.
   */
  readonly text?: string;
  /**
   * The title of the file to download.
   */
  readonly title?: string;
  /**
   * A function to get the blob to download.
   *
   * If the function throws an error, the error will be logged to the console and the download will not occur.
   */
  readonly getBlob: () => Promise<Blob>;
  /**
   * Tooltip text.
   */
  readonly tooltip?: string;
} & React.ComponentProps<typeof Button>;

export function DownloadButton({
  ref: reference,
  getBlob,
  size,
  title = 'download.txt',
  tooltip = 'Download',
  children,
  ...properties
}: DownloadButtonProperties) {
  const handleDownload = async () => {
    try {
      const newBlob = await getBlob();
      const url = URL.createObjectURL(newBlob);

      try {
        const response = await fetch(url);
        const blob = await response.blob();

        const reader = new FileReader();
        reader.addEventListener('load', () => {
          const base64data = reader.result;
          if (typeof base64data === 'string') {
            const a = document.createElement('a');
            a.href = base64data;
            a.download = title;
            a.click();
          }
        });
        reader.readAsDataURL(blob);
      } finally {
        URL.revokeObjectURL(url);
      }
    } catch (error) {
      if (error instanceof Error) {
        toast.error(`Unable to download ${title}: ${error.message}`);
      } else {
        toast.error(`Unable to download ${title}`);
      }
    }
  };

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button ref={reference} size={size} variant="ghost" onClick={handleDownload} {...properties}>
          <span>{children ?? <Download />}</span>
          {size !== 'icon' && 'Download'}
        </Button>
      </TooltipTrigger>
      <TooltipContent>{tooltip}</TooltipContent>
    </Tooltip>
  );
}
