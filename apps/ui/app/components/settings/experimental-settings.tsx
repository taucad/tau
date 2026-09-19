import { SettingsItem, SettingsSectionCard } from '#components/settings/settings-item.js';
import { FlaskConical } from 'lucide-react';
import { CardContent, CardHeader, CardTitle } from '@taucad/ui/components/card';
import { Switch } from '@taucad/ui/components/switch';
import { flagRegistry, featureFlagNames } from '#flags/flag.constants.js';
import type { FeatureFlagName } from '#flags/flag.constants.js';
import { useFeatureFlags, useSetFeatureFlag } from '#flags/use-feature.js';

function FlagRow({ flag }: { readonly flag: FeatureFlagName }): React.JSX.Element {
  const flags = useFeatureFlags();
  const setFlag = useSetFeatureFlag();
  const definition = flagRegistry[flag];

  return (
    <SettingsItem settingId={`flag-${flag}`} className='flex items-center justify-between gap-4'>
      <div className='flex flex-col gap-0.5'>
        <span className='text-sm font-medium'>{definition.label}</span>
        <span className='text-xs text-muted-foreground'>{definition.description}</span>
      </div>
      <Switch
        aria-label={definition.label}
        checked={flags[flag]}
        onCheckedChange={(checked) => {
          setFlag(flag, checked);
        }}
      />
    </SettingsItem>
  );
}

export function ExperimentalSettings(): React.JSX.Element {
  return (
    <div className='flex flex-col gap-6 pb-6'>
      <SettingsSectionCard>
        <CardHeader>
          <CardTitle className='flex items-center gap-2'>
            <FlaskConical className='size-4' />
            Feature Flags
          </CardTitle>
        </CardHeader>
        <CardContent className='flex flex-col gap-4'>
          {featureFlagNames.map((flag) => (
            <FlagRow key={flag} flag={flag} />
          ))}
        </CardContent>
      </SettingsSectionCard>
    </div>
  );
}
