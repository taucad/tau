import { XIcon, SlidersHorizontal } from 'lucide-react';
import { useCallback, memo } from 'react';
import { useSelector } from '@xstate/react';
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
import { Parameters } from '#components/geometry/parameters/parameters.js';

const toggleParametersKeyCombination = {
  key: 'x',
  ctrlKey: true,
} satisfies KeyCombination;

// Parameters Trigger Component
export const ChatParametersTrigger = memo(function ({
  isOpen,
  onToggle,
}: {
  readonly isOpen: boolean;
  readonly onToggle: () => void;
}) {
  return (
    <FloatingPanelTrigger
      icon={SlidersHorizontal}
      tooltipContent={
        <div className="flex items-center gap-2">
          {isOpen ? 'Close' : 'Open'} Parameters
          <KeyShortcut variant="tooltip">{formatKeyCombination(toggleParametersKeyCombination)}</KeyShortcut>
        </div>
      }
      className={isOpen ? 'text-primary' : undefined}
      onClick={onToggle}
    />
  );
});

export const ChatParameters = memo(function (props: {
  readonly className?: string;
  readonly isExpanded?: boolean;
  readonly setIsExpanded?: (value: boolean | ((current: boolean) => boolean)) => void;
}) {
  const { buildRef, cadRef, setParameters } = useBuild();
  const { className, isExpanded = true, setIsExpanded } = props;
  const parameters = useSelector(buildRef, (state) => state.context.build?.assets.mechanical?.parameters ?? {});
  const defaultParameters = useSelector(cadRef, (state) => state.context.defaultParameters);
  const jsonSchema = useSelector(cadRef, (state) => state.context.jsonSchema);

  const toggleParametersOpen = useCallback(() => {
    setIsExpanded?.((current) => !current);
  }, [setIsExpanded]);

  const { formattedKeyCombination: formattedParametersKeyCombination } = useKeydown(
    toggleParametersKeyCombination,
    toggleParametersOpen,
  );

  return (
    <FloatingPanel isOpen={isExpanded} side="right" className={className} onOpenChange={setIsExpanded}>
      <FloatingPanelClose
        icon={XIcon}
        tooltipContent={(isOpen) => (
          <div className="flex items-center gap-2">
            {isOpen ? 'Close' : 'Open'} Parameters
            <KeyShortcut variant="tooltip">{formattedParametersKeyCombination}</KeyShortcut>
          </div>
        )}
      />
      <FloatingPanelContent>
        <FloatingPanelContentHeader>
          <FloatingPanelContentTitle>Parameters</FloatingPanelContentTitle>
        </FloatingPanelContentHeader>

        <FloatingPanelContentBody>
          <Parameters
            parameters={parameters}
            defaultParameters={defaultParameters}
            jsonSchema={jsonSchema}
            onParametersChange={setParameters}
          />
        </FloatingPanelContentBody>
      </FloatingPanelContent>
    </FloatingPanel>
  );
});
