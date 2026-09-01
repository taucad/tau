import { Link } from 'react-router';
import { useCallback, useEffect, useMemo, useState } from 'react';
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
import { cn } from '@taucad/ui/utils/cn';
import { useFileManager } from '#hooks/use-file-manager.js';
import { useSkillsCatalog } from '#hooks/use-skills-catalog.js';
import { builtInSystemSkills } from '#lib/system-skills-catalog.js';
import { tauStoreSkills } from '#lib/tau-plugin-store-catalog.js';
import type { BuiltInSystemSkill } from '#lib/system-skills-catalog.js';
import type { TauStoreSkill } from '#lib/tau-plugin-store-catalog.js';

export const handle: Handle = {
  breadcrumb() {
    return (
      <Button asChild variant='ghost'>
        <Link to='/plugins'>Plugins</Link>
      </Button>
    );
  },
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
    accent: 'bg-blue/10 text-blue',
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
  'bg-yellow/10 text-yellow',
  'bg-purple/10 text-purple',
  'bg-blue/10 text-blue',
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

function parseManifest(bytes: Uint8Array<ArrayBuffer>): InstalledPluginManifest {
  try {
    return JSON.parse(textDecoder.decode(bytes)) as InstalledPluginManifest;
  } catch {
    return {};
  }
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

function systemSkillToStoreItem(skill: BuiltInSystemSkill): StoreItem {
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
  const { readFile, writeFiles, exists } = useFileManager();
  const skillsCatalog = useSkillsCatalog();
  const [manifest, setManifest] = useState<InstalledPluginManifest>({});

  const systemSkills = useMemo(() => builtInSystemSkills.map((skill) => systemSkillToStoreItem(skill)), []);
  const storeSkills = useMemo(() => tauStoreSkills.map((skill, index) => skillToStoreItem(skill, index)), []);

  useEffect(() => {
    let cancelled = false;
    async function loadManifest(): Promise<void> {
      try {
        const bytes = await readFile(manifestPath);
        if (!cancelled) {
          setManifest(parseManifest(bytes));
        }
      } catch {
        if (!cancelled) {
          setManifest({});
        }
      }
    }

    void loadManifest();
    return () => {
      cancelled = true;
    };
  }, [readFile]);

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
      setManifest(nextManifest);
    },
    [exists, manifest, writeFiles],
  );

  return (
    <main className='mx-auto flex w-full max-w-3xl flex-col gap-6 px-4 pt-14 pb-16'>
      <div className='flex items-center gap-1 self-start'>
        <Button size='xs' variant='secondary' className='h-7 rounded-md px-2 text-xs'>
          Plugins
        </Button>
        <Button size='xs' variant='ghost' className='h-7 rounded-md px-2 text-xs text-muted-foreground'>
          Skills
        </Button>
      </div>

      <header className='space-y-6 text-center'>
        <h1 className='text-2xl font-medium tracking-normal'>Make Tau work your way</h1>
        <div className='flex items-center gap-2'>
          <div className='relative min-w-0 flex-1'>
            <Search className='pointer-events-none absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2 text-muted-foreground' />
            <Input className='h-7 rounded-md pl-8 text-xs md:text-xs' placeholder='Search plugins' />
          </div>
          <Button variant='secondary' size='xs' className='h-7 gap-1.5 rounded-md px-2 text-xs'>
            Built by Tau
          </Button>
          <Button variant='secondary' size='xs' className='h-7 rounded-md px-2 text-xs'>
            All
          </Button>
        </div>
      </header>

      <section className='flex h-40 items-center justify-center overflow-hidden rounded-md border bg-[linear-gradient(135deg,color-mix(in_oklab,var(--color-blue)_18%,var(--background)),color-mix(in_oklab,var(--color-purple)_14%,var(--background)),color-mix(in_oklab,var(--color-yellow)_12%,var(--background)))]'>
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

      <StoreSection title='Featured' items={featuredPlugins} />
      <StoreSection title='System' items={systemSkills} />
      <StoreSection title='Skills' items={storeSkills} getStatus={getSkillInstallStatus} onInstall={installSkill} />

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
    </main>
  );
}
