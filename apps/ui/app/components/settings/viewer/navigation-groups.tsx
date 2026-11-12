/**
 * The Navigation and Gizmo groups (onboarding blueprint, Finding 6 and Finding 7, V2 and V3). The mouse preset and
 * gizmo style follow the tool answer's suggestion until the person chooses one, and Reset returns them to it. The
 * trackpad switch is this device's; the three toggles show their built-in values until set. Every open viewer reads
 * the same records, so a change applies without a reload. "Show gizmo" is the View defaults row: a style change never
 * touches it, and it never touches the style.
 */
import { Badge } from '@taucad/ui/components/badge';
import { ModifiedIndicator } from '@taucad/ui/components/modified-indicator';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@taucad/ui/components/select';
import { Switch } from '@taucad/ui/components/switch';
import {
  effectiveGizmoStyle,
  effectivePreset,
  gizmoStyleIds,
  mousePresetIds,
  resetLeaf,
  suggestedGizmo,
  suggestedPreset,
} from '@taucad/preferences';
import type {
  DeviceRecord,
  GizmoStyleId,
  LeafPatch,
  MousePresetId,
  PersonProfile,
  ViewerPreferences,
} from '@taucad/preferences';
import { SettingsGroup, SettingsRow } from '#components/settings/settings-item.js';
import {
  gizmoStyleCopy,
  linuxAltNote,
  mousePresetCopy,
  resetToSuggestion,
  resetToTauDefault,
  suggestedLabel,
  thisDeviceLabel,
  viewerControlCopy,
} from '#components/settings/viewer/viewer-settings-copy.js';
import { setViewerPersonProperties } from '#components/settings/viewer/viewer-person-properties.js';
import { useAnalytics } from '#hooks/use-analytics.js';
import type { SectionWriteResult } from '#preferences/section-store.js';
import { useOnboardingTelemetry } from '#telemetry/onboarding-telemetry.js';
import { osClass } from '#telemetry/platform-class.js';

type ViewerWrites = Readonly<{
  profile: PersonProfile;
  viewer: ViewerPreferences;
  device: DeviceRecord;
  writeViewer: (patch: LeafPatch<ViewerPreferences>) => SectionWriteResult;
  writeDevice: (patch: LeafPatch<DeviceRecord>) => SectionWriteResult;
  onWrite: (result: SectionWriteResult) => void;
}>;

/** An option's name, with the suggestion marked. */
function OptionLabel({
  name,
  isSuggested,
}: {
  readonly name: string;
  readonly isSuggested: boolean;
}): React.JSX.Element {
  return (
    <span className='flex min-w-0 items-center gap-2'>
      <span className='truncate'>{name}</span>
      {isSuggested ? (
        <Badge variant='secondary' className='shrink-0'>
          {suggestedLabel}
        </Badge>
      ) : undefined}
    </span>
  );
}

/**
 * The Navigation group.
 *
 * @param props - The records, their writers and where to report what each write did.
 * @returns The group.
 */
export function NavigationGroup({
  profile,
  viewer,
  device,
  writeViewer,
  writeDevice,
  onWrite,
}: ViewerWrites): React.JSX.Element {
  const telemetry = useOnboardingTelemetry();
  const analytics = useAnalytics();
  const suggestion = suggestedPreset(profile.tool);
  const preset = effectivePreset(viewer, profile);
  const isTrackpad = device.inputDevice === 'trackpad';
  const { controls } = viewer;

  const choosePreset = (next: MousePresetId): void => {
    onWrite(writeViewer({ controls: { preset: next } }));
    telemetry.viewerPresetSelected({ preset: next, suggested: next === suggestion, source: 'settings' });
    setViewerPersonProperties(analytics, { mousePreset: next });
  };
  const resetPreset = (): void => {
    onWrite(writeViewer({ controls: { preset: resetLeaf } }));
    setViewerPersonProperties(analytics, { mousePreset: suggestion });
  };
  const toggle = (leaf: 'zoomToCursor' | 'orbitAboutCursor' | 'invertZoom') => (checked: boolean) => {
    onWrite(writeViewer({ controls: { [leaf]: checked } }));
  };

  return (
    <SettingsGroup title='Navigation'>
      <SettingsRow
        settingId='viewer-mouse-controls'
        title={viewerControlCopy.mouseControls.title}
        description={viewerControlCopy.mouseControls.description}
        control={
          <>
            {controls.preset === undefined ? undefined : (
              <ModifiedIndicator
                tooltip={profile.tool === undefined ? resetToTauDefault : resetToSuggestion}
                onReset={resetPreset}
              />
            )}
            <Select
              size='sm'
              value={preset}
              onValueChange={(next) => {
                const id = mousePresetIds.find((each) => each === next);
                if (id !== undefined) {
                  choosePreset(id);
                }
              }}
            >
              <SelectTrigger className='w-64 max-w-full' aria-label={viewerControlCopy.mouseControls.title}>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {mousePresetIds.map((id) => (
                  <SelectItem key={id} value={id} textValue={mousePresetCopy[id].name}>
                    <OptionLabel name={mousePresetCopy[id].name} isSuggested={id === suggestion} />
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </>
        }
      >
        {preset === 'alt' && osClass() === 'linux' ? (
          <p className='text-xs text-muted-foreground' data-testid='viewer-linux-alt-note'>
            {linuxAltNote}
          </p>
        ) : undefined}
      </SettingsRow>
      <SettingsRow
        settingId='viewer-trackpad-gestures'
        title={viewerControlCopy.trackpadGestures.title}
        description={viewerControlCopy.trackpadGestures.description}
        control={
          <>
            <Badge variant='outline'>{thisDeviceLabel}</Badge>
            <Switch
              aria-label={viewerControlCopy.trackpadGestures.title}
              checked={isTrackpad}
              onCheckedChange={(checked) => {
                const inputDevice = checked ? 'trackpad' : 'mouse';
                onWrite(writeDevice({ inputDevice }));
                setViewerPersonProperties(analytics, { inputDevice });
              }}
            />
          </>
        }
      />
      <SettingsRow
        settingId='viewer-zoom-to-cursor'
        title={viewerControlCopy.zoomToCursor.title}
        description={viewerControlCopy.zoomToCursor.description}
        control={
          <Switch
            aria-label={viewerControlCopy.zoomToCursor.title}
            checked={controls.zoomToCursor ?? true}
            onCheckedChange={toggle('zoomToCursor')}
          />
        }
      />
      <SettingsRow
        settingId='viewer-orbit-around-cursor'
        title={viewerControlCopy.orbitAroundCursor.title}
        description={viewerControlCopy.orbitAroundCursor.description}
        control={
          <Switch
            aria-label={viewerControlCopy.orbitAroundCursor.title}
            checked={controls.orbitAboutCursor ?? false}
            onCheckedChange={toggle('orbitAboutCursor')}
          />
        }
      />
      <SettingsRow
        settingId='viewer-invert-zoom'
        title={viewerControlCopy.invertZoom.title}
        description={viewerControlCopy.invertZoom.description}
        control={
          <Switch
            aria-label={viewerControlCopy.invertZoom.title}
            checked={controls.invertZoom ?? false}
            onCheckedChange={toggle('invertZoom')}
          />
        }
      />
    </SettingsGroup>
  );
}

/**
 * The Gizmo group.
 *
 * @param props - The records, their writers and where to report what each write did.
 * @returns The group.
 */
export function GizmoGroup({
  profile,
  viewer,
  writeViewer,
  onWrite,
}: Pick<ViewerWrites, 'profile' | 'viewer' | 'writeViewer' | 'onWrite'>): React.JSX.Element {
  const telemetry = useOnboardingTelemetry();
  const analytics = useAnalytics();
  const suggestion = suggestedGizmo(profile.tool);
  const style = effectiveGizmoStyle(viewer, profile);

  const chooseStyle = (next: GizmoStyleId): void => {
    onWrite(writeViewer({ gizmo: { style: next } }));
    telemetry.viewerGizmoSelected({ style: next, suggested: next === suggestion, source: 'settings' });
    setViewerPersonProperties(analytics, { gizmoStyle: next });
  };
  const resetStyle = (): void => {
    onWrite(writeViewer({ gizmo: { style: resetLeaf } }));
    setViewerPersonProperties(analytics, { gizmoStyle: suggestion });
  };

  return (
    <SettingsGroup title='Gizmo'>
      <SettingsRow
        settingId='viewer-gizmo-style'
        title={viewerControlCopy.gizmoStyle.title}
        description={viewerControlCopy.gizmoStyle.description}
        control={
          <>
            {viewer.gizmo.style === undefined ? undefined : (
              <ModifiedIndicator
                tooltip={profile.tool === undefined ? resetToTauDefault : resetToSuggestion}
                onReset={resetStyle}
              />
            )}
            <Select
              size='sm'
              value={style}
              onValueChange={(next) => {
                const id = gizmoStyleIds.find((each) => each === next);
                if (id !== undefined) {
                  chooseStyle(id);
                }
              }}
            >
              <SelectTrigger className='w-64 max-w-full' aria-label={viewerControlCopy.gizmoStyle.title}>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {gizmoStyleIds.map((id) => (
                  <SelectItem key={id} value={id} textValue={gizmoStyleCopy[id].name}>
                    <OptionLabel name={gizmoStyleCopy[id].name} isSuggested={id === suggestion} />
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </>
        }
      />
    </SettingsGroup>
  );
}
