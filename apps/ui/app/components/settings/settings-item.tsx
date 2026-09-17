import type { ComponentProps, ReactNode } from 'react';
import { Card } from '@taucad/ui/components/card';
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
