import { ArrowRight } from 'lucide-react';
import { Link } from 'react-router';
import { Card, CardDescription, CardTitle } from '@taucad/ui/components/card';

const legalPages = [
  {
    title: 'Terms of Service',
    description: 'All the info you need to know about using our product and services.',
    href: '/legal/terms',
  },
  {
    title: 'Privacy Policy',
    description: 'Learn how we handle, store, and protect your personal information.',
    href: '/legal/privacy',
  },
  {
    title: 'Cookie Policy',
    description: 'Understand how cookies are used and what kind of data is collected.',
    href: '/legal/cookies',
  },
  {
    title: 'Acceptable Use Policy',
    description: 'Guidelines for appropriate use of our service and content standards.',
    href: '/legal/acceptable-use',
  },
  {
    title: 'Sub-processors',
    description: 'View our list of third-party service providers that process your data.',
    href: '/legal/subprocessors',
  },
];

export default function LegalIndex(): React.JSX.Element {
  return (
    <div className='flex min-h-full flex-col items-center px-6 py-16 md:py-24'>
      <div className='mx-auto w-full max-w-4xl'>
        {/* Header */}
        <div className='mb-16 text-center'>
          <h1 className='font-serif text-5xl tracking-tight text-foreground italic md:text-6xl'>Legal</h1>
          <p className='mt-4 text-lg text-muted-foreground'>
            Review our terms of service and other important legal documents.
          </p>
        </div>

        {/* Cards Grid */}
        <div className='grid gap-4 md:grid-cols-3'>
          {legalPages.map((page) => (
            <Link key={page.href} to={page.href} className='group'>
              <Card className='flex h-full flex-col justify-between bg-card/50 p-5 transition-colors hover:border-primary hover:bg-card'>
                <div className='space-y-2'>
                  <CardTitle className='text-base'>{page.title}</CardTitle>
                  <CardDescription className='text-sm'>{page.description}</CardDescription>
                </div>
                <div className='mt-6 flex justify-end'>
                  <ArrowRight className='size-4 text-muted-foreground transition-transform duration-200 group-hover:translate-x-1' />
                </div>
              </Card>
            </Link>
          ))}
        </div>
      </div>
    </div>
  );
}
