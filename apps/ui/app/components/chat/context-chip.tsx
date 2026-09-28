import { useCallback, useState } from 'react';
import { MessageSquare, Camera, Folder, Blocks, X, Box, FileX } from 'lucide-react';
import { Tooltip, TooltipContent, TooltipTrigger } from '@taucad/ui/components/tooltip';
import { FileExtensionIcon } from '#components/icons/file-extension-icon.js';
import { cn } from '@taucad/ui/utils/cn';

export type ChipType = 'file' | 'folder' | 'chat' | 'screenshot' | 'skill' | 'geometry';

const chipTypeIcons: Record<Exclude<ChipType, 'file'>, React.ComponentType<{ className?: string }>> = {
  folder: Folder,
  chat: MessageSquare,
  screenshot: Camera,
  skill: Blocks,
  geometry: Box,
};

/**
 * Shorten a file name in the middle so its extension survives:
 * `turbofan-housing-assembly-rev-c.step` → `turbofan-hou…rev-c.step`.
 */
export function middleTruncate(name: string, maximum = 24): string {
  if (name.length <= maximum) {
    return name;
  }
  const dot = name.lastIndexOf('.');
  const extension = dot > 0 ? name.slice(dot) : '';
  const stem = dot > 0 ? name.slice(0, dot) : name;
  const room = Math.max(maximum - extension.length - 1, 2);
  const head = Math.ceil(room * 0.55);
  return `${stem.slice(0, head)}…${stem.slice(stem.length - (room - head))}${extension}`;
}

type ContextChipProps = React.ComponentPropsWithRef<'span'> & {
  readonly label: string;
  readonly chipType: ChipType;
  /** When provided, hovering swaps the type icon for an X button that calls this handler. */
  readonly onRemove?: () => void;
  /** Enables the hover background used by clickable chips. */
  readonly isInteractive?: boolean;
  /** The composer's node selection: what Backspace would delete. */
  readonly isSelected?: boolean;
  /** The referenced file or folder no longer exists. */
  readonly isMissing?: boolean;
  /** A muted suffix that tells two same-named chips apart (the parent folder). */
  readonly detail?: string;
  /** Shown on hover: the full path, or why the chip is missing. */
  readonly tooltip?: string;
};

/**
 * One inline reference chip for the composer and the transcript. Neutral by
 * design (composer chip audit, finish A): a quiet foreground-tinted fill and a
 * foreground label; the kind is carried by the glyph alone, and file-type icons
 * render in greyscale like the composer bar's kernel icon.
 */
export function ContextChip({
  label,
  chipType,
  onRemove,
  isInteractive = false,
  isSelected = false,
  isMissing = false,
  detail,
  tooltip,
  className,
  ref,
  ...rest
}: ContextChipProps): React.JSX.Element {
  const [hovered, setHovered] = useState(false);
  const Icon = isMissing ? FileX : chipType === 'file' ? undefined : chipTypeIcons[chipType];

  const handleRemove = useCallback(
    (event: React.MouseEvent) => {
      event.preventDefault();
      event.stopPropagation();
      onRemove?.();
    },
    [onRemove],
  );

  const showRemoveButton = onRemove && hovered;

  /* The remove button takes the glyph's place, so hovering never shifts the line. */
  const iconElement = showRemoveButton ? (
    <button
      type='button'
      className='flex size-3.5 shrink-0 items-center justify-center rounded-xs text-muted-foreground hover:text-foreground'
      onClick={handleRemove}
      aria-label='Remove'
    >
      <X className='size-3' />
    </button>
  ) : Icon ? (
    <Icon className='size-3.5 shrink-0 text-muted-foreground' />
  ) : (
    <FileExtensionIcon filename={label} className='size-3.5 shrink-0 grayscale' />
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

  const shownLabel = chipType === 'file' || chipType === 'folder' ? middleTruncate(label) : label;

  const chip = (
    <span
      ref={ref}
      data-selected={isSelected || undefined}
      className={cn(
        'inline-flex h-5 max-w-[min(16rem,100%)] items-center gap-1 rounded-sm px-1.5 align-middle text-xs leading-5 text-foreground',
        'bg-foreground/10 transition-colors duration-100 motion-reduce:transition-none',
        isInteractive || onRemove ? 'hover:bg-foreground/20' : 'cursor-default',
        isSelected && 'bg-foreground/20 ring-1 ring-ring',
        className,
      )}
      {...hoverProps}
      {...rest}
    >
      {iconElement}
      <span className={cn('min-w-0 truncate', isMissing && 'text-muted-foreground line-through')}>{shownLabel}</span>
      {/* The folder hint gives way before the file name does. */}
      {detail === undefined ? null : (
        <span className='min-w-0 shrink-[4] truncate text-muted-foreground'>{detail}/</span>
      )}
    </span>
  );

  if (tooltip === undefined) {
    return chip;
  }

  return (
    <Tooltip>
      <TooltipTrigger asChild>{chip}</TooltipTrigger>
      <TooltipContent side='top' className='font-mono text-xs'>
        {tooltip}
      </TooltipContent>
    </Tooltip>
  );
}
