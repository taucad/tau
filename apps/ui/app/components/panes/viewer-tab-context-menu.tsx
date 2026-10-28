import { useCallback } from 'react';
import type { IDockviewPanelHeaderProps } from 'dockview-react';
import { Columns2, Copy, FileCode, FolderTree, Plus, Printer, Rows2, X, XCircle } from 'lucide-react';
import { ContextMenuItem, ContextMenuSeparator } from '@taucad/ui/components/context-menu';
import { DropdownMenuItem, DropdownMenuSeparator } from '@taucad/ui/components/dropdown-menu';
import { isPrinterFileName } from '#components/printer/printer-file.js';
import {
  closeOtherPanels,
  closePanelsToTheRight,
  closePanelsToTheLeft,
  closeAllPanelsInGroup,
  copyPathToClipboard,
} from '#components/panes/tab-context-menu-actions.js';
import { useSelector } from '@xstate/react';
import { useProject } from '#hooks/use-project.js';
import { NativeFileManagerIcon, useRevealInFileManager } from '#hooks/use-native-file-manager.js';
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
export function ViewerTabContextMenu(
  properties: Pick<IDockviewPanelHeaderProps, 'api' | 'params'> & {
    readonly variant?: 'context' | 'dropdown';
    readonly onNavigate?: (surface: 'editor' | 'files') => void;
  },
): React.JSX.Element {
  const { api, onNavigate, variant = 'context' } = properties;
  const Item = variant === 'dropdown' ? DropdownMenuItem : ContextMenuItem;
  const Separator = variant === 'dropdown' ? DropdownMenuSeparator : ContextMenuSeparator;
  const { editorRef, projectRef } = useProject();
  const projectId = useSelector(projectRef, (state) => state.context.project?.id);
  const revealInFileManager = useRevealInFileManager(projectId);
  const workspace = useProjectWorkspace({ enableNoContext: true });

  const entryPath = (properties.params as ViewerPanelParameters | undefined)?.entryPath;

  const { panels } = api.group;
  const currentIndex = panels.findIndex((panel) => panel.id === api.id);
  const hasOthers = panels.length > 1;
  const hasRight = currentIndex < panels.length - 1;
  const hasLeft = currentIndex > 0;

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
      onNavigate?.('editor');
    }
  }, [editorRef, entryPath, onNavigate]);

  const handleRevealInFileTree = useCallback(() => {
    if (entryPath) {
      if (onNavigate) {
        onNavigate('files');
      } else {
        workspace?.openPanel('files');
      }
      requestAnimationFrame(() => {
        editorRef.send({ type: 'revealFileInTree', path: entryPath });
      });
    }
  }, [editorRef, entryPath, onNavigate, workspace]);

  return (
    <>
      {/* ── Close group ── */}
      <Item onSelect={handleClose}>
        <X />
        Close
      </Item>
      <Item disabled={!hasOthers} onSelect={handleCloseOthers}>
        <XCircle />
        Close Others
      </Item>
      <Item disabled={!hasRight} onSelect={handleCloseRight}>
        Close to the Right
      </Item>
      <Item disabled={!hasLeft} onSelect={handleCloseLeft}>
        Close to the Left
      </Item>
      <Item onSelect={handleCloseAll}>Close All</Item>

      <Separator />

      {/* ── Copy path ── */}
      <Item disabled={!entryPath} onSelect={handleCopyPath}>
        <Copy />
        Copy Path
      </Item>

      <Separator />

      {variant === 'context' ? (
        <>
          {/* ── Split group ── */}
          <Item onSelect={handleSplitRight}>
            <Columns2 />
            Split Right
          </Item>
          <Item onSelect={handleSplitDown}>
            <Rows2 />
            Split Down
          </Item>

          <Separator />
        </>
      ) : null}

      {/* ── Navigation group ── */}
      <Item disabled={!entryPath} onSelect={handleOpenInEditor}>
        <FileCode />
        Open in Editor
      </Item>
      <Item disabled={!entryPath} onSelect={handleRevealInFileTree}>
        <FolderTree />
        Reveal in File Tree
      </Item>
      {revealInFileManager ? (
        <Item
          disabled={!entryPath}
          onSelect={() => {
            if (entryPath) {
              void revealInFileManager.reveal(entryPath);
            }
          }}
        >
          <NativeFileManagerIcon icon={revealInFileManager.icon} />
          {revealInFileManager.label}
        </Item>
      ) : null}
    </>
  );
}

/**
 * Viewer tab component with a right-click context menu.
 * Use as `defaultTabComponent` in the viewer Dockview.
 */
export const getViewerTabIcon: DockviewTabIconRenderer = (properties) => {
  const params = properties.params as { mode?: unknown; entryPath?: unknown } | undefined;
  if (params?.mode === 'launcher') {
    return <Plus aria-hidden className='size-3 shrink-0' />;
  }
  return typeof params?.entryPath === 'string' && isPrinterFileName(params.entryPath) ? (
    <Printer aria-hidden className='size-3 shrink-0' />
  ) : undefined;
};

export const ViewerDockviewTab = withTabContextMenu(ViewerTabContextMenu, {
  leadingIcon: 'viewer',
  getIcon: getViewerTabIcon,
});
