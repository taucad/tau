import { Palette } from 'lucide-react';
import { useState } from 'react';
import { Tree } from '#components/magicui/file-tree.js';
import { ExplorerFile } from '#routes/builds_.$id/chat-editor-explorer-file.js';
import { ChatEditorExplorerNoItems } from '#routes/builds_.$id/chat-editor-explorer-no-items.js';

export type MaterialItem = {
  readonly id: string;
  readonly name: string;
  readonly color?: string;
};

// Mock material data
const mockMaterials: readonly MaterialItem[] = [
  { id: 'mat-1', name: '820303FF', color: '#820303' },
  { id: 'mat-2', name: '2E2E2EFF', color: '#2E2E2E' },
  { id: 'mat-3', name: '07B072FF', color: '#07B072' },
];

type ChatEditorExplorerMaterialsProps = {
  readonly materials?: readonly MaterialItem[];
  readonly onMaterialSelect?: (materialId: string) => void;
};

export function ChatEditorExplorerMaterials({
  materials = mockMaterials,
  onMaterialSelect,
}: ChatEditorExplorerMaterialsProps): React.JSX.Element {
  const [selectedMaterialId, setSelectedMaterialId] = useState<string | undefined>(undefined);

  const handleMaterialClick = (materialId: string) => {
    setSelectedMaterialId(materialId);
    onMaterialSelect?.(materialId);
  };

  if (materials.length === 0) {
    return <ChatEditorExplorerNoItems message="No materials available" />;
  }

  const treeElements = materials.map((material) => ({
    id: material.id,
    name: material.name,
    isSelectable: true,
  }));

  return (
    <Tree elements={treeElements} className="px-1">
      {materials.map((material) => {
        const isSelected = selectedMaterialId === material.id;
        
        return (
          <ExplorerFile
            key={material.id}
            id={material.id}
            name={material.name}
            icon={
              <Palette
                className="size-4"
                style={{ color: material.color ?? '#888' }}
              />
            }
            isSelected={isSelected}
            onClick={() => {
              handleMaterialClick(material.id);
            }}
          />
        );
      })}
    </Tree>
  );
}

