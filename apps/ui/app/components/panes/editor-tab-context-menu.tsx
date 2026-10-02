import { useCallback, useMemo } from 'react';
import type { IDockviewPanelHeaderProps } from 'dockview-react';
import { Box, Columns2, Copy, FolderTree, Rows2, X, XCircle } from 'lucide-react';
import { ContextMenuItem, ContextMenuSeparator } from '#components/ui/context-menu.js';
import {
  closeOtherPanels,
  closePanelsToTheRight,
  closePanelsToTheLeft,
  closeAllPanelsInGroup,
  copyPathToClipboard,
} from '#components/panes/tab-context-menu-actions.js';
import { useProject } from '#hooks/use-project.js';
import { withTabContextMenu } from '#components/panes/with-tab-context-menu.js';

type EditorPanelParameters = {
  filePath: string;
};

/**
 * Context menu content for editor tabs.
 *
 * Provides close operations, path copying, split controls,
 * and cross-dock navigation (open in viewer, reveal in file tree).
 */
function EditorTabContextMenu(properties: IDockviewPanelHeaderProps): React.JSX.Element {
  const { api, containerApi } = properties;
  const { editorRef, projectRef } = useProject();

  const filePath = (properties.params as EditorPanelParameters | undefined)?.filePath;

  const { hasOthers, hasRight, hasLeft } = useMemo(() => {
    const { panels } = api.group;
    const currentIndex = panels.findIndex((panel) => panel.id === api.id);

    return {
      hasOthers: panels.length > 1,
      hasRight: currentIndex < panels.length - 1,
      hasLeft: currentIndex > 0,
    };
  }, [api]);

  // ── Close actions ──
  const handleClose = useCallback(() => {
    api.close();
  }, [api]);

  const handleCloseOthers = useCallback(() => {
    closeOtherPanels(api);
  }, [api]);

  const handleCloseRight = useCallback(() => {
    closePanelsToTheRight(api);
  }, [api]);

  const handleCloseLeft = useCallback(() => {
    closePanelsToTheLeft(api);
  }, [api]);

  const handleCloseAll = useCallback(() => {
    closeAllPanelsInGroup(api);
  }, [api]);

  // ── Copy path ──
  const handleCopyPath = useCallback(() => {
    if (filePath) {
      void copyPathToClipboard(filePath);
    }
  }, [filePath]);

  // ── Split actions ──
  const handleSplitRight = useCallback(() => {
    containerApi.addGroup({
      referenceGroup: api.group,
      direction: 'right',
    });
  }, [api, containerApi]);

  const handleSplitDown = useCallback(() => {
    containerApi.addGroup({
      referenceGroup: api.group,
      direction: 'below',
    });
  }, [api, containerApi]);

  // ── Navigation actions ──
  const handleOpenInViewer = useCallback(() => {
    if (filePath) {
      projectRef.send({ type: 'openInViewer', entryFile: filePath });
    }
  }, [projectRef, filePath]);

  const handleRevealInFileTree = useCallback(() => {
    if (filePath) {
      editorRef.send({ type: 'revealFileInTree', path: filePath });
    }
  }, [editorRef, filePath]);

  return (
    <>
      {/* ── Close group ── */}
      <ContextMenuItem onSelect={handleClose}>
        <X />
        Close
      </ContextMenuItem>
      <ContextMenuItem disabled={!hasOthers} onSelect={handleCloseOthers}>
        <XCircle />
        Close Others
      </ContextMenuItem>
      <ContextMenuItem disabled={!hasRight} onSelect={handleCloseRight}>
        Close to the Right
      </ContextMenuItem>
      <ContextMenuItem disabled={!hasLeft} onSelect={handleCloseLeft}>
        Close to the Left
      </ContextMenuItem>
      <ContextMenuItem onSelect={handleCloseAll}>Close All</ContextMenuItem>

      <ContextMenuSeparator />

      {/* ── Copy path ── */}
      <ContextMenuItem disabled={!filePath} onSelect={handleCopyPath}>
        <Copy />
        Copy Path
      </ContextMenuItem>

      <ContextMenuSeparator />

      {/* ── Split group ── */}
      <ContextMenuItem onSelect={handleSplitRight}>
        <Columns2 />
        Split Right
      </ContextMenuItem>
      <ContextMenuItem onSelect={handleSplitDown}>
        <Rows2 />
        Split Down
      </ContextMenuItem>

      <ContextMenuSeparator />

      {/* ── Navigation group ── */}
      <ContextMenuItem disabled={!filePath} onSelect={handleOpenInViewer}>
        <Box />
        Open in Viewer
      </ContextMenuItem>
      <ContextMenuItem disabled={!filePath} onSelect={handleRevealInFileTree}>
        <FolderTree />
        Reveal in File Tree
      </ContextMenuItem>
    </>
  );
}

/**
 * Editor tab component with a right-click context menu.
 * Use as `defaultTabComponent` in the editor Dockview.
 */
export const EditorDockviewTab = withTabContextMenu(EditorTabContextMenu);
