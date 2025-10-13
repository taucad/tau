import { supportedExportFormats } from '@taucad/converter';
import type { OutputFormat } from '@taucad/converter';
import { Checkbox } from '#components/ui/checkbox.js';
import { Label } from '#components/ui/label.js';
import { formatDisplayName } from '#routes/converter/converter-utils.js';

type FormatSelectorProperties = {
  readonly selectedFormats: Set<OutputFormat>;
  readonly onFormatToggle: (format: OutputFormat) => void;
};

export function FormatSelector({ selectedFormats, onFormatToggle }: FormatSelectorProperties): React.JSX.Element {
  return (
    <div className="space-y-3">
      <div className="text-sm font-medium">Select formats to convert:</div>
      <div className="space-y-2">
        {supportedExportFormats.map((format) => {
          const isChecked = selectedFormats.has(format);
          const formatId = `format-${format}`;

          return (
            <div key={format} className="flex items-center space-x-2">
              <Checkbox
                id={formatId}
                checked={isChecked}
                onCheckedChange={() => {
                  onFormatToggle(format);
                }}
              />
              <Label
                htmlFor={formatId}
                className="cursor-pointer text-sm leading-none font-normal peer-disabled:cursor-not-allowed peer-disabled:opacity-70"
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
