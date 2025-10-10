import { XIcon, Info } from 'lucide-react';
import { useCallback, useState } from 'react';
import { KeyShortcut } from '#components/ui/key-shortcut.js';
import {
  FloatingPanel,
  FloatingPanelClose,
  FloatingPanelContent,
  FloatingPanelContentHeader,
  FloatingPanelContentTitle,
  FloatingPanelContentBody,
  FloatingPanelTrigger,
} from '#components/ui/floating-panel.js';
import { Button } from '#components/ui/button.js';
import { Input } from '#components/ui/input.js';
import { Textarea } from '#components/ui/textarea.js';
import { Tags, TagsTrigger } from '#components/ui/input-tags.js';
import { useKeydown } from '#hooks/use-keydown.js';
import { useBuild } from '#hooks/use-build.js';
import type { KeyCombination } from '#utils/keys.js';
import { formatKeyCombination } from '#utils/keys.js';

const keyCombinationEditor = {
  key: 'i',
  ctrlKey: true,
} as const satisfies KeyCombination;

type GeometryDetails = {
  readonly vertices: number;
  readonly triangles: number;
  readonly sizeX: number;
  readonly sizeY: number;
  readonly sizeZ: number;
  readonly volume: number | undefined;
  readonly surface: number | undefined;
};

// Mock geometry details data
const mockGeometryDetails: GeometryDetails = {
  vertices: 17_731,
  triangles: 32_044,
  sizeX: 35.2,
  sizeY: 5.38,
  sizeZ: 26.34,
  volume: undefined, // Will be calculated
  surface: undefined, // Will be calculated
};

function formatNumber(value: number, decimals = 2): string {
  return new Intl.NumberFormat('en-US', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  }).format(value);
}

function formatInteger(value: number): string {
  return new Intl.NumberFormat('en-US').format(value);
}

// Details Trigger Component
export function ChatEditorDetailsTrigger({
  isOpen,
  onToggle,
}: {
  readonly isOpen: boolean;
  readonly onToggle: () => void;
}): React.JSX.Element {
  return (
    <FloatingPanelTrigger
      icon={Info}
      tooltipContent={
        <div className="flex items-center gap-2">
          {isOpen ? 'Close' : 'Open'} Details
          <KeyShortcut variant="tooltip">{formatKeyCombination(keyCombinationEditor)}</KeyShortcut>
        </div>
      }
      className={isOpen ? 'text-primary' : undefined}
      onClick={onToggle}
    />
  );
}

export function ChatEditorDetails({
  isExpanded = true,
  setIsExpanded,
}: {
  readonly isExpanded?: boolean;
  readonly setIsExpanded?: (value: boolean | ((current: boolean) => boolean)) => void;
}): React.JSX.Element {
  const { build, updateName, updateDescription, updateTags } = useBuild();
  const [geometryDetails, setGeometryDetails] = useState<GeometryDetails>(mockGeometryDetails);
  const [isCalculatingVolume, setIsCalculatingVolume] = useState(false);
  const [isCalculatingSurface, setIsCalculatingSurface] = useState(false);

  const toggleEditor = (): void => {
    setIsExpanded?.((current) => !current);
  };

  const handleTagsChange = useCallback(
    (newTags: string[]) => {
      // Deduplicate tags to prevent duplicates from accumulating
      const uniqueTags = [...new Set(newTags)];
      updateTags(uniqueTags);
    },
    [updateTags],
  );

  const handleCalculateVolume = useCallback(async () => {
    setIsCalculatingVolume(true);
    // Simulate calculation delay
    await new Promise((resolve) => {
      setTimeout(resolve, 1500);
    });
    setGeometryDetails((previous) => ({ ...previous, volume: 2847.63 }));
    setIsCalculatingVolume(false);
  }, []);

  const handleCalculateSurface = useCallback(async () => {
    setIsCalculatingSurface(true);
    // Simulate calculation delay
    await new Promise((resolve) => {
      setTimeout(resolve, 1200);
    });
    setGeometryDetails((previous) => ({ ...previous, surface: 1523.45 }));
    setIsCalculatingSurface(false);
  }, []);

  const { formattedKeyCombination: formattedEditorKeyCombination } = useKeydown(keyCombinationEditor, toggleEditor);

  return (
    <FloatingPanel isOpen={isExpanded} side="right" onOpenChange={setIsExpanded}>
      <FloatingPanelClose
        icon={XIcon}
        tooltipContent={(isOpen) => (
          <div className="flex items-center gap-2">
            {isOpen ? 'Close' : 'Open'} Details
            <KeyShortcut variant="tooltip">{formattedEditorKeyCombination}</KeyShortcut>
          </div>
        )}
      />
      <FloatingPanelContent>
        <FloatingPanelContentHeader>
          <FloatingPanelContentTitle>Details</FloatingPanelContentTitle>
        </FloatingPanelContentHeader>
        <FloatingPanelContentBody className="p-2">
          <div className="space-y-4">
            {/* Project Information */}
            <div className="space-y-3">
              <div className="space-y-2">
                <label className="text-sm font-medium text-foreground" htmlFor="project-name">
                  Name:
                </label>
                <Input
                  id="project-name"
                  value={build?.name ?? ''}
                  placeholder="Enter your build name..."
                  onChange={(event) => {
                    updateName(event.target.value);
                  }}
                />
              </div>

              <div className="space-y-2">
                <label className="text-sm font-medium text-foreground" htmlFor="project-description">
                  Description:
                </label>
                <Textarea
                  id="project-description"
                  value={build?.description ?? ''}
                  placeholder="Describe what you're building..."
                  className="min-h-20"
                  onChange={(event) => {
                    updateDescription(event.target.value);
                  }}
                />
              </div>

              <div className="space-y-2">
                <label className="text-sm font-medium text-foreground">Tags:</label>
                <Tags tags={build?.tags ?? []} onTagsChange={handleTagsChange}>
                  <TagsTrigger placeholder="Add tags..." />
                </Tags>
              </div>
            </div>

            {/* Mesh Information */}
            <div className="space-y-3 border-t pt-3">
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium text-foreground">Vertices:</span>
                <span className="font-mono text-sm text-muted-foreground">
                  {formatInteger(geometryDetails.vertices)}
                </span>
              </div>

              <div className="flex items-center justify-between">
                <span className="text-sm font-medium text-foreground">Triangles:</span>
                <span className="font-mono text-sm text-muted-foreground">
                  {formatInteger(geometryDetails.triangles)}
                </span>
              </div>
            </div>

            {/* Dimensions */}
            <div className="space-y-3 border-t pt-3">
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium text-foreground">Size X:</span>
                <span className="font-mono text-sm text-muted-foreground">{formatNumber(geometryDetails.sizeX)}</span>
              </div>

              <div className="flex items-center justify-between">
                <span className="text-sm font-medium text-foreground">Size Y:</span>
                <span className="font-mono text-sm text-muted-foreground">{formatNumber(geometryDetails.sizeY)}</span>
              </div>

              <div className="flex items-center justify-between">
                <span className="text-sm font-medium text-foreground">Size Z:</span>
                <span className="font-mono text-sm text-muted-foreground">{formatNumber(geometryDetails.sizeZ)}</span>
              </div>
            </div>

            {/* Volume & Surface */}
            <div className="space-y-3 border-t pt-3">
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium text-foreground">Volume:</span>
                {geometryDetails.volume === undefined ? (
                  <Button
                    variant="link"
                    size="sm"
                    className="text-blue-500 hover:text-blue-600 h-auto p-0 text-sm"
                    disabled={isCalculatingVolume}
                    onClick={handleCalculateVolume}
                  >
                    {isCalculatingVolume ? 'Calculating...' : 'Calculate...'}
                  </Button>
                ) : (
                  <span className="font-mono text-sm text-muted-foreground">
                    {formatNumber(geometryDetails.volume)}
                  </span>
                )}
              </div>

              {/* Surface */}
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium text-foreground">Surface:</span>
                {geometryDetails.surface === undefined ? (
                  <Button
                    variant="link"
                    size="sm"
                    className="text-blue-500 hover:text-blue-600 h-auto p-0 text-sm"
                    disabled={isCalculatingSurface}
                    onClick={handleCalculateSurface}
                  >
                    {isCalculatingSurface ? 'Calculating...' : 'Calculate...'}
                  </Button>
                ) : (
                  <span className="font-mono text-sm text-muted-foreground">
                    {formatNumber(geometryDetails.surface)}
                  </span>
                )}
              </div>
            </div>
          </div>
        </FloatingPanelContentBody>
      </FloatingPanelContent>
    </FloatingPanel>
  );
}
