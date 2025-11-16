import { XIcon, GitBranch } from 'lucide-react';
import { useCallback, memo } from 'react';
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
import { GitConnectorContent } from '#components/git/git-connector-content.js';

const toggleGitKeyCombination = {
  key: 'g',
  ctrlKey: true,
} satisfies KeyCombination;

// Git Trigger Component
export const ChatGitTrigger = memo(function ({
  isOpen,
  onToggle,
}: {
  readonly isOpen: boolean;
  readonly onToggle: () => void;
}) {
  return (
    <FloatingPanelTrigger
      icon={GitBranch}
      tooltipContent={
        <div className="flex items-center gap-2">
          {isOpen ? 'Close' : 'Open'} Git
          <KeyShortcut variant="tooltip">{formatKeyCombination(toggleGitKeyCombination)}</KeyShortcut>
        </div>
      }
      className={isOpen ? 'text-primary' : undefined}
      onClick={onToggle}
    />
  );
});

export const ChatGit = memo(function (props: {
  readonly className?: string;
  readonly isExpanded?: boolean;
  readonly setIsExpanded?: (value: boolean | ((current: boolean) => boolean)) => void;
}) {
  const { gitRef } = useBuild();
  const { className, isExpanded = true, setIsExpanded } = props;

  const toggleGitOpen = useCallback(() => {
    setIsExpanded?.((current) => !current);
  }, [setIsExpanded]);

  const { formattedKeyCombination: formattedGitKeyCombination } = useKeydown(toggleGitKeyCombination, toggleGitOpen);

  return (
    <FloatingPanel isOpen={isExpanded} side="right" className={className} onOpenChange={setIsExpanded}>
      <FloatingPanelClose
        icon={XIcon}
        tooltipContent={(isOpen) => (
          <div className="flex items-center gap-2">
            {isOpen ? 'Close' : 'Open'} Git
            <KeyShortcut variant="tooltip">{formattedGitKeyCombination}</KeyShortcut>
          </div>
        )}
      />
      <FloatingPanelContent>
        <FloatingPanelContentHeader>
          <FloatingPanelContentTitle>Git</FloatingPanelContentTitle>
        </FloatingPanelContentHeader>

        <FloatingPanelContentBody className="px-3 py-2">
          <GitConnectorContent gitRef={gitRef} />
        </FloatingPanelContentBody>
      </FloatingPanelContent>
    </FloatingPanel>
  );
});
