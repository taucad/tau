import { useState } from 'react';
import type { BrowserCommand, BrowserSettings } from '@taucad/types/browser';
import { Button } from '@taucad/ui/components/button';
import { Switch } from '@taucad/ui/components/switch';
import { Label } from '@taucad/ui/components/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@taucad/ui/components/select';
import { getBrowserBridge, useBrowserSession } from '#components/browser/browser-bridge.js';

/** Compact preferences shared by app settings and the review Canvas. */
export function BrowserSettingsSurface({
  settings,
  command,
}: {
  readonly settings: BrowserSettings;
  readonly command: (command: BrowserCommand) => Promise<void>;
}): React.JSX.Element {
  const [clearScope, setClearScope] = useState<'history' | 'all'>();
  const [isClearing, setIsClearing] = useState(false);
  return (
    <div className='space-y-6 text-sm' data-review-id='browser-settings'>
      <section className='space-y-2' aria-label='Browsing preferences'>
        <h3 className='font-medium'>Browsing</h3>
        <div className='divide-y rounded-lg border'>
          <div className='flex flex-wrap items-center justify-between gap-4 p-4'>
            <Label htmlFor='browser-search-engine'>Search engine</Label>
            <Select
              value={settings.searchEngine}
              onValueChange={(value) => {
                if (value === 'duckduckgo' || value === 'google' || value === 'bing') {
                  void command({ kind: 'settings', settings: { ...settings, searchEngine: value } });
                }
              }}
            >
              <SelectTrigger id='browser-search-engine' className='w-40'>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value='duckduckgo'>DuckDuckGo</SelectItem>
                <SelectItem value='google'>Google</SelectItem>
                <SelectItem value='bing'>Bing</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className='flex flex-wrap items-center justify-between gap-4 p-4'>
            <Label htmlFor='browser-default-zoom'>Default page zoom</Label>
            <Select
              value={String(settings.defaultZoom)}
              onValueChange={(value) => {
                void command({ kind: 'settings', settings: { ...settings, defaultZoom: Number(value) } });
              }}
            >
              <SelectTrigger id='browser-default-zoom' className='w-24'>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {[0.5, 0.75, 1, 1.25, 1.5, 2].map((factor) => (
                  <SelectItem key={factor} value={String(factor)}>
                    {factor * 100}%
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className='flex items-center justify-between gap-4 p-4'>
            <div>
              <Label htmlFor='browser-history'>Remember browsing history</Label>
              <p className='mt-1 text-xs text-muted-foreground'>
                Stored on this device. Never added to a project or chat.
              </p>
            </div>
            <Switch
              id='browser-history'
              checked={settings.rememberHistory}
              onCheckedChange={(checked) => {
                void command({ kind: 'settings', settings: { ...settings, rememberHistory: checked } });
              }}
            />
          </div>
        </div>
      </section>
      <section className='space-y-2' aria-label='Browser privacy'>
        <h3 className='font-medium'>Privacy</h3>
        <div className='divide-y rounded-lg border'>
          <div className='p-4'>
            <p>Site permissions</p>
            <p className='mt-1 text-xs text-muted-foreground'>
              Camera, microphone, location, notifications and device access are blocked. Open a site in your default
              browser when it needs these features.
            </p>
          </div>
          <div className='flex flex-wrap items-center justify-between gap-4 p-4'>
            <span>Browsing history</span>
            <Button
              variant='outline'
              size='sm'
              onClick={() => {
                setClearScope('history');
              }}
            >
              Clear history
            </Button>
          </div>
          <div className='flex flex-wrap items-center justify-between gap-4 p-4'>
            <div>
              Cookies and site data<p className='mt-1 text-xs text-muted-foreground'>Separate from your Tau account.</p>
            </div>
            <Button
              variant='outline'
              size='sm'
              onClick={() => {
                setClearScope('all');
              }}
            >
              Clear browsing data
            </Button>
          </div>
        </div>
      </section>
      {clearScope ? (
        <section className='space-y-3 rounded-lg border p-4' aria-label='Confirm clearing browsing data'>
          <p>
            {clearScope === 'all'
              ? 'Clear browser cookies, site data, cache and history? This closes browser tabs, cancels downloads and signs you out of websites. Your Tau account and downloaded files stay unchanged.'
              : 'Clear browsing history on this device?'}
          </p>
          <div className='flex flex-wrap gap-2'>
            <Button
              variant='destructive'
              size='sm'
              disabled={isClearing}
              onClick={async () => {
                setIsClearing(true);
                try {
                  await command({ kind: 'clear-data', scope: clearScope });
                } finally {
                  setIsClearing(false);
                  setClearScope(undefined);
                }
              }}
            >
              {isClearing ? 'Clearing…' : 'Clear data'}
            </Button>
            <Button
              variant='outline'
              size='sm'
              disabled={isClearing}
              onClick={() => {
                setClearScope(undefined);
              }}
            >
              Cancel
            </Button>
          </div>
        </section>
      ) : null}
    </div>
  );
}

/** Settings only subscribe while their section is mounted. */
export function BrowserSettingsPanel(): React.JSX.Element {
  const bridge = getBrowserBridge();
  const { snapshot, error, command } = useBrowserSession(bridge);
  if (!bridge) {
    return <p className='text-sm text-muted-foreground'>Browsing is available in the Tau desktop app.</p>;
  }
  return (
    <div className='space-y-4'>
      {error ? <p role='alert'>{error}</p> : null}
      {snapshot ? (
        <BrowserSettingsSurface settings={snapshot.settings} command={command} />
      ) : (
        <p role='status'>Loading browser settings…</p>
      )}
    </div>
  );
}
