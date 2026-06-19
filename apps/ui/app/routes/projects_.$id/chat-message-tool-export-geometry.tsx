import { CheckCircle, ChevronDown, Download, XCircle } from 'lucide-react';
import { useCallback, useEffect, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import { useSelector } from '@xstate/react';
import { toast } from 'sonner';
import type { ToolInvocation } from '@taucad/chat';
import { toolName } from '@taucad/chat/constants';
import type { FileExtension } from '@taucad/types';
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
import { useExportToDisk } from '#components/files/use-export-to-disk.js';
import { ViewerLink } from '#components/files/viewer-link.js';
import { ExportFormatComboboxLabel, getExportFormatValue } from '#components/files/export-selector.js';
import { groupExportFormatsByFidelity } from '#components/files/export-format-groups.js';
import { buttonVariants } from '#components/ui/button.js';
import { ComboBoxResponsive } from '#components/ui/combobox-responsive.js';
import { menuItemVariants } from '#components/ui/menu.variants.js';
import { Tooltip, TooltipContent, TooltipTrigger } from '#components/ui/tooltip.js';
import { useFileManager } from '#hooks/use-file-manager.js';
import { useProject } from '#hooks/use-project.js';
import { deriveAvailableFormats } from '#routes/projects_.$id/export-formats.utils.js';
import { cn } from '#utils/ui.utils.js';

/** Matches {@link chat-tool-file-operation.tsx} action buttons — label hidden until `@xs/code`. */
const exportActionLabelClassName = '**:data-[slot=label]:hidden @xs/code:**:data-[slot=label]:flex';

function getBasename(path: string): string {
  const index = path.lastIndexOf('/');
  if (index === -1) {
    return path;
  }

  return path.slice(index + 1);
}

function filenameBaseFromTargetFile(targetFile: string): string {
  const basename = getBasename(targetFile);
  const extensionIndex = basename.lastIndexOf('.');

  if (extensionIndex <= 0) {
    return basename;
  }

  return basename.slice(0, extensionIndex);
}

function artifactDownloadName(artifactPath: string): string {
  const index = artifactPath.lastIndexOf('/');
  if (index === -1) {
    return artifactPath;
  }

  return artifactPath.slice(index + 1);
}

function ExportTargetLink({ targetFile }: { readonly targetFile: string }): React.JSX.Element {
  const basename = getBasename(targetFile);

  return (
    <ViewerLink path={targetFile} className='hover:text-foreground/80'>
      {basename}
    </ViewerLink>
  );
}

function ExportGeometryDownloadSplitButton({
  artifactPath,
  mimeType,
  targetFile,
  exportedFormat,
}: {
  readonly artifactPath: string;
  readonly mimeType: string;
  readonly targetFile: string;
  readonly exportedFormat: FileExtension;
}): React.JSX.Element {
  const fileManager = useFileManager();
  const { editorRef, geometryUnits } = useProject();
  const filenameBase = useMemo(() => filenameBaseFromTargetFile(targetFile), [targetFile]);
  const { exportToDisk, isExporting } = useExportToDisk(filenameBase);
  const [isArtifactDownloadBusy, setIsArtifactDownloadBusy] = useState(false);
  const [exportMenuOpen, setExportMenuOpen] = useState(false);
  const [selectedFormat, setSelectedFormat] = useState<FileExtension>(exportedFormat);
  const isDownloadBusy = isArtifactDownloadBusy || isExporting;

  useEffect(() => {
    setSelectedFormat(exportedFormat);
  }, [exportedFormat]);

  const cadActor = geometryUnits.get(targetFile);

  const availableFormats = useSelector(cadActor, (state) =>
    deriveAvailableFormats(state?.context.kernelClient, state?.context.activeKernelId),
  );

  const groupedFormats = useMemo(() => groupExportFormatsByFidelity(availableFormats), [availableFormats]);

  const selectedFormatEntry = useMemo(
    () => availableFormats.find((entry) => entry.format === selectedFormat),
    [availableFormats, selectedFormat],
  );

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
    if (selectedFormat !== exportedFormat) {
      if (!cadActor) {
        toast.error('Export failed');
        return;
      }

      await exportToDisk(cadActor, selectedFormat);
      return;
    }

    setIsArtifactDownloadBusy(true);

    try {
      const bytes = await fileManager.readFile(artifactPath);
      downloadBlob(new Blob([bytes], { type: mimeType }), artifactDownloadName(artifactPath));
    } catch {
      toast.error('Failed to read exported file');
    } finally {
      setIsArtifactDownloadBusy(false);
    }
  }, [artifactPath, cadActor, exportToDisk, exportedFormat, fileManager.readFile, mimeType, selectedFormat]);

  const handleFormatSelect = useCallback((formatValue: string) => {
    setSelectedFormat(formatValue as FileExtension);
  }, []);

  const formatLabel = selectedFormat.toUpperCase();

  const downloadTooltip = useMemo(() => {
    if (selectedFormat === exportedFormat) {
      return `Download ${formatLabel}`;
    }

    return `Export and download as ${formatLabel}`;
  }, [exportedFormat, formatLabel, selectedFormat]);

  const splitButtonClassName = cn(
    buttonVariants({ variant: 'outline', size: 'xs' }),
    'h-6 gap-0 p-0 hover:bg-background',
  );

  return (
    <div className={splitButtonClassName}>
      <Tooltip>
        <TooltipTrigger asChild>
          <button
            aria-label={`Download ${formatLabel}`}
            className={cn(
              'inline-flex h-full min-w-0 items-center justify-center gap-1 rounded-l-md px-2 hover:bg-accent disabled:opacity-50',
              exportActionLabelClassName,
            )}
            disabled={isDownloadBusy}
            onClick={() => {
              void onDownload();
            }}
            type='button'
          >
            <Download className='size-3.5 shrink-0' />
            <span data-slot='label'>Download </span>
            <span className='uppercase'>{selectedFormat}</span>
          </button>
        </TooltipTrigger>
        <TooltipContent side='top'>{downloadTooltip}</TooltipContent>
      </Tooltip>
      <div aria-hidden className='w-px self-stretch bg-border' />
      <Tooltip>
        <ComboBoxResponsive
          className="data-[slot='popover-content']:w-[220px]"
          description='Choose an export format or open the full exporter.'
          emptyListMessage='No export formats available.'
          footer={
            <>
              <div className='border-t' />
              <div className='p-1'>
                <button
                  type='button'
                  className={cn(menuItemVariants({ highlight: 'selected' }), 'h-auto w-full')}
                  onClick={() => {
                    setExportMenuOpen(false);
                    onOpenExporter();
                  }}
                >
                  Open Exporter
                </button>
              </div>
            </>
          }
          getValue={getExportFormatValue}
          groupedItems={groupedFormats}
          isOpen={exportMenuOpen}
          isSearchEnabled={availableFormats.length > 8}
          onOpenChange={setExportMenuOpen}
          onSelect={handleFormatSelect}
          popoverProperties={{ align: 'end' }}
          renderLabel={(item, selectedItem) => <ExportFormatComboboxLabel item={item} selectedItem={selectedItem} />}
          searchPlaceHolder='Filter formats...'
          title='Export formats'
          value={selectedFormatEntry}
        >
          <TooltipTrigger asChild>
            <button
              aria-expanded={exportMenuOpen}
              aria-haspopup='listbox'
              aria-label='More export options'
              className='inline-flex h-full items-center justify-center rounded-r-md px-1.5 hover:bg-accent'
              type='button'
            >
              <ChevronDown className='size-3.5 text-muted-foreground' />
            </button>
          </TooltipTrigger>
        </ComboBoxResponsive>
        <TooltipContent side='top'>Choose export format</TooltipContent>
      </Tooltip>
    </div>
  );
}

export function ChatMessageToolExportGeometry({
  part,
}: {
  readonly part: ToolInvocation<typeof toolName.exportGeometry>;
}): React.JSX.Element {
  switch (part.state) {
    case 'input-streaming':
    case 'input-available': {
      const targetFile = part.input?.targetFile;

      let description: ReactNode;
      if (targetFile === undefined) {
        description = <ChatToolDescription>…</ChatToolDescription>;
      } else {
        description = (
          <ChatToolDescription>
            <ExportTargetLink targetFile={targetFile} /> …
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
        <ChatToolCard className='@container/code' variant='minimal' status='ready' isCollapsible={false}>
          <ChatToolCardHeader className='min-w-0 gap-2'>
            <ChatToolCardIcon icon={CheckCircle} />
            <ChatToolCardTitle className='min-w-0 flex-1'>
              <ChatToolLabel verb='Exported'>
                <ChatToolDescription>
                  <ExportTargetLink targetFile={input.targetFile} />
                </ChatToolDescription>
              </ChatToolLabel>
            </ChatToolCardTitle>
            <ExportGeometryDownloadSplitButton
              artifactPath={output.artifactPath}
              exportedFormat={output.format}
              mimeType={output.mimeType}
              targetFile={input.targetFile}
            />
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
