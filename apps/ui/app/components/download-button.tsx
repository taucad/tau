import { Download } from 'lucide-react';
import { Button } from '@/components/ui/button';
import React from 'react';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { toast } from '@/components/ui/sonner';

export interface DownloadButtonProperties extends React.ComponentProps<typeof Button> {
  /**
   * The text to copy.
   */
  text?: string;
  /**
   * The title of the file to download.
   */
  title?: string;
  /**
   * A function to get the blob to download.
   *
   * If the function throws an error, the error will be logged to the console and the download will not occur.
   */
  getBlob: () => Promise<Blob>;
  /**
   * Tooltip text.
   */
  tooltip?: string;
  /**
   * The ref to the button.
   */
  ref: React.RefObject<HTMLButtonElement>;
}

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

      fetch(url)
        .then((response) => response.blob())
        .then((blob) => {
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
        })
        .finally(() => {
          URL.revokeObjectURL(url);
        });
    } catch (error) {
      if (error instanceof Error) {
        toast.error(`Unable to download ${title}: ${error.message}`);
      } else {
        toast.error(`Unable to download ${title}`);
      }
      return;
    }
  };

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button size={size} variant="ghost" onClick={handleDownload} ref={reference} {...properties}>
          <span>{children || <Download />}</span>
          {size !== 'icon' && 'Download'}
        </Button>
      </TooltipTrigger>
      <TooltipContent>{tooltip}</TooltipContent>
    </Tooltip>
  );
}

DownloadButton.displayName = 'DownloadButton';
