import { useCallback, useState } from 'react';
import { MessageSquare, Camera, AlertCircle, Folder, Blocks, X, Box } from 'lucide-react';
import { FileExtensionIcon } from '#components/icons/file-extension-icon.js';
import { cn } from '#utils/ui.utils.js';

export type ChipType = 'file' | 'folder' | 'chat' | 'screenshot' | 'code' | 'skill' | 'geometry';

const chipTypeIcons: Record<Exclude<ChipType, 'file'>, React.ComponentType<{ className?: string }>> = {
  folder: Folder,
  chat: MessageSquare,
  screenshot: Camera,
  code: AlertCircle,
  skill: Blocks,
  geometry: Box,
};

const chipColorClass: Record<ChipType, { base: string; hover: string }> = {
  file: { base: 'bg-purple/10 text-purple', hover: 'hover:bg-purple/15' },
  folder: { base: 'bg-purple/10 text-purple', hover: 'hover:bg-purple/15' },
  skill: { base: 'bg-yellow/10 text-yellow', hover: 'hover:bg-yellow/15' },
  chat: { base: 'bg-primary/10 text-primary', hover: 'hover:bg-primary/15' },
  screenshot: { base: 'bg-primary/10 text-primary', hover: 'hover:bg-primary/15' },
  code: { base: 'bg-primary/10 text-primary', hover: 'hover:bg-primary/15' },
  geometry: { base: 'bg-primary/10 text-primary', hover: 'hover:bg-primary/15' },
};

type ContextChipProps = React.ComponentPropsWithRef<'span'> & {
  readonly label: string;
  readonly chipType: ChipType;
  /** When provided, hovering swaps the type icon for an X button that calls this handler. */
  readonly onRemove?: () => void;
  /** Enables pointer cursor and hover background highlight (for clickable chips). */
  readonly isInteractive?: boolean;
};

export function ContextChip({
  label,
  chipType,
  onRemove,
  isInteractive = false,
  className,
  ref,
  ...rest
}: ContextChipProps): React.JSX.Element {
  const [hovered, setHovered] = useState(false);
  const Icon = chipType === 'file' ? undefined : chipTypeIcons[chipType];

  const handleRemove = useCallback(
    (event: React.MouseEvent) => {
      event.preventDefault();
      event.stopPropagation();
      onRemove?.();
    },
    [onRemove],
  );

  const showRemoveButton = onRemove && hovered;

  const iconElement = showRemoveButton ? (
    <button
      type='button'
      className='flex size-2.5 shrink-0 items-center justify-center'
      onClick={handleRemove}
      aria-label='Remove'
    >
      <X className='size-2.5' />
    </button>
  ) : Icon ? (
    <Icon className='size-2.5 shrink-0' />
  ) : (
    <FileExtensionIcon filename={label} className='size-2.5 shrink-0' />
  );

  const hoverProps = onRemove
    ? {
        onMouseEnter: () => {
          setHovered(true);
        },
        onMouseLeave: () => {
          setHovered(false);
        },
      }
    : undefined;

  return (
    <span
      ref={ref}
      className={cn(
        'inline-flex items-center gap-0.5 rounded-xs px-1.5 py-px text-xs',
        chipColorClass[chipType].base,
        isInteractive ? `cursor-pointer ${chipColorClass[chipType].hover}` : 'cursor-default',
        className,
      )}
      {...hoverProps}
      {...rest}
    >
      {iconElement}
      <span className='max-w-35 truncate'>{label}</span>
    </span>
  );
}
