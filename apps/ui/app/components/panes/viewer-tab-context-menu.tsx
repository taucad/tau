import { useCallback, useMemo } from 'react';
import type { IDockviewPanelHeaderProps } from 'dockview-react';
import { Columns2, Copy, FileCode, FolderTree, Plus, Rows2, X, XCircle } from 'lucide-react';
import { ContextMenuItem, ContextMenuSeparator } from '@taucad/ui/components/context-menu';
import {
  closeOtherPanels,
  closePanelsToTheRight,
  closePanelsToTheLeft,
  closeAllPanelsInGroup,
  copyPathToClipboard,
} from '#components/panes/tab-context-menu-actions.js';
import { useProject } from '#hooks/use-project.js';
import { withTabContextMenu } from '#components/panes/with-tab-context-menu.js';
import type { DockviewTabIconRenderer } from '#components/panes/dockview-tab.js';
import { useProjectWorkspace } from '#routes/w.$workspace.$project/project-workspace-context.js';

type ViewerPanelParameters = {
  viewId: string;
  entryPath: string | undefined;
};

/**
 * Context menu content for viewer tabs.
 *
 * Provides close operations, path copying, split controls,
 * and cross-dock navigation (open in editor, reveal in file tree).
 */
function ViewerTabContextMenu(properties: IDockviewPanelHeaderProps): React.JSX.Element {
  const { api } = properties;
  const { editorRef } = useProject();
  const workspace = useProjectWorkspace({ enableNoContext: true });

  const entryPath = (properties.params as ViewerPanelParameters | undefined)?.entryPath;

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
    if (entryPath) {
      void copyPathToClipboard(entryPath);
    }
  }, [entryPath]);

  // ── Split actions ──
  const handleSplitRight = useCallback(() => {
    api.moveTo({ group: api.group, position: 'right' });
  }, [api]);

  const handleSplitDown = useCallback(() => {
    api.moveTo({ group: api.group, position: 'bottom' });
  }, [api]);

  // ── Navigation actions ──
  const handleOpenInEditor = useCallback(() => {
    if (entryPath) {
      editorRef.send({ type: 'openFile', path: entryPath, source: 'user' });
    }
  }, [editorRef, entryPath]);

  const handleRevealInFileTree = useCallback(() => {
    if (entryPath) {
      workspace?.openPanel('files');
      requestAnimationFrame(() => {
        editorRef.send({ type: 'revealFileInTree', path: entryPath });
      });
    }
  }, [editorRef, entryPath, workspace]);

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
      <ContextMenuItem disabled={!entryPath} onSelect={handleCopyPath}>
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
      <ContextMenuItem disabled={!entryPath} onSelect={handleOpenInEditor}>
        <FileCode />
        Open in Editor
      </ContextMenuItem>
      <ContextMenuItem disabled={!entryPath} onSelect={handleRevealInFileTree}>
        <FolderTree />
        Reveal in File Tree
      </ContextMenuItem>
    </>
  );
}

/**
 * Viewer tab component with a right-click context menu.
 * Use as `defaultTabComponent` in the viewer Dockview.
 */
export const getViewerTabIcon: DockviewTabIconRenderer = (properties) =>
  (properties.params as { mode?: unknown } | undefined)?.mode === 'launcher' ? (
    <Plus aria-hidden className='size-3 shrink-0' />
  ) : undefined;

export const ViewerDockviewTab = withTabContextMenu(ViewerTabContextMenu, {
  leadingIcon: 'viewer',
  getIcon: getViewerTabIcon,
});
