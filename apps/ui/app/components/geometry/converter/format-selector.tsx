import { Checkbox } from '@taucad/ui/components/checkbox';
import { Label } from '@taucad/ui/components/label';
import { Button } from '@taucad/ui/components/button';
import { formatDisplayName } from '#components/geometry/converter/converter-utils.js';
import { converterExportFormats, type ConverterExportFormat } from '#routes/convert/converter-runtime.definition.js';

type FormatSelectorProperties = {
  readonly selectedFormats: ConverterExportFormat[];
  readonly onFormatToggle: (format: ConverterExportFormat) => void;
  readonly onClearSelection: () => void;
  readonly headingText?: string;
  readonly clearButtonText?: string;
};

export function FormatSelector({
  selectedFormats,
  onFormatToggle,
  onClearSelection,
  headingText = 'Select formats to convert',
  clearButtonText = 'Reset',
}: FormatSelectorProperties): React.JSX.Element {
  return (
    <div className='space-y-3'>
      <div className='flex min-h-7 flex-row items-center justify-between'>
        <h3 className='text-sm font-medium'>{headingText}</h3>
        {selectedFormats.length > 0 ? (
          <Button variant='ghost' size='xs' onClick={onClearSelection}>
            {clearButtonText}
          </Button>
        ) : undefined}
      </div>
      <div className='space-y-2'>
        {converterExportFormats.map((format) => {
          const isChecked = selectedFormats.includes(format);
          const formatId = `format-${format}`;

          return (
            <div key={format} className='flex items-center space-x-2'>
              <Checkbox
                id={formatId}
                checked={isChecked}
                onCheckedChange={() => {
                  onFormatToggle(format);
                }}
              />
              <Label
                htmlFor={formatId}
                className='cursor-pointer text-sm leading-none font-normal peer-disabled:cursor-not-allowed peer-disabled:opacity-70'
              >
                {formatDisplayName(format)}
              </Label>
            </div>
          );
        })}
      </div>
    </div>
  );
}
