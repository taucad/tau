import { fileContentBytes } from '@taucad/fs-client/file-content-service';
import { z } from 'zod';
import { ObservationService } from '@taucad/fs-client/observation-service';
import { useObservation } from '@taucad/fs-client/react/use-observation';
import type { MetaFunction } from 'react-router';
import { PageContent } from '#components/layout/page-content.js';
import { useCallback, useMemo } from 'react';
import {
  Blocks,
  Check,
  GitPullRequest,
  Globe,
  Mail,
  MessagesSquare,
  PackageCheck,
  PackagePlus,
  PanelsTopLeft,
  Plus,
  Puzzle,
  Search,
  Store,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { Badge } from '@taucad/ui/components/badge';
import { Button } from '@taucad/ui/components/button';
import { Input } from '@taucad/ui/components/input';
import { Separator } from '@taucad/ui/components/separator';
import type { Handle } from '#types/matches.types.js';
import { PageHeader } from '#components/layout/page-header.js';
import { cn } from '@taucad/ui/utils/cn';
import { useFileManager } from '#hooks/use-file-manager.js';
import { useSkillsCatalogState } from '#hooks/use-skills-catalog.js';
import { systemSkillsCatalog } from '#lib/system-skills-catalog.js';
import { tauStoreSkills } from '#lib/tau-plugin-store-catalog.js';
import type { SystemSkill } from '#lib/system-skills-catalog.js';
import type { TauStoreSkill } from '#lib/tau-plugin-store-catalog.js';

export const meta: MetaFunction = () => [{ title: 'Plugins · Tau' }];

export const handle: Handle = {
  enableOverflowY: true,
};

type StoreItem = {
  readonly slug?: string;
  readonly name: string;
  readonly description: string;
  readonly icon: LucideIcon;
  readonly status?: 'available' | 'installed' | 'shadowed';
  readonly accent: string;
};

const featuredPlugins: StoreItem[] = [
  {
    name: 'GitHub',
    description: 'Triage PRs, issues, CI, and publish flows',
    icon: GitPullRequest,
    accent: 'bg-neutral text-neutral-foreground',
  },
  {
    name: 'Chrome',
    description: 'Control Chrome with Tau',
    icon: Globe,
    accent: 'bg-information/10 text-information',
  },
  {
    name: 'Slack',
    description: 'Read and manage Slack',
    icon: MessagesSquare,
    accent: 'bg-feature/10 text-feature',
  },
  {
    name: 'Gmail',
    description: 'Read and manage Gmail',
    icon: Mail,
    accent: 'bg-alert/10 text-alert',
  },
  {
    name: 'Figma',
    description: 'Design-to-code workflows powered by Tau',
    icon: PanelsTopLeft,
    accent: 'bg-success/10 text-success',
  },
  {
    name: 'Tau Plugin Store',
    description: 'Shared plugins curated for CAD workflows',
    icon: Store,
    status: 'installed',
    accent: 'bg-primary/10 text-primary',
  },
];

const skillAccentClasses = [
  'bg-warning/10 text-warning',
  'bg-warning/10 text-warning',
  'bg-feature/10 text-feature',
  'bg-information/10 text-information',
];

type InstalledPluginManifest = {
  readonly skills?: Record<
    string,
    {
      readonly status: 'installed' | 'shadowed';
      readonly source: 'tau-store';
      readonly installedPath: string;
      readonly shadowPath?: string;
      readonly version: string;
      readonly updatedAt: string;
    }
  >;
};

const textEncoder = new TextEncoder();
const textDecoder = new TextDecoder();
const manifestPath = '.agents/plugins/installed.json';

const installedPluginManifestSchema = z.object({
  skills: z
    .record(
      z.string(),
      z.object({
        status: z.enum(['installed', 'shadowed']),
        source: z.literal('tau-store'),
        installedPath: z.string(),
        shadowPath: z.string().optional(),
        version: z.string(),
        updatedAt: z.string(),
      }),
    )
    .optional(),
});

function parseManifest(bytes: Uint8Array<ArrayBuffer>): InstalledPluginManifest {
  return installedPluginManifestSchema.parse(JSON.parse(textDecoder.decode(bytes)));
}

function skillToStoreItem(skill: TauStoreSkill, index: number): StoreItem {
  return {
    slug: skill.slug,
    name: skill.name,
    description: skill.description,
    icon: Blocks,
    accent: skillAccentClasses[index % skillAccentClasses.length]!,
  };
}

function systemSkillToStoreItem(skill: SystemSkill): StoreItem {
  return {
    slug: skill.slug,
    name: skill.name,
    description: skill.description,
    icon: Blocks,
    status: 'installed',
    accent: 'bg-primary/10 text-primary',
  };
}

function StoreItemRow({
  item,
  status = item.status ?? 'available',
  onInstall,
}: {
  readonly item: StoreItem;
  readonly status?: 'available' | 'installed' | 'shadowed';
  readonly onInstall?: (slug: string) => void;
}): React.JSX.Element {
  const Icon = item.icon;
  const isInstalled = status === 'installed' || status === 'shadowed';
  const canInstall = item.slug !== undefined && status === 'available';

  return (
    <li className='flex min-w-0 items-center gap-3 py-3'>
      <span className={cn('flex size-8 shrink-0 items-center justify-center rounded-md border', item.accent)}>
        <Icon className='size-4' />
      </span>
      <span className='min-w-0 flex-1'>
        <span className='block truncate text-sm font-medium'>{item.name}</span>
        <span className='block truncate text-xs text-muted-foreground'>{item.description}</span>
      </span>
      <Button
        size='icon-xs'
        variant={isInstalled ? 'ghost' : 'secondary'}
        className='shrink-0 rounded-full'
        aria-label={
          status === 'shadowed'
            ? `${item.name} installed but shadowed`
            : isInstalled
              ? `${item.name} installed`
              : `Install ${item.name}`
        }
        onClick={() => {
          if (canInstall && item.slug) {
            onInstall?.(item.slug);
          }
        }}
      >
        {isInstalled ? <Check className='size-3.5 text-muted-foreground' /> : <Plus className='size-3.5' />}
      </Button>
    </li>
  );
}

function StoreSection({
  title,
  items,
  columns = 2,
  getStatus,
  onInstall,
}: {
  readonly title: string;
  readonly items: StoreItem[];
  readonly columns?: 1 | 2;
  readonly getStatus?: (item: StoreItem) => 'available' | 'installed' | 'shadowed';
  readonly onInstall?: (slug: string) => void;
}): React.JSX.Element {
  return (
    <section className='space-y-3'>
      <div>
        <h2 className='text-sm font-medium'>{title}</h2>
        <Separator className='mt-2' />
      </div>
      <ul className={cn('grid gap-x-10', columns === 2 ? 'md:grid-cols-2' : 'md:grid-cols-1')}>
        {items.map((item) => (
          <StoreItemRow key={item.name} item={item} status={getStatus?.(item)} onInstall={onInstall} />
        ))}
      </ul>
    </section>
  );
}

export default function PluginsRoute(): React.JSX.Element {
  const { writeFiles, exists, contentService } = useFileManager();
  const catalog = useSkillsCatalogState();
  const skillsCatalog = catalog.commands;
  const manifestService = useMemo(() => {
    if (!contentService) {
      return undefined;
    }
    return new ObservationService<InstalledPluginManifest>({
      resource: manifestPath,
      read: async (read) => {
        const result = await read.observe(contentService.observeContent(manifestPath));
        return result.kind === 'orphaned' ? {} : parseManifest(fileContentBytes({ path: manifestPath, result }));
      },
      equal: (previous, next) => JSON.stringify(previous) === JSON.stringify(next),
    });
  }, [contentService]);
  const manifestSnapshot = useObservation(manifestService);
  const manifest = manifestSnapshot.value ?? {};

  const systemSkills = useMemo(() => systemSkillsCatalog.map((skill) => systemSkillToStoreItem(skill)), []);
  const storeSkills = useMemo(() => tauStoreSkills.map((skill, index) => skillToStoreItem(skill, index)), []);

  const getSkillInstallStatus = useCallback(
    (item: StoreItem): 'available' | 'installed' | 'shadowed' => {
      if (!item.slug) {
        return 'available';
      }

      const manifestStatus = manifest.skills?.[item.slug]?.status;
      if (manifestStatus) {
        return manifestStatus;
      }

      const catalogEntry = skillsCatalog.find((skill) => skill.name === item.slug);
      return catalogEntry?.source === 'tau-store' ? 'installed' : 'available';
    },
    [manifest, skillsCatalog],
  );

  const installSkill = useCallback(
    async (slug: string): Promise<void> => {
      if (catalog.status !== 'ready') {
        return;
      }
      if (manifestSnapshot.status !== 'ready') {
        return;
      }
      const skill = tauStoreSkills.find((entry) => entry.slug === slug);
      if (!skill) {
        return;
      }

      const canonicalPath = `.agents/skills/${skill.slug}/SKILL.md`;
      const shadowPath = `.agents/plugins/tau-store/shadowed/${skill.slug}/SKILL.md`;
      const hasExistingSkill = await exists(canonicalPath);
      const status = hasExistingSkill ? 'shadowed' : 'installed';
      const targetPath = hasExistingSkill ? shadowPath : canonicalPath;
      const nextManifest: InstalledPluginManifest = {
        skills: {
          ...manifest.skills,
          [skill.slug]: {
            status,
            source: 'tau-store',
            installedPath: canonicalPath,
            ...(hasExistingSkill && { shadowPath }),
            version: skill.version,
            updatedAt: new Date().toISOString(),
          },
        },
      };

      await writeFiles({
        [targetPath]: { content: textEncoder.encode(skill.skillMarkdown) },
        [manifestPath]: { content: textEncoder.encode(JSON.stringify(nextManifest, null, 2) + '\n') },
      });
      manifestService?.refresh();
    },
    [exists, manifest, manifestService, manifestSnapshot.status, writeFiles, catalog.status],
  );

  return (
    <PageContent className='space-y-6'>
      <PageHeader
        title='Plugins'
        action={
          <div className='ml-auto flex w-full flex-wrap items-center gap-2 sm:w-auto'>
            <div className='flex items-center gap-1'>
              <Button size='sm' variant='secondary'>
                Plugins
              </Button>
              <Button size='sm' variant='ghost'>
                Skills
              </Button>
            </div>
            <div className='relative min-w-0 grow sm:w-64'>
              <Search className='pointer-events-none absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2 text-muted-foreground' />
              <Input aria-label='Search plugins' className='pl-8' placeholder='Search plugins…' />
            </div>
            <Button variant='secondary' size='sm'>
              Built by Tau
            </Button>
            <Button variant='secondary' size='sm'>
              All
            </Button>
          </div>
        }
      />

      {manifestSnapshot.error && (
        <p role='alert' className='text-sm text-destructive'>
          {manifestSnapshot.error}
        </p>
      )}
      {manifestService &&
      (manifestSnapshot.status === 'closed' ||
        manifestSnapshot.status === 'error' ||
        (manifestSnapshot.value !== undefined && manifestSnapshot.status !== 'ready')) ? (
        <div role='status' className='flex items-center justify-between gap-2 text-sm'>
          <span>
            {manifestSnapshot.status === 'registering' || manifestSnapshot.status === 'pending'
              ? 'Plugin updates pending'
              : 'Plugin updates unavailable'}
          </span>
          <Button
            variant='ghost'
            size='sm'
            aria-label='Retry plugin updates'
            onClick={() => {
              manifestService.refresh();
            }}
          >
            Retry
          </Button>
        </div>
      ) : undefined}
      {catalog.status === 'ready' ? undefined : (
        <div role='status' className='flex items-center justify-between gap-2 text-sm'>
          <span>
            {catalog.status === 'registering' || catalog.status === 'pending'
              ? 'Skill updates pending'
              : 'Skill updates unavailable'}
          </span>
          <Button variant='ghost' size='sm' aria-label='Retry skill updates' onClick={catalog.retry}>
            Retry
          </Button>
        </div>
      )}
      <StoreSection title='Featured' items={featuredPlugins} />
      <StoreSection title='System' items={systemSkills} />
      <StoreSection title='Skills' items={storeSkills} getStatus={getSkillInstallStatus} onInstall={installSkill} />

      {/* Below the collections: the first viewport belongs to the lists (page composition Rule 14). */}
      <section className='flex h-40 items-center justify-center overflow-hidden rounded-md border bg-[linear-gradient(135deg,color-mix(in_oklab,var(--information)_18%,var(--background)),color-mix(in_oklab,var(--feature)_14%,var(--background)),color-mix(in_oklab,var(--warning)_12%,var(--background)))]'>
        <div className='flex flex-col items-center gap-4'>
          <Badge
            variant='secondary'
            className='h-8 gap-2 rounded-md border bg-background/80 px-3 font-normal shadow-xs'
          >
            <PackageCheck className='size-4 text-primary' />
            Computer Use
            <span className='text-muted-foreground'>Play a playlist to help me lock in</span>
          </Badge>
          <Button size='xs' className='h-7 rounded-md px-3 text-xs'>
            <Puzzle className='size-3.5' />
            Try in chat
          </Button>
        </div>
      </section>

      <section className='flex items-center gap-3 rounded-md border border-dashed px-4 py-3'>
        <PackagePlus className='size-4 shrink-0 text-muted-foreground' />
        <div className='min-w-0 flex-1'>
          <p className='text-sm font-medium'>Install from the Tau Plugin Store</p>
          <p className='truncate text-xs text-muted-foreground'>
            Shared plugin and skill packs will install into the workspace filesystem.
          </p>
        </div>
        <Button variant='secondary' size='xs' className='h-7 rounded-md px-2 text-xs'>
          Add
        </Button>
      </section>
    </PageContent>
  );
}
