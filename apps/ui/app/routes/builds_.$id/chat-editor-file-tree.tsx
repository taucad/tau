import { useCallback, useEffect } from 'react';
import type { JSX } from 'react';
import { FileExplorerContext } from '~/routes/builds_.$id/graphics-actor.js';
import { Tree, Folder, File } from '~/components/magicui/file-tree.js';
import type { TreeViewElement } from '~/components/magicui/file-tree.js';
import type { FileItem } from '~/machines/file-explorer.js';
import { cn } from '~/utils/ui.js';

// Mock file system structure - in real app this would come from server
const mockFileSystem: FileItem[] = [
  {
    id: 'src',
    name: 'src',
    path: 'src',
    content: '',
    isDirectory: true,
    children: [
      {
        id: 'components',
        name: 'components',
        path: 'src/components',
        content: '',
        isDirectory: true,
        children: [
          {
            id: 'Button.tsx',
            name: 'Button.tsx',
            path: 'src/components/Button.tsx',
            content: `import React from 'react';

interface ButtonProps {
  children: React.ReactNode;
  onClick?: () => void;
  variant?: 'primary' | 'secondary';
}

export function Button({ children, onClick, variant = 'primary' }: ButtonProps) {
  return (
    <button
      onClick={onClick}
      className={\`btn btn-\${variant}\`}
    >
      {children}
    </button>
  );
}`,
            language: 'typescript',
            isDirectory: false,
          },
          {
            id: 'Input.tsx',
            name: 'Input.tsx',
            path: 'src/components/Input.tsx',
            content: `import React from 'react';

interface InputProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
}

export function Input({ value, onChange, placeholder }: InputProps) {
  return (
    <input
      type="text"
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      className="input"
    />
  );
}`,
            language: 'typescript',
            isDirectory: false,
          },
        ],
      },
      {
        id: 'utils',
        name: 'utils',
        path: 'src/utils',
        content: '',
        isDirectory: true,
        children: [
          {
            id: 'helpers.ts',
            name: 'helpers.ts',
            path: 'src/utils/helpers.ts',
            content: `export function formatDate(date: Date): string {
  return date.toLocaleDateString();
}

export function capitalize(str: string): string {
  return str.charAt(0).toUpperCase() + str.slice(1);
}

export function debounce<T extends (...args: any[]) => any>(
  func: T,
  wait: number
): (...args: Parameters<T>) => void {
  let timeout: NodeJS.Timeout;
  return (...args: Parameters<T>) => {
    clearTimeout(timeout);
    timeout = setTimeout(() => func(...args), wait);
  };
}`,
            language: 'typescript',
            isDirectory: false,
          },
        ],
      },
      {
        id: 'App.tsx',
        name: 'App.tsx',
        path: 'src/App.tsx',
        content: `import React from 'react';
import { Button } from './components/Button';
import { Input } from './components/Input';

function App() {
  const [value, setValue] = React.useState('');

  return (
    <div className="app">
      <h1>My App</h1>
      <Input 
        value={value}
        onChange={setValue}
        placeholder="Enter some text..."
      />
      <Button onClick={() => console.log(value)}>
        Log Value
      </Button>
    </div>
  );
}

export default App;`,
        language: 'typescript',
        isDirectory: false,
      },
    ],
  },
  {
    id: 'package.json',
    name: 'package.json',
    path: 'package.json',
    content: `{
  "name": "my-app",
  "version": "1.0.0",
  "description": "A sample TypeScript React app",
  "main": "src/App.tsx",
  "scripts": {
    "start": "react-scripts start",
    "build": "react-scripts build",
    "test": "react-scripts test"
  },
  "dependencies": {
    "react": "^18.0.0",
    "react-dom": "^18.0.0"
  },
  "devDependencies": {
    "@types/react": "^18.0.0",
    "typescript": "^4.0.0"
  }
}`,
    language: 'json',
    isDirectory: false,
  },
  {
    id: 'README.md',
    name: 'README.md',
    path: 'README.md',
    content: `# My App

This is a sample TypeScript React application.

## Getting Started

1. Install dependencies: \`npm install\`
2. Start the development server: \`npm start\`
3. Open http://localhost:3000 in your browser

## Features

- TypeScript support
- React components
- Utility functions
`,
    language: 'markdown',
    isDirectory: false,
  },
];

function convertFileItemToTreeElement(items: FileItem[]): TreeViewElement[] {
  return items.map((item) => ({
    id: item.id,
    name: item.name,
    isSelectable: !item.isDirectory,
    children: item.children ? convertFileItemToTreeElement(item.children) : undefined,
  }));
}

function findFileById(items: FileItem[], id: string): FileItem | undefined {
  for (const item of items) {
    if (item.id === id) {
      return item;
    }

    if (item.children) {
      const found = findFileById(item.children, id);
      if (found) {
        return found;
      }
    }
  }

  return undefined;
}

export function ChatEditorFileTree(): JSX.Element {
  const activeFileId = FileExplorerContext.useSelector((state) => state.context.activeFileId);
  const actorRef = FileExplorerContext.useActorRef();

  // Initialize file tree on mount
  useEffect(() => {
    actorRef.send({ type: 'setFileTree', tree: mockFileSystem });
  }, [actorRef]);

  const handleFileSelect = useCallback(
    (fileId: string) => {
      const file = findFileById(mockFileSystem, fileId);
      if (file && !file.isDirectory) {
        actorRef.send({ type: 'openFile', file });
      }
    },
    [actorRef],
  );

  const treeElements = convertFileItemToTreeElement(mockFileSystem);

  return (
    <div className={cn('h-full w-full bg-neutral/5')}>
      <h3 className="mb-2 flex h-12 items-center border-b px-2 text-base font-medium text-muted-foreground">Files</h3>
      <Tree className="h-full" elements={treeElements} initialExpandedItems={['src', 'components', 'utils']}>
        {treeElements.map((element) => (
          <TreeItem key={element.id} element={element} activeFileId={activeFileId} onSelect={handleFileSelect} />
        ))}
      </Tree>
    </div>
  );
}

type TreeItemProps = {
  readonly element: TreeViewElement;
  readonly onSelect: (id: string) => void;
  readonly activeFileId: string | undefined;
};

function TreeItem({ element, onSelect, activeFileId }: TreeItemProps): JSX.Element {
  if (element.children && element.children.length > 0) {
    return (
      <Folder value={element.id} element={element.name}>
        {element.children.map((child) => (
          <TreeItem key={child.id} element={child} activeFileId={activeFileId} onSelect={onSelect} />
        ))}
      </Folder>
    );
  }

  const isActive = activeFileId === element.id;

  return (
    <File
      value={element.id}
      className={cn('w-fit truncate p-0.5', isActive && 'bg-neutral/10 text-primary')}
      onClick={() => {
        onSelect(element.id);
      }}
    >
      <span>{element.name}</span>
    </File>
  );
}
