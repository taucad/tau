import { Accordion as AccordionPrimitive } from 'radix-ui';
import { FolderIcon, FolderOpenIcon } from 'lucide-react';
import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { Button } from '@taucad/ui/components/button';
import { FileExtensionIcon } from '#components/icons/file-extension-icon.js';
import { cn } from '@taucad/ui/utils/cn';

type TreeViewElement = {
  id: string;
  name: string;
  isSelectable?: boolean;
  children?: TreeViewElement[];
};

type TreeContextProps = {
  selectedId: string | undefined;
  expandedItems: string[] | undefined;
  indicator: boolean;
  handleExpand: (id: string) => void;
  selectItem: (id: string) => void;
  setExpandedItems?: React.Dispatch<React.SetStateAction<string[] | undefined>>;
  openIcon?: React.ReactNode;
  closeIcon?: React.ReactNode;
  direction: 'rtl' | 'ltr';
};

const TreeContext = createContext<TreeContextProps | undefined>(undefined);

const useTree = () => {
  const context = useContext(TreeContext);
  if (!context) {
    throw new Error('useTree must be used within a TreeProvider');
  }

  return context;
};

type TreeViewComponentProps = {} & React.HTMLAttributes<HTMLDivElement>;

type Direction = 'rtl' | 'ltr' | undefined;

type TreeViewProps = {
  readonly initialSelectedId?: string;
  readonly indicator?: boolean;
  readonly elements?: TreeViewElement[];
  readonly initialExpandedItems?: string[];
  readonly openIcon?: React.ReactNode;
  readonly closeIcon?: React.ReactNode;
  readonly dir?: 'rtl' | 'ltr';
  readonly onExpand?: (id: string) => void;
} & TreeViewComponentProps;

function Tree({
  className,
  elements,
  initialSelectedId,
  initialExpandedItems,
  children,
  indicator = true,
  openIcon,
  closeIcon,
  dir,
  onExpand,
  ...props
}: React.PropsWithChildren<TreeViewProps> & React.HTMLAttributes<HTMLDivElement>): React.JSX.Element {
  const [selectedId, setSelectedId] = useState<string | undefined>(initialSelectedId);
  const [expandedItems, setExpandedItems] = useState<string[] | undefined>(initialExpandedItems);
  const previousExpandedRef = useRef<string[] | undefined>(undefined);

  useEffect(() => {
    const current = expandedItems ?? [];
    const previous = previousExpandedRef.current ?? [];

    if (previousExpandedRef.current === undefined) {
      previousExpandedRef.current = current;
      return;
    }

    const newlyExpanded = current.filter((id) => !previous.includes(id));
    for (const id of newlyExpanded) {
      onExpand?.(id);
    }
    previousExpandedRef.current = current;
  }, [expandedItems, onExpand]);

  const selectItem = useCallback((id: string) => {
    setSelectedId(id);
  }, []);

  const handleExpand = useCallback((id: string) => {
    setExpandedItems((previous) => {
      if (previous?.includes(id)) {
        return previous.filter((item) => item !== id);
      }

      return [...(previous ?? []), id];
    });
  }, []);

  const expandSpecificTargetedElements = useCallback((elements?: TreeViewElement[], selectId?: string) => {
    if (!elements || !selectId) {
      return;
    }

    const findParent = (currentElement: TreeViewElement, currentPath: string[] = []) => {
      const isSelectable = currentElement.isSelectable ?? true;
      const newPath = [...currentPath, currentElement.id];
      if (currentElement.id === selectId) {
        if (isSelectable) {
          setExpandedItems((previous) => [...(previous ?? []), ...newPath]);
        } else if (newPath.includes(currentElement.id)) {
          newPath.pop();
          setExpandedItems((previous) => [...(previous ?? []), ...newPath]);
        }

        return;
      }

      if (isSelectable && currentElement.children && currentElement.children.length > 0) {
        for (const child of currentElement.children) {
          findParent(child, newPath);
        }
      }
    };

    for (const element of elements) {
      findParent(element);
    }
  }, []);

  useEffect(() => {
    if (initialSelectedId) {
      expandSpecificTargetedElements(elements, initialSelectedId);
    }
  }, [initialSelectedId, elements, expandSpecificTargetedElements]);

  const direction: 'rtl' | 'ltr' = dir === 'rtl' ? 'rtl' : 'ltr';

  const contextValue = useMemo(
    () => ({
      selectedId,
      expandedItems,
      handleExpand,
      selectItem,
      setExpandedItems,
      indicator,
      openIcon,
      closeIcon,
      direction,
    }),
    [selectedId, expandedItems, handleExpand, selectItem, setExpandedItems, indicator, openIcon, closeIcon, direction],
  );

  return (
    <TreeContext.Provider value={contextValue}>
      <div className={cn('size-full overflow-y-auto p-1', className)}>
        <AccordionPrimitive.Root
          {...props}
          type='multiple'
          defaultValue={expandedItems}
          value={expandedItems}
          className='flex w-full flex-col'
          dir={dir as Direction}
          onValueChange={(value) => {
            setExpandedItems((previous) => [...(previous ?? []), value[0]!]);
          }}
        >
          {children}
        </AccordionPrimitive.Root>
      </div>
    </TreeContext.Provider>
  );
}

function TreeIndicator({ className, ...props }: React.HTMLAttributes<HTMLDivElement>): React.JSX.Element {
  const { direction } = useTree();

  return (
    <div
      dir={direction}
      className={cn(
        'absolute left-3.5 h-full w-px rounded-md bg-muted py-3 hover:bg-neutral/20 rtl:right-1.5',
        className,
      )}
      {...props}
    />
  );
}

type FolderComponentProps = {} & React.ComponentPropsWithoutRef<typeof AccordionPrimitive.Item>;

type FolderProps = {
  readonly expandedItems?: string[];
  readonly element: React.ReactNode;
  readonly isSelectable?: boolean;
  readonly isSelect?: boolean;
  readonly actions?: React.ReactNode;
} & FolderComponentProps;

function Folder({
  className,
  element,
  value,
  isSelectable = true,
  isSelect,
  actions,
  children,
  ...props
}: FolderProps & React.HTMLAttributes<HTMLDivElement>): React.JSX.Element {
  const { direction, handleExpand, expandedItems, indicator, setExpandedItems, openIcon, closeIcon } = useTree();

  return (
    <AccordionPrimitive.Item {...props} value={value} className='relative flex h-full flex-col overflow-hidden'>
      <div
        className={cn(
          'group relative flex h-7 w-full items-center justify-between gap-2 px-2 text-sm',
          'before:pointer-events-none before:absolute before:inset-y-0 before:right-0 before:-left-96 before:-z-10',
          'hover:before:bg-muted',
          className,
          {
            'before:bg-muted': isSelect && isSelectable,
            'cursor-pointer': isSelectable,
            'cursor-not-allowed opacity-50': !isSelectable,
          },
        )}
      >
        <AccordionPrimitive.Trigger
          className='flex min-w-0 flex-1 items-center gap-2'
          disabled={!isSelectable}
          onClick={() => {
            handleExpand(value);
          }}
        >
          {expandedItems?.includes(value)
            ? (openIcon ?? <FolderOpenIcon className='size-4 shrink-0 text-muted-foreground' />)
            : (closeIcon ?? <FolderIcon className='size-4 shrink-0 text-muted-foreground' />)}
          <span className='truncate text-muted-foreground group-hover:text-foreground'>{element}</span>
        </AccordionPrimitive.Trigger>
        <span className='text-muted-foreground opacity-0 group-hover:opacity-100 hover:text-foreground'>{actions}</span>
      </div>
      <AccordionPrimitive.Content className='relative h-full overflow-hidden text-sm data-[state=closed]:animate-accordion-up data-[state=open]:animate-accordion-down'>
        {element && indicator ? <TreeIndicator aria-hidden='true' /> : undefined}
        <AccordionPrimitive.Root
          dir={direction}
          type='multiple'
          className='ml-5 flex flex-col rtl:mr-5'
          defaultValue={expandedItems}
          value={expandedItems}
          onValueChange={(value) => {
            setExpandedItems?.((previous) => [...(previous ?? []), value[0]!]);
          }}
        >
          {children}
        </AccordionPrimitive.Root>
      </AccordionPrimitive.Content>
    </AccordionPrimitive.Item>
  );
}

function File({
  value,
  className,
  handleSelect,
  isSelectable = true,
  isSelect,
  fileIcon,
  actions,
  children,
  ...props
}: {
  readonly value: string;
  readonly handleSelect?: (id: string) => void;
  readonly isSelectable?: boolean;
  readonly isSelect?: boolean;
  readonly fileIcon?: React.ReactNode;
  readonly actions?: React.ReactNode;
  readonly className?: string;
} & React.ButtonHTMLAttributes<HTMLButtonElement>): React.JSX.Element {
  const { direction, selectedId, selectItem } = useTree();
  const isSelected = isSelect ?? selectedId === value;

  // Extract filename from value (path) for FileExtensionIcon
  const filename = value.split('/').pop() ?? value;

  return (
    <div
      className={cn(
        'group relative flex h-7 w-full items-center justify-between gap-2 px-2 text-sm',
        'before:pointer-events-none before:absolute before:inset-y-0 before:right-0 before:-left-96 before:-z-10',
        'hover:before:bg-muted',
        {
          'before:bg-muted': isSelected && isSelectable,
        },
        isSelectable ? 'cursor-pointer' : 'cursor-not-allowed opacity-50',
        direction === 'rtl' ? 'rtl' : 'ltr',
        className,
      )}
    >
      <button
        type='button'
        disabled={!isSelectable}
        className='flex min-w-0 flex-1 items-center gap-2'
        onClick={() => {
          selectItem(value);
        }}
        {...props}
      >
        {fileIcon ?? <FileExtensionIcon filename={filename} className='size-4 shrink-0' />}
        <span className='truncate text-muted-foreground group-hover:text-foreground'>{children}</span>
      </button>
      <span className='text-muted-foreground opacity-0 group-hover:opacity-100 hover:text-foreground'>{actions}</span>
    </div>
  );
}

function CollapseButton({
  className,
  elements,
  isExpanded = false,
  children,
  ...props
}: {
  readonly elements: TreeViewElement[];
  readonly isExpanded?: boolean;
} & React.HTMLAttributes<HTMLButtonElement>): React.JSX.Element {
  const { expandedItems, setExpandedItems } = useTree();

  const expandAllTree = useCallback(
    (elements: TreeViewElement[]) => {
      const expandTree = (element: TreeViewElement) => {
        const isSelectable = element.isSelectable ?? true;
        if (isSelectable && element.children && element.children.length > 0) {
          setExpandedItems?.((previous) => [...(previous ?? []), element.id]);
          for (const child of element.children) {
            expandTree(child);
          }
        }
      };

      for (const element of elements) {
        expandTree(element);
      }
    },
    [setExpandedItems],
  );

  const closeAll = useCallback(() => {
    setExpandedItems?.([]);
  }, [setExpandedItems]);

  useEffect(() => {
    if (isExpanded) {
      expandAllTree(elements);
    }
  }, [isExpanded, expandAllTree, elements]);

  return (
    <Button
      variant='ghost'
      className='absolute right-2 bottom-1 h-7 w-fit p-1'
      onClick={
        expandedItems && expandedItems.length > 0
          ? closeAll
          : () => {
              expandAllTree(elements);
            }
      }
      {...props}
    >
      {children}
      <span className='sr-only'>Toggle</span>
    </Button>
  );
}

CollapseButton.displayName = 'CollapseButton';

export { CollapseButton, File, Folder, Tree, type TreeViewElement };
