import { Boxes, Globe, GitFork, Repeat, WifiOff } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';

type Proof = {
  readonly icon: LucideIcon;
  readonly label: string;
  readonly detail: string;
};

const proofs: Proof[] = [
  { icon: Globe, label: 'Browser-native', detail: 'No install' },
  { icon: Boxes, label: '6 CAD kernels', detail: 'One platform' },
  { icon: Repeat, label: '39 → 14 formats', detail: 'Convert anything' },
  { icon: GitFork, label: 'MIT open source', detail: 'Yours to keep' },
  { icon: WifiOff, label: 'Works offline', detail: 'Local-first' },
];

/**
 * Compact credibility strip beneath the hero: the concrete, checkable facts that
 * separate Tau from a demo — open, browser-native, multi-kernel, no lock-in.
 */
export function ProofStrip(): React.JSX.Element {
  return (
    <section className='border-b bg-muted/20'>
      <div className='container mx-auto flex flex-wrap items-center justify-center gap-x-8 gap-y-4 px-4 py-6'>
        {proofs.map((proof) => (
          <div key={proof.label} className='flex items-center gap-2.5'>
            <proof.icon className='size-4 shrink-0 text-primary' />
            <span className='text-sm font-medium'>{proof.label}</span>
            <span className='hidden text-sm text-muted-foreground sm:inline'>— {proof.detail}</span>
          </div>
        ))}
      </div>
    </section>
  );
}
