import { useCallback, useEffect, useRef, useState } from 'react';
import { ArrowLeft } from 'lucide-react';
import { AccountSettings } from '#components/auth/settings/account/account-settings.js';
import { SecuritySettings } from '#components/auth/settings/security/security-settings.js';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@taucad/ui/components/dialog';
import { useSettingsDialog } from '#hooks/use-settings-dialog.js';
import type { SettingsSection } from '#hooks/use-settings-dialog.js';
import { CloudBillingSettings } from '#cloud/settings-billing.js';
import { FileSystemSettings } from '#components/settings/filesystem-settings.js';
import { GeneralSettings } from '#components/settings/general-settings.js';
import { ExperimentalSettings } from '#components/settings/experimental-settings.js';
import { ModelSettings } from '#components/settings/model-settings.js';
import { AgentSettings } from '#components/settings/agent-settings.js';
import { SettingsAuthGate } from '#components/settings/settings-auth-gate.js';
import { RemoteComputeSettings } from '#components/settings/remote-compute-settings.js';
import { ComputeReuseSettings } from '#components/settings/compute-reuse-settings.js';
import { useKeybinding } from '#hooks/use-keyboard.js';

import { Button } from '@taucad/ui/components/button';
import { SearchInput } from '#components/search-input.js';
import {
  SidebarGroup,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarMenuSub,
  SidebarMenuSubButton,
  SidebarMenuSubItem,
} from '#components/ui/sidebar.js';
import { settingsSections, searchSettings } from '#components/settings/settings-registry.js';
import { SettingsItem } from '#components/settings/settings-item.js';

/** Keep authenticated sections behind their existing gate and mount only the active section. */
function SettingsContent({ section }: { readonly section: SettingsSection }): React.JSX.Element {
  switch (section) {
    case 'general': {
      return <GeneralSettings />;
    }
    case 'account': {
      return (
        <SettingsAuthGate>
          <SettingsItem settingId='profile'>
            <AccountSettings />
          </SettingsItem>
        </SettingsAuthGate>
      );
    }
    case 'security': {
      return (
        <SettingsAuthGate>
          <SecuritySettings />
        </SettingsAuthGate>
      );
    }
    case 'billing': {
      return (
        <SettingsAuthGate>
          <CloudBillingSettings />
        </SettingsAuthGate>
      );
    }
    case 'compute': {
      return (
        <>
          <SettingsItem settingId='compute-reuse'>
            <ComputeReuseSettings />
          </SettingsItem>
          <SettingsAuthGate>
            <SettingsItem settingId='tau-host'>
              <RemoteComputeSettings />
            </SettingsItem>
          </SettingsAuthGate>
        </>
      );
    }
    case 'models': {
      return (
        <SettingsItem settingId='model-picker'>
          <ModelSettings />
        </SettingsItem>
      );
    }
    case 'agents': {
      return <AgentSettings />;
    }
    case 'filesystem': {
      return <FileSystemSettings />;
    }
    case 'experimental': {
      return <ExperimentalSettings />;
    }
  }
}

/** URL-backed settings navigation with a searchable catalogue of individual controls. */
export function SettingsDialog(): React.JSX.Element {
  const { isOpen, section: activeSection, open, close } = useSettingsDialog();
  useKeybinding({ key: ',', modKey: true }, () => {
    open();
  });
  const handleOpenChange = useCallback(
    (nextOpen: boolean) => {
      if (!nextOpen) {
        close();
      }
    },
    [close],
  );
  return (
    <Dialog open={isOpen} onOpenChange={handleOpenChange}>
      {isOpen ? <SettingsSurface activeSection={activeSection} /> : null}
    </Dialog>
  );
}

function SettingsSurface({ activeSection }: { readonly activeSection: SettingsSection }): React.JSX.Element {
  const { open: openSection, close } = useSettingsDialog();
  const [query, setQuery] = useState('');
  const [destination, setDestination] = useState<{ section: SettingsSection; id?: string }>();
  const searchRef = useRef<HTMLInputElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const results = searchSettings(query);
  const isSearching = query.trim().length > 0;
  const active = settingsSections.find((section) => section.id === activeSection)!;
  const resultCount = results.reduce((total, group) => total + group.entries.length, 0);

  useEffect(() => {
    if (!destination || destination.section !== activeSection) {
      return;
    }
    const content = contentRef.current;
    if (!content) {
      return;
    }
    let frame: number;
    const reveal = (): boolean => {
      const target = destination.id
        ? content.querySelector<HTMLElement>(`#settings-${CSS.escape(destination.id)}`)
        : undefined;
      if (!target) {
        return false;
      }
      target.focus({ preventScroll: true });
      target.scrollIntoView({ block: 'center' });
      return true;
    };
    // Billing and filesystem destinations may arrive after their data finishes loading.
    const observer = new MutationObserver(() => {
      if (document.activeElement !== content) {
        observer.disconnect();
        return;
      }
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        if (document.activeElement === content && reveal()) {
          observer.disconnect();
        }
      });
    });
    frame = requestAnimationFrame(() => {
      if (!reveal()) {
        content.focus({ preventScroll: true });
        content.scrollTo({ top: 0 });
        if (destination.id) {
          observer.observe(content, { childList: true, subtree: true });
        }
      }
    });
    return () => {
      cancelAnimationFrame(frame);
      observer.disconnect();
    };
  }, [activeSection, destination]);

  const navigate = (section: SettingsSection, id?: string): void => {
    openSection(section);
    setDestination({ section, id });
  };
  const clearSearch = (): void => {
    setQuery('');
    searchRef.current?.focus();
  };

  return (
    <DialogContent
      className='h-[90dvh] max-w-[calc(100%-2rem)] grid-rows-[1fr] gap-0 overflow-hidden p-0 sm:max-w-6xl'
      onEscapeKeyDown={(event) => {
        if (query) {
          event.preventDefault();
          clearSearch();
        }
      }}
    >
      <DialogTitle className='sr-only'>Settings</DialogTitle>
      <DialogDescription className='sr-only'>Application settings and preferences</DialogDescription>
      <div className='flex min-h-0 flex-col md:flex-row'>
        <aside className='flex shrink-0 flex-col gap-4 border-b bg-sidebar p-4 max-md:max-h-[45%] md:w-64 md:border-r md:border-b-0'>
          <Button variant='ghost' className='w-full justify-start' onClick={close}>
            <ArrowLeft className='size-4' aria-hidden='true' /> Back to app
          </Button>
          <form
            className='relative'
            role='search'
            aria-label='Search settings'
            onSubmit={(event) => {
              event.preventDefault();
              const first = results[0];
              if (first?.entries[0]) {
                navigate(first.section.id, first.entries[0].id);
              }
            }}
          >
            <SearchInput
              ref={searchRef}
              aria-label='Search settings'
              placeholder='Search settings…'
              value={query}
              variant='transparent'
              onClear={clearSearch}
              onChange={(event) => {
                setQuery(event.target.value);
              }}
            />
          </form>
          <nav aria-label='Settings navigation' className='min-h-0 overflow-y-auto'>
            {isSearching ? (
              <div className='space-y-4'>
                <p role='status' className='px-2 text-xs text-muted-foreground'>
                  {resultCount === 0
                    ? 'No settings found'
                    : `${resultCount} ${resultCount === 1 ? 'setting' : 'settings'} found`}
                </p>
                {resultCount === 0 ? (
                  <p className='px-2 text-sm text-muted-foreground'>
                    Try a setting name or a word like theme, models, or storage.
                  </p>
                ) : null}
                {results.map(({ section, entries }) => (
                  <SidebarGroup key={section.id} role='group' aria-label={section.label} className='px-0'>
                    <SidebarMenu>
                      <SidebarMenuItem>
                        <SidebarMenuButton
                          className='text-muted-foreground'
                          onClick={() => {
                            navigate(section.id);
                          }}
                        >
                          <section.icon className='size-4 shrink-0' aria-hidden='true' />
                          <span>{section.label}</span>
                        </SidebarMenuButton>
                        <SidebarMenuSub>
                          {entries.map((entry) => (
                            <SidebarMenuSubItem key={entry.id}>
                              <SidebarMenuSubButton
                                asChild
                                title={entry.description}
                                isActive={destination?.section === activeSection && destination.id === entry.id}
                              >
                                <button
                                  type='button'
                                  onClick={() => {
                                    navigate(section.id, entry.id);
                                  }}
                                >
                                  <span>{entry.label}</span>
                                </button>
                              </SidebarMenuSubButton>
                            </SidebarMenuSubItem>
                          ))}
                        </SidebarMenuSub>
                      </SidebarMenuItem>
                    </SidebarMenu>
                  </SidebarGroup>
                ))}
              </div>
            ) : (
              <div className='flex md:flex-col'>
                {[...new Set(settingsSections.map((section) => section.group))].map((group) => (
                  <SidebarGroup key={group} className='shrink-0 px-0'>
                    <SidebarGroupLabel className='max-md:hidden'>{group}</SidebarGroupLabel>
                    <SidebarMenu>
                      {settingsSections
                        .filter((section) => section.group === group)
                        .map((section) => (
                          <SidebarMenuItem key={section.id}>
                            <SidebarMenuButton
                              isActive={activeSection === section.id}
                              onClick={() => {
                                navigate(section.id);
                              }}
                            >
                              <section.icon className='size-4' aria-hidden='true' />
                              <span>{section.label}</span>
                            </SidebarMenuButton>
                          </SidebarMenuItem>
                        ))}
                    </SidebarMenu>
                  </SidebarGroup>
                ))}
              </div>
            )}
          </nav>
        </aside>
        <div
          ref={contentRef}
          role='region'
          aria-label={`${active.label} settings`}
          tabIndex={-1}
          className='min-h-0 min-w-0 flex-1 overflow-y-auto p-6 focus-visible:focus-outline md:p-10'
        >
          <div className='mx-auto flex max-w-3xl flex-col gap-6 [&_[data-settings-section]]:gap-3 [&_[data-settings-section]]:border-0 [&_[data-settings-section]]:bg-transparent [&_[data-settings-section]]:py-0 [&_[data-settings-section]>[data-slot=card-content]]:rounded-xl [&_[data-settings-section]>[data-slot=card-content]]:border [&_[data-settings-section]>[data-slot=card-content]]:bg-card [&_[data-settings-section]>[data-slot=card-content]]:py-4 [&_[data-settings-section]>[data-slot=card-content]:has(>[data-slot=settings-item])]:gap-0 [&_[data-settings-section]>[data-slot=card-content]>[data-slot=settings-item]:not(:first-child)]:pt-4 [&_[data-settings-section]>[data-slot=card-content]>[data-slot=settings-item]:not(:first-child)]:before:absolute [&_[data-settings-section]>[data-slot=card-content]>[data-slot=settings-item]:not(:first-child)]:before:inset-x-0 [&_[data-settings-section]>[data-slot=card-content]>[data-slot=settings-item]:not(:first-child)]:before:top-0 [&_[data-settings-section]>[data-slot=card-content]>[data-slot=settings-item]:not(:first-child)]:before:border-t [&_[data-settings-section]>[data-slot=card-content]>[data-slot=settings-item]:not(:first-child)]:before:content-[""] [&_[data-settings-section]>[data-slot=card-content]>[data-slot=settings-item]:not(:last-child)]:pb-4 [&_[data-settings-section]>[data-slot=card-header]]:px-0 [&_[data-settings-section]>[data-slot=card-header]_[data-slot=card-description]]:hidden [&_[data-settings-section]>[data-slot=card-header]_[data-slot=card-title]]:text-sm [&_[data-settings-section]>[data-slot=card-header]_[data-slot=card-title]]:font-medium [&_[data-slot=card]]:shadow-none [&_h2]:text-sm [&_h2]:font-medium'>
            <h1 className='text-lg font-medium'>{active.label}</h1>
            <SettingsContent section={activeSection} />
          </div>
        </div>
      </div>
    </DialogContent>
  );
}
