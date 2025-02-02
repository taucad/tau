import { Download } from 'lucide-react';
import { Button, ButtonProperties } from '@/components/ui/button';
import React from 'react';
import { Tooltip, TooltipContent, TooltipTrigger } from './ui/tooltip';

export interface DownloadButtonProperties extends ButtonProperties {
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
   */
  getBlob?: () => Promise<Blob>;
}

export const DownloadButton = React.forwardRef<HTMLButtonElement, DownloadButtonProperties>(
  ({ text, getBlob, size, title = 'download.txt', ...properties }, reference) => {
    const handleDownload = async () => {
      // New download handler logic without creating an element
      const newBlob = getBlob ? await getBlob() : new Blob([text as string], { type: 'text/plain' });
      const url = URL.createObjectURL(newBlob);

      fetch(url)
        .then((response) => response.blob())
        .then((blob) => {
          const reader = new FileReader();
          reader.addEventListener('load', () => {
            const base64data = reader.result;
            const a = document.createElement('a');
            a.href = base64data as string;
            a.download = title;
            a.click();
          });
          reader.readAsDataURL(blob);
        })
        .finally(() => {
          URL.revokeObjectURL(url);
        });
    };

    return (
      <Tooltip>
        <TooltipTrigger>
          <Button size={size} variant="ghost" onClick={handleDownload} ref={reference} {...properties}>
            <span>{<Download />}</span>
            {size !== 'icon' && 'Download'}
          </Button>
        </TooltipTrigger>
        <TooltipContent>Download</TooltipContent>
      </Tooltip>
    );
  },
);

DownloadButton.displayName = 'DownloadButton';
