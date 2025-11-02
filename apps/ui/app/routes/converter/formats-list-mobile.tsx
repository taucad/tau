import type { InputFormat, OutputFormat } from '@taucad/converter';
import { Badge } from '#components/ui/badge.js';

type FormatsListMobileProps = {
  readonly title: string;
  readonly formats: ReadonlyArray<InputFormat | OutputFormat>;
};

export function FormatsListMobile({ title, formats }: FormatsListMobileProps): React.JSX.Element {
  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold">{title}</h3>
        <span className="text-xs text-muted-foreground">{formats.length} formats</span>
      </div>
      <div className="flex flex-wrap gap-2">
        {formats.map((format) => (
          <Badge key={format} variant="secondary" className="px-2.5 py-1 font-mono text-xs">
            {format.toUpperCase()}
          </Badge>
        ))}
      </div>
    </div>
  );
}
