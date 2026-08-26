import { Link } from 'react-router';
import { ArrowRight, FileCode, Package, Lock } from 'lucide-react';
import { Button } from '#components/ui/button.js';
import { SvgIcon } from '#components/icons/svg-icon.js';
import { formatKernelList } from '#utils/kernel.utils.js';

/**
 * "Own your work" — the no-lock-in story. Everything is code and files: import
 * from GitHub, convert programmatically, export and leave anytime. Merges the
 * legacy integration section content with the ownership pillar.
 */
export function OwnYourWorkSection(): React.JSX.Element {
  const kernelList = formatKernelList('or');

  return (
    <section className='border-b'>
      <div className='container mx-auto px-4 py-20'>
        <div className='mx-auto mb-12 max-w-2xl text-center'>
          <h2 className='text-3xl font-semibold tracking-tight md:text-4xl'>Own your work. No lock-in, ever.</h2>
          <p className='mt-4 text-muted-foreground'>
            Every design is code and files — versionable, diffable, and portable. Bring projects in, take them out, or
            run the pieces in your own app. Apache-2.0 across the embeddable stack.
          </p>
        </div>

        <div className='grid gap-6 md:grid-cols-3'>
          <div className='rounded-xl border bg-background p-6'>
            <div className='mb-4 flex size-10 items-center justify-center rounded-lg bg-primary/10'>
              <SvgIcon id='github' className='size-5 text-primary' />
            </div>
            <h3 className='mb-2 font-semibold'>Import from GitHub</h3>
            <p className='mb-4 text-sm text-muted-foreground'>
              Bring any {kernelList} project straight from a repo — paste the URL and start building.
            </p>
            <Button asChild variant='outline' size='sm' className='w-full'>
              <Link to='/import'>
                Import repository
                <ArrowRight className='ml-auto size-4' />
              </Link>
            </Button>
          </div>

          <div className='rounded-xl border bg-background p-6'>
            <div className='mb-4 flex size-10 items-center justify-center rounded-lg bg-primary/10'>
              <Package className='size-5 text-primary' />
            </div>
            <h3 className='mb-2 font-semibold'>Convert programmatically</h3>
            <p className='mb-4 text-sm text-muted-foreground'>
              Render and export CAD files in your own scripts and CI pipelines with the published Tau CLI.
            </p>
            <div className='rounded-lg bg-sidebar p-3 font-mono text-sm'>
              <span className='text-muted-foreground'>$</span> pnpm add @taucad/cli
            </div>
          </div>

          <div className='rounded-xl border bg-background p-6'>
            <div className='mb-4 flex size-10 items-center justify-center rounded-lg bg-primary/10'>
              <FileCode className='size-5 text-primary' />
            </div>
            <h3 className='mb-2 font-semibold'>Everything is a file</h3>
            <p className='text-sm text-muted-foreground'>
              Geometry, tests, and metadata are plain files with a full history — reproducible, reviewable, and runnable
              outside Tau.
            </p>
            <div className='mt-4 inline-flex items-center gap-2 text-sm text-muted-foreground'>
              <Lock className='size-4 text-primary' />
              Export or leave anytime
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
