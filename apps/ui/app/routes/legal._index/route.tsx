import type { MetaFunction } from 'react-router';
import { PageHeader } from '#components/layout/page-header.js';
import { ArrowRight } from 'lucide-react';
import { Link } from 'react-router';
import { Card, CardDescription, CardTitle } from '@taucad/ui/components/card';

export const meta: MetaFunction = () => [{ title: 'Legal · Tau' }];

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
  {
    title: 'Open-Source Notices',
    description: 'See the open-source software in Tau, including Open CASCADE, and its licenses.',
    href: '/legal/open-source',
  },
];

export default function LegalIndex(): React.JSX.Element {
  return (
    <div className='space-y-6'>
      <PageHeader title='Legal' />
      {/* Cards Grid */}
      <div className='grid gap-4 md:grid-cols-3'>
        {legalPages.map((page) => (
          <Link key={page.href} to={page.href} className='group rounded-xl outline-none focus-visible:focus-outline'>
            <Card className='flex h-full flex-col justify-between bg-card/50 p-5 transition-colors hover:bg-muted'>
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
  );
}
