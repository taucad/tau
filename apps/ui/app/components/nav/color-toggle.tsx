import { Pipette } from 'lucide-react';
import { ColorPicker } from '#components/ui/color-picker.js';
import { Button } from '#components/ui/button.js';
import { SidebarMenuButton } from '#components/ui/sidebar.js';
import { cn } from '#utils/ui.utils.js';
import { useColor } from '#hooks/use-color.js';

export function ColorToggle(): React.JSX.Element {
  const { hue, setHue, resetHue } = useColor();

  return (
    <SidebarMenuButton asChild>
      <ColorPicker
        asChild
        value={{ h: hue, s: 100, l: 75 }}
        onChange={(value) => {
          setHue(value.h);
        }}
        onReset={resetHue}
      >
        <Button
          variant="ghost"
          size="icon"
          className={cn(
            'w-auto overflow-hidden border-none bg-transparent shadow-none ring-sidebar-ring! dark:bg-transparent',
            // Active styles
            'data-[state=open]:bg-primary hover:data-[state=open]:bg-primary',
            // Text styles
            'data-[state=open]:text-primary-foreground hover:data-[state=open]:text-primary-foreground',
          )}
        >
          <Pipette className="size-4" />
        </Button>
      </ColorPicker>
    </SidebarMenuButton>
  );
}
