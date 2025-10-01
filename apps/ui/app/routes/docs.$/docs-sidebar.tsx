'use client';
import type { PageTree } from 'fumadocs-core/server';
import { type ReactNode, useMemo, useCallback, createContext, useContext } from 'react';
import { cn } from '#utils/ui.js';
import { useTreeContext } from 'fumadocs-ui/contexts/tree';
import { useSearchContext } from 'fumadocs-ui/contexts/search';
import Link from 'fumadocs-core/link';
import { usePathname } from 'fumadocs-core/framework';
import { cva } from 'class-variance-authority';
import { MenuIcon, XIcon, SearchIcon } from 'lucide-react';
import { useCookie } from '#hooks/use-cookie.js';
import { cookieName } from '#constants/cookie.constants.js';
import { KeyShortcut } from '#components/ui/key-shortcut.js';
import { formatKeyCombination } from '#utils/keys.js';
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

const docsSidebarWidthIcon = 'calc(var(--spacing) * 17)';
const docsSidebarWidth = 'calc(var(--spacing) * 72)';

const linkVariants = cva(
  'flex items-center gap-2 w-full py-1.5 rounded-lg text-fd-foreground/80 [&_svg]:size-4',
  {
    variants: {
      active: {
        true: 'text-fd-primary font-medium',
        false: 'hover:text-fd-accent-foreground',
      },
    },
  },
);

type DocsSidebarProps = {
  readonly className?: string;
};

const DocsSidebarProviderContext = createContext<{ isDocsSidebarOpen: boolean; toggleDocsSidebar: () => void } | undefined>(undefined);

export const useDocsSidebarProvider = () => {
  const context = useContext(DocsSidebarProviderContext);
  if (!context) {
    throw new Error('useDocsSidebarProvider must be used within a DocsSidebarProvider');
  }
  return context;
};

export function DocsSidebarProvider({ children }: { readonly children: ReactNode }): React.JSX.Element {
  const [isDocsSidebarOpen, setIsDocsSidebarOpen] = useCookie(cookieName.docsOpSidebar, false);
  
  const toggleDocsSidebar = useCallback(() => {
    setIsDocsSidebarOpen((previous) => !previous);
  }, [setIsDocsSidebarOpen]);

  return (
    <DocsSidebarProviderContext.Provider value={{ isDocsSidebarOpen, toggleDocsSidebar }}>
      <div data-slot="docs-sidebar"
      style={{
        '--docs-sidebar-width': docsSidebarWidth,
        '--docs-sidebar-width-icon': docsSidebarWidthIcon,
        '--docs-sidebar-toggle-width-current': isDocsSidebarOpen ? '0px' : docsSidebarWidthIcon,
        '--docs-sidebar-width-current': isDocsSidebarOpen ? docsSidebarWidth : '0px',
      }}
       className="size-full">{children}</div>
    </DocsSidebarProviderContext.Provider>
  );
}

export function DocsSidebar({ className }: DocsSidebarProps): React.JSX.Element {
  const [isDocsSidebarOpen, setIsDocsSidebarOpen] = useCookie(cookieName.docsOpSidebar, false);
  
  const toggleDocsSidebar = useCallback(() => {
    setIsDocsSidebarOpen((previous) => !previous);
  }, [setIsDocsSidebarOpen]);

  return (
    <FloatingPanel 
      open={isDocsSidebarOpen}
      onOpenChange={setIsDocsSidebarOpen}
      className={cn( 
        'w-(--docs-sidebar-width-icon) data-[state=open]:w-full',
        className)}>
      <FloatingPanelToggle
        openIcon={MenuIcon}
        closeIcon={XIcon}
        openTooltip="Open Documentation Sidebar"
        closeTooltip="Close Documentation Sidebar"
        variant="absolute"
        side="left"
        align="start"
        onClick={toggleDocsSidebar}
      />
      <Separator orientation="vertical" className="absolute z-10 h-4! my-2 group-data-[state=open]:hidden left-1/2 -translate-x-1/2"/>
      <DocsSidebarSearch />

      <FloatingPanelContent>
        <FloatingPanelContentHeader side="left">
          <FloatingPanelContentTitle>Documentation</FloatingPanelContentTitle>
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

function DocsSidebarSearch(): React.JSX.Element | null {
  const { enabled, setOpenSearch } = useSearchContext();
  
  if (!enabled) return null;

  return (
    <FloatingPanelTrigger
      icon={SearchIcon}
      tooltipContent={
        <div className="flex items-center gap-2">
          Search Documentation
          <KeyShortcut variant="tooltip">
            {formatKeyCombination({ key: 'K', metaKey: true })}
          </KeyShortcut>
        </div>
      }
      tooltipSide='right'
      variant="absolute"
      onClick={() => setOpenSearch(true)}
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
    return (
      <SidebarGroupLabel className="mt-4 first:mt-0 px-1.5">
        {item.name}
      </SidebarGroupLabel>
    );
  }

  // Folder type
  return (
    <div>
      {item.index ? (
        <SidebarMenuItem>
          <SidebarMenuButton asChild isActive={pathname === item.index.url}>
            <Link
              href={item.index.url}
              className={linkVariants({ active: pathname === item.index.url })}
            >
              {item.index.icon}
              <span>{item.index.name}</span>
            </Link>
          </SidebarMenuButton>
        </SidebarMenuItem>
      ) : (
        <li className="px-2">
          <div className={cn(linkVariants(), 'text-start justify-start')}>
            {item.icon}
            <span>{item.name}</span>
          </div>
        </li>
      )}
      <div className="pl-4 border-l ml-2 flex flex-col space-y-1">
        <SidebarMenu>{children}</SidebarMenu>
      </div>
    </div>
  );
}
