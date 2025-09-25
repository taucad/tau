import { useTheme } from 'remix-themes';
import { Toaster as Sonner } from 'sonner';

type ToasterProperties = React.ComponentProps<typeof Sonner>;

function Toaster({ ...properties }: ToasterProperties): React.JSX.Element {
  const [theme] = useTheme();

  return (
    <Sonner
      theme={theme as ToasterProperties['theme']}
      className="toaster group"
      toastOptions={{
        classNames: {
          toast:
            'group toast group-[.toaster]:[--border-radius:var(--radius-lg)] group-[.toaster]:bg-background group-[.toaster]:text-foreground group-[.toaster]:border-border group-[.toaster]:shadow-lg',
          description: 'group-[.toast]:text-muted-foreground',
          actionButton: 'group-[.toast]:bg-primary group-[.toast]:text-primary-foreground',
          cancelButton: 'group-[.toast]:bg-muted group-[.toast]:text-muted-foreground',
        },
      }}
      {...properties}
    />
  );
}

export { Toaster };
// eslint-disable-next-line no-barrel-files/no-barrel-files -- keeping all toast exports in one file
export { toast } from 'sonner';
