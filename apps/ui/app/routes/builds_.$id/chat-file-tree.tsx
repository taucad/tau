import { memo, useCallback } from 'react';
import { XIcon, Files } from 'lucide-react';
import {
  FloatingPanel,
  FloatingPanelClose,
  FloatingPanelContent,
  FloatingPanelTrigger,
} from '#components/ui/floating-panel.js';
import { useKeydown } from '#hooks/use-keydown.js';
import type { KeyCombination } from '#utils/keys.utils.js';
import { formatKeyCombination } from '#utils/keys.utils.js';
import { KeyShortcut } from '#components/ui/key-shortcut.js';

const toggleFileTreeKeyCombination = {
  key: 'f',
  ctrlKey: true,
} satisfies KeyCombination;

// File Tree Trigger Component
export const ChatFileTreeTrigger = memo(function ({
  isOpen,
  onToggle,
}: {
  readonly isOpen: boolean;
  readonly onToggle: () => void;
}) {
  return (
    <FloatingPanelTrigger
      icon={Files}
      tooltipContent={
        <div className="flex items-center gap-2">
          {isOpen ? 'Close' : 'Open'} Files
          <KeyShortcut variant="tooltip">{formatKeyCombination(toggleFileTreeKeyCombination)}</KeyShortcut>
        </div>
      }
      tooltipSide="right"
      className={isOpen ? 'text-primary' : undefined}
      onClick={onToggle}
    />
  );
});

export const ChatFileTree = memo(function (props: {
  readonly className?: string;
  readonly isExpanded?: boolean;
  readonly setIsExpanded?: (value: boolean | ((current: boolean) => boolean)) => void;
}) {
  const { className, isExpanded = true, setIsExpanded } = props;

  const toggleFileTree = useCallback(() => {
    setIsExpanded?.((current) => !current);
  }, [setIsExpanded]);

  const { formattedKeyCombination } = useKeydown(toggleFileTreeKeyCombination, toggleFileTree);

  return (
    <FloatingPanel isOpen={isExpanded} side="left" className={className} onOpenChange={setIsExpanded}>
      <FloatingPanelClose
        icon={XIcon}
        tooltipContent={(isOpen) => (
          <div className="flex items-center gap-2">
            {isOpen ? 'Close' : 'Open'} Files
            <KeyShortcut variant="tooltip">{formattedKeyCombination}</KeyShortcut>
          </div>
        )}
      />
      <FloatingPanelContent>TODO</FloatingPanelContent>
    </FloatingPanel>
  );
});
