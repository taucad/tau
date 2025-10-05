import { FileIcon } from 'lucide-react';
import { useState } from 'react';
import { Tree } from '#components/magicui/file-tree.js';
import { ExplorerFile } from '#routes/builds_.$id/chat-editor-explorer-file.js';
import { EmptyItems } from '#components/ui/empty-items.js';

export type FileItem = {
  readonly id: string;
  readonly name: string;
  readonly type: string;
  readonly size?: number;
};

// Mock file data
const mockFiles: readonly FileItem[] = [
  { id: 'file-1', name: 'MultipleMeshes.bim', type: 'bim', size: 2048 },
];

type ChatEditorExplorerFilesProps = {
  readonly files?: readonly FileItem[];
  readonly onFileSelect?: (fileId: string) => void;
};

export function ChatEditorExplorerFiles({
  files = mockFiles,
  onFileSelect,
}: ChatEditorExplorerFilesProps): React.JSX.Element {
  const [selectedFileId, setSelectedFileId] = useState<string | undefined>(undefined);

  const handleFileClick = (fileId: string) => {
    setSelectedFileId(fileId);
    onFileSelect?.(fileId);
  };

  if (files.length === 0) {
    return <EmptyItems>No files available</EmptyItems>;
  }

  const treeElements = files.map((file) => ({
    id: file.id,
    name: file.name,
    isSelectable: true,
  }));

  return (
    <Tree elements={treeElements} className="px-1">
      {files.map((file) => {
        const isSelected = selectedFileId === file.id;
        
        return (
          <ExplorerFile
            key={file.id}
            id={file.id}
            name={file.name}
            icon={<FileIcon className="size-4" />}
            isSelected={isSelected}
            onClick={() => {
              handleFileClick(file.id);
            }}
          />
        );
      })}
    </Tree>
  );
}
