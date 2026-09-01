import { Card, CardContent } from '@taucad/ui/components/card';
import { Skeleton } from '@taucad/ui/components/skeleton';

export function ApiKeySkeleton() {
  return (
    <Card className='border-0 bg-transparent shadow-none ring-0'>
      <CardContent className='flex items-center gap-3'>
        <Skeleton className='size-10 rounded-md' />

        <div className='flex flex-col gap-1'>
          <Skeleton className='h-4 w-28' />
          <Skeleton className='h-3 w-36' />
          <Skeleton className='h-3 w-32' />
        </div>
      </CardContent>
    </Card>
  );
}
