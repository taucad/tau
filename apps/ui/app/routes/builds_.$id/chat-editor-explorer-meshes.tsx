import { Box } from 'lucide-react';
import { useState } from 'react';
import { Tree } from '#components/magicui/file-tree.js';
import { ExplorerFile } from '#routes/builds_.$id/chat-editor-explorer-file.js';
import { EmptyItems } from '#components/ui/empty-items.js';
import { stringToColor } from '#utils/color.utils.js';

export type MeshItem = {
  readonly id: string;
  readonly name: string;
  readonly triangles: number;
  readonly vertices: number;
  readonly materialId?: string;
};

// Mock mesh data
const mockMeshes: readonly MeshItem[] = [
  { id: 'mesh-1', name: 'Brick', triangles: 12, vertices: 8 },
  { id: 'mesh-2', name: 'Brick', triangles: 12, vertices: 8 },
  { id: 'mesh-3', name: 'Brick', triangles: 12, vertices: 8 },
  { id: 'mesh-4', name: 'Concrete element', triangles: 24, vertices: 16 },
  { id: 'mesh-5', name: 'Concrete element', triangles: 24, vertices: 16 },
  { id: 'mesh-6', name: 'Concrete element', triangles: 24, vertices: 16 },
  { id: 'mesh-7', name: 'Block', triangles: 18, vertices: 12 },
  { id: 'mesh-8', name: 'Block', triangles: 18, vertices: 12 },
  { id: 'mesh-9', name: 'Block', triangles: 18, vertices: 12 },
];

type ChatEditorExplorerMeshesProps = {
  readonly meshes?: readonly MeshItem[];
  readonly onMeshSelect?: (meshId: string) => void;
};

export function ChatEditorExplorerMeshes({
  meshes = mockMeshes,
  onMeshSelect,
}: ChatEditorExplorerMeshesProps): React.JSX.Element {
  const [selectedMeshId, setSelectedMeshId] = useState<string | undefined>(undefined);

  const handleMeshClick = (meshId: string) => {
    setSelectedMeshId(meshId);
    onMeshSelect?.(meshId);
  };

  if (meshes.length === 0) {
    return <EmptyItems>No meshes available</EmptyItems>;
  }

  const treeElements = meshes.map((mesh) => ({
    id: mesh.id,
    name: mesh.name,
    isSelectable: true,
  }));

  return (
    <Tree elements={treeElements} className="px-1">
      {meshes.map((mesh) => {
        const isSelected = selectedMeshId === mesh.id;
        const meshColor = stringToColor(mesh.name);

        return (
          <ExplorerFile
            key={mesh.id}
            id={mesh.id}
            name={mesh.name}
            icon={<Box className="size-4" style={{ color: meshColor }} />}
            isSelected={isSelected}
            onClick={() => {
              handleMeshClick(mesh.id);
            }}
          />
        );
      })}
    </Tree>
  );
}
