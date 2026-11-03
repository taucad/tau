import { useId } from 'react';
import type { ComponentProps, ReactNode } from 'react';
import { Info } from 'lucide-react';
import { Card } from '@taucad/ui/components/card';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@taucad/ui/components/tooltip';
import { cn } from '@taucad/ui/utils/cn';
import type { SettingId } from '#components/settings/settings-registry.js';
import { settingsSections } from '#components/settings/settings-registry.js';

type SettingsItemProps = {
  readonly settingId: SettingId;
  readonly children: ReactNode;
  readonly className?: string;
};

/**
 * An explicit, focusable destination for a registered setting.
 *
 * The registry is the single source of truth for which settings exist in this
 * deployment, so a setting it filters out (Tau Cloud entries in a self-hosted
 * build) renders nothing instead of crashing the panel. Unknown ids are a
 * compile error via `SettingId`.
 */
export function SettingsItem({ settingId, children, className }: SettingsItemProps): React.JSX.Element | undefined {
  const definition = settingsSections.flatMap((section) => section.entries).find((entry) => entry.id === settingId);
  if (!definition) {
    return undefined;
  }
  return (
    <section
      id={`settings-${settingId}`}
      data-slot='settings-item'
      aria-label={definition.label}
      tabIndex={-1}
      className={cn('relative scroll-m-4 rounded-lg focus-visible:focus-outline', className)}
    >
      {children}
    </section>
  );
}

/** Marks a top-level settings section without restyling nested product cards. */
export function SettingsSectionCard(properties: ComponentProps<typeof Card>): React.JSX.Element {
  return <Card data-settings-section {...properties} />;
}

/**
 * A titled group of setting rows: an optional heading above one bordered card whose rows are divided by rules.
 *
 * @param props - The group heading, an optional control beside it, and its rows.
 * @returns The group.
 */
export function SettingsGroup({
  title,
  info,
  action,
  children,
  className,
}: {
  readonly title?: string;
  /** Detail about the whole group, shown from an info glyph beside its heading. */
  readonly info?: ReactNode;
  readonly action?: ReactNode;
  readonly children: ReactNode;
  readonly className?: string;
}): React.JSX.Element {
  return (
    <div className={cn('flex flex-col gap-3', className)}>
      {title === undefined ? undefined : (
        <div className='flex min-h-8 items-center justify-between gap-4'>
          <div className='flex items-center gap-1.5'>
            <h2 className='text-sm font-medium'>{title}</h2>
            {info === undefined ? undefined : <SettingsInfo label={title}>{info}</SettingsInfo>}
          </div>
          {action}
        </div>
      )}
      <div
        data-slot='settings-group'
        className='flex flex-col rounded-xl border bg-card px-4 [&>*]:rounded-none [&>*:not(:first-child)]:border-t'
      >
        {children}
      </div>
    </div>
  );
}

/**
 * The detail behind a setting, one focusable glyph away, so the row itself stays one short line.
 *
 * @param props - What the tooltip explains, and the label naming its subject.
 * @returns The glyph and its tooltip.
 */
export function SettingsInfo({
  label,
  children,
}: {
  readonly label: string;
  readonly children: ReactNode;
}): React.JSX.Element {
  return (
    // Its own provider, so the row renders the same inside or outside the app shell.
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <button
            type='button'
            aria-label={`About ${label.toLowerCase()}`}
            className='inline-flex size-5 shrink-0 items-center justify-center rounded-sm text-muted-foreground hover:text-foreground focus-visible:focus-outline'
          >
            <Info className='size-3.5' />
          </button>
        </TooltipTrigger>
        <TooltipContent side='bottom' className='max-w-80 space-y-1.5 p-3 text-left'>
          {children}
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}

type SettingsRowProps = {
  /** Registers the row as a search destination. */
  readonly settingId?: SettingId;
  readonly title: ReactNode;
  /** One short sentence; anything longer belongs in `info`. */
  readonly description?: ReactNode;
  /** Detail shown from an info glyph beside the title. */
  readonly info?: ReactNode;
  /** The control on the right: a switch, select or button. */
  readonly control?: ReactNode;
  /** Content under the title, such as a status line or an inline list. */
  readonly children?: ReactNode;
  readonly className?: string;
};

/**
 * One setting: a title and a short description on the left, its control on the right.
 *
 * @param props - The setting's copy and control.
 * @returns The row, wrapped as a search destination when `settingId` is given.
 */
export function SettingsRow({
  settingId,
  title,
  description,
  info,
  control,
  children,
  className,
}: SettingsRowProps): React.JSX.Element | undefined {
  const id = useId();
  // The row is a group named by its title and described by its description, so the control is announced in context.
  const row = (
    <div
      role='group'
      aria-labelledby={`${id}-title`}
      aria-describedby={description === undefined ? undefined : `${id}-description`}
      className={cn('flex flex-col gap-2 py-3.5', className)}
    >
      <div className='flex items-center justify-between gap-4'>
        <div className='flex min-w-0 flex-col gap-0.5'>
          <div className='flex items-center gap-1.5 text-sm font-medium'>
            <span id={`${id}-title`} className='flex min-w-0 items-center gap-2'>
              {title}
            </span>
            {info === undefined || typeof title !== 'string' ? undefined : (
              <SettingsInfo label={title}>{info}</SettingsInfo>
            )}
          </div>
          {description === undefined ? undefined : (
            <div id={`${id}-description`} className='text-xs text-muted-foreground'>
              {description}
            </div>
          )}
        </div>
        {control === undefined ? undefined : <div className='flex shrink-0 items-center gap-2'>{control}</div>}
      </div>
      {children}
    </div>
  );
  return settingId === undefined ? row : <SettingsItem settingId={settingId}>{row}</SettingsItem>;
}
