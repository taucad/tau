import { communityGridClassName } from '#components/project-grid.js';
import { Skeleton } from '#components/ui/skeleton.js';

function CardSkeleton(): React.JSX.Element {
  return (
    <div className='overflow-hidden rounded-xl border'>
      <Skeleton className='aspect-4/3 w-full rounded-none' />
      <div className='space-y-2 p-3'>
        <Skeleton className='h-4 w-3/4' />
      </div>
    </div>
  );
}

export function CommunityGridSkeleton(): React.JSX.Element {
  return (
    <div className='container mx-auto px-4 py-8'>
      <div className='mb-2 flex flex-row items-center justify-between'>
        <Skeleton className='h-6 w-40' />
        <Skeleton className='h-5 w-16' />
      </div>
      <div className={communityGridClassName}>
        {Array.from({ length: 10 }, (_, i) => (
          <CardSkeleton key={i} />
        ))}
      </div>
    </div>
  );
}

export function HeroImageSkeleton(): React.JSX.Element {
  return (
    <div className='container mx-auto px-4 py-16'>
      <div className='mx-auto max-w-5xl'>
        <div className='mb-8 flex flex-col items-center gap-3'>
          <Skeleton className='h-8 w-72' />
          <Skeleton className='h-4 w-96 max-w-full' />
        </div>
        <div className='mb-8 flex flex-wrap justify-center gap-3'>
          {Array.from({ length: 5 }, (_, i) => (
            <Skeleton key={i} className='h-9 w-32 rounded-full' />
          ))}
        </div>
        <Skeleton className='mx-auto aspect-video max-w-4xl rounded-xl' />
      </div>
    </div>
  );
}

export function KernelsSkeleton(): React.JSX.Element {
  return (
    <div className='border-y bg-muted/20'>
      <div className='container mx-auto px-4 py-16'>
        <div className='mx-auto max-w-4xl'>
          <div className='mb-10 flex flex-col items-center gap-3'>
            <Skeleton className='h-8 w-64' />
            <Skeleton className='h-4 w-80 max-w-full' />
          </div>
          <div className='grid gap-4 sm:grid-cols-2 lg:grid-cols-4'>
            {Array.from({ length: 4 }, (_, i) => (
              <div key={i} className='rounded-xl border bg-background p-5'>
                <div className='mb-3 flex items-center gap-3'>
                  <Skeleton className='size-10 rounded-lg' />
                  <Skeleton className='h-5 w-20' />
                </div>
                <Skeleton className='h-3 w-full' />
                <Skeleton className='mt-2 h-3 w-3/4' />
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

export function IntegrationSkeleton(): React.JSX.Element {
  return (
    <div className='border-t bg-muted/30'>
      <div className='container mx-auto px-4 py-20'>
        <div className='mx-auto max-w-4xl'>
          <div className='mb-12 flex flex-col items-center gap-3'>
            <Skeleton className='h-9 w-72' />
            <Skeleton className='h-4 w-96 max-w-full' />
          </div>
          <div className='grid gap-8 md:grid-cols-2'>
            {Array.from({ length: 2 }, (_, i) => (
              <div key={i} className='rounded-xl border bg-background p-6'>
                <div className='mb-4 flex items-center gap-3'>
                  <Skeleton className='size-10 rounded-lg' />
                  <Skeleton className='h-5 w-36' />
                </div>
                <Skeleton className='mb-2 h-3 w-full' />
                <Skeleton className='mb-4 h-3 w-3/4' />
                <Skeleton className='h-9 w-full rounded-md' />
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

export function ComingSoonSkeleton(): React.JSX.Element {
  return (
    <div className='border-t'>
      <div className='container mx-auto px-4 py-20'>
        <div className='mx-auto max-w-4xl'>
          <div className='mb-12 flex flex-col items-center gap-3'>
            <Skeleton className='h-8 w-32 rounded-full' />
            <Skeleton className='h-9 w-80 max-w-full' />
            <Skeleton className='h-4 w-96 max-w-full' />
          </div>
          <div className='grid gap-6 md:grid-cols-3'>
            {Array.from({ length: 3 }, (_, i) => (
              <div key={i} className='rounded-xl border bg-background/50 p-6'>
                <Skeleton className='mb-3 size-10 rounded-lg' />
                <Skeleton className='mb-2 h-5 w-24' />
                <Skeleton className='h-3 w-full' />
                <Skeleton className='mt-2 h-3 w-3/4' />
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

export function CtaSkeleton(): React.JSX.Element {
  return (
    <div className='border-t bg-gradient-to-b from-muted/50 to-background'>
      <div className='container mx-auto px-4 py-20'>
        <div className='mx-auto max-w-3xl'>
          <div className='mb-10 flex flex-col items-center gap-3'>
            <Skeleton className='h-9 w-64' />
            <Skeleton className='h-4 w-80 max-w-full' />
          </div>
          <div className='space-y-4'>
            <div className='flex justify-center'>
              <Skeleton className='h-8 w-40 rounded-full' />
            </div>
            <Skeleton className='h-32 w-full rounded-xl' />
          </div>
          <div className='mt-8 flex justify-center'>
            <Skeleton className='h-10 w-48 rounded-md' />
          </div>
        </div>
      </div>
    </div>
  );
}

export function HeroViewerSkeleton(): React.JSX.Element {
  return (
    <div className='space-y-6'>
      <div className='flex flex-col items-center gap-2'>
        <Skeleton className='h-8 w-64' />
        <Skeleton className='h-4 w-96 max-w-full' />
        <Skeleton className='h-3 w-48' />
      </div>
      <Skeleton className='h-[300px] w-full rounded-xl md:h-[700px]' />
    </div>
  );
}
