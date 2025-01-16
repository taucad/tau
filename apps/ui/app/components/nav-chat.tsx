import { SidebarMenuButton } from "@/components/ui/sidebar"
import { Plus } from "lucide-react";
import { SidebarGroup } from "./ui/sidebar";
import { Link } from "@remix-run/react";

export const NavChat = () => {
    return (
        <SidebarGroup>
            <Link to="/chat">
                <SidebarMenuButton tooltip="New Build" variant='outline'>
                    <Plus />
                    <span>New Build</span>
                </SidebarMenuButton>
            </Link>
        </SidebarGroup>
    )
}
