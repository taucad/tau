import { useId } from 'react';
import { SettingsGroup, SettingsItem, SettingsRow } from '#components/settings/settings-item.js';
import type { SettingId } from '#components/settings/settings-registry.js';
import { Switch } from '@taucad/ui/components/switch';
import { useCookie } from '#hooks/use-cookie.js';
import { cookieName } from '#constants/cookie.constants.js';
import { tauCloudEnabled } from '#cloud/cloud-enabled.js';
import { DefaultPermissionsSetting } from '#components/settings/default-permissions-setting.js';
import { desktopPermissions } from '#filesystem/desktop-permissions.js';

function SwitchSetting({
  settingId,
  title,
  description,
  isChecked,
  onIsCheckedChange,
}: {
  readonly settingId: SettingId;
  readonly title: string;
  readonly description: string;
  readonly isChecked: boolean;
  readonly onIsCheckedChange: (isChecked: boolean) => void;
}): React.JSX.Element | undefined {
  const id = useId();
  // The row's text labels the switch, so the whole row is its target: the bare switch alone is too small to tap.
  return (
    <SettingsRow
      settingId={settingId}
      title={
        <label htmlFor={id} className='cursor-action'>
          {title}
        </label>
      }
      description={
        <label htmlFor={id} className='cursor-action'>
          {description}
        </label>
      }
      control={<Switch id={id} aria-label={title} checked={isChecked} onCheckedChange={onIsCheckedChange} />}
    />
  );
}

export function AgentSettings(): React.JSX.Element {
  const [showCredits, setShowCredits] = useCookie(cookieName.chatModelCost, true);
  const [includeFileSystem, setIncludeFileSystem] = useCookie(cookieName.chatCtxFs, true);
  const [includeActiveFile, setIncludeActiveFile] = useCookie(cookieName.chatCtxActive, true);
  const [includeOpenFiles, setIncludeOpenFiles] = useCookie(cookieName.chatCtxOpen, true);
  const [testingEnabled, setTestingEnabled] = useCookie(cookieName.chatTestingEnabled, true);

  return (
    <div className='flex flex-col gap-6 pb-6'>
      <SettingsGroup title='Chat'>
        {tauCloudEnabled ? (
          <SwitchSetting
            settingId='show-credits'
            title='Show credits'
            description='Show the credits each message used.'
            isChecked={showCredits}
            onIsCheckedChange={setShowCredits}
          />
        ) : null}
        <SwitchSetting
          settingId='testing-tools'
          title='Testing tools'
          description='Let the agent run and edit tests.'
          isChecked={testingEnabled}
          onIsCheckedChange={setTestingEnabled}
        />
      </SettingsGroup>

      <SettingsGroup title='Context'>
        <SwitchSetting
          settingId='filesystem-context'
          title='Project files'
          description='Include the project file tree.'
          isChecked={includeFileSystem}
          onIsCheckedChange={setIncludeFileSystem}
        />
        <SwitchSetting
          settingId='active-file'
          title='Active file'
          description='Include the file you are editing.'
          isChecked={includeActiveFile}
          onIsCheckedChange={setIncludeActiveFile}
        />
        <SwitchSetting
          settingId='open-tabs'
          title='Open tabs'
          description='Include every open editor tab.'
          isChecked={includeOpenFiles}
          onIsCheckedChange={setIncludeOpenFiles}
        />
      </SettingsGroup>

      {desktopPermissions() === undefined ? null : (
        <SettingsItem settingId='default-permissions'>
          <SettingsGroup title='Permissions'>
            <DefaultPermissionsSetting />
          </SettingsGroup>
        </SettingsItem>
      )}
    </div>
  );
}
