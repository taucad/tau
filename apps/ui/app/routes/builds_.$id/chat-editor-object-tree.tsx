import { XIcon, FileBox } from 'lucide-react';
import { useCallback, useState } from 'react';
import { KeyShortcut } from '#components/ui/key-shortcut.js';
import { FloatingPanel, FloatingPanelClose, FloatingPanelContent, FloatingPanelContentHeader, FloatingPanelContentTitle, FloatingPanelContentBody, FloatingPanelTrigger } from '#components/ui/floating-panel.js';
import { Tree, Folder, File } from '#components/magicui/file-tree.js';
import type { TreeViewElement } from '#components/magicui/file-tree.js';
import { cookieName } from '#constants/cookie.constants.js';
import { useCookie } from '#hooks/use-cookie.js';
import { useKeydown } from '#hooks/use-keydown.js';
import type { KeyCombination } from '#utils/keys.js';
import { formatKeyCombination } from '#utils/keys.js';
import { cn } from '#utils/ui.js';

const keyCombinationEditor = {
  key: 'a',
  ctrlKey: true,
} as const satisfies KeyCombination;

type CadComponent = {
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

// Model Explorer Trigger Component
export function ChatEditorObjectTreeTrigger({ 
  isOpen, 
  onToggle 
}: { 
  readonly isOpen: boolean; 
  readonly onToggle: () => void; 
}): React.JSX.Element {
  return (
    <FloatingPanelTrigger
      icon={FileBox}
      tooltipContent={
        <div className="flex items-center gap-2">
          {isOpen ? 'Close' : 'Open'} Explorer
          <KeyShortcut variant="tooltip">
            {formatKeyCombination(keyCombinationEditor)}
          </KeyShortcut>
        </div>
      }
      onClick={onToggle}
      isOpen={isOpen}
      tooltipSide="right"
    />
  );
}

export function ChatEditorObjectTree({ className }: { readonly className?: string }): React.JSX.Element {
  const [isOpen, setIsOpen] = useCookie(cookieName.chatOpModelExplorer, false);
  const [activeComponentId, setActiveComponentId] = useState<string | undefined>(undefined);

  const toggleEditor = () => {
    setIsOpen(!isOpen);
  };

  const handleComponentSelect = useCallback(
    (componentId: string) => {
      const component = findCadComponentById(mockCadComponents, componentId);
      if (component && component.type !== 'assembly') {
        setActiveComponentId(componentId);
        // TODO: Add actual component selection logic here
        console.log('Selected CAD component:', component);
      }
    },
    [],
  );

  const { formattedKeyCombination: formattedEditorKeyCombination } = useKeydown(keyCombinationEditor, toggleEditor);

  // Convert CAD components to tree elements
  const treeElements = convertCadComponentToTreeElement(mockCadComponents);

  return (
    <FloatingPanel open={isOpen} onOpenChange={setIsOpen} className={className}>
      <FloatingPanelClose
        side="left"
        align="start"
        icon={XIcon}
        tooltipContent={(isOpen) => (
          <div className="flex items-center gap-2">
            {isOpen ? 'Close' : 'Open'} Model Explorer
            <KeyShortcut variant="tooltip">
              {formattedEditorKeyCombination}
            </KeyShortcut>
          </div>
        )}
      />
      <FloatingPanelContent>
        <FloatingPanelContentHeader>
          <FloatingPanelContentTitle>Model Explorer</FloatingPanelContentTitle>
        </FloatingPanelContentHeader>
        <FloatingPanelContentBody>
          <div className="my-2">
            {treeElements.length > 0 ? (
              <Tree elements={treeElements} initialExpandedItems={treeElements.map((element) => element.id)}>
                {treeElements.map((element) => (
                  <CadTreeItem key={element.id} element={element} activeComponentId={activeComponentId} onSelect={handleComponentSelect} />
                ))}
              </Tree>
            ) : (
              <div className="px-4 py-2 text-sm text-muted-foreground">No components available</div>
            )}
          </div>
        </FloatingPanelContentBody>
      </FloatingPanelContent>
    </FloatingPanel>
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
      <Folder
        value={element.id}
        element={element.name}
        className="rounded-md px-2 py-1.5 text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
      >
        {element.children.map((child) => (
          <CadTreeItem key={child.id} element={child} activeComponentId={activeComponentId} onSelect={onSelect} />
        ))}
      </Folder>
    );
  }

  const isActive = activeComponentId === element.id;

  return (
    <File
      value={element.id}
      className={cn(
        'w-full justify-start rounded-md px-2 py-1.5 text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground',
        isActive && 'bg-sidebar-accent text-sidebar-accent-foreground',
      )}
      onClick={() => {
        onSelect(element.id);
      }}
    >
      <span className="truncate">{element.name}</span>
    </File>
  );
}
