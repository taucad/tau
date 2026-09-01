import { Link } from 'react-router';
import { ArrowRight, Package } from 'lucide-react';
import { Button } from '@taucad/ui/components/button';
import { SvgIcon } from '#components/icons/svg-icon.js';
import { formatKernelList } from '#utils/kernel.utils.js';

export function IntegrationSection(): React.JSX.Element {
  const kernelList = formatKernelList('or');

  return (
    <div className='border-t bg-muted/30'>
      <div className='container mx-auto px-4 py-20'>
        <div className='mx-auto max-w-4xl'>
          <div className='mb-12 text-center'>
            <h2 className='text-3xl font-semibold tracking-tight md:text-4xl'>Integrate with Your Workflow</h2>
            <p className='mx-auto mt-4 max-w-2xl text-muted-foreground'>
              Import projects from GitHub or automate CAD exports with our published command-line tools.
            </p>
          </div>

          <div className='grid gap-8 md:grid-cols-2'>
            {/* GitHub Import */}
            <div className='rounded-xl border bg-background p-6'>
              <div className='mb-4 flex items-center gap-3'>
                <div className='flex size-10 items-center justify-center rounded-lg bg-primary/10'>
                  <SvgIcon id='github' className='size-5 text-primary' />
                </div>
                <h3 className='text-lg font-semibold'>Import from GitHub</h3>
              </div>
              <p className='mb-4 text-sm text-muted-foreground'>
                Import any {kernelList} project directly from GitHub. Just paste the repository URL and start building.
              </p>
              <Button asChild variant='outline' className='w-full'>
                <Link to='/import'>
                  <SvgIcon id='github' className='mr-2 size-4' />
                  Import Repository
                  <ArrowRight className='ml-auto size-4' />
                </Link>
              </Button>
            </div>

            {/* CAD CLI */}
            <div className='rounded-xl border bg-background p-6'>
              <div className='mb-4 flex items-center gap-3'>
                <div className='flex size-10 items-center justify-center rounded-lg bg-primary/10'>
                  <Package className='size-5 text-primary' />
                </div>
                <h3 className='text-lg font-semibold'>CAD CLI</h3>
              </div>
              <p className='mb-4 text-sm text-muted-foreground'>
                Render and export CAD files from scripts, CI, or your terminal.
              </p>
              <div className='rounded-lg bg-sidebar p-3 font-mono text-sm'>
                <span className='text-muted-foreground'>$</span> pnpm add @taucad/cli
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
