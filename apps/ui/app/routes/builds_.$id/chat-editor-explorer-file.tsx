import { File } from '#components/magicui/file-tree.js';
import { cn } from '#utils/ui.js';

type ExplorerFileProps = {
  readonly id: string;
  readonly name: string;
  readonly icon: React.ReactNode;
  readonly isSelected: boolean;
  readonly onClick: () => void;
};

export function ExplorerFile({ id, name, icon, isSelected, onClick }: ExplorerFileProps): React.JSX.Element {
  return (
    <File
      value={id}
      fileIcon={icon}
      isSelect={isSelected}
      className={cn(
        'w-full justify-start px-2 py-1 text-sm text-sidebar-foreground',
        'data-[selected=true]:text-sidebar-accent-foreground',
      )}
      data-selected={isSelected}
      onClick={onClick}
    >
      <span className="truncate">{name}</span>
    </File>
  );
}

