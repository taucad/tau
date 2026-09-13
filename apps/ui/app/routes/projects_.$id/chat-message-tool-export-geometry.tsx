import { CheckCircle, Download, XCircle } from 'lucide-react';
import { useCallback, useState } from 'react';
import type { ReactNode } from 'react';
import { toast } from 'sonner';
import type { ToolInvocation } from '@taucad/chat';
import { toolName } from '@taucad/chat/constants';
import { downloadBlob } from '@taucad/utils/file';

import {
  ChatToolCard,
  ChatToolCardHeader,
  ChatToolCardIcon,
  ChatToolCardTitle,
} from '#components/chat/chat-tool-card.js';
import { ChatToolDescription } from '#components/chat/chat-tool-text.js';
import { ChatToolLabel } from '#components/chat/chat-tool-label.js';
import { ChatToolError } from '#components/chat/chat-tool-error.js';
import { ViewerLink } from '#components/files/viewer-link.js';
import { Button } from '#components/ui/button.js';
import { useFileManager } from '#hooks/use-file-manager.js';
import { useProject } from '#hooks/use-project.js';

function FilenameLink({ targetFile }: { readonly targetFile: string }): React.JSX.Element {
  return <ViewerLink path={targetFile}>{targetFile}</ViewerLink>;
}

function artifactDownloadName(artifactPath: string): string {
  const index = artifactPath.lastIndexOf('/');
  if (index === -1) {
    return artifactPath;
  }

  return artifactPath.slice(index + 1);
}

function formatByteLength(byteLength: number): string {
  if (byteLength < 1024) {
    return `${byteLength} B`;
  }
  if (byteLength < 1024 * 1024) {
    return `${(byteLength / 1024).toFixed(1)} KB`;
  }
  return `${(byteLength / (1024 * 1024)).toFixed(1)} MB`;
}

export function ChatMessageToolExportGeometry({
  part,
}: {
  readonly part: ToolInvocation<typeof toolName.exportGeometry>;
}): React.JSX.Element {
  const fileManager = useFileManager();
  const { editorRef } = useProject();
  const [downloadBusy, setDownloadBusy] = useState(false);

  const onOpenExporter = useCallback(() => {
    editorRef.send({
      type: 'setPanelState',
      panelState: {
        openPanels: { converter: true },
        mobileActiveTab: 'converter',
      },
    });
  }, [editorRef]);

  const onDownload = useCallback(async () => {
    if (part.state !== 'output-available') {
      return;
    }

    const { artifactPath, mimeType } = part.output;

    setDownloadBusy(true);

    try {
      const bytes = await fileManager.readFile(artifactPath);
      downloadBlob(new Blob([bytes], { type: mimeType }), artifactDownloadName(artifactPath));
    } catch {
      toast.error('Failed to read exported file');
    } finally {
      setDownloadBusy(false);
    }
  }, [fileManager.readFile, part]);

  switch (part.state) {
    case 'input-streaming':
    case 'input-available': {
      const targetFile = part.input?.targetFile;
      const formatExtension = part.input?.format;

      let description: ReactNode;
      if (targetFile === undefined) {
        description = <ChatToolDescription>…</ChatToolDescription>;
      } else if (formatExtension === undefined) {
        description = (
          <ChatToolDescription>
            <FilenameLink targetFile={targetFile} /> …
          </ChatToolDescription>
        );
      } else {
        description = (
          <ChatToolDescription>
            <FilenameLink targetFile={targetFile} /> … .{formatExtension}
          </ChatToolDescription>
        );
      }

      return (
        <ChatToolCard variant='minimal' status='loading' isDefaultOpen={false}>
          <ChatToolCardHeader>
            <ChatToolCardIcon icon={CheckCircle} />
            <ChatToolCardTitle>
              <ChatToolLabel verb='Exporting'>{description}</ChatToolLabel>
            </ChatToolCardTitle>
          </ChatToolCardHeader>
        </ChatToolCard>
      );
    }

    case 'output-available': {
      const { output, input } = part;

      return (
        <ChatToolCard variant='minimal' status='ready' isCollapsible={false}>
          <ChatToolCardHeader className='min-w-0 flex-wrap gap-2'>
            <ChatToolCardIcon icon={CheckCircle} />
            <ChatToolCardTitle className='min-w-0 flex-1'>
              <ChatToolLabel verb='Exported'>
                <ChatToolDescription>
                  .{output.format} — <FilenameLink targetFile={input.targetFile} /> —{' '}
                  {formatByteLength(output.byteLength)}
                </ChatToolDescription>
              </ChatToolLabel>
            </ChatToolCardTitle>
            <Button
              aria-label={`Download exported ${output.format} file`}
              className='shrink-0'
              disabled={downloadBusy}
              onClick={() => {
                void onDownload();
              }}
              size='xs'
              type='button'
              variant='outline'
            >
              <Download className='mr-1 size-4' />
              Download
            </Button>
            <Button className='shrink-0' onClick={onOpenExporter} size='sm' type='button' variant='link'>
              Open Exporter
            </Button>
          </ChatToolCardHeader>
        </ChatToolCard>
      );
    }

    case 'output-error': {
      return <ChatToolError errorText={part.errorText} icon={XCircle} noun='geometry export' />;
    }

    case 'approval-requested':
    case 'approval-responded':
    case 'output-denied': {
      throw new Error(`Unexpected ${toolName.exportGeometry} state: ${part.state}`);
    }
  }
}
