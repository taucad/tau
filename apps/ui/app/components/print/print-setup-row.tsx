import { MaterialSwatch } from '#components/geometry/cad/material-swatch.js';
import { ModifiedIndicator } from '#components/ui/modified-indicator.js';
import { cn } from '@taucad/ui/utils/cn';

/** Match the Parameters label, control and reset columns in the Print pane. */
export function PrintSetupRow({
  label,
  reading,
  description,
  swatch,
  isModified = false,
  onReset,
  className,
  children,
}: {
  readonly label: string;
  /** What the machine reports now, shown after the label. */
  readonly reading?: string;
  readonly description?: string;
  readonly swatch?: string;
  readonly isModified?: boolean;
  readonly onReset?: () => void;
  readonly className?: string;
  readonly children: React.ReactNode;
}): React.JSX.Element {
  return (
    <div className={cn('group/field @container/parameter flex min-w-0 flex-col gap-0.5 py-1.5', className)}>
      <div className='flex items-center gap-2 @[240px]/parameter:flex-row'>
        <div className='flex min-w-0 shrink-0 items-center gap-1.5 @[240px]/parameter:w-[40%]'>
          <span
            className={cn(
              'flex min-w-0 items-center gap-1.5 truncate text-sm',
              isModified ? 'font-medium text-foreground' : 'font-normal text-muted-foreground',
            )}
          >
            {swatch === undefined ? null : (
              <MaterialSwatch materials={[{ color: swatch, roughness: 0.35, metalness: 0 }]} />
            )}
            <span className='truncate'>{label}</span>
            {reading === undefined ? null : (
              <span className='shrink-0 text-xs text-muted-foreground/70 tabular-nums'>{reading}</span>
            )}
          </span>
          {isModified && onReset ? <ModifiedIndicator onReset={onReset} tooltip={`Reset ${label}`} /> : null}
        </div>
        <div className='flex min-w-0 flex-1 items-center justify-end gap-2'>{children}</div>
      </div>
      {description ? <div className='text-xs text-muted-foreground/70'>{description}</div> : null}
    </div>
  );
}
