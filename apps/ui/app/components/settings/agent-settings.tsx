import { SettingsItem, SettingsSectionCard } from '#components/settings/settings-item.js';
import { CardContent, CardHeader, CardTitle } from '@taucad/ui/components/card';
import { Switch } from '@taucad/ui/components/switch';
import { useCookie } from '#hooks/use-cookie.js';
import { cookieName } from '#constants/cookie.constants.js';
import { tauCloudEnabled } from '#cloud/cloud-enabled.js';

function SettingRow({
  label,
  description,
  children,
}: {
  readonly label: string;
  readonly description: string;
  readonly children: React.ReactNode;
}): React.JSX.Element {
  return (
    <div className='flex items-center justify-between gap-4'>
      <div className='flex flex-col gap-0.5'>
        <span className='text-sm font-medium'>{label}</span>
        <span className='text-xs text-muted-foreground'>{description}</span>
      </div>
      {children}
    </div>
  );
}

export function AgentSettings(): React.JSX.Element {
  const [showCredits, setShowCredits] = useCookie(cookieName.chatModelCost, true);
  const [includeFileSystem, setIncludeFileSystem] = useCookie(cookieName.chatCtxFs, true);
  const [includeActiveFile, setIncludeActiveFile] = useCookie(cookieName.chatCtxActive, true);
  const [includeOpenFiles, setIncludeOpenFiles] = useCookie(cookieName.chatCtxOpen, true);
  const [showCodePreview, setShowCodePreview] = useCookie(cookieName.chatToolCodePreview, true);
  const [testingEnabled, setTestingEnabled] = useCookie(cookieName.chatTestingEnabled, true);

  return (
    <div className='flex flex-col gap-6 pb-6'>
      {tauCloudEnabled ? (
        <SettingsSectionCard>
          <CardHeader>
            <CardTitle>Metadata Display</CardTitle>
          </CardHeader>
          <CardContent className='flex flex-col gap-4'>
            <SettingsItem settingId='show-credits'>
              <SettingRow
                label='Show Credits'
                description='Display the Tau credits charged for each message in the chat history'
              >
                <Switch aria-label='Show Credits' checked={showCredits} onCheckedChange={setShowCredits} />
              </SettingRow>
            </SettingsItem>
          </CardContent>
        </SettingsSectionCard>
      ) : null}

      <SettingsSectionCard>
        <CardHeader>
          <CardTitle>Editor Context</CardTitle>
        </CardHeader>
        <CardContent className='flex flex-col gap-4'>
          <SettingsItem settingId='filesystem-context'>
            <SettingRow label='Filesystem' description='Include a snapshot of the project file tree'>
              <Switch aria-label='Filesystem' checked={includeFileSystem} onCheckedChange={setIncludeFileSystem} />
            </SettingRow>
          </SettingsItem>
          <SettingsItem settingId='active-file'>
            <SettingRow label='Active File' description='Include the currently focused file'>
              <Switch aria-label='Active File' checked={includeActiveFile} onCheckedChange={setIncludeActiveFile} />
            </SettingRow>
          </SettingsItem>
          <SettingsItem settingId='open-tabs'>
            <SettingRow label='Open Tabs' description='Include all open editor tabs'>
              <Switch aria-label='Open Tabs' checked={includeOpenFiles} onCheckedChange={setIncludeOpenFiles} />
            </SettingRow>
          </SettingsItem>
        </CardContent>
      </SettingsSectionCard>

      <SettingsSectionCard>
        <CardHeader>
          <CardTitle>Tool Display</CardTitle>
        </CardHeader>
        <CardContent className='flex flex-col gap-4'>
          <SettingsItem settingId='code-preview'>
            <SettingRow label='Code Preview' description='Show inline code previews for file operations'>
              <Switch aria-label='Code Preview' checked={showCodePreview} onCheckedChange={setShowCodePreview} />
            </SettingRow>
          </SettingsItem>
        </CardContent>
      </SettingsSectionCard>

      <SettingsSectionCard>
        <CardHeader>
          <CardTitle>Testing</CardTitle>
        </CardHeader>
        <CardContent className='flex flex-col gap-4'>
          <SettingsItem settingId='testing-tools'>
            <SettingRow label='Enable Testing Tools' description='Allow the agent to run and edit tests'>
              <Switch aria-label='Enable Testing Tools' checked={testingEnabled} onCheckedChange={setTestingEnabled} />
            </SettingRow>
          </SettingsItem>
        </CardContent>
      </SettingsSectionCard>
    </div>
  );
}
