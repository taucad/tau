import { createContext, useCallback, useContext, useMemo } from 'react';
import type { IDockviewHeaderActionsProps, DockviewGroupPanel, DockviewApi } from 'dockview-react';
import { Plus } from 'lucide-react';
import { FileSelector } from '#components/files/file-selector.js';
import { DockviewPaneAction } from '#components/panes/dockview-pane-action.js';

/**
 * Callback invoked when a file is selected from the open-file action.
 * Receives the selected file path, the Dockview group the button belongs to,
 * and the container API so each dock can handle file opening appropriately.
 */
export type DockviewFileSelectHandler = (path: string, group: DockviewGroupPanel, containerApi: DockviewApi) => void;

const DockviewFileActionContext = createContext<DockviewFileSelectHandler | undefined>(undefined);

/**
 * Provider for the open-file action callback.
 * Wrap your Dockview component with this to supply the file-select handler.
 */
export const DockviewFileActionProvider = DockviewFileActionContext.Provider;

/**
 * Left-side header action for Dockview groups.
 *
 * Renders a "+" button right after the last tab that opens a FileSelector
 * popover, letting the user pick a file to open in the current pane.
 * Visible on hover via the `.dv-open-file-action` CSS class.
 *
 * The actual file-open behaviour is delegated to the parent dock via
 * `DockviewFileActionProvider` so editor and viewer docks can handle
 * it differently.
 */
export function DockviewOpenFileAction({
  containerApi,
  activePanel,
  group,
}: IDockviewHeaderActionsProps): React.JSX.Element {
  const onFileSelect = useContext(DockviewFileActionContext);

  const initialPath = useMemo(() => {
    if (!activePanel) {
      return undefined;
    }

    const parameters = activePanel.params;
    const filePath = (parameters?.['filePath'] ?? parameters?.['entryPath']) as string | undefined;
    if (!filePath) {
      return undefined;
    }

    // Strip the filename to get the parent directory
    const parts = filePath.split('/');
    parts.pop();
    return parts.join('/');
  }, [activePanel]);

  const handleSelect = useCallback(
    (path: string) => {
      onFileSelect?.(path, group, containerApi);
    },
    [onFileSelect, group, containerApi],
  );

  return (
    <FileSelector
      selectedFile={undefined}
      initialPath={initialPath}
      placeholder='Open file...'
      title='Open File'
      description='Choose a file to open in this pane'
      searchPlaceholder='Search files...'
      emptyMessage='No files found.'
      popoverProperties={{ align: 'start' }}
      onSelect={handleSelect}
    >
      <DockviewPaneAction aria-label='Open file'>
        <Plus className='size-3.5' />
      </DockviewPaneAction>
    </FileSelector>
  );
}
