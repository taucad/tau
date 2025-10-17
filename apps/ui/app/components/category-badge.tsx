import { Brain, Cpu, Wrench, Zap } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import type { EngineeringDiscipline } from '@taucad/types';
import { cn } from '#utils/ui.utils.js';

const colors = {
  mechanical: 'text-blue',
  electrical: 'text-yellow',
  software: 'text-purple',
  firmware: 'text-green',
} as const satisfies Record<EngineeringDiscipline, string>;

const categoryIconsFromEngineeringDiscipline = {
  mechanical: Wrench,
  electrical: Zap,
  firmware: Cpu,
  software: Brain,
} as const satisfies Record<EngineeringDiscipline, LucideIcon>;

export function CategoryBadge({ category }: { readonly category: EngineeringDiscipline }): React.JSX.Element {
  const Icon = categoryIconsFromEngineeringDiscipline[category];

  return (
    <div className={cn('flex items-center gap-1.5', colors[category])}>
      <Icon className="size-4" />
      <span className="capitalize">{category}</span>
    </div>
  );
}
