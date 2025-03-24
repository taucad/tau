import { Button } from '@/components/ui/button';
import { SidebarMenuButton } from '@/components/ui/sidebar';
import { Pipette } from 'lucide-react';
import { ColorPicker } from '../ui/color-picker';
import { cn } from '@/utils/ui';
import { useColor } from '@/hooks/use-color';

export const ColorToggle = () => {
  const { hue, setHue, resetHue } = useColor();

  return (
    <SidebarMenuButton asChild>
      <ColorPicker asChild value={{ h: hue, s: 100, l: 75 }} onChange={(value) => setHue(value.h)} onReset={resetHue}>
        <Button
          variant="ghost"
          size="icon"
          className={cn(
            'w-auto overflow-hidden bg-transparent dark:bg-transparent border-none',
            // Active styles
            'data-[state=open]:bg-primary hover:data-[state=open]:bg-primary',
            // Text styles
            'data-[state=open]:text-primary-foreground hover:data-[state=open]:text-primary-foreground',
          )}
        >
          <Pipette className="w-4 h-4" />
        </Button>
      </ColorPicker>
    </SidebarMenuButton>
  );
};
