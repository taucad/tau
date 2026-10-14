import { useEffect, useRef, useState } from 'react';
import type { ReactNode, Ref } from 'react';
import type { BrowserCommand, BrowserSnapshot } from '@taucad/types/browser';
import {
  ArrowLeft,
  ArrowRight,
  ArrowDown,
  ArrowUp,
  ExternalLink,
  Globe,
  EllipsisVertical,
  RotateCw,
  Search,
  ShieldAlert,
  X,
} from 'lucide-react';
import { Button } from '@taucad/ui/components/button';
import { Input } from '@taucad/ui/components/input';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@taucad/ui/components/dropdown-menu';
import { useKeybinding } from '@taucad/ui/components/keyboard';
import { BrowserSettingsSurface } from '#components/browser/browser-settings.js';
import { menuItemVariants } from '@taucad/ui/components/menu.variants';

type BrowserPanel = 'page' | 'history' | 'downloads' | 'settings' | 'site';

/** Trusted browser chrome, independent of native guest rendering and reusable in Canvas. */
export function BrowserSurface({
  snapshot,
  tabId = snapshot.activeTabId,
  command,
  error,
  viewportRef,
  children,
  onSettings,
  initialPanel = 'page',
}: {
  readonly snapshot: BrowserSnapshot;
  readonly tabId?: string;
  readonly command: (command: BrowserCommand) => Promise<void>;
  readonly error?: string;
  readonly viewportRef?: Ref<HTMLDivElement>;
  readonly children?: ReactNode;
  readonly onSettings?: () => void;
  readonly initialPanel?: BrowserPanel;
}): React.JSX.Element {
  const tab = snapshot.tabs.find((candidate) => candidate.id === tabId);
  const [panel, setPanel] = useState<BrowserPanel>(initialPanel);
  const [addressDraft, setAddressDraft] = useState<string>();
  const [isFinding, setIsFinding] = useState(false);
  const [findText, setFindText] = useState('');
  const addressRef = useRef<HTMLInputElement>(null);
  const findRef = useRef<HTMLInputElement>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const isActive = (): boolean =>
    Boolean(rootRef.current?.getBoundingClientRect().width) &&
    Boolean(rootRef.current?.contains(document.activeElement)) &&
    !document.querySelector('[role="dialog"]');
  const focusAddress = (): void => {
    addressRef.current?.focus();
    addressRef.current?.select();
  };
  useKeybinding({ key: 'l', modKey: true }, focusAddress, { enabled: isActive });
  useKeybinding(
    { key: 'f', modKey: true },
    () => {
      setIsFinding(true);
    },
    { enabled: isActive },
  );
  useKeybinding(
    { key: 't', modKey: true },
    () => {
      void command({ kind: 'new-tab' });
      setPanel('page');
    },
    { enabled: isActive },
  );
  useKeybinding(
    { key: 'Escape' },
    () => {
      setIsFinding(false);
      if (tab) {
        void command({ kind: 'find', tabId: tab.id, text: '' });
      }
      focusAddress();
    },
    { enabled: () => isFinding && isActive() },
  );
  useEffect(() => {
    if (isFinding) {
      findRef.current?.focus();
    }
  }, [isFinding]);
  useEffect(() => {
    if (tab?.url === '' && tab.id === snapshot.activeTabId) {
      focusAddress();
    }
  }, [tab?.id, tab?.url, snapshot.activeTabId]);
  useEffect(() => {
    const handleShortcut = (event: Event): void => {
      if (!(event instanceof CustomEvent) || !rootRef.current?.checkVisibility() || tab?.id !== snapshot.activeTabId) {
        return;
      }
      if (event.detail === 'l') {
        focusAddress();
      }
      if (event.detail === 'f') {
        setIsFinding(true);
      }
    };
    globalThis.addEventListener('tau-browser-shortcut', handleShortcut);
    return () => {
      globalThis.removeEventListener('tau-browser-shortcut', handleShortcut);
    };
  }, [tab?.id, snapshot.activeTabId]);
  const navigate = (input: string): void => {
    setPanel('page');
    setAddressDraft(undefined);
    void command(tab ? { kind: 'navigate', tabId: tab.id, input } : { kind: 'new-tab', input });
  };
  const action = (
    value: 'back' | 'forward' | 'reload' | 'stop' | 'print' | 'screenshot' | 'external' | 'devtools',
  ): void => {
    if (tab) {
      void command({ kind: 'action', tabId: tab.id, action: value });
    }
  };
  return (
    <div
      ref={rootRef}
      className='flex h-full min-h-0 min-w-0 flex-col bg-background text-foreground'
      data-review-id='browser-pane'
    >
      <div className='flex shrink-0 items-center gap-1 border-b p-1' data-review-id='browser-toolbar'>
        <Button
          variant='ghost'
          size='icon-sm'
          aria-label='Back'
          disabled={!tab?.canGoBack}
          onClick={() => {
            action('back');
          }}
        >
          <ArrowLeft />
        </Button>
        <Button
          variant='ghost'
          size='icon-sm'
          aria-label='Forward'
          disabled={!tab?.canGoForward}
          onClick={() => {
            action('forward');
          }}
        >
          <ArrowRight />
        </Button>
        <Button
          variant='ghost'
          size='icon-sm'
          aria-label={tab?.isLoading ? 'Stop loading' : 'Reload page'}
          disabled={!tab?.url}
          onClick={() => {
            action(tab?.isLoading ? 'stop' : 'reload');
          }}
        >
          {tab?.isLoading ? <X /> : <RotateCw />}
        </Button>
        <form
          className='min-w-0 flex-1'
          onSubmit={(event) => {
            event.preventDefault();
            navigate(addressDraft ?? tab?.url ?? '');
          }}
        >
          <Input
            ref={addressRef}
            aria-label='Search or enter a URL'
            placeholder='Search or enter a URL'
            autoComplete='off'
            spellCheck={false}
            className='rounded-full shadow-none'
            value={addressDraft ?? tab?.url ?? ''}
            onChange={(event) => {
              setAddressDraft(event.target.value);
            }}
            onFocus={(event) => {
              event.target.select();
            }}
          />
        </form>
        <Button
          variant='ghost'
          size='icon-sm'
          aria-label='Site information'
          disabled={!tab?.url}
          onClick={() => {
            setPanel(panel === 'site' ? 'page' : 'site');
          }}
        >
          {tab?.url.startsWith('http:') ? <ShieldAlert /> : <Globe />}
        </Button>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant='ghost' size='icon-sm' aria-label='Browser menu'>
              <EllipsisVertical />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent
            align='end'
            className='w-64'
            onCloseAutoFocus={(event) => {
              if (isFinding) {
                event.preventDefault();
                findRef.current?.focus();
              }
            }}
          >
            <DropdownMenuItem
              disabled={!tab?.url}
              onSelect={() => {
                setIsFinding(true);
              }}
            >
              Find in page
            </DropdownMenuItem>
            <DropdownMenuItem
              disabled={!tab?.url}
              onSelect={() => {
                action('print');
              }}
            >
              Print…
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <div
              role='group'
              aria-label='Page zoom'
              className={menuItemVariants({ className: 'justify-between hover:bg-transparent' })}
            >
              <span>Zoom</span>
              <div className='flex items-center'>
                <DropdownMenuItem
                  aria-label='Zoom out'
                  disabled={!tab || tab.zoom <= 0.25}
                  onSelect={(event) => {
                    event.preventDefault();
                    if (tab) {
                      void command({ kind: 'zoom', tabId: tab.id, factor: Math.max(0.25, tab.zoom - 0.25) });
                    }
                  }}
                >
                  −
                </DropdownMenuItem>
                <DropdownMenuItem
                  aria-label='Reset zoom'
                  disabled={!tab}
                  onSelect={(event) => {
                    event.preventDefault();
                    if (tab) {
                      void command({ kind: 'zoom', tabId: tab.id, factor: 1 });
                    }
                  }}
                >
                  {Math.round((tab?.zoom ?? 1) * 100)}%
                </DropdownMenuItem>
                <DropdownMenuItem
                  aria-label='Zoom in'
                  disabled={!tab || tab.zoom >= 3}
                  onSelect={(event) => {
                    event.preventDefault();
                    if (tab) {
                      void command({ kind: 'zoom', tabId: tab.id, factor: Math.min(3, tab.zoom + 0.25) });
                    }
                  }}
                >
                  +
                </DropdownMenuItem>
              </div>
            </div>
            <DropdownMenuItem
              disabled={!tab?.url}
              onSelect={() => {
                action('devtools');
              }}
            >
              Developer tools
            </DropdownMenuItem>
            <DropdownMenuItem
              disabled={!tab?.url}
              onSelect={() => {
                action('screenshot');
              }}
            >
              Take a screenshot…
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              onSelect={() => {
                setPanel('downloads');
              }}
            >
              Downloads
            </DropdownMenuItem>
            <DropdownMenuItem
              onSelect={() => {
                setPanel('history');
              }}
            >
              History
            </DropdownMenuItem>
            <DropdownMenuItem
              onSelect={() => {
                if (onSettings) {
                  onSettings();
                } else {
                  setPanel('settings');
                }
              }}
            >
              Browser settings
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              disabled={!tab?.url}
              onSelect={() => {
                action('external');
              }}
            >
              <ExternalLink />
              Open in default browser
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
      {isFinding ? (
        <form
          className='flex shrink-0 items-center gap-1 border-b p-2'
          aria-label='Find in page'
          onSubmit={(event) => {
            event.preventDefault();
            if (tab) {
              void command({ kind: 'find', tabId: tab.id, text: findText, next: true });
            }
          }}
        >
          <Input
            ref={findRef}
            aria-label='Find text'
            placeholder='Find in page'
            value={findText}
            onChange={(event) => {
              setFindText(event.target.value);
              if (tab) {
                void command({ kind: 'find', tabId: tab.id, text: event.target.value });
              }
            }}
          />
          <span className='shrink-0 text-xs tabular-nums' role='status'>
            {tab?.matches ? `${tab.matches.active} / ${tab.matches.total}` : ''}
          </span>
          <Button
            type='button'
            variant='ghost'
            size='icon-sm'
            aria-label='Previous match'
            onClick={() => {
              if (tab) {
                void command({ kind: 'find', tabId: tab.id, text: findText, forward: false, next: true });
              }
            }}
          >
            <ArrowUp />
          </Button>
          <Button variant='ghost' size='icon-sm' aria-label='Next match'>
            <ArrowDown />
          </Button>
          <Button
            type='button'
            variant='ghost'
            size='icon-sm'
            aria-label='Close find'
            onClick={() => {
              setIsFinding(false);
              if (tab) {
                void command({ kind: 'find', tabId: tab.id, text: '' });
              }
              focusAddress();
            }}
          >
            <X />
          </Button>
        </form>
      ) : null}
      {error ? (
        <p className='border-b p-3 text-sm' role='alert'>
          {error}
        </p>
      ) : null}
      {panel === 'page' ? (
        <div
          ref={viewportRef}
          className='relative min-h-0 flex-1 overflow-hidden'
          aria-label='Web page'
          data-review-id='browser-page'
        >
          {tab?.error ? (
            <div className='flex h-full flex-col items-center justify-center gap-4 p-6 text-center'>
              <ShieldAlert className='size-6 text-feature' />
              <p role='alert' className='max-w-sm text-sm'>
                {tab.error}
              </p>
              <Button
                variant='outline'
                size='sm'
                onClick={() => {
                  action('reload');
                }}
              >
                Reload page
              </Button>
            </div>
          ) : tab?.url ? (
            children
          ) : (
            <div className='flex h-full flex-col items-center justify-center gap-3 p-6 text-center'>
              <Globe className='size-6 text-muted-foreground' />
              <h2 className='text-sm font-medium'>Browse alongside your work</h2>
              <p className='max-w-xs text-sm text-muted-foreground'>
                Open a reference, explore a supplier, or search the web.
              </p>
              <Button variant='outline' size='sm' onClick={focusAddress}>
                <Search />
                Search or enter a URL
              </Button>
            </div>
          )}
          {tab?.isLoading ? (
            <p
              role='status'
              aria-busy='true'
              className='absolute bottom-2 left-2 rounded-md bg-background px-2 py-1 text-xs'
            >
              Loading page…
            </p>
          ) : null}
        </div>
      ) : (
        <div className='min-h-0 flex-1 overflow-auto p-4' data-review-id={`browser-${panel}`}>
          <div className='mb-4 flex items-center justify-between'>
            <h2 className='text-sm font-medium'>
              {panel === 'site'
                ? 'Site information'
                : panel === 'settings'
                  ? 'Browser settings'
                  : panel === 'history'
                    ? 'History'
                    : 'Downloads'}
            </h2>
            <Button
              variant='ghost'
              size='icon-sm'
              aria-label='Return to page'
              onClick={() => {
                setPanel('page');
              }}
            >
              <X />
            </Button>
          </div>
          {panel === 'settings' ? <BrowserSettingsSurface settings={snapshot.settings} command={command} /> : null}
          {panel === 'site' ? (
            <div className='space-y-4 text-sm'>
              <p className='break-all'>{tab?.url ? new URL(tab.url).origin : 'New tab'}</p>
              <p>
                {tab?.url.startsWith('https:')
                  ? 'This address uses HTTPS.'
                  : 'This address uses HTTP. Information sent to this site is not encrypted.'}
              </p>
              <p className='text-muted-foreground'>
                Camera, microphone, location, notifications and device access are blocked.
              </p>
              <Button
                variant='outline'
                size='sm'
                onClick={() => {
                  action('external');
                }}
              >
                Open in default browser
              </Button>
            </div>
          ) : null}
          {panel === 'history' ? (
            <div className='space-y-1'>
              {snapshot.history.length > 0 ? (
                snapshot.history.map((entry) => (
                  <Button
                    key={entry.url}
                    variant='ghost'
                    className='h-auto w-full justify-start py-2 text-left font-normal'
                    onClick={() => {
                      navigate(entry.url);
                    }}
                  >
                    <Globe className='shrink-0' />
                    <span className='min-w-0'>
                      <span className='block truncate'>{entry.title}</span>
                      <span className='block truncate text-xs text-muted-foreground'>{entry.url}</span>
                    </span>
                  </Button>
                ))
              ) : (
                <p className='text-sm text-muted-foreground'>No browsing history yet.</p>
              )}
            </div>
          ) : null}
          {panel === 'downloads' ? (
            <div className='divide-y'>
              {snapshot.downloads.length > 0 ? (
                snapshot.downloads.map((entry) => (
                  <div key={entry.id} className='flex items-center justify-between gap-3 py-3 text-sm'>
                    <div className='min-w-0'>
                      <p className='truncate'>{entry.name}</p>
                      <p className='text-xs text-muted-foreground'>
                        {entry.state === 'progressing'
                          ? `${Math.round(entry.received / 1024)} KB${entry.total > 0 ? ` of ${Math.round(entry.total / 1024)} KB` : ''}`
                          : entry.state}
                      </p>
                    </div>
                    {entry.state === 'progressing' ? (
                      <Button
                        variant='outline'
                        size='sm'
                        onClick={() => {
                          void command({ kind: 'cancel-download', downloadId: entry.id });
                        }}
                      >
                        Cancel download
                      </Button>
                    ) : null}
                  </div>
                ))
              ) : (
                <p className='text-sm text-muted-foreground'>No downloads this session.</p>
              )}
            </div>
          ) : null}
        </div>
      )}
    </div>
  );
}
