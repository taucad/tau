import { useState } from 'react';
import { CircleAlert, Lock, LockOpen } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { lockMatchesManifest, parsePackageLock } from '@taucad/bundler-core';
import type { PackageLock } from '@taucad/bundler-core';
import type { ToolInvocation } from '@taucad/chat';
import { rpcName } from '@taucad/chat/constants';
import type { toolName } from '@taucad/chat/constants';
import { Button } from '@taucad/ui/components/button';
import { cn } from '@taucad/ui/utils/cn';
import { randomUuid } from '@taucad/utils/id';
import { CopyButton } from '#components/copy-button.js';
import { useFileContent } from '#hooks/use-file-content.js';
import { useFileManager } from '#hooks/use-file-manager.js';
import { createRpcHandlers } from '#hooks/rpc-handlers.js';
import { ChatMessageToolInstallPackages } from '#routes/w.$workspace.$project/chat-message-tool-install-packages.js';

type InstallPackagesInvocation = ToolInvocation<typeof toolName.installPackages>;
type Json = Readonly<Record<string, unknown>>;

const standaloneCommand = 'npm ci --ignore-scripts';
const runOutsideTauUrl = 'https://docs.tau.new/editor/packages#run-the-project-outside-tau';

const isRecord = (value: unknown): value is Json =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const parseJson = (content: Uint8Array<ArrayBuffer>): Json | undefined => {
  try {
    const value: unknown = JSON.parse(new TextDecoder().decode(content));
    return isRecord(value) ? value : undefined;
  } catch {
    return undefined;
  }
};

/** What the lock says about the project: absent, unusable for this manifest, or the rows it locks. */
type LockState = { kind: 'none' } | { kind: 'stale' } | { kind: 'current'; packages: PackageLock['packages'] };

// The bundler's own rule: an unreadable lock, or one whose root disagrees with package.json, fails every bare import.
const lockStateOf = (manifest: Json, lockFile: ReturnType<typeof useFileContent>): LockState => {
  if (lockFile.kind !== 'text') {
    return { kind: 'none' };
  }
  try {
    const lock = parsePackageLock(new TextDecoder().decode(lockFile.content));
    return lockMatchesManifest(lock, manifest) === undefined
      ? { kind: 'current', packages: lock.packages }
      : { kind: 'stale' };
  } catch {
    return { kind: 'stale' };
  }
};

const statusDisplay = {
  locked: { label: 'Locked', icon: Lock, className: 'text-muted-foreground' },
  'not-locked': { label: 'Not locked', icon: LockOpen, className: 'text-warning' },
  stale: { label: 'Lock out of date', icon: CircleAlert, className: 'text-warning' },
  'not-installed': { label: 'Not installed', icon: CircleAlert, className: 'text-warning' },
  checking: { label: 'Checking', icon: Lock, className: 'text-muted-foreground' },
} as const satisfies Record<string, { label: string; icon: LucideIcon; className: string }>;

function DependencyRow({
  name,
  range,
  lock,
}: {
  readonly name: string;
  readonly range: string;
  readonly lock: LockState;
}): React.JSX.Element {
  const version = lock.kind === 'current' ? lock.packages[`node_modules/${name}`]?.version : undefined;
  // Only a locked row can be installed; everything else is decided without touching node_modules.
  const installed = useFileContent(version === undefined ? undefined : `node_modules/${name}/package.json`);
  const status =
    lock.kind === 'none'
      ? 'not-locked'
      : lock.kind === 'stale'
        ? 'stale'
        : version === undefined
          ? 'not-locked'
          : installed.kind === 'loading'
            ? 'checking'
            : installed.kind === 'text'
              ? 'locked'
              : 'not-installed';
  const { label, icon: Icon, className } = statusDisplay[status];
  return (
    <li className='flex items-center gap-2 px-3 py-1.5 text-sm'>
      <Icon aria-hidden className={cn('size-3.5 shrink-0', className)} />
      <span className='min-w-0 truncate font-mono'>{name}</span>
      <span className='truncate text-xs text-muted-foreground'>{version ?? range}</span>
      <span className='ml-auto shrink-0 text-xs text-muted-foreground'>{label}</span>
    </li>
  );
}

/**
 * The project's npm packages: each `package.json` dependency with its lock status, one Install action that runs
 * the `install_packages` RPC from the manifest, and the command that installs the same tree outside Tau (DA7).
 *
 * @returns The Packages section.
 */
export function PackagesPanel(): React.JSX.Element {
  const fileManager = useFileManager();
  const manifestFile = useFileContent('package.json');
  const lockFile = useFileContent('package-lock.json');
  const [result, setResult] = useState<InstallPackagesInvocation | undefined>();
  const [isInstalling, setIsInstalling] = useState(false);

  const manifest = manifestFile.kind === 'text' ? parseJson(manifestFile.content) : undefined;
  const dependencies = Object.entries(isRecord(manifest?.['dependencies']) ? manifest['dependencies'] : {}).filter(
    (entry): entry is [string, string] => typeof entry[1] === 'string',
  );
  const lock = manifest === undefined ? ({ kind: 'none' } as const) : lockStateOf(manifest, lockFile);

  const install = async (): Promise<void> => {
    setIsInstalling(true);
    const toolCallId = randomUuid();
    try {
      const outcome = await createRpcHandlers({ chatId: 'packages-panel', fileManager }).executeRpcCall({
        rpcName: rpcName.installPackages,
        args: {},
        toolCallId,
      });
      if (outcome.success) {
        const { manifestChanged, lockChanged, packages, issues } = outcome;
        setResult({
          toolCallId,
          state: 'output-available',
          input: {},
          output: { manifestChanged, lockChanged, packages, issues },
        });
      } else {
        setResult({ toolCallId, state: 'output-error', input: {}, errorText: outcome.message });
      }
    } finally {
      setIsInstalling(false);
    }
  };

  return (
    <section aria-label='Packages' className='overflow-hidden rounded-xl border border-border bg-card'>
      <div className='flex items-center justify-between gap-2 border-b px-3 py-1.5'>
        <h2 className='text-[13px] font-medium text-foreground'>Packages</h2>
        <Button
          size='xs'
          disabled={isInstalling}
          aria-busy={isInstalling}
          onClick={() => {
            void install();
          }}
        >
          {isInstalling ? 'Installing…' : 'Install'}
        </Button>
      </div>
      {manifestFile.kind === 'loading' ? null : manifestFile.kind === 'orphaned' ? (
        <p className='p-3 text-sm text-muted-foreground'>This project has no package.json.</p>
      ) : manifestFile.kind === 'text' && manifest === undefined ? (
        <p className='p-3 text-sm text-muted-foreground'>package.json is not valid JSON. Fix it, then run Install.</p>
      ) : dependencies.length === 0 ? (
        <p className='p-3 text-sm text-muted-foreground'>package.json declares no dependencies.</p>
      ) : (
        <ul aria-label='Dependencies' className='py-1'>
          {dependencies.map(([name, range]) => (
            <DependencyRow key={name} name={name} range={range} lock={lock} />
          ))}
        </ul>
      )}
      {result === undefined ? null : (
        <div className='border-t px-1 py-1'>
          <ChatMessageToolInstallPackages part={result} />
        </div>
      )}
      <div className='space-y-1 border-t p-3'>
        <p className='text-xs text-muted-foreground'>Install the same tree outside Tau</p>
        <div className='flex items-center gap-1 rounded-md bg-muted px-2 py-1'>
          <code className='min-w-0 flex-1 truncate font-mono text-xs'>{standaloneCommand}</code>
          <CopyButton size='icon-xs' tooltip='Copy command' getText={() => standaloneCommand} />
        </div>
        <a
          href={runOutsideTauUrl}
          target='_blank'
          rel='noopener noreferrer'
          className='text-xs text-muted-foreground underline-offset-4 hover:text-foreground hover:underline'
        >
          Run a model outside Tau
        </a>
      </div>
    </section>
  );
}
