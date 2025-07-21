import { Cog, Cpu, Zap } from 'lucide-react';
import type { Category } from '~/types/cad.types.js';
import { cn } from '~/utils/ui.js';

export function CategoryBadge({ category }: { readonly category: Category }): React.JSX.Element {
  const icons = {
    mechanical: <Cog className="size-4" />,
    electrical: <Zap className="size-4" />,
    firmware: <Cpu className="size-4" />,
  };

  const colors = {
    mechanical: 'text-blue',
    electrical: 'text-yellow',
    firmware: 'text-purple',
  };

  return (
    <div className={cn('flex items-center gap-1.5', colors[category])}>
      {icons[category]}
      <span className="capitalize">{category}</span>
    </div>
  );
}
