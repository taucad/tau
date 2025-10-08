import { cn } from "#utils/ui.js";
import { cva, type VariantProps } from "class-variance-authority";

export const emptyItemVariants = cva(
  "flex flex-col h-full items-center justify-center m-2 border border-dashed text-muted-foreground rounded-xs py-4 px-2 text-center text-sm",
  {
    variants: {
      variant: {
        default: "",
      },
    },
  }
);

export function EmptyItems({
  variant = "default",
  className,
  children
}: React.ComponentProps<'div'> & VariantProps<typeof emptyItemVariants>
): React.JSX.Element {
  return <div data-slot="empty-items" className={cn(emptyItemVariants({ variant, className }))}>{children}</div>;
}
