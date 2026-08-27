import { memo, useCallback } from 'react';
import { XIcon } from 'lucide-react';
import { FloatingPanel, FloatingPanelClose } from '#components/ui/floating-panel.js';
import { useKeybinding } from '#hooks/use-keyboard.js';
import { KeyShortcut } from '#components/ui/key-shortcut.js';
import { ChatEditorFileTree } from '#routes/w.$workspace.$project/chat-editor-file-tree.js';
import { projectWorkspaceKeyCombinations } from '#routes/w.$workspace.$project/project-workspace-context.js';

const toggleFileTreeKeyCombination = projectWorkspaceKeyCombinations.files;

export const FileTreePanelBody = memo(function ({
  className,
  isOpen = true,
  onOpenChange,
  closeButton,
  showTitle = false,
  onRequestOpen,
  borderless = false,
  onOpenFile,
  shouldHandleReveal,
}: {
  readonly className?: string;
  readonly isOpen?: boolean;
  readonly onOpenChange?: (open: boolean) => void;
  readonly closeButton?: React.ReactNode;
  readonly showTitle?: boolean;
  readonly onRequestOpen?: () => void;
  readonly borderless?: boolean;
  readonly onOpenFile?: (path: string, readOnly?: boolean) => void;
  readonly shouldHandleReveal?: () => boolean;
}): React.JSX.Element {
  return (
    <FloatingPanel isOpen={isOpen} side='right' className={className} onOpenChange={onOpenChange}>
      <ChatEditorFileTree
        closeButton={closeButton}
        showTitle={showTitle}
        borderless={borderless}
        onRequestOpen={onRequestOpen}
        onOpenFile={onOpenFile}
        shouldHandleReveal={shouldHandleReveal}
      />
    </FloatingPanel>
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

  const { formattedKeyCombination } = useKeybinding(toggleFileTreeKeyCombination, toggleFileTree);

  return (
    <FileTreePanelBody
      className={className}
      isOpen={isExpanded}
      onOpenChange={setIsExpanded}
      showTitle
      onRequestOpen={() => {
        setIsExpanded?.(true);
      }}
      closeButton={
        <FloatingPanelClose
          icon={XIcon}
          tooltipContent={(isOpen) => (
            <div className='flex items-center gap-2'>
              {isOpen ? 'Close' : 'Open'} Files
              <KeyShortcut variant='tooltip'>{formattedKeyCombination}</KeyShortcut>
            </div>
          )}
        />
      }
    />
  );
});
