import { useCallback } from 'react';
import { Check } from 'lucide-react';
import type { FileExtension } from '@taucad/types';
import { Button } from '#components/ui/button.js';
import { FileExtensionIcon } from '#components/icons/file-extension-icon.js';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '#components/ui/tooltip.js';
import { menuItemVariants } from '#components/ui/menu.variants.js';
import { groupExportFormatsByFidelity } from '#components/files/export-format-groups.js';
import type { FormatEntry } from '#routes/projects_.$id/export-formats.utils.js';
import { getFormatInfo } from '#routes/projects_.$id/export-formats.utils.js';
import { cn } from '#utils/ui.utils.js';

const formatGridCols = 'grid grid-cols-1 gap-1.5 @[10rem]:grid-cols-2 @[16rem]:grid-cols-3';

function ExportFormatButton({
  format,
  isDirect,
  isExporting,
  onSelectFormat,
}: {
  readonly format: FileExtension;
  readonly isDirect: boolean;
  readonly isExporting: boolean;
  readonly onSelectFormat: (format: FileExtension) => void;
}) {
  const info = getFormatInfo(format);
  const handleClick = useCallback(() => {
    onSelectFormat(format);
  }, [format, onSelectFormat]);

  const button = (
    <Button
      variant='outline'
      size='xs'
      disabled={isExporting}
      className='justify-start uppercase hover:border-primary/50'
      onClick={handleClick}
    >
      <FileExtensionIcon filename={`file.${format}`} className='size-3.5 shrink-0' />
      <span className='flex-1 text-left'>{format}</span>
    </Button>
  );

  if (!info) {
    return button;
  }

  return (
    <Tooltip>
      <TooltipTrigger asChild>{button}</TooltipTrigger>
      <TooltipContent side='right' className='max-w-56'>
        <p className='font-semibold'>{info.name}</p>
        <p className='mt-0.5 text-[10px] leading-snug text-white/70'>{info.description}</p>
        {!isDirect && <p className='mt-1 text-[10px] text-white/50 italic'>Transcoded</p>}
      </TooltipContent>
    </Tooltip>
  );
}

export type ExportFormatLayout = 'grid' | 'list';

export type ExportFormatGridProps = {
  readonly formats: FormatEntry[];
  readonly isExporting: boolean;
  readonly onSelectFormat: (format: FileExtension) => void;
  readonly layout?: ExportFormatLayout;
  readonly selectedFormat?: FileExtension;
};

function ExportFormatListItem({
  format,
  isDirect,
  isExporting,
  isSelected,
  onSelectFormat,
}: {
  readonly format: FileExtension;
  readonly isDirect: boolean;
  readonly isExporting: boolean;
  readonly isSelected: boolean;
  readonly onSelectFormat: (format: FileExtension) => void;
}): React.JSX.Element {
  const info = getFormatInfo(format);
  const handleClick = useCallback(() => {
    onSelectFormat(format);
  }, [format, onSelectFormat]);

  const row = (
    <button
      type='button'
      disabled={isExporting}
      className={cn(menuItemVariants({ highlight: 'selected' }), 'h-auto w-full uppercase')}
      onClick={handleClick}
    >
      <FileExtensionIcon filename={`file.${format}`} className='size-3.5 shrink-0' />
      <span className='flex-1 text-left'>{format}</span>
      {isSelected ? <Check className='size-3.5 shrink-0' /> : null}
    </button>
  );

  if (!info) {
    return row;
  }

  return (
    <Tooltip>
      <TooltipTrigger asChild>{row}</TooltipTrigger>
      <TooltipContent side='right' className='max-w-56'>
        <p className='font-semibold'>{info.name}</p>
        <p className='mt-0.5 text-[10px] leading-snug text-white/70'>{info.description}</p>
        {!isDirect && <p className='mt-1 text-[10px] text-white/50 italic'>Transcoded</p>}
      </TooltipContent>
    </Tooltip>
  );
}

function ExportFormatSection({
  title,
  formats,
  isExporting,
  layout,
  selectedFormat,
  onSelectFormat,
}: {
  readonly title: string;
  readonly formats: FormatEntry[];
  readonly isExporting: boolean;
  readonly layout: ExportFormatLayout;
  readonly selectedFormat?: FileExtension;
  readonly onSelectFormat: (format: FileExtension) => void;
}): React.JSX.Element {
  return (
    <div>
      <p className='mb-1.5 text-[10px] font-semibold tracking-wider text-muted-foreground uppercase'>{title}</p>
      {layout === 'grid' ? (
        <div className={formatGridCols}>
          {formats.map(({ format, direct }) => (
            <ExportFormatButton
              key={format}
              format={format}
              isDirect={direct}
              isExporting={isExporting}
              onSelectFormat={onSelectFormat}
            />
          ))}
        </div>
      ) : (
        <div className='flex flex-col gap-0.5'>
          {formats.map(({ format, direct }) => (
            <ExportFormatListItem
              key={format}
              format={format}
              isDirect={direct}
              isExporting={isExporting}
              isSelected={selectedFormat === format}
              onSelectFormat={onSelectFormat}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function ExportFormatSections({
  formats,
  isExporting,
  layout,
  selectedFormat,
  onSelectFormat,
}: {
  readonly formats: FormatEntry[];
  readonly isExporting: boolean;
  readonly layout: ExportFormatLayout;
  readonly selectedFormat?: FileExtension;
  readonly onSelectFormat: (format: FileExtension) => void;
}): React.JSX.Element {
  const groups = groupExportFormatsByFidelity(formats);

  return (
    <div className='flex flex-col gap-3'>
      {groups.map(({ name, items }) => (
        <ExportFormatSection
          key={name}
          title={name}
          formats={items}
          isExporting={isExporting}
          layout={layout}
          selectedFormat={selectedFormat}
          onSelectFormat={onSelectFormat}
        />
      ))}
    </div>
  );
}

/**
 * Pure presentational grid/list that groups available export formats into MESH and BREP
 * sections. Click semantics are owned by the caller via `onSelectFormat`; controls
 * disable while `isExporting` is true.
 */
export function ExportFormatGrid({
  formats,
  isExporting,
  onSelectFormat,
  layout = 'grid',
  selectedFormat,
}: ExportFormatGridProps): React.JSX.Element {
  return (
    <TooltipProvider>
      <div className='@container'>
        <ExportFormatSections
          formats={formats}
          isExporting={isExporting}
          layout={layout}
          selectedFormat={selectedFormat}
          onSelectFormat={onSelectFormat}
        />
      </div>
    </TooltipProvider>
  );
}
