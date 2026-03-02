import { FlaskConical } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '#components/ui/card.js';
import { Switch } from '#components/ui/switch.js';
import { flagRegistry, featureFlagNames } from '#flags/flag.constants.js';
import type { FeatureFlagName } from '#flags/flag.constants.js';
import { useFeatureFlags, useSetFeatureFlag } from '#flags/use-feature.js';

function FlagRow({ flag }: { readonly flag: FeatureFlagName }): React.JSX.Element {
  const flags = useFeatureFlags();
  const setFlag = useSetFeatureFlag();
  const definition = flagRegistry[flag];

  return (
    <div className="flex items-center justify-between gap-4">
      <div className="flex flex-col gap-0.5">
        <span className="text-sm font-medium">{definition.label}</span>
        <span className="text-xs text-muted-foreground">{definition.description}</span>
      </div>
      <Switch
        checked={flags[flag]}
        onCheckedChange={(checked) => {
          setFlag(flag, checked);
        }}
      />
    </div>
  );
}

export function ExperimentalSettings(): React.JSX.Element {
  return (
    <div className="flex flex-col gap-6 pb-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <FlaskConical className="size-4" />
            Feature Flags
          </CardTitle>
          <CardDescription>
            These features are under active development. They may be incomplete or change without notice.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          {featureFlagNames.map((flag) => (
            <FlagRow key={flag} flag={flag} />
          ))}
        </CardContent>
      </Card>
    </div>
  );
}
