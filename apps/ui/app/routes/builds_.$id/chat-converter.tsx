import { XIcon, Download, Info } from 'lucide-react';
import { useCallback, memo, useState, useMemo } from 'react';
import { useSelector } from '@xstate/react';
import type { OutputFormat } from '@taucad/converter';
import { KeyShortcut } from '#components/ui/key-shortcut.js';
import {
  FloatingPanel,
  FloatingPanelClose,
  FloatingPanelContent,
  FloatingPanelContentBody,
  FloatingPanelContentHeader,
  FloatingPanelContentTitle,
  FloatingPanelTrigger,
} from '#components/ui/floating-panel.js';
import { useKeydown } from '#hooks/use-keydown.js';
import type { KeyCombination } from '#utils/keys.utils.js';
import { formatKeyCombination } from '#utils/keys.utils.js';
import { useBuild } from '#hooks/use-build.js';
import type { ExportedFile } from '#components/geometry/converter/converter.js';
import { Converter } from '#components/geometry/converter/converter.js';
import { useCookie } from '#hooks/use-cookie.js';
import { cookieName } from '#constants/cookie.constants.js';
import { toast } from '#components/ui/sonner.js';
import { EmptyItems } from '#components/ui/empty-items.js';

const toggleConverterKeyCombination = {
  key: 'e',
  ctrlKey: true,
} satisfies KeyCombination;

type UploadedFileInfo = {
  readonly name: string;
  readonly format: 'glb';
  readonly size: number;
};

// Converter Trigger Component
export const ChatConverterTrigger = memo(function ({
  isOpen,
  onToggle,
}: {
  readonly isOpen: boolean;
  readonly onToggle: () => void;
}) {
  return (
    <FloatingPanelTrigger
      icon={Download}
      tooltipContent={
        <div className="flex items-center gap-2">
          {isOpen ? 'Close' : 'Open'} Exporter
          <KeyShortcut variant="tooltip">{formatKeyCombination(toggleConverterKeyCombination)}</KeyShortcut>
        </div>
      }
      className={isOpen ? 'text-primary' : undefined}
      onClick={onToggle}
    />
  );
});

export const ChatConverter = memo(function (properties: {
  readonly className?: string;
  readonly isExpanded?: boolean;
  readonly setIsExpanded?: (value: boolean | ((current: boolean) => boolean)) => void;
}) {
  const { className, isExpanded = true, setIsExpanded } = properties;
  const { buildRef, cadRef: cadActor } = useBuild();
  const buildName = useSelector(buildRef, (state) => state.context.build?.name) ?? 'model';
  const geometries = useSelector(cadActor, (state) => state.context.geometries);

  // State for GLB data (lazy-loaded)
  const [glbData, setGlbData] = useState<Uint8Array | undefined>(undefined);

  // Derive uploadedFile from buildName so it updates reactively
  const uploadedFile = useMemo<UploadedFileInfo>(
    () => ({
      name: `${buildName}.glb`,
      format: 'glb',
      size: 0, // Size is not critical for display purposes
    }),
    [buildName],
  );

  // Converter state
  const [selectedFormats, setSelectedFormats] = useCookie<OutputFormat[]>(cookieName.converterOutputFormats, []);
  const [useZipForMultiple, setUseZipForMultiple] = useCookie<boolean>(cookieName.converterMultifileZip, true);

  // Lazy GLB provider sourced from CAD geometries
  const getGlbData = useCallback(async (): Promise<Uint8Array> => {
    if (glbData) {
      return glbData;
    }

    try {
      const first = geometries.find((g) => g.format === 'gltf');
      if (!first) {
        throw new Error('No GLB geometry available to export. Compute geometry first.');
      }

      const blob = first.gltfBlob;
      const buffer = await blob.arrayBuffer();
      const data = new Uint8Array(buffer);
      setGlbData(data);
      return data;
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to read GLB data from CAD state';
      toast.error(message);
      throw error instanceof Error ? error : new Error(message);
    }
  }, [glbData, geometries]);

  const handleFormatToggle = useCallback(
    (format: OutputFormat) => {
      setSelectedFormats((previous) => {
        if (previous.includes(format)) {
          return previous.filter((f) => f !== format);
        }

        return [...previous, format];
      });
    },
    [setSelectedFormats],
  );

  const handleClearFormats = useCallback(() => {
    setSelectedFormats([]);
  }, [setSelectedFormats]);

  const handleZipToggle = useCallback(
    (useZip: boolean) => {
      setUseZipForMultiple(useZip);
    },
    [setUseZipForMultiple],
  );

  const handleExport = useCallback(
    (files: ExportedFile[]) => {
      // Save each exported file to the build's file system
      for (const file of files) {
        buildRef.send({
          type: 'createFile',
          path: file.filename,
          content: file.content,
        });
      }

      toast.success(`Saved ${files.length} ${files.length === 1 ? 'file' : 'files'} to project`);
    },
    [buildRef],
  );

  const toggleConverterOpen = useCallback(() => {
    setIsExpanded?.((current) => !current);
  }, [setIsExpanded]);

  const { formattedKeyCombination: formattedConverterKeyCombination } = useKeydown(
    toggleConverterKeyCombination,
    toggleConverterOpen,
  );

  return (
    <FloatingPanel isOpen={isExpanded} side="right" className={className} onOpenChange={setIsExpanded}>
      <FloatingPanelClose
        icon={XIcon}
        tooltipContent={(isOpen) => (
          <div className="flex items-center gap-2">
            {isOpen ? 'Close' : 'Open'} Exporter
            <KeyShortcut variant="tooltip">{formattedConverterKeyCombination}</KeyShortcut>
          </div>
        )}
      />
      <FloatingPanelContent>
        <FloatingPanelContentHeader>
          <FloatingPanelContentTitle>Exporter</FloatingPanelContentTitle>
        </FloatingPanelContentHeader>

        <FloatingPanelContentBody className="p-2">
          {geometries.length === 0 ? (
            <EmptyItems className="m-0">
              <div className="mb-3 rounded-full bg-muted/50 p-2">
                <Info className="size-6 text-muted-foreground" strokeWidth={1.5} />
              </div>
              <h3 className="mb-1 text-base font-medium">No geometry to export</h3>
              <p className="text-muted-foreground">Generate or compute geometry first to enable export options</p>
            </EmptyItems>
          ) : (
            <Converter
              className="px-1"
              getGlbData={getGlbData}
              selectedFormats={selectedFormats}
              shouldUseZipForMultiple={useZipForMultiple}
              uploadedFile={uploadedFile}
              formatSelectorProperties={{
                headingText: 'Select formats to export',
              }}
              onFormatToggle={handleFormatToggle}
              onClearSelection={handleClearFormats}
              onZipToggle={handleZipToggle}
              onExport={handleExport}
            />
          )}
        </FloatingPanelContentBody>
      </FloatingPanelContent>
    </FloatingPanel>
  );
});
