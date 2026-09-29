import { PageContent } from '#components/layout/page-content.js';
import { PageHeader } from '#components/layout/page-header.js';
import { PageNotice } from '#components/layout/page-notice.js';
import { RotateCcw } from 'lucide-react';
import { Button } from '@taucad/ui/components/button';

type ImportErrorViewProperties = {
  readonly error: Error | undefined;
  readonly message?: string;
  readonly onRetry: () => void;
};

/** Shared error view for import failures. */
export function ImportErrorView({ error, message, onRetry }: ImportErrorViewProperties): React.JSX.Element {
  return (
    <PageContent className='space-y-6'>
      <PageHeader title='Import' />
      <PageNotice
        title='Import interrupted'
        message={message ?? 'The project could not be imported. Check the source and try again.'}
        detail={error?.message ?? 'No additional error details are available.'}
      >
        <Button variant='outline' onClick={onRetry}>
          <RotateCcw />
          Try again
        </Button>
      </PageNotice>
    </PageContent>
  );
}
