import * as DesignSystemSonner from '@taucad/ui/components/sonner';
import { useTheme } from '#hooks/use-theme.js';

type ToasterProperties = React.ComponentProps<typeof DesignSystemSonner.Toaster>;

function Toaster(properties: ToasterProperties): React.JSX.Element {
  const { theme } = useTheme();

  return <DesignSystemSonner.Toaster theme={theme} {...properties} />;
}

const { toast } = DesignSystemSonner;

export { Toaster, toast };
