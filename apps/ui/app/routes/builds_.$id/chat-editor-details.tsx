import { XIcon, Info } from 'lucide-react';
import { useCallback, useState } from 'react';
import { KeyShortcut } from '#components/ui/key-shortcut.js';
import { FloatingPanel, FloatingPanelClose, FloatingPanelContent, FloatingPanelContentHeader, FloatingPanelContentTitle, FloatingPanelContentBody, FloatingPanelTrigger } from '#components/ui/floating-panel.js';
import { Button } from '#components/ui/button.js';
import { useKeydown } from '#hooks/use-keydown.js';
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
  vertices: 17731,
  triangles: 32044,
  sizeX: 35.20,
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
  onToggle 
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
          <KeyShortcut variant="tooltip">
            {formatKeyCombination(keyCombinationEditor)}
          </KeyShortcut>
        </div>
      }
      onClick={onToggle}
      isOpen={isOpen}
    />
  );
}

export function ChatEditorDetails({
  isExpanded,
  setIsExpanded,
}: {
  readonly isExpanded: boolean;
  readonly setIsExpanded: (value: boolean | ((current: boolean) => boolean)) => void;
}): React.JSX.Element {
  const [geometryDetails, setGeometryDetails] = useState<GeometryDetails>(mockGeometryDetails);
  const [isCalculatingVolume, setIsCalculatingVolume] = useState(false);
  const [isCalculatingSurface, setIsCalculatingSurface] = useState(false);

  const toggleEditor = () => {
    setIsExpanded((current) => !current);
  };

  const handleCalculateVolume = useCallback(async () => {
    setIsCalculatingVolume(true);
    // Simulate calculation delay
    await new Promise(resolve => setTimeout(resolve, 1500));
    setGeometryDetails(prev => ({ ...prev, volume: 2847.63 }));
    setIsCalculatingVolume(false);
  }, []);

  const handleCalculateSurface = useCallback(async () => {
    setIsCalculatingSurface(true);
    // Simulate calculation delay
    await new Promise(resolve => setTimeout(resolve, 1200));
    setGeometryDetails(prev => ({ ...prev, surface: 1523.45 }));
    setIsCalculatingSurface(false);
  }, []);

  const { formattedKeyCombination: formattedEditorKeyCombination } = useKeydown(keyCombinationEditor, toggleEditor);

  return (
    <FloatingPanel open={isExpanded} onOpenChange={setIsExpanded}>
      <FloatingPanelClose
        side="right"
        align="start"
        icon={XIcon}
        tooltipContent={(isOpen) => (
          <div className="flex items-center gap-2">
            {isOpen ? 'Close' : 'Open'} Details
            <KeyShortcut variant="tooltip">
              {formattedEditorKeyCombination}
            </KeyShortcut>
          </div>
        )}
      />
      <FloatingPanelContent>
        <FloatingPanelContentHeader side="right">
          <FloatingPanelContentTitle>Details</FloatingPanelContentTitle>
        </FloatingPanelContentHeader>
        <FloatingPanelContentBody className='p-2'>
          <div className="space-y-4">
            {/* Mesh Information */}
            <div className="space-y-3">
              <div className="flex justify-between items-center">
                <span className="text-sm font-medium text-foreground">Vertices:</span>
                <span className="text-sm text-muted-foreground font-mono">
                  {formatInteger(geometryDetails.vertices)}
                </span>
              </div>
              
              <div className="flex justify-between items-center">
                <span className="text-sm font-medium text-foreground">Triangles:</span>
                <span className="text-sm text-muted-foreground font-mono">
                  {formatInteger(geometryDetails.triangles)}
                </span>
              </div>
            </div>

            <div className="border-t pt-3 space-y-3">
              {/* Dimensions */}
              <div className="flex justify-between items-center">
                <span className="text-sm font-medium text-foreground">Size X:</span>
                <span className="text-sm text-muted-foreground font-mono">
                  {formatNumber(geometryDetails.sizeX)}
                </span>
              </div>
              
              <div className="flex justify-between items-center">
                <span className="text-sm font-medium text-foreground">Size Y:</span>
                <span className="text-sm text-muted-foreground font-mono">
                  {formatNumber(geometryDetails.sizeY)}
                </span>
              </div>
              
              <div className="flex justify-between items-center">
                <span className="text-sm font-medium text-foreground">Size Z:</span>
                <span className="text-sm text-muted-foreground font-mono">
                  {formatNumber(geometryDetails.sizeZ)}
                </span>
              </div>
            </div>

            <div className="border-t pt-3 space-y-3">
              {/* Volume */}
              <div className="flex justify-between items-center">
                <span className="text-sm font-medium text-foreground">Volume:</span>
                {geometryDetails.volume !== undefined ? (
                  <span className="text-sm text-muted-foreground font-mono">
                    {formatNumber(geometryDetails.volume)}
                  </span>
                ) : (
                  <Button
                    variant="link"
                    size="sm"
                    className="h-auto p-0 text-sm text-blue-500 hover:text-blue-600"
                    onClick={handleCalculateVolume}
                    disabled={isCalculatingVolume}
                  >
                    {isCalculatingVolume ? 'Calculating...' : 'Calculate...'}
                  </Button>
                )}
              </div>
              
              {/* Surface */}
              <div className="flex justify-between items-center">
                <span className="text-sm font-medium text-foreground">Surface:</span>
                {geometryDetails.surface !== undefined ? (
                  <span className="text-sm text-muted-foreground font-mono">
                    {formatNumber(geometryDetails.surface)}
                  </span>
                ) : (
                  <Button
                    variant="link"
                    size="sm"
                    className="h-auto p-0 text-sm text-blue-500 hover:text-blue-600"
                    onClick={handleCalculateSurface}
                    disabled={isCalculatingSurface}
                  >
                    {isCalculatingSurface ? 'Calculating...' : 'Calculate...'}
                  </Button>
                )}
              </div>
            </div>
          </div>
        </FloatingPanelContentBody>
      </FloatingPanelContent>
    </FloatingPanel>
  );
}
