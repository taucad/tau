import type { PageTree } from 'fumadocs-core/server';
import { useMemo, useCallback, createContext, useContext, useEffect } from 'react';
import type { ReactNode } from 'react';
import { useTreeContext } from 'fumadocs-ui/contexts/tree';
import { useSearchContext } from 'fumadocs-ui/contexts/search';
import Link from 'fumadocs-core/link';
import { usePathname } from 'fumadocs-core/framework';
import { cva } from 'class-variance-authority';
import { MenuIcon, XIcon, SearchIcon } from 'lucide-react';
import { useLocation } from 'react-router';
import { cn } from '#utils/ui.utils.js';
import { useCookie } from '#hooks/use-cookie.js';
import { cookieName } from '#constants/cookie.constants.js';
import { KeyShortcut } from '#components/ui/key-shortcut.js';
import { formatKeyCombination } from '#utils/keys.utils.js';
import {
  FloatingPanel,
  FloatingPanelTrigger,
  FloatingPanelToggle,
  FloatingPanelContent,
  FloatingPanelContentHeader,
  FloatingPanelContentTitle,
  FloatingPanelContentBody,
} from '#components/ui/floating-panel.js';
import {
  SidebarContent,
  SidebarGroup,
  SidebarMenu,
  SidebarMenuItem,
  SidebarMenuButton,
  SidebarGroupLabel,
} from '#components/ui/sidebar.js';
import { Separator } from '#components/ui/separator.js';
import { Tau } from '#components/icons/tau.js';
import { metaConfig } from '#config.js';
import { useIsMobile } from '#hooks/use-mobile.js';

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

  const value = useMemo(() => ({ isDocsSidebarOpen, toggleDocsSidebar }), [isDocsSidebarOpen, toggleDocsSidebar]);

  return (
    <DocsSidebarProviderContext.Provider value={value}>
      <div
        data-slot="docs-sidebar"
        style={{
          '--docs-sidebar-width': docsSidebarWidth,
          '--docs-sidebar-width-icon': docsSidebarWidthIcon,
          '--docs-sidebar-toggle-width-current': isDocsSidebarOpen ? '0px' : docsSidebarWidthIcon,
          '--docs-sidebar-width-current': isDocsSidebarOpen ? docsSidebarWidth : '0px',
        }}
        className="size-full"
      >
        {children}
      </div>
    </DocsSidebarProviderContext.Provider>
  );
}

export function DocsSidebar({ className }: DocsSidebarProps): React.JSX.Element {
  const [isDocsSidebarOpen, setIsDocsSidebarOpen] = useCookie(cookieName.docsOpSidebar, false);

  return (
    <FloatingPanel
      isOpen={isDocsSidebarOpen}
      side="left"
      className={cn('z-20 w-(--docs-sidebar-width-icon) data-[state=open]:w-full', className)}
      onOpenChange={setIsDocsSidebarOpen}
    >
      <FloatingPanelToggle
        openIcon={MenuIcon}
        closeIcon={
          <span>
            <Tau className="hidden size-6 text-primary md:block md:group-hover:hidden" />
            <XIcon className="text-primary md:hidden md:group-hover:block" />
          </span>
        }
        openTooltip="Open Documentation Sidebar"
        closeTooltip="Close Documentation Sidebar"
        variant="absolute"
      />
      <Separator
        orientation="vertical"
        className="absolute left-1/2 z-10 my-2 h-4! -translate-x-1/2 group-data-[state=open]:hidden"
      />
      <DocsSidebarSearch />

      <FloatingPanelContent>
        <FloatingPanelContentHeader>
          <FloatingPanelContentTitle className="flex items-center gap-1">{metaConfig.name}</FloatingPanelContentTitle>
        </FloatingPanelContentHeader>

        <FloatingPanelContentBody>
          <SidebarContent className="p-1">
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

function DocsSidebarSearch(): React.JSX.Element | undefined {
  const { enabled, setOpenSearch } = useSearchContext();

  if (!enabled) {
    return undefined;
  }

  return (
    <FloatingPanelTrigger
      icon={SearchIcon}
      tooltipContent={
        <div className="flex items-center gap-2">
          Search Documentation
          <KeyShortcut variant="tooltip">{formatKeyCombination({ key: 'K', metaKey: true })}</KeyShortcut>
        </div>
      }
      tooltipSide="right"
      variant="static"
      onClick={() => {
        setOpenSearch(true);
      }}
    />
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

  // eslint-disable-next-line react/jsx-no-useless-fragment -- children IS an array of ReactNodes
  return <>{children}</>;
}

function DocsSidebarItem({
  item,
  children,
}: {
  readonly item: PageTree.Node;
  readonly children: ReactNode;
}): React.JSX.Element {
  const pathname = usePathname();

  if (item.type === 'page') {
    return (
      <SidebarMenuItem>
        <SidebarMenuButton asChild isActive={pathname === item.url}>
          <Link href={item.url} className={linkVariants({ active: pathname === item.url })}>
            {item.icon}
            <span>{item.name}</span>
          </Link>
        </SidebarMenuButton>
      </SidebarMenuItem>
    );
  }

  if (item.type === 'separator') {
    return <SidebarGroupLabel className="mt-4 px-1.5 first:mt-0">{item.name}</SidebarGroupLabel>;
  }

  // Folder type
  return (
    <div>
      {item.index ? (
        <SidebarMenuItem>
          <SidebarMenuButton asChild isActive={pathname === item.index.url}>
            <Link href={item.index.url} className={linkVariants({ active: pathname === item.index.url })}>
              {item.index.icon}
              <span>{item.index.name}</span>
            </Link>
          </SidebarMenuButton>
        </SidebarMenuItem>
      ) : (
        <li className="px-2">
          <div className={cn(linkVariants(), 'justify-start text-start')}>
            {item.icon}
            <span>{item.name}</span>
          </div>
        </li>
      )}
      <div className="ml-2 flex flex-col space-y-1 border-l pl-4">
        <SidebarMenu>{children}</SidebarMenu>
      </div>
    </div>
  );
}
