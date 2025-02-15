import { SidebarMenuButton } from '@/components/ui/sidebar';
import { Plus } from 'lucide-react';
import { SidebarGroup } from '../ui/sidebar';
import { Link } from '@remix-run/react';

export const NavChat = () => {
  return (
    // Elevate the sidebar group above the other items to ensure the new build button is always clickable
    <SidebarGroup className="z-10">
      <Link to="/builds/new">
        <SidebarMenuButton tooltip="New Build" variant="outline">
          <Plus />
          <span>New Build</span>
        </SidebarMenuButton>
      </Link>
    </SidebarGroup>
  );
};
