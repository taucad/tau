import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { RefCallback } from 'react';
import { ChevronLeft, ChevronRight, X } from 'lucide-react';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@taucad/ui/components/dialog';
import { useSettingsDialog } from '#hooks/use-settings-dialog.js';
import type { SettingsSection } from '#hooks/use-settings-dialog.js';
import { useKeybinding } from '@taucad/ui/components/keyboard';
import { useIsMobile } from '@taucad/ui/hooks/use-mobile';

import { cn } from '@taucad/ui/utils/cn';
import { Button } from '@taucad/ui/components/button';
import { SearchInput } from '@taucad/ui/components/search-input';
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
import type { SettingId } from '#components/settings/settings-registry.js';
import { settingsSections, searchSettings } from '#components/settings/settings-registry.js';
import { DeferredSettingsContent } from '#components/settings/deferred-settings-content.js';

/** URL-backed settings navigation with a searchable catalogue of individual controls. */
export function SettingsDialog(): React.JSX.Element {
  const { isOpen, section: activeSection, target, open, close } = useSettingsDialog();
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
  // A menu item that opens settings has already unmounted, with focus on the body, by the time the
  // dialog renders. Remember the last focus while closed, resolved to its menu's trigger while the
  // menu still exists.
  const lastFocus = useRef<HTMLElement>(undefined);
  useEffect(() => {
    if (isOpen) {
      return;
    }
    const remember = (event: FocusEvent): void => {
      lastFocus.current = event.target instanceof Element ? resolveOpener(event.target) : undefined;
    };
    document.addEventListener('focusin', remember);
    return () => {
      document.removeEventListener('focusin', remember);
    };
  }, [isOpen]);
  return (
    <Dialog open={isOpen} onOpenChange={handleOpenChange}>
      {isOpen ? (
        <SettingsSurface
          activeSection={settingsSections.some(({ id }) => id === activeSection) ? activeSection : 'general'}
          openSection={open}
          close={close}
          linkedSetting={target}
          lastFocus={lastFocus}
        />
      ) : null}
    </Dialog>
  );
}

/**
 * Resolve the element that opened settings. A menu item or popover row unmounts as settings opens,
 * so focus goes back to the trigger that opened that menu instead, through any nested menus.
 */
function resolveOpener(element: Element): HTMLElement | undefined {
  let current: Element | undefined = element;
  for (let depth = 0; current instanceof HTMLElement && depth < 4; depth++) {
    const layer: HTMLElement | undefined =
      current.closest<HTMLElement>('[role=menu], [role=listbox], [data-radix-popper-content-wrapper]') ?? undefined;
    if (!layer) {
      return current;
    }
    const owner: Element = layer.querySelector('[role=menu], [role=listbox], [role=dialog]') ?? layer;
    const document_: Document = current.ownerDocument;
    const ids: string[] = [layer.id, owner.id].filter((id) => id !== '');
    const controller: Element | undefined =
      ids
        .map((id) => document_.querySelector(`[aria-controls="${CSS.escape(id)}"]`))
        .find((trigger) => trigger !== null) ?? undefined;
    current = controller ?? document_.querySelector('[aria-expanded="true"][aria-haspopup]') ?? undefined;
  }
  return undefined;
}

/** The section a plain open lands on; on a phone it opens the section list instead. */
const defaultSection: SettingsSection = 'general';

/** Settings presentation with navigation supplied by the owning host. */
export function SettingsSurface({
  activeSection,
  openSection,
  close,
  linkedSetting,
  isEmbedded = false,
  lastFocus,
}: {
  readonly activeSection: SettingsSection;
  readonly openSection: (section?: SettingsSection, target?: SettingId) => void;
  readonly close: () => void;
  readonly linkedSetting?: string;
  readonly isEmbedded?: boolean;
  /** Where focus last was before the host opened settings, for when the opener has since unmounted. */
  readonly lastFocus?: React.RefObject<HTMLElement | undefined>;
}): React.JSX.Element {
  const { Content, Title, Description } = isEmbedded ? embeddedParts : dialogParts;
  const isMobile = useIsMobile();
  const [query, setQuery] = useState('');
  const [searchDestination, setDestination] = useState<{ section: SettingsSection; id?: string }>();
  const searchRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLElement>(null);
  // Settings opens from the URL rather than a dialog trigger, so the dialog has no trigger to return
  // focus to. Whatever held focus when the surface mounted is the opener.
  const [opener] = useState(() =>
    typeof document === 'undefined' || !document.activeElement || document.activeElement === document.body
      ? undefined
      : resolveOpener(document.activeElement),
  );
  // State, not a ref: the dialog mounts its content after the first effects run, and a
  // deep link opening the dialog has to wait for it.
  const [content, setContent] = useState<HTMLDivElement>();
  const contentRef = useCallback<RefCallback<HTMLDivElement>>((element) => {
    setContent(element ?? undefined);
  }, []);
  // Phones show one level at a time. A plain open (`open()` writes the default section) starts on
  // the section list; an open that names another section or a setting lands on its detail.
  // `?settings=general` therefore lands on the list on a phone, as do `/settings` and
  // `/settings/general`, which redirect to it: the URL cannot tell "General" from "settings".
  const [isListShown, setIsListShown] = useState(() => activeSection === defaultSection && !linkedSetting);
  const [request, setRequest] = useState({ section: activeSection, setting: linkedSetting });
  if (request.section !== activeSection || request.setting !== linkedSetting) {
    setRequest({ section: activeSection, setting: linkedSetting });
    setIsListShown(false);
  }
  // The list row (or search result) that opened the detail takes focus back when the list returns.
  const returnFocusKey = useRef<string>(undefined);
  const isReturning = useRef(false);
  const showsList = isMobile && isListShown;
  const showsDetail = !isMobile || !isListShown;
  const results = useMemo(() => searchSettings(query), [query]);
  const isSearching = query.trim().length > 0;
  const active = settingsSections.find((section) => section.id === activeSection)!;

  // A deep link from outside the dialog (`?setting=`) reveals its control like a search result does.
  // Navigating inside the dialog drops the parameter, so a present link is always the latest request.
  const linkedDestination = useMemo(
    () => (linkedSetting ? { section: activeSection, id: linkedSetting } : undefined),
    [activeSection, linkedSetting],
  );
  const destination = linkedDestination ?? searchDestination;

  useEffect(() => {
    if (!destination || destination.section !== activeSection) {
      return;
    }
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
      if (content.ownerDocument.activeElement !== content) {
        observer.disconnect();
        return;
      }
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        if (content.ownerDocument.activeElement === content && reveal()) {
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
  }, [activeSection, content, destination]);

  useEffect(() => {
    if (!showsList || !isReturning.current) {
      return;
    }
    isReturning.current = false;
    const key = returnFocusKey.current ?? `section:${activeSection}`;
    const row = listRef.current?.querySelector<HTMLElement>(`[data-return-focus="${CSS.escape(key)}"]`);
    (row ?? searchRef.current)?.focus();
  }, [activeSection, showsList]);

  const navigate = (section: SettingsSection, id?: string): void => {
    openSection(section);
    setDestination({ section, id });
    returnFocusKey.current = id ? `setting:${id}` : `section:${section}`;
    setIsListShown(false);
  };
  const showList = (): void => {
    isReturning.current = true;
    setIsListShown(true);
  };
  const clearSearch = (): void => {
    setQuery('');
    searchRef.current?.focus();
  };

  const search = (
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
        // On a phone the field is a 40px target, and Clear's hit area grows to 40px around its glyph.
        className={cn(isMobile && 'h-10')}
        containerClassName={cn(
          isMobile && '[&>[data-slot=button]]:after:absolute [&>[data-slot=button]]:after:-inset-2',
        )}
        aria-label='Search settings'
        placeholder='Search settings…'
        value={query}
        onClear={clearSearch}
        onChange={(event) => {
          setQuery(event.target.value);
        }}
      />
    </form>
  );

  const region = (
    <div
      ref={contentRef}
      role='region'
      aria-label={`${active.label} settings`}
      tabIndex={-1}
      className={cn(
        'min-h-0 min-w-0 flex-1 overflow-y-auto bg-muted/40 focus-visible:focus-outline',
        isMobile ? 'p-4' : 'p-6 md:p-10',
      )}
    >
      <div className='mx-auto flex max-w-3xl flex-col gap-6 [&_[data-settings-section]]:gap-3 [&_[data-settings-section]]:border-0 [&_[data-settings-section]]:bg-transparent [&_[data-settings-section]]:py-0 [&_[data-settings-section]>[data-slot=card-content]]:rounded-xl [&_[data-settings-section]>[data-slot=card-content]]:border [&_[data-settings-section]>[data-slot=card-content]]:bg-card [&_[data-settings-section]>[data-slot=card-content]]:py-4 [&_[data-settings-section]>[data-slot=card-content]:has(>[data-slot=settings-item])]:gap-0 [&_[data-settings-section]>[data-slot=card-content]>[data-slot=settings-item]:not(:first-child)]:pt-4 [&_[data-settings-section]>[data-slot=card-content]>[data-slot=settings-item]:not(:first-child)]:before:absolute [&_[data-settings-section]>[data-slot=card-content]>[data-slot=settings-item]:not(:first-child)]:before:inset-x-0 [&_[data-settings-section]>[data-slot=card-content]>[data-slot=settings-item]:not(:first-child)]:before:top-0 [&_[data-settings-section]>[data-slot=card-content]>[data-slot=settings-item]:not(:first-child)]:before:border-t [&_[data-settings-section]>[data-slot=card-content]>[data-slot=settings-item]:not(:first-child)]:before:content-[""] [&_[data-settings-section]>[data-slot=card-content]>[data-slot=settings-item]:not(:last-child)]:pb-4 [&_[data-settings-section]>[data-slot=card-header]]:px-0 [&_[data-settings-section]>[data-slot=card-header]_[data-slot=card-description]]:hidden [&_[data-settings-section]>[data-slot=card-header]_[data-slot=card-title]]:text-sm [&_[data-settings-section]>[data-slot=card-header]_[data-slot=card-title]]:font-medium [&_[data-slot=card]]:shadow-none [&_h2]:text-sm [&_h2]:font-medium'>
        {isMobile ? null : <h1 className='text-lg font-medium'>{active.label}</h1>}
        <DeferredSettingsContent section={activeSection} />
      </div>
    </div>
  );

  return (
    <Content
      className={cn(
        'h-[90dvh] max-w-[calc(100%-2rem)] grid-rows-[1fr] gap-0 overflow-hidden p-0 sm:max-w-6xl [&_[data-slot=input-group]]:bg-card [&_[data-slot=input]]:bg-card [&_[data-slot=select-trigger]]:bg-card [&_[data-slot=slider-input]]:bg-card [&_[data-slot=textarea]]:bg-card',
        // Phones get a full-screen sheet; its headers carry a 40px close in place of the corner glyph.
        isMobile &&
          'top-0 left-0 h-dvh max-w-none translate-x-0 translate-y-0 rounded-none border-0 sm:max-w-none [&>[data-slot=dialog-close]]:hidden',
      )}
      onOpenAutoFocus={(event) => {
        // A deep link owns focus: its reveal moves it to the content, not the dialog's first button.
        if (linkedDestination) {
          event.preventDefault();
        } else if (showsList) {
          // The phone list opens ready to search, not on its close control.
          event.preventDefault();
          searchRef.current?.focus();
        }
      }}
      onCloseAutoFocus={(event) => {
        event.preventDefault();
        const returnTo = opener ?? lastFocus?.current;
        if (returnTo?.isConnected) {
          returnTo.focus();
        }
      }}
      onEscapeKeyDown={(event) => {
        if (isMobile && !isListShown) {
          event.preventDefault();
          showList();
        } else if (query) {
          event.preventDefault();
          clearSearch();
        }
      }}
    >
      {showsList ? null : <Title className='sr-only'>Settings</Title>}
      <Description className='sr-only'>Application settings and preferences</Description>
      <div className={cn('flex min-h-0 min-w-0 flex-col', !isMobile && 'md:flex-row')}>
        {isMobile && !showsList ? null : (
          <SettingsNavigationPane isMobile={isMobile} close={close} search={search} listRef={listRef} title={Title}>
            <SettingsNavigationItems
              results={results}
              isSearching={isSearching}
              activeSection={activeSection}
              destination={destination}
              isMobile={isMobile}
              navigate={navigate}
            />
          </SettingsNavigationPane>
        )}
        {showsDetail && isMobile ? (
          <div className='flex min-h-0 min-w-0 flex-1 flex-col'>
            <SettingsSheetHeader close={close} back={showList}>
              <h2 className={sheetTitleClassName}>{active.label}</h2>
            </SettingsSheetHeader>
            {region}
          </div>
        ) : null}
        {isMobile ? null : region}
      </div>
    </Content>
  );
}

/** The navigation column on desktop; on a phone, the full-height section list with its own header. */
function SettingsNavigationPane({
  isMobile,
  close,
  search,
  listRef,
  title: Title,
  children,
}: {
  readonly isMobile: boolean;
  readonly close: () => void;
  readonly search: React.ReactNode;
  readonly listRef: React.Ref<HTMLElement>;
  readonly title: SettingsTitle;
  readonly children: React.ReactNode;
}): React.JSX.Element {
  return (
    <aside
      className={cn(
        'flex shrink-0 flex-col bg-sidebar',
        isMobile
          ? 'min-h-0 flex-1 gap-2 pb-4'
          : 'gap-4 border-b p-4 max-md:max-h-[45%] md:w-64 md:border-r md:border-b-0',
      )}
    >
      {isMobile ? (
        <SettingsSheetHeader close={close}>
          <Title className={sheetTitleClassName}>Settings</Title>
        </SettingsSheetHeader>
      ) : (
        <Button variant='ghost' className='w-full justify-start' onClick={close}>
          <X className='size-4' aria-hidden='true' /> Close settings
        </Button>
      )}
      <div className={cn(isMobile && 'px-3')}>{search}</div>
      <nav
        ref={listRef}
        aria-label='Settings navigation'
        className={cn('min-h-0 overflow-y-auto', isMobile && 'flex-1 px-2')}
      >
        {children}
      </nav>
    </aside>
  );
}

/** Section rows, or search results while there is a query; a phone gets 44px rows with group labels. */
function SettingsNavigationItems({
  results,
  isSearching,
  activeSection,
  destination,
  isMobile,
  navigate,
}: {
  readonly results: ReturnType<typeof searchSettings>;
  readonly isSearching: boolean;
  readonly activeSection: SettingsSection;
  readonly destination: { section: SettingsSection; id?: string } | undefined;
  readonly isMobile: boolean;
  readonly navigate: (section: SettingsSection, id?: string) => void;
}): React.JSX.Element {
  const resultCount = results.reduce((total, group) => total + group.entries.length, 0);
  if (isSearching) {
    return (
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
                  size={isMobile ? 'lg' : 'default'}
                  className='text-muted-foreground'
                  data-return-focus={`section:${section.id}`}
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
                        className={cn(isMobile && 'h-11')}
                      >
                        <button
                          type='button'
                          data-return-focus={`setting:${entry.id}`}
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
    );
  }
  return (
    <div className={cn('flex', isMobile ? 'flex-col' : 'md:flex-col')}>
      {[...new Set(settingsSections.map((section) => section.group))].map((group) => (
        <SidebarGroup key={group} className='shrink-0 px-0'>
          <SidebarGroupLabel className={cn(!isMobile && 'max-md:hidden')}>{group}</SidebarGroupLabel>
          <SidebarMenu>
            {settingsSections
              .filter((section) => section.group === group)
              .map((section) => (
                <SidebarMenuItem key={section.id}>
                  <SidebarMenuButton
                    size={isMobile ? 'lg' : 'default'}
                    isActive={!isMobile && activeSection === section.id}
                    data-return-focus={`section:${section.id}`}
                    onClick={() => {
                      navigate(section.id);
                    }}
                  >
                    <section.icon className='size-4' aria-hidden='true' />
                    <span className={cn(isMobile && 'min-w-0 flex-1 truncate')}>{section.label}</span>
                    {isMobile ? <ChevronRight className='text-muted-foreground' aria-hidden='true' /> : null}
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
          </SidebarMenu>
        </SidebarGroup>
      ))}
    </div>
  );
}

const sheetTitleClassName = 'min-w-0 flex-1 truncate text-base font-medium';

/** The phone sheet's 48px bar: back to the section list when there is one, the title and a 40px close. */
function SettingsSheetHeader({
  back,
  close,
  children,
}: {
  readonly back?: () => void;
  readonly close: () => void;
  readonly children: React.ReactNode;
}): React.JSX.Element {
  return (
    <header className={cn('flex h-12 shrink-0 items-center gap-1 border-b pr-1', back ? 'pl-1' : 'pl-4')}>
      {back ? (
        <Button variant='ghost' size='icon-lg' aria-label='Back to Settings' className='shrink-0' onClick={back}>
          <ChevronLeft className='size-5' aria-hidden='true' />
        </Button>
      ) : null}
      {children}
      <Button variant='ghost' size='icon-lg' aria-label='Close settings' className='shrink-0' onClick={close}>
        <X className='size-5' aria-hidden='true' />
      </Button>
    </header>
  );
}

/** Embedded hosts already own their focus boundary; Escape that clears search stays inside. */
function EmbeddedSettingsContent({
  children,
  className,
  onEscapeKeyDown,
}: React.ComponentProps<typeof DialogContent>): React.JSX.Element {
  return (
    // oxlint-disable-next-line jsx-a11y/no-static-element-interactions -- delegates Escape from the focused search field.
    <div
      className={cn(className, 'grid h-full w-full max-w-none sm:max-w-none')}
      onKeyDown={(event) => {
        if (event.key !== 'Escape') {
          return;
        }

        onEscapeKeyDown?.(event.nativeEvent);
        if (event.nativeEvent.defaultPrevented) {
          event.stopPropagation();
        }
      }}
    >
      {children}
    </div>
  );
}

type SettingsTitle = React.ComponentType<{ readonly className?: string; readonly children: React.ReactNode }>;

function EmbeddedTitle({ children, ...props }: React.ComponentProps<'h2'>): React.JSX.Element {
  return <h2 {...props}>{children}</h2>;
}

function EmbeddedDescription(props: React.ComponentProps<'p'>): React.JSX.Element {
  return <p {...props} />;
}

/** Radix titles throw outside a Dialog root, so embedded hosts get plain landmarks. */
const embeddedParts = {
  Content: EmbeddedSettingsContent,
  Title: EmbeddedTitle as SettingsTitle,
  Description: EmbeddedDescription,
};
const dialogParts = { Content: DialogContent, Title: DialogTitle as SettingsTitle, Description: DialogDescription };
