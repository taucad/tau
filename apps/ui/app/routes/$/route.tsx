import { ArrowLeft, Home, Search, MapPin } from 'lucide-react';
import { useNavigate, Link } from 'react-router';
import { Button, buttonVariants } from '#components/ui/button.js';
import { cn } from '#utils/ui.js';

export default function NotFoundPage(): React.JSX.Element {
  const navigate = useNavigate();

  const goBack = (): void => {
    void navigate(-1);
  };

  return (
    <div className="flex min-h-full flex-col items-center justify-center px-4 py-8">
      <div className="w-full max-w-md animate-in duration-300 fade-in">
        {/* 404 Header */}
        <div className="mb-8 text-center">
          <div className="mb-4 flex items-center justify-center gap-3">
            <div className="flex size-12 items-center justify-center rounded-full bg-muted/50 dark:bg-muted/30">
              <MapPin className="size-6 text-muted-foreground" />
            </div>
          </div>
          <h1 className="mb-2 text-6xl font-bold text-muted-foreground">404</h1>
          <h2 className="text-2xl font-semibold">Page Not Found</h2>
        </div>

        {/* Content Card */}
        <div className="mb-6 rounded-lg border border-border/60 bg-card/50 p-6 shadow-sm dark:border-border/40 dark:bg-card/30">
          <div className="mb-4 flex items-center gap-3">
            <Search className="size-5 text-muted-foreground" />
            <p className="text-lg font-medium">Looks like you&apos;re lost!</p>
          </div>

          <p className="mb-4 text-muted-foreground">
            The page you&apos;re looking for doesn&apos;t exist or has been moved to a different location.
          </p>

          <div className="space-y-2">
            <p className="text-sm text-muted-foreground">Here are some helpful options:</p>
            <ul className="ml-4 space-y-1 text-sm text-muted-foreground">
              <li>• Check the URL for typos</li>
              <li>• Go back to the previous page</li>
              <li>• Visit our homepage</li>
              <li>• Use the navigation menu</li>
            </ul>
          </div>
        </div>

        {/* Action Buttons */}
        <div className="flex flex-col gap-3 sm:flex-row">
          <Button variant="outline" className="flex-1" onClick={goBack}>
            <ArrowLeft className="mr-2 size-4" />
            Go Back
          </Button>

          <Link to="/" className={cn(buttonVariants(), 'flex-1')}>
            <Home className="mr-2 size-4" />
            Go Home
          </Link>
        </div>

        {/* Additional Help */}
        <div className="mt-6 text-center">
          <p className="text-sm text-muted-foreground">
            Still need help?{' '}
            <Link to="/docs" className={cn(buttonVariants({ variant: 'link' }), 'h-auto p-0 text-sm underline')}>
              Check our docs
            </Link>{' '}
            or{' '}
            <Link to="/" className={cn(buttonVariants({ variant: 'link' }), 'h-auto p-0 text-sm underline')}>
              start over
            </Link>
            .
          </p>
        </div>
      </div>
    </div>
  );
}
