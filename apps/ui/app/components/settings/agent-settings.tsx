import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '#components/ui/card.js';
import { Switch } from '#components/ui/switch.js';
import { useCookie } from '#hooks/use-cookie.js';
import { cookieName } from '#constants/cookie.constants.js';

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
  const [showModelCost, setShowModelCost] = useCookie(cookieName.chatModelCost, true);
  const [includeFileSystem, setIncludeFileSystem] = useCookie(cookieName.chatCtxFs, true);
  const [includeActiveFile, setIncludeActiveFile] = useCookie(cookieName.chatCtxActive, true);
  const [includeOpenFiles, setIncludeOpenFiles] = useCookie(cookieName.chatCtxOpen, true);
  const [showCodePreview, setShowCodePreview] = useCookie(cookieName.chatToolCodePreview, true);
  const [testingEnabled, setTestingEnabled] = useCookie(cookieName.chatTestingEnabled, true);

  return (
    <div className='flex flex-col gap-6 pb-6'>
      <Card>
        <CardHeader>
          <CardTitle>Metadata Display</CardTitle>
          <CardDescription>Control what metadata is shown alongside chat messages.</CardDescription>
        </CardHeader>
        <CardContent className='flex flex-col gap-4'>
          <SettingRow label='Show Model Cost' description='Display token cost per message in the chat history'>
            <Switch checked={showModelCost} onCheckedChange={setShowModelCost} />
          </SettingRow>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Editor Context</CardTitle>
          <CardDescription>Choose which editor context is automatically included with each message.</CardDescription>
        </CardHeader>
        <CardContent className='flex flex-col gap-4'>
          <SettingRow label='Filesystem' description='Include a snapshot of the project file tree'>
            <Switch checked={includeFileSystem} onCheckedChange={setIncludeFileSystem} />
          </SettingRow>
          <SettingRow label='Active File' description='Include the currently focused file'>
            <Switch checked={includeActiveFile} onCheckedChange={setIncludeActiveFile} />
          </SettingRow>
          <SettingRow label='Open Tabs' description='Include all open editor tabs'>
            <Switch checked={includeOpenFiles} onCheckedChange={setIncludeOpenFiles} />
          </SettingRow>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Tool Display</CardTitle>
          <CardDescription>Configure how tool results are displayed in the chat.</CardDescription>
        </CardHeader>
        <CardContent className='flex flex-col gap-4'>
          <SettingRow label='Code Preview' description='Show inline code previews for file operations'>
            <Switch checked={showCodePreview} onCheckedChange={setShowCodePreview} />
          </SettingRow>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Testing</CardTitle>
          <CardDescription>Control the availability of testing tools in agent conversations.</CardDescription>
        </CardHeader>
        <CardContent className='flex flex-col gap-4'>
          <SettingRow label='Enable Testing Tools' description='Allow the agent to run and edit tests'>
            <Switch checked={testingEnabled} onCheckedChange={setTestingEnabled} />
          </SettingRow>
        </CardContent>
      </Card>
    </div>
  );
}
