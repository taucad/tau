import { useEffect, useMemo, useState } from 'react';
import { File, Folder, Tree } from '#components/magicui/file-tree.js';
import type { TreeViewElement } from '#components/magicui/file-tree.js';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '#components/ui/dialog.js';
import { publicationFileFetchInit } from '#routes/v.$id/parsed-publication.js';
import type { ParsedPublication } from '#routes/v.$id/parsed-publication.js';
import { cn } from '#utils/ui.utils.js';

type PublicationFilesPaneProps = {
  readonly entryPath: string;
  readonly files: Record<string, string>;
  readonly visibility: ParsedPublication['visibility'];
  readonly className?: string;
};

type TreeNode = TreeViewElement & {
  readonly path?: string;
  readonly children?: TreeNode[];
};

const buildTree = (paths: string[]): TreeNode[] => {
  const sorted = [...paths].sort((a, b) => a.localeCompare(b));
  const root: TreeNode[] = [];

  for (const path of sorted) {
    const segments = path.split('/');
    let cursor = root;

    for (let index = 0; index < segments.length; index++) {
      const segment = segments[index]!;
      const isLeaf = index === segments.length - 1;
      const id = segments.slice(0, index + 1).join('/');

      if (isLeaf) {
        cursor.push({ id, name: segment, path });
        continue;
      }

      let folder = cursor.find((node): node is TreeNode => node.id === id && node.children !== undefined);
      if (!folder) {
        folder = { id, name: segment, children: [] };
        cursor.push(folder);
      }

      cursor = folder.children!;
    }
  }

  const sortFoldersFirst = (nodes: TreeNode[]): TreeNode[] => {
    const folders = nodes.filter((node) => node.children !== undefined);
    const leaves = nodes.filter((node) => node.children === undefined);
    for (const folder of folders) {
      if (folder.children) {
        folder.children = sortFoldersFirst(folder.children);
      }
    }
    return [...folders, ...leaves];
  };

  return sortFoldersFirst(root);
};

const collectFolderIds = (nodes: TreeNode[], accumulator: string[] = []): string[] => {
  for (const node of nodes) {
    if (node.children !== undefined) {
      accumulator.push(node.id);
      collectFolderIds(node.children, accumulator);
    }
  }

  return accumulator;
};

const renderNodes = (nodes: TreeNode[], entryPath: string, onSelect: (path: string) => void): React.ReactNode => {
  return nodes.map((node) => {
    if (node.children !== undefined) {
      return (
        <Folder key={node.id} value={node.id} element={node.name}>
          {renderNodes(node.children, entryPath, onSelect)}
        </Folder>
      );
    }

    const isEntry = node.path === entryPath;
    return (
      <File
        key={node.id}
        value={node.id}
        aria-current={isEntry ? 'page' : undefined}
        onClick={() => {
          if (node.path !== undefined) {
            onSelect(node.path);
          }
        }}
      >
        <span className={cn(isEntry && 'font-semibold text-foreground')}>{node.name}</span>
      </File>
    );
  });
};

/**
 * Side-rail file tree for the sharing route. Renders the publication's manifest
 * as an expandable tree; clicking a leaf opens a read-only preview dialog.
 *
 * Replaces the old centered-card `PublicationFileExplorer`. Designed to fill its
 * grid cell vertically (`h-full min-h-0`) so the tree scrolls inside the pane.
 */
export const PublicationFilesPane = ({
  entryPath,
  files,
  visibility,
  className,
}: PublicationFilesPaneProps): React.JSX.Element => {
  const tree = useMemo(() => buildTree(Object.keys(files)), [files]);
  const expanded = useMemo(() => collectFolderIds(tree), [tree]);
  const [open, setOpen] = useState<string | undefined>();
  const [content, setContent] = useState<string | undefined>();

  useEffect(() => {
    if (open === undefined) {
      setContent(undefined);
      return;
    }

    const url = files[open];
    if (url === undefined) {
      return;
    }

    let cancelled = false;
    const load = async (): Promise<void> => {
      try {
        const response = await fetch(url, publicationFileFetchInit(visibility));
        if (!response.ok) {
          return;
        }

        const text = await response.text();
        if (!cancelled) {
          setContent(text);
        }
      } catch {
        // Non-essential dialog content; suppress fetch failures.
      }
    };
    // async-iife: bootstrap
    void load();

    return () => {
      cancelled = true;
    };
  }, [files, open, visibility]);

  return (
    <section
      role='region'
      aria-label='Files'
      data-slot='publication-files-pane'
      className={cn('flex h-full min-h-0 flex-col overflow-hidden bg-background', className)}
    >
      <div className='shrink-0 border-b px-3 py-2 text-xs font-medium text-muted-foreground'>Files</div>
      <div className='min-h-0 flex-1 overflow-y-auto p-2'>
        <Tree initialExpandedItems={expanded} indicator role='tree'>
          {renderNodes(tree, entryPath, setOpen)}
        </Tree>
      </div>

      <Dialog
        open={open !== undefined}
        onOpenChange={(next) => {
          if (!next) {
            setOpen(undefined);
          }
        }}
      >
        <DialogContent className='max-w-2xl'>
          <DialogHeader>
            <DialogTitle>{open ?? ''}</DialogTitle>
            <DialogDescription>Read-only preview from the publication manifest.</DialogDescription>
          </DialogHeader>
          <pre className='max-h-[60vh] overflow-auto rounded-md bg-muted p-3 text-xs'>{content ?? 'Loading…'}</pre>
        </DialogContent>
      </Dialog>
    </section>
  );
};
