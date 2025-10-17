import { ArrowLeft, AlertCircle, Code } from 'lucide-react';
import { isRouteErrorResponse, useNavigate, useRouteError } from 'react-router';
import { Button, buttonVariants } from '#components/ui/button.js';
import { cn } from '#utils/ui.utils.js';
import { CopyButton } from '#components/copy-button.js';

export function ErrorPage(): React.JSX.Element {
  const error = useRouteError();
  const navigate = useNavigate();

  const goBack = () => {
    void navigate(-1);
  };

  if (isRouteErrorResponse(error)) {
    return (
      <div className="flex size-full flex-col items-center justify-center gap-4 p-8 md:ml-[var(--sidebar-width-current)]">
        <h1 className="text-xl">
          {error.status} {error.statusText}
        </h1>
        <p>{error.data}</p>
        <p>
          Please try again later,{' '}
          <button
            type="button"
            className={cn(buttonVariants({ variant: 'link' }), 'h-auto cursor-pointer p-0 text-base underline')}
            onClick={goBack}
          >
            head back
          </button>
          {', '}
          or navigate to a different page.
        </p>
      </div>
    );
  }

  if (error instanceof Error) {
    return (
      <div className="flex min-h-full flex-col items-center justify-center px-4 py-8">
        <div className="shadow-lg w-full animate-in rounded-lg border border-destructive/20 bg-destructive/5 p-8 duration-300 fade-in dark:border-destructive/30 dark:bg-destructive/10">
          <div className="mb-6 flex items-center gap-3">
            <div className="flex size-7 items-center justify-center rounded-full bg-destructive/20">
              <AlertCircle className="size-5 text-destructive" />
            </div>
            <h1 className="text-2xl font-semibold text-destructive">Error</h1>
          </div>

          <div className="mb-6 rounded-md border border-destructive/10 bg-background/50 p-4 dark:bg-muted/30">
            <p className="text-lg font-medium">{error.message}</p>
          </div>

          <div className="w-full overflow-hidden rounded-md border border-border bg-muted/30 dark:border-neutral/20">
            <div className="flex items-center justify-between border-b border-border px-4 py-3 dark:border-neutral/20">
              <div className="flex items-center gap-2 text-muted-foreground">
                <Code className="size-4" />
                <p className="text-sm font-medium">Stack Trace</p>
              </div>
              <div className="flex gap-2">
                <Button variant="outline" size="sm" onClick={goBack}>
                  <ArrowLeft />
                  Go back
                </Button>
                <CopyButton size="sm" variant="outline" getText={() => error.stack ?? ''} tooltip="Copy stack trace" />
              </div>
            </div>
            <pre className="max-h-[50vh] overflow-auto border-l-4 border-l-destructive/20 p-4 text-left font-mono text-xs break-words whitespace-pre-wrap text-foreground">
              {error.stack}
            </pre>
          </div>
        </div>
      </div>
    );
  }

  return <h1>Unknown Error</h1>;
}
