import { useState } from 'react';
import { Box } from 'lucide-react';
import { Tree, Folder } from '#components/magicui/file-tree.js';
import type { TreeViewElement } from '#components/magicui/file-tree.js';
import { ExplorerFile } from '#routes/builds_.$id/chat-explorer-file.js';
import { EmptyItems } from '#components/ui/empty-items.js';

export type CadComponent = {
  readonly id: string;
  readonly name: string;
  readonly type: 'assembly' | 'part' | 'sketch' | 'feature';
  readonly children?: readonly CadComponent[];
};

// Mock CAD component tree data
const mockCadComponents: readonly CadComponent[] = [
  {
    id: 'main-assembly',
    name: 'Main Assembly',
    type: 'assembly',
    children: [
      {
        id: 'base-plate',
        name: 'Base Plate',
        type: 'part',
      },
      {
        id: 'motor-mount',
        name: 'Motor Mount',
        type: 'assembly',
        children: [
          {
            id: 'motor-bracket',
            name: 'Motor Bracket',
            type: 'part',
          },
          {
            id: 'mounting-bolts',
            name: 'Mounting Bolts',
            type: 'part',
          },
          {
            id: 'motor-housing',
            name: 'Motor Housing',
            type: 'part',
          },
        ],
      },
      {
        id: 'gear-assembly',
        name: 'Gear Assembly',
        type: 'assembly',
        children: [
          {
            id: 'primary-gear',
            name: 'Primary Gear',
            type: 'part',
          },
          {
            id: 'secondary-gear',
            name: 'Secondary Gear',
            type: 'part',
          },
          {
            id: 'gear-shaft',
            name: 'Gear Shaft',
            type: 'part',
          },
        ],
      },
      {
        id: 'cover-plate',
        name: 'Cover Plate',
        type: 'part',
      },
      {
        id: 'mounting-sketch',
        name: 'Mounting Pattern Sketch',
        type: 'sketch',
      },
    ],
  },
];

function convertCadComponentToTreeElement(components: readonly CadComponent[]): TreeViewElement[] {
  return components.map((component) => ({
    id: component.id,
    name: component.name,
    isSelectable: component.type !== 'assembly',
    children: component.children ? convertCadComponentToTreeElement(component.children) : undefined,
  }));
}

function findCadComponentById(components: readonly CadComponent[], id: string): CadComponent | undefined {
  for (const component of components) {
    if (component.id === id) {
      return component;
    }

    if (component.children) {
      const found = findCadComponentById(component.children, id);
      if (found) {
        return found;
      }
    }
  }

  return undefined;
}

type ChatEditorExplorerObjectsProps = {
  readonly components?: readonly CadComponent[];
  readonly onComponentSelect?: (componentId: string) => void;
};

export function ChatEditorExplorerObjects({
  components = mockCadComponents,
  onComponentSelect,
}: ChatEditorExplorerObjectsProps): React.JSX.Element {
  const [activeComponentId, setActiveComponentId] = useState<string | undefined>(undefined);

  const handleComponentSelect = (componentId: string) => {
    const component = findCadComponentById(components, componentId);
    if (component && component.type !== 'assembly') {
      setActiveComponentId(componentId);
      onComponentSelect?.(componentId);
    }
  };

  const treeElements = convertCadComponentToTreeElement(components);

  if (treeElements.length === 0) {
    return <EmptyItems>No objects available</EmptyItems>;
  }

  return (
    <Tree elements={treeElements} initialExpandedItems={treeElements.map((element) => element.id)} className="px-1">
      {treeElements.map((element) => (
        <CadTreeItem
          key={element.id}
          element={element}
          activeComponentId={activeComponentId}
          onSelect={handleComponentSelect}
        />
      ))}
    </Tree>
  );
}

type CadTreeItemProps = {
  readonly element: TreeViewElement;
  readonly onSelect: (id: string) => void;
  readonly activeComponentId: string | undefined;
};

function CadTreeItem({ element, onSelect, activeComponentId }: CadTreeItemProps): React.JSX.Element {
  if (element.children && element.children.length > 0) {
    return (
      <Folder value={element.id} element={element.name} className="px-2 py-1 text-sm text-sidebar-foreground">
        {element.children.map((child) => (
          <CadTreeItem key={child.id} element={child} activeComponentId={activeComponentId} onSelect={onSelect} />
        ))}
      </Folder>
    );
  }

  const isActive = activeComponentId === element.id;

  return (
    <ExplorerFile
      id={element.id}
      name={element.name}
      icon={<Box className="size-4" />}
      isSelected={isActive}
      onClick={() => {
        onSelect(element.id);
      }}
    />
  );
}
