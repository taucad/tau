import { Link } from 'react-router';
import { ArrowRight } from 'lucide-react';
import { NewProjectChatComposer } from '#components/chat/new-project-chat-composer.js';
import { Button } from '@taucad/ui/components/button';
import { ChatComposerProvider } from '#hooks/active-chat-provider.js';

export function CtaSection(): React.JSX.Element {
  return (
    <div className='border-t bg-linear-to-b from-muted/50 to-background'>
      <div className='container mx-auto px-4 py-20'>
        <div className='mx-auto max-w-3xl'>
          {/* Heading */}
          <div className='mb-10 text-center'>
            <h2 className='text-3xl font-semibold tracking-tight md:text-4xl'>
              We can&apos;t wait to see what you build
            </h2>
            <p className='mx-auto mt-4 max-w-xl text-muted-foreground'>
              Start designing with AI assistance, or dive straight into code.
            </p>
          </div>

          {/* Chat Input — composer-only mode (no chat session). The draft is
              held in memory only. The marketing CTA never persists; it just
              routes into project creation on submit. */}
          <ChatComposerProvider>
            <NewProjectChatComposer enableAutoFocus={false} />
          </ChatComposerProvider>

          {/* CTA Button */}
          <div className='mt-8 flex justify-center'>
            <Button asChild size='lg' className='gap-2'>
              <Link to='/projects/new'>
                Create New Project
                <ArrowRight className='size-4' />
              </Link>
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
