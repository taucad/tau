import { supportedExportFormats } from '@taucad/converter';
import type { OutputFormat } from '@taucad/converter';
import { X } from 'lucide-react';
import { Checkbox } from '#components/ui/checkbox.js';
import { Label } from '#components/ui/label.js';
import { Button } from '#components/ui/button.js';
import { formatDisplayName } from '#routes/converter/converter-utils.js';

type FormatSelectorProperties = {
  readonly selectedFormats: OutputFormat[];
  readonly onFormatToggle: (format: OutputFormat) => void;
  readonly onClearSelection: () => void;
};

export function FormatSelector({
  selectedFormats,
  onFormatToggle,
  onClearSelection,
}: FormatSelectorProperties): React.JSX.Element {
  return (
    <div className="space-y-3">
      <div className="flex h-4 items-center justify-between">
        <h3 className="text-sm font-medium">Select formats to convert</h3>
        {selectedFormats.length > 0 ? (
          <Button variant="ghost" size="xs" onClick={onClearSelection}>
            Clear
            <X className="size-3" />
          </Button>
        ) : undefined}
      </div>
      <div className="space-y-2">
        {supportedExportFormats.map((format) => {
          const isChecked = selectedFormats.includes(format);
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
