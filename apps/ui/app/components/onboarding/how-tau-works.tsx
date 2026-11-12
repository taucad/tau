import {
  Boxes,
  CircleCheck,
  CircleHelp,
  Download,
  Hammer,
  HardDrive,
  Layers,
  PencilRuler,
  ShieldCheck,
} from 'lucide-react';
import type { PersonProfile } from '@taucad/preferences';
import { Badge } from '@taucad/ui/components/badge';
import { Heading } from '@taucad/ui/components/heading';
import { cn } from '@taucad/ui/utils/cn';
import { howTauWorksCopy } from '#components/onboarding/setup-copy.js';

function ConceptCard({
  icon,
  step,
  title,
  body,
  children,
  testId,
}: {
  readonly icon: React.ReactNode;
  readonly step?: string;
  readonly title: string;
  readonly body: string;
  readonly children?: React.ReactNode;
  readonly testId: string;
}): React.JSX.Element {
  return (
    <article className='flex min-w-0 flex-col gap-3 rounded-xl border bg-card p-4' data-testid={testId}>
      <div className='flex items-center gap-2 text-muted-foreground [&>svg]:size-4'>
        {icon}
        {step === undefined ? null : <span className='text-xs font-medium'>{step}</span>}
      </div>
      <div className='flex flex-col gap-1'>
        <Heading level={2} variant='label'>
          {title}
        </Heading>
        <p className='text-xs text-muted-foreground'>{body}</p>
      </div>
      {children === undefined ? null : (
        <div className='mt-auto flex flex-col gap-1.5 rounded-lg bg-muted/50 p-3 text-xs'>{children}</div>
      )}
    </article>
  );
}

/**
 * Design, Verify, Build: the three things a person does in Tau, in order, then the kernel card, the
 * warehouse card (with `partsWarehouse`) and, on the desktop, "Runs on your machine". Step 4 of setup and Help →
 * "How Tau works" show the same cards.
 *
 * @param properties - The profile and the host facts.
 * @returns The cards.
 */
export function HowTauWorks({
  profile,
  isDesktop,
  isWarehouseEnabled,
}: {
  readonly profile: PersonProfile;
  readonly isDesktop: boolean;
  readonly isWarehouseEnabled: boolean;
}): React.JSX.Element {
  const { design, verify, build, kernels, warehouse, desktop } = howTauWorksCopy;
  const isToldWhatTheyMake = profile.goals.some((goal) => goal !== 'exploring');
  const isElectronics = profile.goals.includes('electronics') || profile.goals.includes('product');
  const files = isElectronics ? kernels.filesElectronics : kernels.files;
  const extraCards = (isWarehouseEnabled ? 1 : 0) + (isDesktop ? 1 : 0);
  return (
    <div className='flex min-w-0 flex-col gap-3'>
      <div className='grid min-w-0 gap-3 md:grid-cols-3' data-testid='design-verify-build'>
        <ConceptCard
          testId='concept-design'
          icon={<PencilRuler aria-hidden='true' />}
          step={design.step}
          title={design.title}
          body={design.body}
        >
          <span className='text-muted-foreground'>{design.kernel}</span>
          <span className='flex flex-wrap items-center gap-1.5'>
            <Badge variant='outline'>{design.auto}</Badge>
            <span className='text-muted-foreground'>
              {isToldWhatTheyMake ? design.autoLineWithGoals : design.autoLine}
            </span>
          </span>
        </ConceptCard>
        <ConceptCard
          testId='concept-verify'
          icon={<ShieldCheck aria-hidden='true' />}
          step={verify.step}
          title={verify.title}
          body={verify.body}
        >
          <ul className='flex flex-col gap-1'>
            {verify.checks.map((check) => (
              <li key={check.text} className='flex items-start gap-2'>
                {check.state === 'pass' ? (
                  <span className='flex h-lh shrink-0 items-center'>
                    <CircleCheck className='size-3.5 text-success' aria-hidden='true' />
                  </span>
                ) : (
                  <span className='flex h-lh shrink-0 items-center'>
                    <CircleHelp className='size-3.5 text-warning' aria-hidden='true' />
                  </span>
                )}
                <span>
                  <span className='sr-only'>{check.state === 'pass' ? verify.passed : verify.unknown}</span>
                  {check.text}
                </span>
              </li>
            ))}
          </ul>
        </ConceptCard>
        <ConceptCard
          testId='concept-build'
          icon={<Hammer aria-hidden='true' />}
          step={build.step}
          title={build.title}
          body={build.body}
        >
          <span className='flex items-start gap-1.5 text-muted-foreground'>
            <span className='flex h-lh shrink-0 items-center'>
              <Download className='size-3.5' aria-hidden='true' />
            </span>
            {build.note}
          </span>
        </ConceptCard>
      </div>
      <div className={cn('grid min-w-0 gap-3', extraCards > 0 ? 'md:grid-cols-2' : '')}>
        <ConceptCard
          testId='concept-kernels'
          icon={<Layers aria-hidden='true' />}
          title={kernels.title}
          body={isElectronics ? kernels.bodyElectronics : kernels.body}
        >
          <ul className='flex flex-col gap-1.5' aria-label={kernels.filesLabel}>
            {files.map((entry) => (
              <li key={entry.file} className='flex flex-wrap items-center justify-between gap-2'>
                <code className='text-xs'>{entry.file}</code>
                <span className='flex items-center gap-1.5 text-muted-foreground'>
                  {entry.kernel}
                  <Badge variant='secondary'>{entry.family}</Badge>
                </span>
              </li>
            ))}
          </ul>
        </ConceptCard>
        {isWarehouseEnabled ? (
          <ConceptCard
            testId='concept-warehouse'
            icon={<Boxes aria-hidden='true' />}
            title={warehouse.title}
            body={warehouse.body}
          >
            <ul className='flex flex-col gap-1' aria-label={warehouse.partsLabel}>
              {warehouse.parts.map((part) => (
                <li key={part}>{part}</li>
              ))}
            </ul>
          </ConceptCard>
        ) : null}
        {isDesktop ? (
          <ConceptCard
            testId='concept-desktop'
            icon={<HardDrive aria-hidden='true' />}
            title={desktop.title}
            body={desktop.body}
          >
            <span className='text-muted-foreground'>{desktop.firstUse}</span>
            <span>{desktop.firstUseLine}</span>
          </ConceptCard>
        ) : null}
      </div>
    </div>
  );
}
