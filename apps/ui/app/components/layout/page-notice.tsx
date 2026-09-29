import type { ReactNode } from 'react';
import { CircleAlert } from 'lucide-react';

export function PageNotice({
  title,
  message,
  detail,
  children,
}: {
  readonly title: string;
  readonly message: string;
  readonly detail: string;
  readonly children?: ReactNode;
}): React.JSX.Element {
  return (
    <section role='alert' aria-label={title} className='grid gap-4 border-y py-6 md:grid-cols-[12rem_minmax(0,1fr)]'>
      <h2 className='flex items-center gap-2 self-start text-sm font-medium'>
        <CircleAlert aria-hidden className='size-4 shrink-0 text-feature' />
        {title}
      </h2>
      <div className='max-w-xl min-w-0 space-y-4'>
        <p className='text-sm'>{message}</p>
        <details className='text-xs text-muted-foreground'>
          <summary className='w-fit rounded-xs select-none focus-visible:focus-outline-outside'>Details</summary>
          <pre className='mt-2 font-mono break-words whitespace-pre-wrap'>{detail}</pre>
        </details>
        {children ? <div className='flex flex-wrap gap-2'>{children}</div> : undefined}
      </div>
    </section>
  );
}
