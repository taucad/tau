import type { PageTree } from 'fumadocs-core/server';
import { useMemo, useCallback, createContext, useContext, useEffect } from 'react';
import type { ReactNode } from 'react';
import { useTreeContext } from 'fumadocs-ui/contexts/tree';
import { useSearchContext } from 'fumadocs-ui/contexts/search';
import { cva } from 'class-variance-authority';
import { XIcon, MenuIcon } from 'lucide-react';
import { useLocation, NavLink } from 'react-router';
import { cn } from '#utils/ui.utils.js';
import { useCookie } from '#hooks/use-cookie.js';
import { cookieName } from '#constants/cookie.constants.js';
import { KeyShortcut } from '#components/ui/key-shortcut.js';
import {
  FloatingPanel,
  FloatingPanelContent,
  FloatingPanelContentHeader,
  FloatingPanelContentTitle,
  FloatingPanelContentBody,
  FloatingPanelToggle,
} from '#components/ui/floating-panel.js';
import {
  SidebarContent,
  SidebarGroup,
  SidebarMenu,
  SidebarMenuItem,
  SidebarMenuButton,
  SidebarGroupLabel,
} from '#components/ui/sidebar.js';
import { LoadingSpinner } from '#components/ui/loading-spinner.js';
import { DocsIcon } from '#components/icons/docs-icon.js';
import { metaConfig } from '#config.js';
import { useIsMobile } from '#hooks/use-mobile.js';
import { Button } from '#components/ui/button.js';
import { useKeydown } from '#hooks/use-keydown.js';

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
  readonly isExpanded?: boolean;
  readonly setIsExpanded?: (value: boolean | ((current: boolean) => boolean)) => void;
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

export function DocsSidebar({ className, isExpanded = true, setIsExpanded }: DocsSidebarProps): React.JSX.Element {
  return (
    <FloatingPanel isOpen={isExpanded} side="left" className={className} onOpenChange={setIsExpanded}>
      <FloatingPanelContent className="overflow-hidden rounded-md border">
        <FloatingPanelContentHeader>
          <FloatingPanelContentTitle className="flex w-full items-center justify-between gap-1">
            <FloatingPanelToggle
              openIcon={MenuIcon}
              closeIcon={
                <span>
                  <MenuIcon className="hidden size-6 text-primary group-hover:hidden" />
                  <XIcon className="text-primary md:hidden md:group-hover:block" />
                </span>
              }
              openTooltip="Open Documentation Sidebar"
              closeTooltip="Close Documentation Sidebar"
              variant="absolute"
            />
            {metaConfig.name}
            <DocsSidebarSearch />
          </FloatingPanelContentTitle>
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

  const { formattedKeyCombination: formattedSearchKeyCombination } = useKeydown({ key: '/' }, () => {
    // @ts-expect-error -- fumadocs has incorrect typing
    setOpenSearch((previous) => !previous);
  });

  if (!enabled) {
    return undefined;
  }

  return (
    <Button
      variant="outline"
      className="mr-0.5 h-6 w-fit px-2 text-xs font-normal"
      onClick={() => {
        setOpenSearch(true);
      }}
    >
      Search Docs
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
  const renderIcon = (icon: ReactNode | string | undefined): ReactNode => {
    if (!icon) {
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
        <NavLink end to={item.url} tabIndex={-1}>
          {({ isActive, isPending }) => (
            <SidebarMenuButton isActive={isActive} className={linkVariants({ active: isActive })}>
              {isPending ? <LoadingSpinner /> : renderIcon(item.icon)}
              <span>{item.name}</span>
            </SidebarMenuButton>
          )}
        </NavLink>
      </SidebarMenuItem>
    );
  }

  if (item.type === 'separator') {
    return <SidebarGroupLabel className="mt-4 px-1.5 first:mt-0">{item.name}</SidebarGroupLabel>;
  }

  // Folder type
  const folderIndex = item.index;
  return (
    <div>
      {folderIndex ? (
        <SidebarMenuItem>
          <NavLink end to={folderIndex.url} tabIndex={-1}>
            {({ isActive, isPending }) => (
              <SidebarMenuButton isActive={isActive} className={linkVariants({ active: isActive })}>
                {isPending ? <LoadingSpinner /> : renderIcon(folderIndex.icon)}
                <span>{folderIndex.name}</span>
              </SidebarMenuButton>
            )}
          </NavLink>
        </SidebarMenuItem>
      ) : (
        <li className="px-2">
          <div className={cn(linkVariants(), 'justify-start text-start')}>
            {renderIcon(item.icon)}
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
