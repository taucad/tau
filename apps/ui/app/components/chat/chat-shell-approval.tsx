import type { ShellApprovalPayload } from '@taucad/chat';
import { shellLanguageName } from '@taucad/chat';

/**
 * The authority one `shell` widening asks for, read from the structured request rather than the prompt text (A12):
 * the language, folder and exact command, every folder and host name exactly as it will be granted, and the agent's
 * reason labelled as its own words, never as Tau's description of the request.
 *
 * @param props - The request.
 * @param props.request - The interrupt's shell payload.
 * @returns The request's facts.
 */
export function ChatShellApprovalContent({ request }: { readonly request: ShellApprovalPayload }): React.JSX.Element {
  const scopes: ReadonlyArray<readonly [string, readonly string[]]> = [
    ['Read', request.access.read],
    ['Write', request.access.write],
    ['Network', request.access.domains],
  ];
  return (
    <div className='min-w-0 space-y-2 text-xs/5'>
      <p className='text-sm/5 font-medium'>
        Run {shellLanguageName(request.shell)} in {request.cwd === '' ? 'the project folder' : request.cwd} with extra
        access
      </p>
      <div
        role='region'
        aria-label='Command'
        // oxlint-disable-next-line jsx-a11y/no-noninteractive-tabindex -- the scrollable command must be keyboard reachable (WCAG 2.1.1)
        tabIndex={0}
        className='max-h-32 overflow-auto overscroll-contain rounded-md border bg-muted/30 p-2 outline-none focus-visible:focus-outline'
      >
        <p className='font-mono [overflow-wrap:anywhere] whitespace-pre-wrap'>{request.command}</p>
      </div>
      <dl className='space-y-1'>
        {scopes
          .filter(([, entries]) => entries.length > 0)
          .map(([label, entries]) => (
            <div key={label} className='flex min-w-0 gap-2'>
              <dt className='shrink-0 text-muted-foreground'>{label}</dt>
              <dd className='min-w-0 font-mono [overflow-wrap:anywhere]'>{entries.join(', ')}</dd>
            </div>
          ))}
        <div className='flex min-w-0 gap-2'>
          <dt className='shrink-0 text-muted-foreground'>The agent says</dt>
          <dd className='min-w-0 [overflow-wrap:anywhere]'>
            <q>{request.access.reason}</q>
          </dd>
        </div>
      </dl>
      <p className='text-muted-foreground'>
        Allow once covers this one command. It still runs sandboxed, and Tau&apos;s protected files stay off-limits.
      </p>
    </div>
  );
}
