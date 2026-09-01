import { AlertCircle, ArrowLeft, RefreshCcw } from 'lucide-react';
import { lazy, Suspense, useEffect } from 'react';
import { isRouteErrorResponse, useNavigate, useRouteError } from 'react-router';
import { Button } from '@taucad/ui/components/button';
import { useAnalytics } from '#hooks/use-analytics.js';
import { PageNotFound } from '#components/page-not-found.js';

const CollapsibleCodeBlock = lazy(async () => {
  const m = await import('#components/ui/collapsible-code-block.js');
  return { default: m.CollapsibleCodeBlock };
});

export function ErrorPage(): React.JSX.Element {
  const error = useRouteError();
  const navigate = useNavigate();
  const analytics = useAnalytics();

  useEffect(() => {
    // Don't report 404 errors to analytics - they're expected user behavior
    if (isRouteErrorResponse(error) && error.status === 404) {
      return;
    }

    if (isRouteErrorResponse(error)) {
      const routeError = new Error(`${error.status} ${error.statusText}`);
      routeError.name = 'route_error';
      analytics.captureException(routeError, { context: { component: 'ErrorPage' } });
    } else if (error instanceof Error) {
      analytics.captureException(error, { context: { component: 'ErrorPage' } });
    }
  }, [error, analytics]);

  const goBack = (): void => {
    void navigate(-1);
  };

  const refreshPage = (): void => {
    globalThis.location.reload();
  };

  // Handle 404 errors with the dedicated PageNotFound component
  if (isRouteErrorResponse(error) && error.status === 404) {
    return <PageNotFound />;
  }

  if (isRouteErrorResponse(error)) {
    return (
      <div className='flex min-h-full flex-1 flex-col items-center justify-center gap-6 px-4 py-8'>
        <div className='flex flex-col items-center gap-3 text-center'>
          <div className='flex size-12 items-center justify-center rounded-full bg-destructive/10'>
            <AlertCircle className='size-6 text-destructive' />
          </div>
          <h1 className='text-lg font-semibold text-foreground'>
            {error.status} {error.statusText}
          </h1>
          {error.data ? <p className='max-w-sm text-sm text-muted-foreground'>{error.data}</p> : undefined}
          <p className='max-w-xs text-sm text-pretty text-muted-foreground'>
            Our team has been notified and will investigate shortly.
          </p>
        </div>
        <div className='flex flex-wrap items-center justify-center gap-2'>
          <Button variant='default' size='sm' className='gap-2' onClick={goBack}>
            <ArrowLeft className='size-4' />
            Go Back
          </Button>
          <Button variant='outline' size='sm' className='gap-2' onClick={refreshPage}>
            <RefreshCcw className='size-4' />
            Reload Page
          </Button>
        </div>
      </div>
    );
  }

  if (error instanceof Error) {
    return (
      <div className='flex min-h-full flex-1 flex-col items-center justify-center px-4 py-8'>
        <div className='flex w-full max-w-lg flex-col items-center gap-4 p-6 text-center'>
          {/* Error Icon */}
          <div className='flex size-12 items-center justify-center rounded-full bg-destructive/10'>
            <AlertCircle className='size-6 text-destructive' />
          </div>

          {/* Error Title */}
          <h1 className='text-lg font-semibold text-foreground'>Something went wrong</h1>

          {/* Reassurance Message */}
          <p className='max-w-xs text-sm text-pretty text-muted-foreground'>
            Our team has been notified of the error and will investigate it shortly.
          </p>

          {error.stack ? (
            <Suspense
              fallback={
                <div className='w-full rounded-md border border-border bg-muted/30 p-3 text-left'>
                  <p className='text-xs font-medium text-muted-foreground'>{error.message}</p>
                </div>
              }
            >
              <CollapsibleCodeBlock
                language='bash'
                title={error.message}
                text={error.stack}
                collapsedLineCount={3}
                className='text-left text-muted-foreground'
                containerClassName='w-full'
              />
            </Suspense>
          ) : (
            <div className='w-full rounded-md border border-border bg-muted/30 p-3 text-left'>
              <p className='text-xs font-medium text-muted-foreground'>{error.message}</p>
            </div>
          )}

          {/* Action Buttons */}
          <div className='flex flex-wrap items-center justify-center gap-2'>
            <Button variant='default' size='sm' className='gap-2' onClick={goBack}>
              <ArrowLeft className='size-4' />
              Go Back
            </Button>
            <Button variant='outline' size='sm' className='gap-2' onClick={refreshPage}>
              <RefreshCcw className='size-4' />
              Reload Page
            </Button>
          </div>
        </div>
      </div>
    );
  }

  return <h1>Unknown Error</h1>;
}
