import type { ClassValue } from 'clsx';
import { XIcon, Code2 } from 'lucide-react';
import { KeyShortcut } from '#components/ui/key-shortcut.js';
import {
  FloatingPanel,
  FloatingPanelClose,
  FloatingPanelContent,
  FloatingPanelContentHeader,
  FloatingPanelContentHeaderActions,
  FloatingPanelContentTitle,
  FloatingPanelTrigger,
} from '#components/ui/floating-panel.js';
import { useKeybinding } from '#hooks/use-keyboard.js';
import { EditorDockview } from '#routes/w.$workspace.$project/chat-editor-dockview.js';
import type { KeyCombination } from '#utils/keys.utils.js';
import { formatKeyCombination } from '#utils/keys.utils.js';
import { cn } from '#utils/ui.utils.js';

export const keyCombinationEditor = {
  key: 'e',
  ctrlKey: true,
} as const satisfies KeyCombination;

export function ChatEditorLayoutTrigger({
  isOpen,
  onToggle,
}: {
  readonly isOpen: boolean;
  readonly onToggle: () => void;
}): React.JSX.Element {
  return (
    <FloatingPanelTrigger
      icon={Code2}
      tooltipContent={
        <div className='flex items-center gap-2'>
          {isOpen ? 'Close' : 'Open'} Editor
          <KeyShortcut variant='tooltip'>{formatKeyCombination(keyCombinationEditor)}</KeyShortcut>
        </div>
      }
      tooltipSide='left'
      className={isOpen ? 'text-primary' : undefined}
      onClick={onToggle}
    />
  );
}

export function ChatEditorLayout({
  className,
  isExpanded = true,
  setIsExpanded,
}: {
  readonly className?: ClassValue;
  readonly isExpanded?: boolean;
  readonly setIsExpanded?: (value: boolean | ((current: boolean) => boolean)) => void;
}): React.JSX.Element {
  const toggleEditor = (): void => {
    setIsExpanded?.((current) => !current);
  };

  const { formattedKeyCombination: formattedEditorKeyCombination } = useKeybinding(keyCombinationEditor, toggleEditor);

  return (
    <FloatingPanel isOpen={isExpanded} side='right' onOpenChange={setIsExpanded}>
      <FloatingPanelContent>
        <FloatingPanelContentHeader className='md:hidden'>
          <FloatingPanelContentTitle>Editor</FloatingPanelContentTitle>
          <FloatingPanelContentHeaderActions>
            <FloatingPanelClose
              icon={XIcon}
              tooltipContent={(isOpen) => (
                <div className='flex items-center gap-2'>
                  {isOpen ? 'Close' : 'Open'} Editor
                  <KeyShortcut variant='tooltip'>{formattedEditorKeyCombination}</KeyShortcut>
                </div>
              )}
            />
          </FloatingPanelContentHeaderActions>
        </FloatingPanelContentHeader>
        <div className={cn('h-full', className)}>
          <EditorDockview />
        </div>
      </FloatingPanelContent>
    </FloatingPanel>
  );
}
