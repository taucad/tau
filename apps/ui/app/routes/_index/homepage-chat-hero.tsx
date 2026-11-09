import { NavLink } from 'react-router';
import { HomeNewProjectComposerProvider } from '#hooks/active-chat-provider.js';
import { HomeChatComposer } from '#routes/_index/home-chat-composer.js';
import { Separator } from '@taucad/ui/components/separator';
import { buttonVariants } from '@taucad/ui/components/button';
import { Loader } from '@taucad/ui/components/loader';

/**
 * The homepage chat hero: "What do you want to build?" over the real chat
 * composer (kernel selector + textarea) with a "Build from code" escape hatch.
 * Shared by the legacy landing (flag off) and the signed-in home view (flag on),
 * both of which start new projects from the same persistent homepage draft.
 */
export function HomepageChatHero({ composer }: { readonly composer?: React.ReactNode } = {}): React.JSX.Element {
  return (
    <div className='container mx-auto px-4 py-6 pb-12 md:px-6 md:pt-32'>
      <div className='mx-auto max-w-3xl space-y-6 md:space-y-8'>
        <div className='mb-12 text-center'>
          <h1 className='mx-auto max-w-[16ch] text-3xl font-semibold tracking-tight text-balance md:max-w-[20ch] md:text-5xl'>
            What do you want to build?
          </h1>
        </div>

        <HomeNewProjectComposerProvider>{composer ?? <HomeChatComposer />}</HomeNewProjectComposerProvider>
        <div className='mx-auto my-6 flex w-20 items-center justify-center'>
          <Separator />
          <div className='mx-4 text-sm font-light text-muted-foreground'>or</div>
          <Separator />
        </div>
        <div className='flex justify-center'>
          {/* A plain secondary action beside the composer, not a second call to action (R15). */}
          <NavLink to='/projects/new' className={buttonVariants({ variant: 'outline' })}>
            {({ isPending }) => (
              <span aria-busy={isPending} className='flex items-center gap-2'>
                {isPending ? <Loader /> : null}
                Build from code
              </span>
            )}
          </NavLink>
        </div>
      </div>
    </div>
  );
}
