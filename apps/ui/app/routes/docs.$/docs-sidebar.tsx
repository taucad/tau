import type * as PageTree from 'fumadocs-core/page-tree';
import { useMemo, useCallback, createContext, useContext, useEffect } from 'react';
import type { ReactNode } from 'react';
import { cva } from 'class-variance-authority';
import { ChevronsUpDown, SearchIcon, XIcon, MenuIcon } from 'lucide-react';
import { useLocation, NavLink, useNavigate, Link } from 'react-router';
import { useTreeContext } from 'fumadocs-ui/contexts/tree';
import { useSearchContext } from 'fumadocs-ui/contexts/search';
import { cn } from '#utils/ui.utils.js';
import { SidebarOffset } from '#components/layout/sidebar-offset.js';
import { useCookie } from '#hooks/use-cookie.js';
import { cookieName } from '#constants/cookie.constants.js';
import { KeyShortcut } from '#components/ui/key-shortcut.js';
import {
  FloatingPanel,
  FloatingPanelContent,
  FloatingPanelContentHeader,
  FloatingPanelContentHeaderActions,
  FloatingPanelContentTitle,
  FloatingPanelContentBody,
  FloatingPanelClose,
  FloatingPanelTrigger,
} from '#components/ui/floating-panel.js';
import {
  SidebarContent,
  SidebarGroup,
  SidebarMenu,
  SidebarMenuItem,
  SidebarMenuButton,
  SidebarGroupLabel,
} from '#components/ui/sidebar.js';
import { Loader } from '#components/ui/loader.js';
import { useIsMobile } from '#hooks/use-mobile.js';
import { Button } from '#components/ui/button.js';
import { useKeybinding } from '#hooks/use-keyboard.js';
import { ComboBoxResponsive } from '#components/ui/combobox-responsive.js';
import { DocsIcon } from '#components/icons/docs-icon.js';
import { TauWordmark } from '#components/icons/tau-wordmark.js';

const docsSidebarWidthIcon = 'calc(var(--spacing) * 17)';
const docsSidebarWidth = 'calc(var(--spacing) * 72)';

const linkVariants = cva('flex items-center gap-2 w-full py-1.5 rounded-lg text-fd-foreground/80 [&_svg]:size-4', {
  variants: {
    active: {
      true: 'text-fd-primary font-medium',
      false: 'hover:text-fd-accent-foreground',
    },
  },
});

type DocsSidebarProps = {
  readonly className?: string;
};

type DocsSidebarProviderContextType = {
  readonly isDocsSidebarOpen: boolean;
  readonly setIsDocsSidebarOpen: (value: boolean | ((current: boolean) => boolean)) => void;
  readonly toggleDocsSidebar: () => void;
};

const DocsSidebarProviderContext = createContext<DocsSidebarProviderContextType | undefined>(undefined);

export const useDocsSidebarProvider = (): DocsSidebarProviderContextType => {
  const context = useContext(DocsSidebarProviderContext);
  if (!context) {
    throw new Error('useDocsSidebarProvider must be used within a DocsSidebarProvider');
  }

  return context;
};

export function DocsSidebarProvider({ children }: { readonly children: ReactNode }): React.JSX.Element {
  const [isDocsSidebarOpen, setIsDocsSidebarOpen] = useCookie(cookieName.docsOpSidebar, true);

  const toggleDocsSidebar = useCallback(() => {
    setIsDocsSidebarOpen((previous) => !previous);
  }, [setIsDocsSidebarOpen]);

  const isMobile = useIsMobile();
  const location = useLocation();
  useEffect(() => {
    if (isMobile) {
      // Location changes on mobile should close the sidebar
      setIsDocsSidebarOpen(false);
    }
  }, [location, isMobile, setIsDocsSidebarOpen]);

  const value = useMemo(
    () => ({ isDocsSidebarOpen, setIsDocsSidebarOpen, toggleDocsSidebar }),
    [isDocsSidebarOpen, setIsDocsSidebarOpen, toggleDocsSidebar],
  );

  return (
    <DocsSidebarProviderContext.Provider value={value}>
      <div
        data-slot='docs-sidebar'
        style={{
          '--docs-sidebar-width': docsSidebarWidth,
          '--docs-sidebar-width-icon': docsSidebarWidthIcon,
          '--docs-sidebar-toggle-width-current': isDocsSidebarOpen ? '0px' : docsSidebarWidthIcon,
          '--docs-sidebar-width-current': isDocsSidebarOpen ? docsSidebarWidth : '0px',
        }}
        className='size-full'
      >
        {children}
      </div>
    </DocsSidebarProviderContext.Provider>
  );
}

// Docs Sidebar Trigger Component
export function DocsSidebarTrigger({
  isOpen,
  onToggle,
}: {
  readonly isOpen: boolean;
  readonly onToggle: () => void;
}): React.JSX.Element {
  return (
    <FloatingPanelTrigger
      icon={MenuIcon}
      tooltipContent={`${isOpen ? 'Close' : 'Open'} Documentation Sidebar`}
      className={isOpen ? 'text-primary' : undefined}
      onClick={onToggle}
    />
  );
}

export function DocsSidebar({ className }: DocsSidebarProps): React.JSX.Element {
  const { isDocsSidebarOpen, setIsDocsSidebarOpen } = useDocsSidebarProvider();

  return (
    <FloatingPanel isOpen={isDocsSidebarOpen} side='right' className={className} onOpenChange={setIsDocsSidebarOpen}>
      <FloatingPanelContent className={cn('overflow-hidden rounded-md border', isDocsSidebarOpen && 'z-100')}>
        <FloatingPanelContentHeader>
          <FloatingPanelContentTitle>
            <Link to='/docs/runtime' aria-label='Tau documentation' className='inline-flex min-w-0 items-center'>
              <TauWordmark className='h-5 max-w-[140px] shrink-0 py-0.5 text-primary' />
            </Link>
          </FloatingPanelContentTitle>
          <FloatingPanelContentHeaderActions className='md:opacity-100'>
            <FloatingPanelClose
              icon={XIcon}
              tooltipContent={(isOpen) => `${isOpen ? 'Close' : 'Open'} Documentation Sidebar`}
              className='md:hidden'
            />
          </FloatingPanelContentHeaderActions>
        </FloatingPanelContentHeader>

        <FloatingPanelContentBody className='flex flex-col overflow-hidden p-0'>
          <div className='flex shrink-0 flex-col gap-1.5 border-b p-2'>
            <DocsSidebarSearch />
            <DocsSidebarFrameworkSelector />
          </div>
          <SidebarContent className='min-h-0 flex-1 overflow-y-auto p-1'>
            <SidebarGroup>
              <SidebarMenu>
                <DocsSidebarItems />
              </SidebarMenu>
            </SidebarGroup>
          </SidebarContent>
        </FloatingPanelContentBody>
      </FloatingPanelContent>
    </FloatingPanel>
  );
}

type DocumentSection = {
  readonly id: string;
  readonly label: string;
  readonly icon: ReactNode | string | undefined;
  readonly url: string;
};

const renderSectionIcon = (icon: ReactNode | string | undefined): ReactNode => {
  if (icon === undefined || icon === null) {
    return null;
  }

  if (typeof icon === 'string') {
    return <DocsIcon iconString={icon} className='size-4 shrink-0' />;
  }

  return icon;
};

function getDocumentSections(root: PageTree.Root): DocumentSection[] {
  const sections: DocumentSection[] = [];

  for (const child of root.children) {
    if (child.type === 'folder' && child.root) {
      const firstPage = child.children.find((c): c is PageTree.Item => c.type === 'page');
      const firstUrl = child.index?.url ?? firstPage?.url;
      if (firstUrl) {
        sections.push({
          id: child.$id ?? firstUrl,
          label: typeof child.name === 'string' ? child.name : firstUrl,
          icon: child.icon,
          url: firstUrl,
        });
      }
    }
  }

  return sections;
}

function useCurrentSection(sections: DocumentSection[]): DocumentSection | undefined {
  const location = useLocation();
  return useMemo(
    () => sections.find((section) => location.pathname.startsWith(section.url)) ?? sections[0],
    [sections, location.pathname],
  );
}

function DocsSidebarFrameworkSelector({ className }: { readonly className?: string }): React.JSX.Element {
  const { full } = useTreeContext();
  const navigate = useNavigate();
  const sections = useMemo(() => getDocumentSections(full), [full]);
  const currentSection = useCurrentSection(sections);

  const groupedItems = [
    {
      name: 'Documentation',
      items: sections,
    },
  ];

  return (
    <ComboBoxResponsive<DocumentSection>
      searchPlaceHolder='Search sections...'
      isSearchEnabled={false}
      groupedItems={groupedItems}
      labelClassName='px-2'
      renderLabel={(section) => (
        <div className='flex min-w-0 items-center gap-2'>
          {renderSectionIcon(section.icon)}
          <span className='truncate'>{section.label}</span>
        </div>
      )}
      getValue={(section) => section.id}
      value={currentSection}
      title='Select Section'
      description='Choose which documentation section to view'
      popoverProperties={{
        align: 'start',
        sideOffset: 4,
        className: 'w-[var(--radix-popover-trigger-width)] p-0',
      }}
      onSelect={(value) => {
        const section = sections.find((s) => s.id === value);
        if (section) {
          void navigate(section.url);
        }
      }}
    >
      <Button variant='outline' className={cn('h-9 w-full justify-between gap-2 px-3 text-sm font-medium', className)}>
        <span className='flex min-w-0 items-center gap-2'>
          {renderSectionIcon(currentSection?.icon)}
          <span className='truncate'>{currentSection?.label ?? 'Docs'}</span>
        </span>
        <ChevronsUpDown className='size-3.5 shrink-0 text-muted-foreground' />
      </Button>
    </ComboBoxResponsive>
  );
}

function DocsSidebarSearch(): React.JSX.Element | undefined {
  const { enabled, setOpenSearch } = useSearchContext();

  const { formattedKeyCombination: formattedSearchKeyCombination } = useKeybinding(
    { key: '/' },
    () => {
      // @ts-expect-error -- fumadocs has incorrect typing
      setOpenSearch((previous) => !previous);
    },
    { ignoreInputs: true },
  );

  if (!enabled) {
    return undefined;
  }

  return (
    <Button
      variant='outline'
      className='h-9 w-full justify-between gap-2 px-3 text-sm font-normal text-muted-foreground'
      onClick={() => {
        setOpenSearch(true);
      }}
    >
      <span className='inline-flex min-w-0 items-center gap-2'>
        <SearchIcon className='size-4 shrink-0' aria-hidden />
        <span>Search</span>
      </span>
      <KeyShortcut>{formattedSearchKeyCombination}</KeyShortcut>
    </Button>
  );
}

function DocsSidebarItems(): React.JSX.Element {
  const { root } = useTreeContext();

  const children = useMemo(() => {
    function renderItems(items: PageTree.Node[]): ReactNode[] {
      return items.map((item) => (
        <DocsSidebarItem key={item.$id} item={item}>
          {item.type === 'folder' ? renderItems(item.children) : null}
        </DocsSidebarItem>
      ));
    }

    return renderItems(root.children);
  }, [root]);

  // oxlint-disable-next-line react/jsx-no-useless-fragment -- children IS an array of ReactNodes
  return <>{children}</>;
}

function DocsSidebarItem({
  item,
  children,
}: {
  readonly item: PageTree.Node;
  readonly children: ReactNode;
}): React.JSX.Element {
  const renderIcon = (icon: ReactNode | string | undefined): ReactNode => {
    if (icon === undefined || icon === null) {
      return null;
    }

    if (typeof icon === 'string') {
      return <DocsIcon iconString={icon} />;
    }

    return icon;
  };

  if (item.type === 'page') {
    return (
      <SidebarMenuItem>
        <NavLink end prefetch='viewport' preventScrollReset={false} to={item.url}>
          {({ isActive, isPending }) => (
            <SidebarMenuButton asChild isActive={isActive} className={linkVariants({ active: isActive })}>
              <span>
                {isPending ? <Loader /> : renderIcon(item.icon)}
                <span>{item.name}</span>
              </span>
            </SidebarMenuButton>
          )}
        </NavLink>
      </SidebarMenuItem>
    );
  }

  if (item.type === 'separator') {
    return <SidebarGroupLabel className='mt-4 px-1.5 first:mt-0'>{item.name}</SidebarGroupLabel>;
  }

  // Folder type
  const folderIndex = item.index;
  return (
    <div>
      {folderIndex ? (
        <SidebarMenuItem>
          <NavLink end prefetch='viewport' preventScrollReset={false} to={folderIndex.url}>
            {({ isActive, isPending }) => (
              <SidebarMenuButton asChild isActive={isActive} className={linkVariants({ active: isActive })}>
                <span>
                  {isPending ? <Loader /> : renderIcon(folderIndex.icon)}
                  <span>{folderIndex.name}</span>
                </span>
              </SidebarMenuButton>
            )}
          </NavLink>
        </SidebarMenuItem>
      ) : (
        <li className='px-2'>
          <div className={cn(linkVariants(), 'justify-start text-start')}>
            {renderIcon(item.icon)}
            <span>{item.name}</span>
          </div>
        </li>
      )}
      <div className='ml-2 flex flex-col space-y-1 border-l pl-4'>
        <SidebarMenu>{children}</SidebarMenu>
      </div>
    </div>
  );
}

export function DocsSidebarWithTrigger(): React.JSX.Element {
  const { isDocsSidebarOpen, setIsDocsSidebarOpen } = useDocsSidebarProvider();

  return (
    <SidebarOffset asChild via='left'>
      <div
        className={cn(
          // Left
          'left-2',
          // Top
          'top-(--header-height)',

          // Transition
          'transition-[top,left] duration-200 ease-linear',
          'fixed',
        )}
      >
        <SidebarOffset asChild via='left'>
          <DocsSidebar
            className={cn(
              // Left
              'left-2',
              'data-[state=closed]:bg-muted',
              // Top
              'top-(--header-height)',
              'pb-[calc(var(--header-height)+var(--spacing)*2)]',

              // Width - collapse when closed, expand when open (no animation)
              'w-0',
              'data-[state=open]:w-full',

              // Transition (excluding width to prevent animation)
              'transition-[top,left] duration-200 ease-linear',

              // Max width
              'max-w-[calc(100dvw-var(--spacing)*4)]',
              'md:max-w-(--docs-sidebar-width)',
              'fixed',
            )}
          />
        </SidebarOffset>
        <div
          className='absolute top-0'
          style={{
            left: isDocsSidebarOpen ? 'calc(var(--docs-sidebar-width) + var(--spacing)*2)' : 0,
          }}
        >
          <DocsSidebarTrigger
            isOpen={isDocsSidebarOpen}
            onToggle={() => {
              setIsDocsSidebarOpen((previous) => !previous);
            }}
          />
        </div>
      </div>
    </SidebarOffset>
  );
}
