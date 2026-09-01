import type { ComponentProps, ReactNode } from 'react';
import { ArrowRight, Box, Braces, Component, ExternalLink, PanelTop } from 'lucide-react';
import { Link } from 'react-router';
import { Badge } from '@taucad/ui/components/badge';
import { Button } from '@taucad/ui/components/button';
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from '@taucad/ui/components/card';
import { HomeLayout } from 'fumadocs-ui/layouts/home';
import { baseOptions } from '#lib/fumadocs/layout.shared.js';

const quickStartCommand = 'pnpm add @taucad/runtime @taucad/replicad @taucad/esbuild zod';

const buildTasks = [
  {
    title: 'Render your first model',
    description: 'Install the runtime, define a kernel, and export geometry from TypeScript.',
    href: '/runtime/getting-started/quick-start',
    path: '/runtime/getting-started',
    icon: Box,
  },
  {
    title: 'Choose a CAD kernel',
    description: 'Match modeling language, geometry type, and deployment target to a kernel.',
    href: '/runtime/guides/choosing-a-kernel',
    path: '/runtime/guides',
    icon: Component,
  },
  {
    title: 'Embed the runtime',
    description: 'Connect browser, Node.js, or Electron hosts through one typed contract.',
    href: '/runtime/guides/embedding-in-a-host',
    path: '/runtime/guides',
    icon: Braces,
  },
  {
    title: 'Work in the editor',
    description: 'Learn the browser workspace for AI-assisted parametric modeling.',
    href: '/editor',
    path: '/editor',
    icon: PanelTop,
  },
] as const;

const machineLinks = [
  {
    label: 'llms.txt',
    description: 'A concise index of the published documentation.',
    href: '/llms.txt',
  },
  {
    label: 'llms-full.txt',
    description: 'The complete documentation corpus in one text response.',
    href: '/llms-full.txt',
  },
  {
    label: 'Per-page markdown',
    description: 'Append .mdx to a documentation URL to read that page alone.',
    href: '/runtime.mdx',
  },
] as const;

const LandingContainer = ({ children }: ComponentProps<'main'>): ReactNode => children;

const LandingPage = (): React.JSX.Element => {
  const options = baseOptions();

  return (
    <HomeLayout {...options} slots={{ ...options.slots, container: LandingContainer }}>
      <main id='main-content' className='bg-background text-foreground'>
        <section className='border-b border-border'>
          <div className='mx-auto w-full max-w-7xl px-6 py-20 sm:py-24 lg:px-10 lg:py-32'>
            <p className='font-mono text-xs tracking-widest text-muted-foreground'>TAU DOCUMENTATION</p>
            <h1 className='mt-6 max-w-6xl text-5xl leading-none font-semibold tracking-tight text-balance sm:text-7xl lg:text-8xl'>
              CAD belongs in the browser.
            </h1>
            <div className='mt-8 grid gap-8 lg:grid-cols-12 lg:items-end'>
              <p className='max-w-2xl text-lg leading-8 text-muted-foreground lg:col-span-7'>
                Tau is an open-source, next-generation platform for parametric CAD. Describe a part, inspect real
                geometry, and export anywhere without leaving the browser.
              </p>
              <div className='flex flex-wrap items-center gap-3 lg:col-span-5 lg:justify-end'>
                <Button
                  asChild
                  size='lg'
                  className='h-11 bg-foreground text-background transition-transform duration-150 hover:bg-foreground/90 motion-reduce:transform-none'
                >
                  <Link to='/runtime'>
                    Read the runtime docs
                    <ArrowRight aria-hidden />
                  </Link>
                </Button>
                <Button
                  asChild
                  size='lg'
                  variant='ghost'
                  className='h-11 transition-transform duration-150 motion-reduce:transform-none'
                >
                  <a href='https://github.com/taucad/tau' target='_blank' rel='noreferrer'>
                    GitHub
                    <ExternalLink aria-hidden />
                  </a>
                </Button>
              </div>
            </div>

            <ol className='mt-16 grid border-y border-border sm:grid-cols-3' aria-label='Tau model pipeline'>
              {[
                ['01 / SOURCE', 'Parametric code'],
                ['02 / RUNTIME', 'One typed contract'],
                ['03 / OUTPUT', 'Portable geometry'],
              ].map(([label, value]) => (
                <li
                  key={label}
                  className='border-b border-border py-4 last:border-b-0 sm:border-b-0 sm:border-l sm:px-6 first:sm:border-l-0 first:sm:pl-0 last:sm:pr-0'
                >
                  <p className='font-mono text-xs tracking-widest text-muted-foreground'>{label}</p>
                  <p className='mt-2 text-sm font-medium'>{value}</p>
                </li>
              ))}
            </ol>
          </div>
        </section>

        <section className='border-b border-border bg-muted/40'>
          <div className='mx-auto grid w-full max-w-7xl gap-10 px-6 py-20 lg:grid-cols-12 lg:px-10 lg:py-24'>
            <div className='lg:col-span-4'>
              <p className='font-mono text-xs tracking-widest text-muted-foreground'>START HERE</p>
              <h2 className='mt-4 text-3xl leading-tight font-semibold tracking-tight sm:text-4xl'>
                Install the runtime. Make a part.
              </h2>
              <p className='mt-5 max-w-md leading-7 text-muted-foreground'>
                Compose only the runtime, kernel, and bundler packages your application needs.
              </p>
              <Link
                to='/runtime/getting-started/quick-start'
                className='mt-6 inline-flex min-h-10 items-center gap-2 text-sm font-medium text-fd-primary hover:underline'
              >
                Follow the quick start
                <ArrowRight aria-hidden className='size-4' />
              </Link>
            </div>

            <div className='overflow-hidden rounded-xl border border-border border-l-primary bg-card shadow-sm lg:col-span-8'>
              <div className='flex min-h-12 items-center justify-between gap-4 border-b border-border px-5'>
                <span className='font-mono text-xs tracking-widest text-muted-foreground'>PACKAGE MANAGER / PNPM</span>
                <Badge variant='outline' className='font-mono'>
                  Apache-2.0
                </Badge>
              </div>
              <pre className='overflow-x-auto px-5 py-7'>
                <code className='block min-w-max text-sm text-foreground'>
                  <span aria-hidden className='text-fd-primary'>
                    ${' '}
                  </span>
                  {quickStartCommand}
                </code>
              </pre>
            </div>
          </div>
        </section>

        <section className='border-b border-border'>
          <div className='mx-auto w-full max-w-7xl px-6 py-20 lg:px-10 lg:py-24'>
            <p className='font-mono text-xs tracking-widest text-muted-foreground'>BY TASK</p>
            <h2 className='mt-4 text-3xl font-semibold tracking-tight sm:text-4xl'>What do you want to build?</h2>
            <div className='mt-10 grid gap-4 md:grid-cols-2'>
              {buildTasks.map((task) => (
                <Card
                  key={task.href}
                  className='group relative min-h-52 justify-between overflow-hidden py-0 shadow-none transition-transform duration-150 hover:-translate-y-1 hover:border-foreground/30 motion-reduce:transform-none'
                >
                  <CardHeader className='px-6 pt-6'>
                    <task.icon aria-hidden className='mb-8 size-5 text-muted-foreground' strokeWidth={1.5} />
                    <CardTitle>
                      <h3 className='text-xl font-semibold tracking-tight'>{task.title}</h3>
                    </CardTitle>
                    <CardAction>
                      <ArrowRight
                        aria-hidden
                        className='size-5 text-muted-foreground transition-transform duration-150 group-hover:translate-x-1 group-hover:text-foreground motion-reduce:transform-none'
                      />
                    </CardAction>
                  </CardHeader>
                  <CardContent className='px-6'>
                    <CardDescription className='max-w-lg text-base leading-6'>{task.description}</CardDescription>
                  </CardContent>
                  <CardFooter className='border-t border-border px-6 py-4 font-mono text-xs text-muted-foreground'>
                    {task.path}
                  </CardFooter>
                  <Link
                    to={task.href}
                    aria-label={task.title}
                    className='absolute inset-0 rounded-xl focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none focus-visible:ring-inset'
                  />
                </Card>
              ))}
            </div>
          </div>
        </section>

        <section className='bg-foreground text-background'>
          <div className='mx-auto grid w-full max-w-7xl gap-10 px-6 py-20 lg:grid-cols-12 lg:px-10 lg:py-24'>
            <div className='lg:col-span-5'>
              <p className='font-mono text-xs tracking-widest'>FOR MACHINES, TOO</p>
              <h2 className='mt-4 text-3xl font-semibold tracking-tight sm:text-4xl'>These docs ship as text.</h2>
              <p className='mt-5 max-w-lg leading-7'>
                Every page is available without layout chrome. Documentation pages also include a small copy-markdown
                action beside the table of contents.
              </p>
            </div>
            <div className='border-y border-background/40 lg:col-span-7'>
              {machineLinks.map((item) => (
                <a
                  key={item.href}
                  href={item.href}
                  className='group grid min-h-24 gap-2 border-b border-background/40 px-2 py-5 last:border-b-0 hover:bg-background hover:text-foreground focus-visible:outline-background sm:grid-cols-3 sm:items-center sm:gap-6'
                >
                  <code className='text-sm font-semibold'>{item.label}</code>
                  <span className='text-sm leading-6 sm:col-span-2'>{item.description}</span>
                </a>
              ))}
            </div>
          </div>
        </section>
      </main>

      <footer className='border-t border-border bg-background text-foreground'>
        <div className='mx-auto flex w-full max-w-7xl flex-col gap-3 px-6 py-8 text-sm text-muted-foreground sm:flex-row sm:items-center sm:justify-between lg:px-10'>
          <p>TAU / DOCS</p>
          <p className='font-mono text-xs'>Tau-authored source · Apache-2.0</p>
        </div>
      </footer>
    </HomeLayout>
  );
};

export default LandingPage;
